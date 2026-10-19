# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
# kics-scan disable=e39f87f5-0abf-488b-864c-63ee1f588140
# Monitoring. AgentCore publishes metrics for every runtime, gateway, memory and policy engine (namespace
# AWS/Bedrock-AgentCore) and the runtimes write their own logs, but gateway spans and memory logs arrive only once a
# log delivery is set up. This file sets those up, alarms on errors, throttles and slow tool calls, and draws one
# dashboard for the whole stack. It stays empty until the image exists or when enable_monitoring is false.

locals {
  monitoring = var.enable_monitoring && var.image_tag != ""
  namespace  = "AWS/Bedrock-AgentCore"

  # Every gateway this stack runs, by role.
  monitored_gateways = local.monitoring ? merge(
    local.tools_enabled ? { tools = aws_bedrockagentcore_gateway.tools[0] } : {},
    local.tools_enabled && var.enable_jwt_gateway ? { signin = aws_bedrockagentcore_gateway.tools_jwt[0] } : {},
  ) : {}

  # The runtimes behind the harness and the tools. Each endpoint reports under its own Name dimension
  # (<runtime name>::<endpoint>), and promote.sh moves harness users from DEFAULT to PROD, so both count.
  monitored_runtimes = local.monitoring ? merge(
    {
      agent = {
        arn       = try(local.harness_runtime.agent_runtime_arn, null)
        name      = try(local.harness_runtime.agent_runtime_name, null)
        endpoints = tolist(["DEFAULT", "PROD"])
      }
    },
    local.tools_enabled ? {
      tools = {
        arn       = aws_bedrockagentcore_agent_runtime.tools[0].agent_runtime_arn
        name      = aws_bedrockagentcore_agent_runtime.tools[0].agent_runtime_name
        endpoints = tolist(["DEFAULT"])
      }
    } : {},
  ) : {}

  memory_arn    = try(one(aws_bedrockagentcore_harness.agent[0].memory_actual[0].managed_memory_configuration).arn, null)
  alarm_actions = aws_sns_topic.alarms[*].arn
}

# ---------- alarm topic ----------

# CloudWatch alarms cannot publish to a topic encrypted with the AWS managed SNS key (that key's policy does not let
# CloudWatch use it), so the topic has its own key that does.
data "aws_iam_policy_document" "alarm_topic_key" {
  #checkov:skip=CKV_AWS_109:In a key policy the resource "*" is the key itself; the account root administers it.
  #checkov:skip=CKV_AWS_111:In a key policy the resource "*" is the key itself.
  #checkov:skip=CKV_AWS_356:In a key policy the resource "*" is the key itself.
  statement {
    sid       = "AccountAdministers"
    actions   = ["kms:*"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = ["arn:${local.partition}:iam::${local.account_id}:root"]
    }
  }
  statement {
    sid       = "CloudWatchAlarmsPublish"
    actions   = ["kms:Decrypt", "kms:GenerateDataKey*"]
    resources = ["*"]
    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com"]
    }
  }
}

resource "aws_kms_key" "alarms" {
  count               = local.monitoring ? 1 : 0
  description         = "Encrypts the ${var.name} alarm topic"
  enable_key_rotation = true
  policy              = data.aws_iam_policy_document.alarm_topic_key.json
}

resource "aws_kms_alias" "alarms" {
  count         = local.monitoring ? 1 : 0
  name          = "alias/${var.name}-alarms"
  target_key_id = aws_kms_key.alarms[0].key_id
}

# The alarm topic delivers to the alarm_email subscription below; it is not tied to an S3 bucket.
resource "aws_sns_topic" "alarms" {
  count             = local.monitoring ? 1 : 0
  name              = "${var.name}-alarms"
  kms_master_key_id = aws_kms_key.alarms[0].arn
}

