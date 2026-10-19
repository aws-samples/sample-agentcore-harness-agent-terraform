---
title: Skills-based agent with governed MCP tools reference architecture
subtitle: Serve an AI agent and its tools to MCP clients from Amazon Bedrock AgentCore, with every call signed, authorized and logged
kind: refarch
version: 1.0
status: Example
owner: Platform team
prepared_by: AWS Professional Services
audience: Builders who host agents for MCP clients such as Claude Code, Codex and Kiro
classification: Public example
date: 2026-10-16
---

# Skills-based agent with governed MCP tools reference architecture

<!-- aws-svg: figures/hosted-current.svg | MCP clients call the tools through an AgentCore Gateway; ask_architect hands a whole request to the AgentCore harness -->

## How it works

- **Tool calls**: a Model Context Protocol (MCP) client signs each call with the caller's AWS credentials through the MCP Proxy for AWS, and the AgentCore Gateway checks it against a default-deny Cedar policy and a per-caller rate limit.
- **MCP**: the gateway forwards the call to the MCP server on AgentCore Runtime, which only the gateway role may invoke.
- **Save**: the tools render diagrams, run layout checks and build documents, upload the files to Amazon S3 and return presigned links.
- **ask_architect**: for a whole request, the tools runtime runs one turn of the AgentCore harness on its pinned endpoint.
- **Reason**: the harness reasons with a Claude model on Amazon Bedrock, with a guardrail on every request, and keeps context in AgentCore Memory.
- **Tools** and **Docs**: the harness calls the same tools through the gateway and reads AWS documentation from the AWS Knowledge MCP Server.

## Services used

- **Amazon Bedrock AgentCore**: the harness, the MCP tools runtime, the gateway, Policy, Memory and Evaluations.
- **Amazon Bedrock**: the Claude model and the guardrail.
- **Amazon S3**: generated figures and documents, expiring after 30 days.
- **AWS IAM**: one role per component, each scoped to what it calls.
- **Amazon CloudWatch**: traces, alarms, a dashboard and a canary.

## Considerations

- **Security**: keep the harness on SigV4 only, because any caller of a harness can override its model, prompt and tools for a call; users reach it through the gateway.
- **Cost**: model tokens are most of the cost of a turn; see [Amazon Bedrock pricing](https://aws.amazon.com/bedrock/pricing/) and [Amazon Bedrock AgentCore pricing](https://aws.amazon.com/bedrock/agentcore/pricing/).
- **Operations**: promote a new agent version to the pinned endpoint only after it passes an evaluation, and alarm on errors, throttles and slow tool calls.
