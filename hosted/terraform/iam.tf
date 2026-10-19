# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
data "aws_iam_policy_document" "codebuild_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["codebuild.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.account_id]
    }
  }
}

resource "aws_iam_role" "build" {
  name               = "${var.name}-build"
  assume_role_policy = data.aws_iam_policy_document.codebuild_trust.json
}

data "aws_iam_policy_document" "build" {
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.build.arn}:*"]
  }
  statement {
    sid       = "ReadContext"
    actions   = ["s3:GetObject", "s3:GetObjectVersion"]
    resources = ["${aws_s3_bucket.build.arn}/context/*"]
  }
  statement {
    sid       = "EcrLogin"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }
  statement {
    sid = "EcrPush"
    actions = [
      "ecr:BatchCheckLayerAvailability", "ecr:InitiateLayerUpload", "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload", "ecr:PutImage", "ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer",
    ]
    resources = [aws_ecr_repository.env.arn]
  }
}

resource "aws_iam_role_policy" "build" {
  name   = "build"
  role   = aws_iam_role.build.id
  policy = data.aws_iam_policy_document.build.json
}

# ---------- harness execution role ----------

data "aws_iam_policy_document" "agentcore_trust" {
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
      values   = ["arn:${local.partition}:bedrock-agentcore:${var.region}:${local.account_id}:*"]
    }
  }
}

resource "aws_iam_role" "harness" {
  name               = "${var.name}-harness"
  assume_role_policy = data.aws_iam_policy_document.agentcore_trust.json
}

