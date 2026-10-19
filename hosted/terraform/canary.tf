# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
# kics-scan disable=e592a0c5-5bdb-414c-9066-5dba7cdea370
# IAM Access Analyzer is an account setting (create_access_analyzer in iam.tf), not part of this file.
# Optional canary (enable_canary). Every 15 minutes a CloudWatch Synthetics script lists the tools and calls
# find_icon through the IAM gateway, as an MCP client does, so a broken release shows before a user meets it. The
# canary role joins the Cedar callers (tools.tf) and may invoke only that gateway.

locals {
  canary_enabled = local.tools_enabled && var.enable_canary
  canary_role    = "${var.name}-canary"
  # Canary names allow 21 lowercase letters, digits, hyphens and underscores.
  canary_name = substr("${var.name}-tools", 0, 21)
}

data "archive_file" "canary" {
  count       = local.canary_enabled ? 1 : 0
  type        = "zip"
  source_dir  = "${path.module}/../canary"
  output_path = "${path.module}/.terraform/canary.zip"
}

data "aws_iam_policy_document" "canary_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "canary" {
  count              = local.canary_enabled ? 1 : 0
  name               = local.canary_role
  assume_role_policy = data.aws_iam_policy_document.canary_trust.json
}

data "aws_iam_policy_document" "canary" {
  count = local.canary_enabled ? 1 : 0
  statement {
    sid       = "CallTheTools"
    actions   = ["bedrock-agentcore:InvokeGateway"]
    resources = [aws_bedrockagentcore_gateway.tools[0].gateway_arn]
  }
  statement {
    sid       = "RunArtifacts"
    actions   = ["s3:PutObject", "s3:GetObject"]
    resources = ["${aws_s3_bucket.build.arn}/canary/*"]
  }
  statement {
    sid       = "ArtifactBucket"
    actions   = ["s3:GetBucketLocation"]
    resources = [aws_s3_bucket.build.arn]
  }
  statement {
    sid       = "RunLogs"
    actions   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["arn:${local.partition}:logs:${var.region}:${local.account_id}:log-group:/aws/lambda/cwsyn-${local.canary_name}-*"]
  }
  statement {
    sid       = "SyntheticsRuntime"
    actions   = ["s3:ListAllMyBuckets", "xray:PutTraceSegments"]
    resources = ["*"]
  }
  statement {
    sid       = "RunMetrics"
    actions   = ["cloudwatch:PutMetricData"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "cloudwatch:namespace"
      values   = ["CloudWatchSynthetics"]
    }
  }
}

resource "aws_iam_role_policy" "canary" {
  count  = local.canary_enabled ? 1 : 0
  name   = "canary"
  role   = aws_iam_role.canary[0].id
  policy = data.aws_iam_policy_document.canary[0].json
}

resource "aws_synthetics_canary" "tools" {
  count                    = local.canary_enabled ? 1 : 0
  name                     = local.canary_name
  artifact_s3_location     = "s3://${aws_s3_bucket.build.id}/canary/"
  execution_role_arn       = aws_iam_role.canary[0].arn
  handler                  = "tool_canary.handler"
  runtime_version          = "syn-python-selenium-13.0"
  zip_file                 = data.archive_file.canary[0].output_path
  start_canary             = true
  success_retention_period = 2
  failure_retention_period = 14
  delete_lambda            = true

  schedule {
    expression = "rate(15 minutes)"
  }

  run_config {
    timeout_in_seconds = 60
    environment_variables = {
      GATEWAY_URL = aws_bedrockagentcore_gateway.tools[0].gateway_url
      TOOL_NAME   = "${local.target_name}___find_icon"
    }
  }

  # The Cedar policy must list the canary role before the first run, or the gateway hides every tool from it.
  depends_on = [aws_iam_role_policy.canary, aws_bedrockagentcore_policy.allow_tools]
}

resource "aws_cloudwatch_metric_alarm" "canary" {
  count               = local.canary_enabled && local.monitoring ? 1 : 0
  alarm_name          = "${var.name}-canary-failing"
  alarm_description   = "Two canary runs in a row could not list the tools or call find_icon through the IAM gateway."
  namespace           = "CloudWatchSynthetics"
  metric_name         = "SuccessPercent"
  statistic           = "Average"
  period              = 900
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  threshold           = 100
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  dimensions = {
    CanaryName = aws_synthetics_canary.tools[0].name
  }
}
