# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
variable "region" {
  description = "Region for every resource. The AgentCore harness must be available there."
  type        = string
  default     = "us-east-1"
}

variable "name" {
  description = "Name prefix for every resource (lower case, digits and hyphens)."
  type        = string
  default     = "aws-arch-agent"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,30}$", var.name))
    error_message = "Use 3-31 lower-case letters, digits and hyphens, starting with a letter."
  }
}

variable "model_id" {
  description = "Amazon Bedrock model or inference profile ID the agent reasons with."
  type        = string
  default     = "us.anthropic.claude-sonnet-5-5"
}

variable "image_tag" {
  description = "Tag of the environment image in ECR. Leave empty on the first apply, build the image (scripts/build-image.sh), then apply again with the tag."
  type        = string
  default     = ""
}

variable "output_retention_days" {
  description = "Days before figures and documents in the outputs bucket expire."
  type        = number
  default     = 30
}

variable "log_retention_days" {
  description = "Days to keep build logs."
  type        = number
  default     = 365
}

variable "policy_mode" {
  description = "How AgentCore Policy treats tool calls on the gateway: LOG_ONLY records decisions, ENFORCE blocks anything not permitted."
  type        = string
  default     = "ENFORCE"
  validation {
    condition     = contains(["LOG_ONLY", "ENFORCE"], var.policy_mode)
    error_message = "Use LOG_ONLY or ENFORCE."
  }
}

variable "enable_transaction_search" {
  description = "Send X-Ray trace segments to CloudWatch Logs (Transaction Search), which AgentCore Evaluations reads. This is a Region-wide account setting."
  type        = bool
  default     = true
}

variable "evaluation_sampling_percent" {
  description = "Share of agent sessions scored by AgentCore Evaluations."
  type        = number
  default     = 10
}

variable "evaluator_model_id" {
  description = "Bedrock model or inference profile the custom evaluator judges with."
  type        = string
  default     = "us.anthropic.claude-sonnet-5-5"
}

variable "tool_caller_role_names" {
  description = "IAM role names, besides the harness role, that may call the gateway tools (for example a role MCP clients assume through a SigV4 proxy)."
  type        = list(string)
  default     = []
}

# ---------- the agent being hosted ----------
# The defaults host the AWS Architecture Agent in this repository. To host another
# agent, bake its skills and MCP server into the image and point these at them.

variable "agent_prompt_file" {
  description = "Agent system prompt (markdown; YAML front matter is dropped). Relative paths are from this folder."
  type        = string
  default     = "../../agents/aws-architect.md"
}

variable "extra_prompt_files" {
  description = "More prompt files appended after the agent prompt, in order. The default adds the hosting rules (where to work, how to hand files over)."
  type        = list(string)
  default     = ["../prompt-hosted.md"]
}

variable "skill_paths" {
  description = "Skill folders (each with a SKILL.md) inside the image, loaded by the harness."
  type        = list(string)
  default = [
    "/opt/aws-architecture-agent/skills/aws-archify",
    "/opt/aws-architecture-agent/skills/aws-design-doc",
    "/opt/aws-architecture-agent/skills/aws-docs-lookup",
  ]
}

variable "enable_mcp_tools" {
  description = "Host the image's MCP server on AgentCore Runtime behind the gateway and policy. The server must listen on 0.0.0.0:8000/mcp when the image runs its CMD."
  type        = bool
  default     = true
}

variable "tools_target_name" {
  description = "Gateway target name. Tools appear to callers as <target>___<tool>; the Cedar policy uses the same names."
  type        = string
  default     = "archtools"
}

variable "tool_names" {
  description = "MCP tools the Cedar policy permits on the gateway. Anything else is denied."
  type        = list(string)
  default     = ["get_authoring_guide", "find_icon", "render_diagram", "check_layout", "drawio_link", "build_design_doc", "lint_doc", "send_feedback"]
}

variable "gateway_tool_name" {
  description = "Name of the gateway tool entry on the harness."
  type        = string
  default     = "architecture_tools"
}

variable "harness_signin" {
  description = "How callers reach the harness: \"iam\" (SigV4, only principals granted bedrock-agentcore:InvokeHarness) or \"cognito\" (any user of the stack's user pool). Every caller can override the model, prompt, tools and skills on a call and open a shell in a session, so cognito suits a pool of trusted users only."
  type        = string
  default     = "iam"
  validation {
    condition     = contains(["iam", "cognito"], var.harness_signin)
    error_message = "harness_signin must be iam or cognito."
  }
}

