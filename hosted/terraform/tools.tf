# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
# kics-scan disable=e592a0c5-5bdb-414c-9066-5dba7cdea370
# IAM Access Analyzer is an account setting (create_access_analyzer in iam.tf), not part of this file.
# The agent's MCP server, hosted on AgentCore Runtime (MCP protocol) from the same
# image, behind an AgentCore Gateway whose policy engine allows only the listed tools.
locals {
  tools_enabled = var.image_tag != "" && var.enable_mcp_tools
  tool_names    = var.tool_names
  target_name   = var.tools_target_name
  tool_callers  = concat([aws_iam_role.harness.name], var.tool_caller_role_names, local.canary_enabled ? [local.canary_role] : [])
  caller_condition = join(" || ", [
    for r in local.tool_callers : format("principal.id like %q", "arn:${local.partition}:sts::${local.account_id}:assumed-role/${r}*")
  ])
  ask_enabled = local.tools_enabled && var.enable_ask_architect
  # ask_architect runs the harness, so the harness role never gets it: a turn would call itself.
  ask_condition = join(" || ", [
    for r in var.tool_caller_role_names : format("principal.id like %q", "arn:${local.partition}:sts::${local.account_id}:assumed-role/${r}*")
  ])
}

resource "aws_bedrockagentcore_agent_runtime" "tools" {
  count              = local.tools_enabled ? 1 : 0
  agent_runtime_name = "${local.name_id}_tools"
  description        = "AWS Architecture Agent MCP tools"
  role_arn           = aws_iam_role.tools.arn

  agent_runtime_artifact {
    container_configuration {
      container_uri = local.image_uri
    }
  }

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

  protocol_configuration {
    server_protocol = "MCP"
  }

  environment_variables = merge(
    {
      AWS_ARCH_OUTPUT_BUCKET = aws_s3_bucket.outputs.id
    },
    var.enable_ask_architect ? {
      AWS_ARCH_HARNESS_ARN      = aws_bedrockagentcore_harness.agent[0].arn
      AWS_ARCH_HARNESS_ENDPOINT = var.ask_architect_endpoint
    } : {},
  )
}

# Optional: the gateways sign their calls to the tools runtime with the gateway role, so a deny for every other
# principal leaves the gateway, with its Cedar policy, as the only way in. The deny also covers command and shell
# sessions, which reach into a running session.
data "aws_iam_policy_document" "tools_runtime_access" {
  count = local.tools_enabled && var.restrict_tools_runtime_to_gateway ? 1 : 0
  statement {
    sid       = "AllowGatewayRole"
    actions   = ["bedrock-agentcore:InvokeAgentRuntime"]
    resources = [aws_bedrockagentcore_agent_runtime.tools[0].agent_runtime_arn]
    principals {
      type        = "AWS"
      identifiers = [aws_iam_role.gateway.arn]
    }
  }
  statement {
    sid    = "DenyOtherPrincipals"
    effect = "Deny"
    actions = [
      "bedrock-agentcore:InvokeAgentRuntime", "bedrock-agentcore:InvokeAgentRuntimeForUser",
      "bedrock-agentcore:InvokeAgentRuntimeCommand", "bedrock-agentcore:InvokeAgentRuntimeCommandShell",
      "bedrock-agentcore:InvokeAgentRuntimeWithWebSocketStream", "bedrock-agentcore:InvokeAgentRuntimeWithWebSocketStreamForUser",
    ]
    resources = [aws_bedrockagentcore_agent_runtime.tools[0].agent_runtime_arn]
    principals {
      type        = "AWS"
      identifiers = ["*"]
    }
    condition {
      test     = "ArnNotEquals"
      variable = "aws:PrincipalArn"
      values   = [aws_iam_role.gateway.arn]
    }
  }
}

resource "aws_bedrockagentcore_resource_policy" "tools" {
  count        = local.tools_enabled && var.restrict_tools_runtime_to_gateway ? 1 : 0
  resource_arn = aws_bedrockagentcore_agent_runtime.tools[0].agent_runtime_arn
  policy       = data.aws_iam_policy_document.tools_runtime_access[0].json
}

resource "aws_bedrockagentcore_policy_engine" "tools" {
  name        = "${local.name_id}_tools"
  description = "Tool rules for the AWS Architecture Agent gateway"
}

resource "aws_bedrockagentcore_gateway" "tools" {
  count           = local.tools_enabled ? 1 : 0
  name            = "${var.name}-tools"
  description     = "AWS Architecture Agent tools"
  role_arn        = aws_iam_role.gateway.arn
  authorizer_type = "AWS_IAM"
  protocol_type   = "MCP"

  policy_engine_configuration {
    arn  = aws_bedrockagentcore_policy_engine.tools.policy_engine_arn
    mode = var.policy_mode
  }
}

resource "aws_bedrockagentcore_gateway_target" "tools" {
  count              = local.tools_enabled ? 1 : 0
  name               = local.target_name
  description        = "The plugin's MCP server on AgentCore Runtime"
  gateway_identifier = aws_bedrockagentcore_gateway.tools[0].gateway_id

  credential_provider_configuration {
    gateway_iam_role {
      service = "bedrock-agentcore"
    }
  }

  target_configuration {
    mcp {
      mcp_server {
        endpoint = "https://bedrock-agentcore.${var.region}.amazonaws.com/runtimes/${urlencode(aws_bedrockagentcore_agent_runtime.tools[0].agent_runtime_arn)}/invocations?qualifier=DEFAULT"
      }
    }
  }
}

