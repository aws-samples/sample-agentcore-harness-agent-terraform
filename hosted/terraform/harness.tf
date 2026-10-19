# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
# kics-scan disable=e592a0c5-5bdb-414c-9066-5dba7cdea370
# IAM Access Analyzer is an account setting (create_access_analyzer in iam.tf), not part of this file.
# The agent: a managed AgentCore harness that runs the environment image, with the
# agent's prompt files and the skills baked into that image. Swap the prompt files and
# skill paths (and the image contents) to host a different agent.
locals {
  prompt_files = [for f in concat([var.agent_prompt_file], var.extra_prompt_files) : startswith(f, "/") ? f : "${path.module}/${f}"]
  # YAML front matter (agent metadata for local clients) is not part of the prompt.
  system_prompt = join("\n\n", [for f in local.prompt_files : trimspace(replace(file(f), "/(?s)\\A---\\n.*?\\n---\\n/", ""))])
  image_uri     = "${aws_ecr_repository.env.repository_url}:${var.image_tag}"
}

resource "aws_bedrockagentcore_harness" "agent" {
  count              = var.image_tag == "" ? 0 : 1
  harness_name       = local.name_id
  execution_role_arn = aws_iam_role.harness.arn
  max_iterations     = 80
  # Presigned links are long; the model default (4,096) cut the hand-off reply short.
  max_tokens      = 32768
  timeout_seconds = 1800

  model {
    bedrock_model_config {
      model_id   = var.model_id
      max_tokens = 32768
      # The harness passes guardrailConfig to Amazon Bedrock with every model request (converse_stream, its default API format).
      additional_params = var.enable_guardrail ? jsonencode({
        guardrailConfig = {
          guardrailIdentifier = aws_bedrock_guardrail.agent[0].guardrail_arn
          guardrailVersion    = aws_bedrock_guardrail_version.agent[0].version
        }
      }) : null
    }
  }

  system_prompt {
    text = local.system_prompt
  }

  # Idle sessions stop after 10 minutes (default 15): memory is billed while a session idles.
  environment {
    agentcore_runtime_environment {
      network_configuration {
        network_mode = local.vpc_mode ? "VPC" : "PUBLIC"
        dynamic "network_mode_config" {
          for_each = local.vpc_mode ? [1] : []
          content {
            subnets         = var.vpc_subnet_ids
            security_groups = var.vpc_security_group_ids
          }
        }
      }
      lifecycle_configuration {
        idle_runtime_session_timeout = 600
        max_lifetime                 = 28800
      }
    }
  }

  environment_artifact {
    container_configuration {
      container_uri = local.image_uri
    }
  }

  environment_variables = {
    AWS_ARCH_OUTPUT_BUCKET = aws_s3_bucket.outputs.id
  }

  dynamic "skill" {
    for_each = var.skill_paths
    content {
      path = skill.value
    }
  }

  dynamic "tool" {
    for_each = local.tools_enabled ? [1] : []
    content {
      type = "agentcore_gateway"
      name = var.gateway_tool_name
      config {
        agentcore_gateway {
          gateway_arn = aws_bedrockagentcore_gateway.tools[0].gateway_arn
          outbound_auth {
            aws_iam = true
          }
        }
      }
    }
  }

  tool {
    type = "remote_mcp"
    name = "aws_knowledge"
    config {
      remote_mcp {
        url = "https://knowledge-mcp.global.api.aws"
      }
    }
  }

  memory {
    managed_memory_configuration {
      event_expiry_duration = 30
      # USER_PREFERENCE keeps each user's house style (figure rules, Region, brand) across sessions.
      strategies = ["SEMANTIC", "SUMMARIZATION", "USER_PREFERENCE"]
    }
  }

  dynamic "authorizer_configuration" {
    for_each = var.harness_signin == "cognito" ? [1] : []
    content {
      custom_jwt_authorizer {
        discovery_url   = local.cognito_discovery_url
        allowed_clients = [aws_cognito_user_pool_client.cli.id]
      }
    }
  }
}

# Optional guardrail on the harness model requests. Its prompt attack filter screens the conversation text
# (jailbreaks, prompt injection); Bedrock does not apply it to tool results, which the prompt rules cover.
resource "aws_bedrock_guardrail" "agent" {
  count                     = var.enable_guardrail ? 1 : 0
  name                      = "${var.name}-guardrail"
  description               = "Prompt attack filter for the AWS Architecture Agent harness"
  blocked_input_messaging   = "This request was blocked because it reads like an attempt to override the agent's instructions."
  blocked_outputs_messaging = "This response was blocked by the agent's guardrail."

  content_policy_config {
    filters_config {
      type            = "PROMPT_ATTACK"
      input_strength  = var.guardrail_prompt_attack_strength
      output_strength = "NONE"
    }
  }
}

# The harness uses a fixed version; a change to the guardrail publishes a new one before the old one goes.
resource "aws_bedrock_guardrail_version" "agent" {
  count         = var.enable_guardrail ? 1 : 0
  guardrail_arn = aws_bedrock_guardrail.agent[0].guardrail_arn
  description   = "Version the harness applies"

  lifecycle {
    create_before_destroy = true
    replace_triggered_by  = [aws_bedrock_guardrail.agent[count.index]]
  }
}