variable "enable_ask_architect" {
  description = "Add the ask_architect MCP tool: it runs the whole hosted agent (the harness) for an MCP client. The tools runtime calls the harness with SigV4, so this needs harness_signin = \"iam\". The harness itself never gets the tool: a turn would call itself."
  type        = bool
  default     = true
  validation {
    condition     = !var.enable_ask_architect || var.harness_signin == "iam"
    error_message = "enable_ask_architect needs harness_signin = \"iam\"."
  }
}

variable "ask_architect_endpoint" {
  description = "Harness endpoint that ask_architect invokes. PROD is the version promote.sh tested; run promote.sh once before the first call."
  type        = string
  default     = "PROD"
}

variable "create_access_analyzer" {
  description = "Create an IAM Access Analyzer for external access in this account and Region. Leave false when the account or its organization already has one (an account holds one account-level analyzer per Region)."
  type        = bool
  default     = false
}

variable "enable_jwt_gateway" {
  description = "Add a second tools gateway that accepts the user pool's access tokens, so MCP clients can connect with a sign-in instead of AWS credentials."
  type        = bool
  default     = false
}



# ---------- optional hardening (every default leaves the stack as it is) ----------

variable "enable_guardrail" {
  description = "Create an Amazon Bedrock guardrail with a prompt attack filter and apply it to every model request the harness makes."
  type        = bool
  default     = false
}

variable "guardrail_prompt_attack_strength" {
  description = "How strictly the guardrail's prompt attack filter judges the conversation: LOW, MEDIUM or HIGH."
  type        = string
  default     = "HIGH"
  validation {
    condition     = contains(["LOW", "MEDIUM", "HIGH"], var.guardrail_prompt_attack_strength)
    error_message = "Use LOW, MEDIUM or HIGH."
  }
}

variable "vpc_subnet_ids" {
  description = "Existing private subnets (in AZs AgentCore supports) for the harness sessions and the MCP tools runtime. Empty keeps both on the public network."
  type        = list(string)
  default     = []
}

variable "vpc_security_group_ids" {
  description = "Existing security groups for the network interfaces of the harness sessions and the MCP tools runtime. Set together with vpc_subnet_ids."
  type        = list(string)
  default     = []
  validation {
    condition     = (length(var.vpc_subnet_ids) == 0) == (length(var.vpc_security_group_ids) == 0)
    error_message = "Set vpc_subnet_ids and vpc_security_group_ids together, or neither."
  }
}

variable "restrict_tools_runtime_to_gateway" {
  description = "Attach a resource policy to the MCP tools runtime that lets only the gateway role invoke it, so nothing reaches the tools around the gateway and its Cedar policy."
  type        = bool
  default     = false
}

variable "enable_monitoring" {
  description = "Spans for every gateway, memory logs, alarms on errors, throttles and slow tool calls, and one CloudWatch dashboard for the stack. AgentCore publishes the metrics either way."
  type        = bool
  default     = true
}

variable "alarm_email" {
  description = "Email address subscribed to the alarm topic; it must confirm the subscription. Empty: alarms still change state and show on the dashboard, but notify no one."
  type        = string
  default     = ""
}

variable "tool_duration_alarm_ms" {
  description = "Alarm when the p90 duration of tool calls through a gateway stays at or above this many milliseconds for 15 minutes."
  type        = number
  default     = 45000
}

variable "enable_canary" {
  description = "A CloudWatch Synthetics canary that lists the tools and calls find_icon through the IAM gateway every 15 minutes, with an alarm when two runs in a row fail."
  type        = bool
  default     = false
}

variable "monthly_budget_usd" {
  description = "Monthly AWS Budgets limit in US dollars on the Amazon Bedrock AgentCore service in this account; alarm_email gets an email at 80% of actual and 100% of forecast cost. 0 adds no budget. Model use is billed under Amazon Bedrock and needs its own budget."
  type        = number
  default     = 0
}

variable "log_tool_payloads" {
  description = "Also deliver the gateways' service logs, which carry each tool call's request and response bodies (scene sources, document text, download links), to CloudWatch Logs. The spans already show every call's tool, duration and error."
  type        = bool
  default     = false
}