resource "aws_sns_topic_subscription" "alarm_email" {
  count     = local.monitoring && var.alarm_email != "" ? 1 : 0
  topic_arn = aws_sns_topic.alarms[0].arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

# ---------- spans and service logs ----------

# Gateway spans go to X-Ray, which indexes them for Transaction Search: tool name, latency, error and status code for
# every call, without the request and response bodies.
resource "aws_cloudwatch_log_delivery_destination" "traces" {
  count                     = local.monitoring ? 1 : 0
  name                      = "${var.name}-traces"
  delivery_destination_type = "XRAY"
}

resource "aws_cloudwatch_log_delivery_source" "gateway_traces" {
  for_each     = local.monitored_gateways
  name         = "${var.name}-${each.key}-gateway-traces"
  log_type     = "TRACES"
  resource_arn = each.value.gateway_arn
}

resource "aws_cloudwatch_log_delivery" "gateway_traces" {
  for_each                 = local.monitored_gateways
  delivery_source_name     = aws_cloudwatch_log_delivery_source.gateway_traces[each.key].name
  delivery_destination_arn = aws_cloudwatch_log_delivery_destination.traces[0].arn
}

# Gateway service logs carry the request and response bodies, so they are delivered only when log_tool_payloads is on.
resource "aws_cloudwatch_log_group" "gateway" {
  for_each          = var.log_tool_payloads ? local.monitored_gateways : {}
  name              = "/aws/vendedlogs/bedrock-agentcore/gateway/APPLICATION_LOGS/${each.value.gateway_id}"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.logs.arn
}

resource "aws_cloudwatch_log_delivery_source" "gateway_logs" {
  for_each     = aws_cloudwatch_log_group.gateway
  name         = "${var.name}-${each.key}-gateway-logs"
  log_type     = "APPLICATION_LOGS"
  resource_arn = local.monitored_gateways[each.key].gateway_arn
}

resource "aws_cloudwatch_log_delivery_destination" "gateway_logs" {
  for_each = aws_cloudwatch_log_group.gateway
  name     = "${var.name}-${each.key}-gateway-logs"
  delivery_destination_configuration {
    destination_resource_arn = each.value.arn
  }
}

resource "aws_cloudwatch_log_delivery" "gateway_logs" {
  for_each                 = aws_cloudwatch_log_group.gateway
  delivery_source_name     = aws_cloudwatch_log_delivery_source.gateway_logs[each.key].name
  delivery_destination_arn = aws_cloudwatch_log_delivery_destination.gateway_logs[each.key].arn
}

# Memory logs: the start, end and errors of each extraction and consolidation, with how many records each made.
resource "aws_cloudwatch_log_group" "memory" {
  count             = local.monitoring ? 1 : 0
  name              = "/aws/vendedlogs/bedrock-agentcore/memory/APPLICATION_LOGS/${element(split("/", local.memory_arn), 1)}"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.logs.arn
}

resource "aws_cloudwatch_log_delivery_source" "memory_logs" {
  count        = local.monitoring ? 1 : 0
  name         = "${var.name}-memory-logs"
  log_type     = "APPLICATION_LOGS"
  resource_arn = local.memory_arn
}

resource "aws_cloudwatch_log_delivery_destination" "memory_logs" {
  count = local.monitoring ? 1 : 0
  name  = "${var.name}-memory-logs"
  delivery_destination_configuration {
    destination_resource_arn = aws_cloudwatch_log_group.memory[0].arn
  }
}

resource "aws_cloudwatch_log_delivery" "memory_logs" {
  count                    = local.monitoring ? 1 : 0
  delivery_source_name     = aws_cloudwatch_log_delivery_source.memory_logs[0].name
  delivery_destination_arn = aws_cloudwatch_log_delivery_destination.memory_logs[0].arn
}

# ---------- alarms ----------

locals {
  gateway_alarm_kinds = {
    system-errors = { metric = "SystemErrors", stat = "Sum", threshold = 1, periods = 1, what = "answered a tool call with a server error (5xx)" }
    throttles     = { metric = "Throttles", stat = "Sum", threshold = 1, periods = 1, what = "throttled a tool call (429)" }
    slow-calls    = { metric = "Duration", stat = "p90", threshold = var.tool_duration_alarm_ms, periods = 3, what = "kept the p90 tool-call duration at or above ${var.tool_duration_alarm_ms} ms for 15 minutes" }
  }
  gateway_alarms = {
    for pair in setproduct(keys(local.monitored_gateways), keys(local.gateway_alarm_kinds)) :
    "${pair[0]}-gateway-${pair[1]}" => { gateway = pair[0], kind = local.gateway_alarm_kinds[pair[1]] }
  }

  runtime_alarm_kinds = {
    system-errors = { metric = "SystemErrors", what = "answered a request with a server error (5xx)" }
    throttles     = { metric = "Throttles", what = "throttled a request (429)" }
  }
  runtime_alarms = {
    for pair in setproduct(keys(local.monitored_runtimes), keys(local.runtime_alarm_kinds)) :
    "${pair[0]}-runtime-${pair[1]}" => { role = pair[0], runtime = local.monitored_runtimes[pair[0]], kind = local.runtime_alarm_kinds[pair[1]] }
  }
}

resource "aws_cloudwatch_metric_alarm" "gateway" {
  for_each            = local.gateway_alarms
  alarm_name          = "${var.name}-${each.key}"
  alarm_description   = "The ${each.value.gateway} tools gateway ${each.value.kind.what}."
  namespace           = local.namespace
  metric_name         = each.value.kind.metric
  statistic           = each.value.kind.stat == "Sum" ? "Sum" : null
  extended_statistic  = each.value.kind.stat == "Sum" ? null : each.value.kind.stat
  period              = 300
  evaluation_periods  = each.value.kind.periods
  datapoints_to_alarm = each.value.kind.periods
  threshold           = each.value.kind.threshold
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  dimensions = {
    Operation = "InvokeGateway"
    Protocol  = "MCP"
    Resource  = local.monitored_gateways[each.value.gateway].gateway_arn
  }
}

resource "aws_cloudwatch_metric_alarm" "runtime" {
  for_each            = local.runtime_alarms
  alarm_name          = "${var.name}-${each.key}"
  alarm_description   = "The ${each.value.role} runtime ${each.value.kind.what}."
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions

  # One series per endpoint, added up. An endpoint without traffic reports nothing at all, so each is filled with 0.
  metric_query {
    id          = "total"
    expression  = join(" + ", [for i, _ in each.value.runtime.endpoints : "FILL(e${i}, 0)"])
    return_data = true
  }

  dynamic "metric_query" {
    for_each = each.value.runtime.endpoints
    content {
      id = "e${metric_query.key}"
      metric {
        namespace   = local.namespace
        metric_name = each.value.kind.metric
        period      = 300
        stat        = "Sum"
        dimensions = {
          Name      = "${each.value.runtime.name}::${metric_query.value}"
          Operation = "InvokeAgentRuntime"
          Resource  = each.value.runtime.arn
        }
      }
    }
  }
}

# ---------- dashboard ----------

locals {
  gateway_dims = { for k, g in local.monitored_gateways : k => ["Operation", "InvokeGateway", "Protocol", "MCP", "Resource", g.gateway_arn] }
  runtime_dims = { for k, r in local.monitored_runtimes : k => ["Name", "${r.name}::DEFAULT", "Operation", "InvokeAgentRuntime", "Resource", r.arn] }

  # Each panel is one graph. A metrics entry is [namespace, metric, dimension pairs..., options]; a search entry finds
  # its own lines, so every tool, policy decision and memory operation shows up without being listed here.
  panels = {
    tool_calls = {
      title   = "Tool calls by gateway"
      stat    = "Sum"
      metrics = [for k, d in local.gateway_dims : concat([local.namespace, "Invocations"], d, [{ label = k }])]
    }
    tool_errors = {
      title = "Tool call errors and throttles"
      stat  = "Sum"
      metrics = [for p in setproduct(keys(local.gateway_dims), ["SystemErrors", "UserErrors", "Throttles"]) :
      concat([local.namespace, p[1]], local.gateway_dims[p[0]], [{ label = "${p[0]} ${p[1]}" }])]
    }
    tool_duration = {
      title = "Tool call duration (p50, p90)"
      stat  = "p90"
      metrics = [for p in setproduct(keys(local.gateway_dims), ["p50", "p90"]) :
      concat([local.namespace, "Duration"], local.gateway_dims[p[0]], [{ label = "${p[0]} ${p[1]}", stat = p[1] }])]
    }
    calls_per_tool = {
      title = "Calls per tool"
      metrics = [for i, g in values(local.monitored_gateways) : [{
        id         = "s${i}"
        expression = "SEARCH('{${local.namespace},Method,Name,Operation,Protocol,Resource} MetricName=\"Invocations\" Resource=\"${g.gateway_arn}\"', 'Sum', 300)"
      }]]
    }
    policy = {
      title = "Tool rules: allowed and denied calls"
      metrics = [[{
        id         = "s0"
        expression = "SEARCH('{${local.namespace},Mode,OperationName,PolicyEngine} PolicyEngine=\"${aws_bedrockagentcore_policy_engine.tools.policy_engine_id}\"', 'Sum', 300)"
      }]]
    }
    memory = {
      title = "Memory latency by operation"
      metrics = [[{
        id         = "s0"
        expression = "SEARCH('{${local.namespace},Operation,Resource} MetricName=\"Latency\" Resource=\"${coalesce(local.memory_arn, "none")}\"', 'Average', 300)"
      }]]
    }
    runtime_requests = {
      title   = "Agent and tools runtime requests (DEFAULT endpoint)"
      stat    = "Sum"
      metrics = [for k, d in local.runtime_dims : concat([local.namespace, "Invocations"], d, [{ label = k }])]
    }
    runtime_errors = {
      title = "Runtime errors and throttles"
      stat  = "Sum"
      metrics = [for p in setproduct(keys(local.runtime_dims), ["SystemErrors", "UserErrors", "Throttles"]) :
      concat([local.namespace, p[1]], local.runtime_dims[p[0]], [{ label = "${p[0]} ${p[1]}" }])]
    }
    runtime_latency = {
      title   = "Runtime latency (p90)"
      stat    = "p90"
      metrics = [for k, d in local.runtime_dims : concat([local.namespace, "Latency"], d, [{ label = k }])]
    }
    sessions = {
      title   = "New sessions"
      stat    = "Sum"
      metrics = [for k, d in local.runtime_dims : concat([local.namespace, "Sessions"], d, [{ label = k }])]
    }
    compute = {
      title = "Compute used (vCPU-hours, GB-hours)"
      stat  = "Sum"
      metrics = [for p in setproduct(keys(local.monitored_runtimes), ["CPUUsed-vCPUHours", "MemoryUsed-GBHours"]) :
      [local.namespace, p[1], "Resource", local.monitored_runtimes[p[0]].arn, "Service", "AgentCore.Runtime", { label = "${p[0]} ${p[1]}" }]]
    }
    canary = {
      title   = "Canary runs that passed (%)"
      stat    = "Average"
      metrics = [["CloudWatchSynthetics", "SuccessPercent", "CanaryName", local.canary_name, { label = "success" }]]
    }
  }

  layout = [
    ["tool_calls", "tool_errors", "tool_duration"],
    ["calls_per_tool", "policy", "memory"],
    ["runtime_requests", "runtime_errors", "runtime_latency"],
    local.canary_enabled ? ["sessions", "compute", "canary"] : ["sessions", "compute"],
  ]

  widgets = concat(
    flatten([for row, names in local.layout : [
      for col, name in names : {
        type       = "metric"
        x          = col * 8
        y          = row * 6
        width      = 8
        height     = 6
        properties = merge({ region = var.region, view = "timeSeries", stacked = false, period = 300 }, local.panels[name])
      }
    ]]),
    [{
      type   = "alarm"
      x      = 0
      y      = length(local.layout) * 6
      width  = 24
      height = 4
      properties = {
        title = "Alarms"
        alarms = concat(
          [for a in aws_cloudwatch_metric_alarm.gateway : a.arn],
          [for a in aws_cloudwatch_metric_alarm.runtime : a.arn],
          aws_cloudwatch_metric_alarm.canary[*].arn,
        )
      }
    }],
  )
}

resource "aws_cloudwatch_dashboard" "stack" {
  count          = local.monitoring ? 1 : 0
  dashboard_name = var.name
  dashboard_body = jsonencode({ widgets = local.widgets })
}

# ---------- budget ----------

# AgentCore is billed under its own service name, so the budget filters on that; a Project tag filter would need the
# tag activated for cost allocation, which only the payer account of an organization can do. Model use is billed
# under Amazon Bedrock and is left to the account's own budgets.
resource "aws_budgets_budget" "agentcore" {
  count        = var.monthly_budget_usd > 0 ? 1 : 0
  name         = "${var.name}-agentcore-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_filter {
    name   = "Service"
    values = ["Amazon Bedrock AgentCore"]
  }

  dynamic "notification" {
    for_each = var.alarm_email != "" ? { ACTUAL = 80, FORECASTED = 100 } : {}
    content {
      comparison_operator        = "GREATER_THAN"
      notification_type          = notification.key
      threshold                  = notification.value
      threshold_type             = "PERCENTAGE"
      subscriber_email_addresses = [var.alarm_email]
    }
  }
}