# Default deny: only the harness role (and any listed caller roles) may call, and only the listed tools.
resource "aws_bedrockagentcore_policy" "allow_tools" {
  count            = local.tools_enabled ? 1 : 0
  name             = "allow_architecture_tools"
  description      = "Permit the AWS Architecture Agent tools and nothing else"
  policy_engine_id = aws_bedrockagentcore_policy_engine.tools.policy_engine_id

  definition {
    cedar {
      statement = <<-EOT
        permit(
          principal is AgentCore::IamEntity,
          action in [
            ${join(",\n            ", [for t in local.tool_names : "AgentCore::Action::\"${local.target_name}___${t}\""])}
          ],
          resource == AgentCore::Gateway::"${aws_bedrockagentcore_gateway.tools[0].gateway_arn}"
        )
        when { ${local.caller_condition} };
      EOT
    }
  }

  # Validation reads the gateway's tool schema, which exists once the target has synced.
  depends_on = [aws_bedrockagentcore_gateway_target.tools]
}

# ask_architect on the IAM gateway: only the listed caller roles (people's MCP clients through a SigV4 proxy).
resource "aws_bedrockagentcore_policy" "allow_ask_architect" {
  count            = local.ask_enabled && length(var.tool_caller_role_names) > 0 ? 1 : 0
  name             = "allow_ask_architect"
  description      = "Permit ask_architect for the listed caller roles, never the harness itself"
  policy_engine_id = aws_bedrockagentcore_policy_engine.tools.policy_engine_id

  definition {
    cedar {
      statement = <<-EOT
        permit(
          principal is AgentCore::IamEntity,
          action == AgentCore::Action::"${local.target_name}___ask_architect",
          resource == AgentCore::Gateway::"${aws_bedrockagentcore_gateway.tools[0].gateway_arn}"
        )
        when { ${local.ask_condition} };
      EOT
    }
  }

  depends_on = [aws_bedrockagentcore_gateway_target.tools]
}

# A second gateway in front of the same tools runtime for MCP clients (Kiro, Claude Code,
# Cursor) that sign in with the stack's Cognito user pool instead of signing with AWS credentials.
resource "aws_bedrockagentcore_gateway" "tools_jwt" {
  count           = local.tools_enabled && var.enable_jwt_gateway ? 1 : 0
  name            = "${var.name}-tools-signin"
  description     = "AWS Architecture Agent tools for signed-in MCP clients"
  role_arn        = aws_iam_role.gateway.arn
  authorizer_type = "CUSTOM_JWT"
  protocol_type   = "MCP"

  authorizer_configuration {
    custom_jwt_authorizer {
      discovery_url   = local.cognito_discovery_url
      allowed_clients = [aws_cognito_user_pool_client.cli.id]
    }
  }

  protocol_configuration {
    mcp {
      instructions = "AWS architecture diagrams and design documents. Call get_authoring_guide before writing a scene or a document, and pass file contents in the *_source arguments."
    }
  }

  policy_engine_configuration {
    arn  = aws_bedrockagentcore_policy_engine.tools.policy_engine_arn
    mode = var.policy_mode
  }
}

resource "aws_bedrockagentcore_gateway_target" "tools_jwt" {
  count              = local.tools_enabled && var.enable_jwt_gateway ? 1 : 0
  name               = local.target_name
  description        = "The plugin's MCP server on AgentCore Runtime"
  gateway_identifier = aws_bedrockagentcore_gateway.tools_jwt[0].gateway_id

  credential_provider_configuration {
    gateway_iam_role {
      service = "bedrock-agentcore"
    }
  }

  target_configuration {
    mcp {
      mcp_server {
        endpoint = "https://bedrock-agentcore.${var.region}.amazonaws.com/runtimes/${urlencode(aws_bedrockagentcore_agent_runtime.tools[0].agent_runtime_arn)}/invocations?qualifier=DEFAULT"
      }
    }
  }
}

# Any user of the pool (admin-created only) may call the listed tools on the sign-in gateway.
resource "aws_bedrockagentcore_policy" "allow_tools_jwt" {
  count            = local.tools_enabled && var.enable_jwt_gateway ? 1 : 0
  name             = "allow_architecture_tools_signin"
  description      = "Permit the AWS Architecture Agent tools for signed-in users"
  policy_engine_id = aws_bedrockagentcore_policy_engine.tools.policy_engine_id

  definition {
    cedar {
      statement = <<-EOT
        permit(
          principal is AgentCore::OAuthUser,
          action in [
            ${join(",\n            ", [for t in local.tool_names : "AgentCore::Action::\"${local.target_name}___${t}\""])}
          ],
          resource == AgentCore::Gateway::"${aws_bedrockagentcore_gateway.tools_jwt[0].gateway_arn}"
        )
        when { principal.hasTag("iss") && principal.getTag("iss") == "https://cognito-idp.${var.region}.amazonaws.com/${aws_cognito_user_pool.users.id}" };
      EOT
    }
  }

  depends_on = [aws_bedrockagentcore_gateway_target.tools_jwt]
}

resource "aws_bedrockagentcore_policy" "allow_ask_architect_jwt" {
  count            = local.ask_enabled && var.enable_jwt_gateway ? 1 : 0
  name             = "allow_ask_architect_signin"
  description      = "Permit ask_architect for signed-in users of the pool"
  policy_engine_id = aws_bedrockagentcore_policy_engine.tools.policy_engine_id

  definition {
    cedar {
      statement = <<-EOT
        permit(
          principal is AgentCore::OAuthUser,
          action == AgentCore::Action::"${local.target_name}___ask_architect",
          resource == AgentCore::Gateway::"${aws_bedrockagentcore_gateway.tools_jwt[0].gateway_arn}"
        )
        when { principal.hasTag("iss") && principal.getTag("iss") == "https://cognito-idp.${var.region}.amazonaws.com/${aws_cognito_user_pool.users.id}" };
      EOT
    }
  }

  depends_on = [aws_bedrockagentcore_gateway_target.tools_jwt]
}

