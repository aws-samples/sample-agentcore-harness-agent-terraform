# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
output "ecr_repository_url" {
  description = "ECR repository the image build pushes to"
  value       = aws_ecr_repository.env.repository_url
}

output "image_tag" {
  description = "Image tag the harness and the tools runtime run"
  value       = var.image_tag
}

output "codebuild_project" {
  description = "CodeBuild project that builds the image"
  value       = aws_codebuild_project.image.name
}

output "build_bucket" {
  description = "S3 bucket for image build contexts"
  value       = aws_s3_bucket.build.id
}

output "outputs_bucket" {
  description = "S3 bucket for the agent's figures and documents"
  value       = aws_s3_bucket.outputs.id
}

output "user_pool_id" {
  description = "Cognito user pool for harness_signin = cognito and the sign-in gateway"
  value       = aws_cognito_user_pool.users.id
}

output "user_pool_client_id" {
  description = "Cognito app client for harness_signin = cognito and the sign-in gateway"
  value       = aws_cognito_user_pool_client.cli.id
}

output "harness_arn" {
  description = "ARN of the AgentCore harness"
  value       = one(aws_bedrockagentcore_harness.agent[*].arn)
}

output "harness_signin" {
  description = "How callers reach the harness: iam or cognito"
  value       = var.harness_signin
}

output "harness_runtime_id" {
  description = "AgentCore Runtime id behind the harness"
  value       = try(local.harness_runtime.agent_runtime_id, null)
}

output "evaluator_id" {
  description = "Custom AgentCore Evaluations evaluator"
  value       = aws_bedrockagentcore_evaluator.handoff.evaluator_id
}

output "tools_gateway_url" {
  description = "MCP URL of the IAM (SigV4) tools gateway"
  value       = one(aws_bedrockagentcore_gateway.tools[*].gateway_url)
}

output "tools_signin_gateway_url" {
  description = "MCP URL of the Cognito sign-in tools gateway, when enabled"
  value       = one(aws_bedrockagentcore_gateway.tools_jwt[*].gateway_url)
}


# Read by scripts/gateway-controls.sh: each gateway's id, ARN and caller identity, and where its policies live.
output "tools_gateways" {
  description = "Each tools gateway's id, ARN and authorizer type"
  value = {
    for g in concat(aws_bedrockagentcore_gateway.tools, aws_bedrockagentcore_gateway.tools_jwt) :
    g.name => { id = g.gateway_id, arn = g.gateway_arn, authorizer = g.authorizer_type }
  }
}

output "tools_target_name" {
  description = "Gateway target name of the MCP tools runtime"
  value       = local.target_name
}

output "policy_engine_id" {
  description = "AgentCore Policy engine that holds the gateway policies"
  value       = aws_bedrockagentcore_policy_engine.tools.policy_engine_id
}

output "tools_runtime_arn" {
  description = "ARN of the MCP tools runtime"
  value       = one(aws_bedrockagentcore_agent_runtime.tools[*].agent_runtime_arn)
}

output "registry_id" {
  description = "AWS Agent Registry that lists the tools gateway"
  value       = aws_agentregistry_registry.agent.registry_id
}

output "dashboard_url" {
  description = "CloudWatch dashboard for the stack"
  value       = one([for d in aws_cloudwatch_dashboard.stack : "https://${var.region}.console.aws.amazon.com/cloudwatch/home?region=${var.region}#dashboards/dashboard/${d.dashboard_name}"])
}

output "alarm_topic_arn" {
  description = "SNS topic that the alarms publish to"
  value       = one(aws_sns_topic.alarms[*].arn)
}