data "aws_iam_policy_document" "harness" {
  #checkov:skip=CKV_AWS_107:ecr-public:GetAuthorizationToken and sts:GetServiceBearerToken are required for the harness to pull its managed image (AgentCore harness execution role policy); they support no resource type.
  # Only the configured model: a caller can override the model on a single InvokeHarness call, and this keeps that
  # override on the same model (reached only through its inference profile).
  statement {
    sid       = "InvokeInferenceProfile"
    actions   = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
    resources = local.model_is_profile ? ["arn:${local.partition}:bedrock:${var.region}:${local.account_id}:inference-profile/${var.model_id}"] : ["arn:${local.partition}:bedrock:${var.region}::foundation-model/${var.model_id}"]
  }
  dynamic "statement" {
    for_each = local.model_is_profile ? [1] : []
    content {
      sid       = "InvokeModelThroughProfile"
      actions   = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
      resources = ["arn:${local.partition}:bedrock:*::foundation-model/${local.foundation_model_id}*"]
      condition {
        test     = "StringEquals"
        variable = "bedrock:InferenceProfileArn"
        values   = ["arn:${local.partition}:bedrock:${var.region}:${local.account_id}:inference-profile/${var.model_id}"]
      }
    }
  }
  statement {
    sid       = "PullImage"
    actions   = ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer"]
    resources = [aws_ecr_repository.env.arn]
  }
  statement {
    sid       = "EcrToken"
    actions   = ["ecr:GetAuthorizationToken", "ecr-public:GetAuthorizationToken", "sts:GetServiceBearerToken"]
    resources = ["*"]
  }
  statement {
    sid       = "Tracing"
    actions   = ["xray:PutTraceSegments", "xray:PutTelemetryRecords", "xray:GetSamplingRules", "xray:GetSamplingTargets"]
    resources = ["*"]
  }
  statement {
    sid       = "LogGroups"
    actions   = ["logs:CreateLogGroup", "logs:DescribeLogStreams"]
    resources = ["arn:${local.partition}:logs:${var.region}:${local.account_id}:log-group:/aws/bedrock-agentcore/runtimes/*"]
  }
  statement {
    sid       = "DescribeLogGroups"
    actions   = ["logs:DescribeLogGroups"]
    resources = ["arn:${local.partition}:logs:${var.region}:${local.account_id}:log-group:*"]
  }
  statement {
    sid       = "LogStreams"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["arn:${local.partition}:logs:${var.region}:${local.account_id}:log-group:/aws/bedrock-agentcore/runtimes/*:log-stream:*"]
  }
  statement {
    sid       = "Metrics"
    actions   = ["cloudwatch:PutMetricData"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "cloudwatch:namespace"
      values   = ["bedrock-agentcore"]
    }
  }
  statement {
    sid     = "WorkloadIdentity"
    actions = ["bedrock-agentcore:GetWorkloadAccessToken", "bedrock-agentcore:GetWorkloadAccessTokenForJWT"]
    resources = [
      "arn:${local.partition}:bedrock-agentcore:${var.region}:${local.account_id}:workload-identity-directory/default",
      "arn:${local.partition}:bedrock-agentcore:${var.region}:${local.account_id}:workload-identity-directory/default/workload-identity/*",
    ]
  }
  statement {
    sid       = "ManagedMemory"
    actions   = ["bedrock-agentcore:CreateEvent", "bedrock-agentcore:DeleteEvent", "bedrock-agentcore:GetEvent", "bedrock-agentcore:ListEvents", "bedrock-agentcore:RetrieveMemoryRecords"]
    resources = ["arn:${local.partition}:bedrock-agentcore:${var.region}:${local.account_id}:memory/${local.name_id}-*"]
  }
  statement {
    sid       = "WriteOutputs"
    actions   = ["s3:PutObject", "s3:GetObject"]
    resources = ["${aws_s3_bucket.outputs.arn}/*"]
  }
  # CreateWorkload and ListWorkloads support no resource type; everything else is scoped to workloads.
  statement {
    sid       = "WellArchitectedCreate"
    actions   = ["wellarchitected:CreateWorkload", "wellarchitected:ListWorkloads"]
    resources = ["*"]
  }
  statement {
    sid = "WellArchitectedReviews"
    actions = [
      "wellarchitected:GetWorkload", "wellarchitected:ListAnswers", "wellarchitected:GetAnswer",
      "wellarchitected:UpdateAnswer", "wellarchitected:CreateMilestone", "wellarchitected:ListLensReviews",
      "wellarchitected:GetLensReview",
    ]
    resources = ["arn:${local.partition}:wellarchitected:${var.region}:${local.account_id}:workload/*"]
  }
  statement {
    sid       = "InvokeToolsGateway"
    actions   = ["bedrock-agentcore:InvokeGateway"]
    resources = ["arn:${local.partition}:bedrock-agentcore:${var.region}:${local.account_id}:gateway/${var.name}-tools-*"]
  }
  dynamic "statement" {
    for_each = var.enable_guardrail ? [1] : []
    content {
      sid       = "ApplyGuardrail"
      actions   = ["bedrock:ApplyGuardrail"]
      resources = [aws_bedrock_guardrail.agent[0].guardrail_arn]
    }
  }
  # In VPC mode the harness pulls its managed image from a private ECR repository in the Region (harness-*, owned by
  # an AWS account) instead of from ECR Public.
  dynamic "statement" {
    for_each = local.vpc_mode ? [1] : []
    content {
      sid       = "PullManagedImageInVpc"
      actions   = ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:BatchCheckLayerAvailability"]
      resources = ["arn:${local.partition}:ecr:${var.region}:*:repository/harness-*"]
    }
  }
}

resource "aws_iam_role_policy" "harness" {
  name   = "harness"
  role   = aws_iam_role.harness.id
  policy = data.aws_iam_policy_document.harness.json
}

# ---------- MCP tools runtime role ----------

resource "aws_iam_role" "tools" {
  name               = "${var.name}-tools"
  assume_role_policy = data.aws_iam_policy_document.agentcore_trust.json
}

