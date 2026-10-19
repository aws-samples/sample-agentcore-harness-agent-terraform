# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
# kics-scan disable=e592a0c5-5bdb-414c-9066-5dba7cdea370
# IAM Access Analyzer is an account setting (create_access_analyzer in iam.tf), not part of this file.
# Quality and reach: traces into CloudWatch, online scoring of a sample of sessions,
# and a registry entry so other teams can find the agent's tools.

data "aws_iam_policy_document" "transaction_search" {
  statement {
    sid     = "TransactionSearchXRayAccess"
    actions = ["logs:PutLogEvents"]
    principals {
      type        = "Service"
      identifiers = ["xray.amazonaws.com"]
    }
    resources = [
      "arn:${local.partition}:logs:${var.region}:${local.account_id}:log-group:aws/spans:*",
      "arn:${local.partition}:logs:${var.region}:${local.account_id}:log-group:/aws/application-signals/data:*",
    ]
    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values   = ["arn:${local.partition}:xray:${var.region}:${local.account_id}:*"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.account_id]
    }
  }
}

resource "aws_cloudwatch_log_resource_policy" "transaction_search" {
  count           = var.enable_transaction_search ? 1 : 0
  policy_name     = "${var.name}-transaction-search"
  policy_document = data.aws_iam_policy_document.transaction_search.json
}

resource "aws_xray_trace_segment_destination" "this" {
  count       = var.enable_transaction_search ? 1 : 0
  destination = "CloudWatchLogs"
  depends_on  = [aws_cloudwatch_log_resource_policy.transaction_search]
}

locals {
  harness_runtime = try(one(aws_bedrockagentcore_harness.agent[0].environment_actual[0].agentcore_runtime_environment), null)
}

# Scores a whole session: did the agent run the checks, look at the result and hand over links?
resource "aws_bedrockagentcore_evaluator" "handoff" {
  evaluator_name = "${local.name_id}_handoff"
  description    = "Did the agent verify its figure or document and hand over download links?"
  level          = "SESSION"

  evaluator_config {
    llm_as_a_judge {
      instructions = <<-EOT
        You review one session of an AWS architecture agent that draws diagrams and writes design documents.
        Session, including the final reply: {context}
        Score 1 only if every deliverable the user asked for was produced, the layout checks were run and passed for every figure
        (or the document built without lint errors), and the final reply gives download links, the diagrams.net link for figures,
        and alt text or a one-line summary. Score 0 if checks were skipped or failed, links are missing, or the agent stopped early.
      EOT
      rating_scale {
        numerical {
          value      = 0
          label      = "fail"
          definition = "Checks skipped or failing, deliverables or links missing, or the session stopped early."
        }
        numerical {
          value      = 1
          label      = "pass"
          definition = "Deliverables verified and handed over with links."
        }
      }
      model_config {
        bedrock_evaluator_model_config {
          model_id = var.evaluator_model_id
        }
      }
    }
  }
}

data "aws_iam_policy_document" "evaluation_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["bedrock-agentcore.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.account_id]
    }
    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values = [
        "arn:${local.partition}:bedrock-agentcore:${var.region}:${local.account_id}:evaluator/*",
        "arn:${local.partition}:bedrock-agentcore:${var.region}:${local.account_id}:online-evaluation-config/*",
      ]
    }
  }
}

resource "aws_iam_role" "evaluation" {
  name               = "${var.name}-evaluation"
  assume_role_policy = data.aws_iam_policy_document.evaluation_trust.json
}

data "aws_iam_policy_document" "evaluation" {
  #checkov:skip=CKV_AWS_356:logs:GetQueryResults supports no resource type (Service Authorization Reference); every other statement is scoped.
  statement {
    sid       = "ReadTraces"
    actions   = ["logs:DescribeLogGroups", "logs:StartQuery"]
    resources = ["arn:${local.partition}:logs:${var.region}:${local.account_id}:log-group:*"]
  }
  # GetQueryResults supports no resource type.
  statement {
    sid       = "ReadQueryResults"
    actions   = ["logs:GetQueryResults"]
    resources = ["*"]
  }
  statement {
    sid       = "WriteResults"
    actions   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["arn:${local.partition}:logs:${var.region}:${local.account_id}:log-group:/aws/bedrock-agentcore/evaluations/*"]
  }
  statement {
    sid     = "SpansIndex"
    actions = ["logs:DescribeIndexPolicies", "logs:PutIndexPolicy"]
    resources = [
      "arn:${local.partition}:logs:${var.region}:${local.account_id}:log-group:aws/spans",
      "arn:${local.partition}:logs:${var.region}:${local.account_id}:log-group:aws/spans:*",
    ]
  }
  statement {
    sid     = "JudgeModel"
    actions = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
    resources = [
      "arn:${local.partition}:bedrock:${var.region}:${local.account_id}:inference-profile/${var.evaluator_model_id}",
      "arn:${local.partition}:bedrock:*::foundation-model/*",
    ]
  }
}

resource "aws_iam_role_policy" "evaluation" {
  name   = "evaluation"
  role   = aws_iam_role.evaluation.id
  policy = data.aws_iam_policy_document.evaluation.json
}

resource "aws_bedrockagentcore_online_evaluation_config" "agent" {
  count                         = var.image_tag == "" ? 0 : 1
  online_evaluation_config_name = "${local.name_id}_online"
  description                   = "Scores a sample of hosted agent sessions"
  enable_on_create              = true
  evaluation_execution_role_arn = aws_iam_role.evaluation.arn

  data_source_config {
    cloudwatch_logs {
      log_group_names = ["/aws/bedrock-agentcore/runtimes/${local.harness_runtime.agent_runtime_id}-DEFAULT"]
      service_names   = ["${local.harness_runtime.agent_runtime_name}.DEFAULT"]
    }
  }

  evaluator {
    evaluator_id = "Builtin.Helpfulness"
  }
  evaluator {
    evaluator_id = "Builtin.GoalSuccessRate"
  }
  evaluator {
    evaluator_id = aws_bedrockagentcore_evaluator.handoff.evaluator_id
  }

  rule {
    sampling_config {
      sampling_percentage = var.evaluation_sampling_percent
    }
  }

  depends_on = [aws_iam_role_policy.evaluation, aws_xray_trace_segment_destination.this]
}

# A registry for the agent's tools; scripts/register-tools.sh adds the record.
resource "aws_agentregistry_registry" "agent" {
  name        = "${var.name}-registry"
  description = "AWS Architecture Agent tools and skills"

  discovery_configuration {
    authorizer_type = "AWS_IAM"
  }

  approval_configuration {
    auto_approval_rules = ["APPROVE_ALL"]
  }
}