data "aws_iam_policy_document" "tools" {
  statement {
    sid       = "PullImage"
    actions   = ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer"]
    resources = [aws_ecr_repository.env.arn]
  }
  statement {
    sid       = "EcrToken"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }
  statement {
    sid       = "LogGroups"
    actions   = ["logs:CreateLogGroup", "logs:DescribeLogStreams"]
    resources = ["arn:${local.partition}:logs:${var.region}:${local.account_id}:log-group:/aws/bedrock-agentcore/runtimes/*"]
  }
  statement {
    sid       = "DescribeLogGroups"
    actions   = ["logs:DescribeLogGroups"]
    resources = ["arn:${local.partition}:logs:${var.region}:${local.account_id}:log-group:*"]
  }
  statement {
    sid       = "LogStreams"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["arn:${local.partition}:logs:${var.region}:${local.account_id}:log-group:/aws/bedrock-agentcore/runtimes/*:log-stream:*"]
  }
  statement {
    sid       = "Tracing"
    actions   = ["xray:PutTraceSegments", "xray:PutTelemetryRecords", "xray:GetSamplingRules", "xray:GetSamplingTargets"]
    resources = ["*"]
  }
  statement {
    sid       = "Metrics"
    actions   = ["cloudwatch:PutMetricData"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "cloudwatch:namespace"
      values   = ["bedrock-agentcore"]
    }
  }
  statement {
    sid     = "WorkloadIdentity"
    actions = ["bedrock-agentcore:GetWorkloadAccessToken", "bedrock-agentcore:GetWorkloadAccessTokenForJWT"]
    resources = [
      "arn:${local.partition}:bedrock-agentcore:${var.region}:${local.account_id}:workload-identity-directory/default",
      "arn:${local.partition}:bedrock-agentcore:${var.region}:${local.account_id}:workload-identity-directory/default/workload-identity/*",
    ]
  }
  statement {
    sid       = "WriteOutputs"
    actions   = ["s3:PutObject", "s3:GetObject"]
    resources = ["${aws_s3_bucket.outputs.arn}/mcp/*"]
  }
  # ask_architect: one turn of the harness through its endpoint (InvokeHarness needs both actions on both ARNs).
  dynamic "statement" {
    for_each = local.ask_enabled ? [1] : []
    content {
      sid     = "InvokeHarness"
      actions = ["bedrock-agentcore:InvokeHarness", "bedrock-agentcore:InvokeAgentRuntime"]
      resources = [
        aws_bedrockagentcore_harness.agent[0].arn,
        "${aws_bedrockagentcore_harness.agent[0].arn}/harness-endpoint/${var.ask_architect_endpoint}",
      ]
    }
  }
}

resource "aws_iam_role_policy" "tools" {
  name   = "tools"
  role   = aws_iam_role.tools.id
  policy = data.aws_iam_policy_document.tools.json
}

# ---------- gateway role ----------

resource "aws_iam_role" "gateway" {
  name               = "${var.name}-gateway"
  assume_role_policy = data.aws_iam_policy_document.agentcore_trust.json
}

data "aws_iam_policy_document" "gateway" {
  statement {
    sid     = "InvokeToolsRuntime"
    actions = ["bedrock-agentcore:InvokeAgentRuntime"]
    resources = [
      "arn:${local.partition}:bedrock-agentcore:${var.region}:${local.account_id}:runtime/${local.name_id}_tools-*",
    ]
  }
  statement {
    sid     = "PolicyEngine"
    actions = ["bedrock-agentcore:GetPolicyEngine", "bedrock-agentcore:AuthorizeAction", "bedrock-agentcore:PartiallyAuthorizeActions"]
    resources = [
      aws_bedrockagentcore_policy_engine.tools.policy_engine_arn,
      "arn:${local.partition}:bedrock-agentcore:${var.region}:${local.account_id}:gateway/${var.name}-tools-*",
    ]
  }
  statement {
    sid     = "WorkloadIdentity"
    actions = ["bedrock-agentcore:GetWorkloadAccessToken", "bedrock-agentcore:GetWorkloadAccessTokenForJWT", "bedrock-agentcore:GetWorkloadAccessTokenForUserId"]
    resources = [
      "arn:${local.partition}:bedrock-agentcore:${var.region}:${local.account_id}:workload-identity-directory/default",
      "arn:${local.partition}:bedrock-agentcore:${var.region}:${local.account_id}:workload-identity-directory/default/workload-identity/*",
    ]
  }
}

resource "aws_iam_role_policy" "gateway" {
  name   = "gateway"
  role   = aws_iam_role.gateway.id
  policy = data.aws_iam_policy_document.gateway.json
}

# ---------- IAM Access Analyzer ----------

# An account holds one account-level external access analyzer per Region, and many accounts already have one (or an
# organization analyzer), so the stack adds one only when asked.
resource "aws_accessanalyzer_analyzer" "account" {
  count         = var.create_access_analyzer ? 1 : 0
  analyzer_name = "${var.name}-external-access"
  type          = "ACCOUNT"
}
