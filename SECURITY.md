# Security

## Reporting a vulnerability

If you discover a potential security issue in this project, notify AWS/Amazon Security through the [vulnerability reporting page](https://aws.amazon.com/security/vulnerability-reporting/). Please do **not** create a public GitHub issue.

## What this sample deploys

One AWS Region, one AWS account: an Amazon Bedrock AgentCore harness (the agent), an AgentCore Runtime that hosts the MCP tools, an AgentCore Gateway with an AgentCore Policy engine and gateway rate limits (plus an optional second gateway for signed-in MCP clients), AgentCore Memory (managed by the harness), an AgentCore Evaluations online configuration, an AWS Agent Registry, an Amazon Cognito user pool (used only by the optional sign-in gateway, or `harness_signin = "cognito"`), two Amazon S3 buckets and a Terraform state bucket, an Amazon ECR repository, an AWS CodeBuild project, AWS KMS keys for logs and the alarm topic, CloudWatch alarms, a dashboard and a Synthetics canary, an Amazon SNS topic, an AWS Budgets budget, an optional Amazon Bedrock guardrail, IAM roles, and the X-Ray trace segment destination setting (Transaction Search).

## Data handling

- **Prompts and replies** travel over TLS to the gateway, the harness and Amazon Bedrock. The harness keeps short-term memory events for 30 days (`event_expiry_duration`) and extracts long-term memory records (semantic, summary and user-preference strategies).
- **Generated files** (SVG, PNG, draw.io, HTML, Word) are written to the outputs bucket and expire after `output_retention_days` (default 30). Users receive presigned links that are valid for at most one hour.
- **Logs and traces** go to Amazon CloudWatch Logs; the stack's own log groups are encrypted with a customer managed AWS KMS key. Prompts and tool output can appear in traces. Gateway request and response bodies are logged only with `log_tool_payloads = true`.
- **Usage and feedback**: the tools runtime logs one line per tool call (tool name, duration, result, session ID; never the arguments) and one per `send_feedback` call, which holds the rating and comment the user gave. Treat feedback comments as user content.
- Do not send confidential, regulated or personal data to the sample.

## Controls in place

- Harness access: the harness takes SigV4 requests only (`harness_signin = "iam"`), so only principals granted `bedrock-agentcore:InvokeHarness` reach it. Any caller of a harness can override its model, prompt, tools and skills for a call and open a shell in a session, so users reach the agent through the gateway (`ask_architect`) instead (`hosted/terraform/harness.tf`).
- Tool access: the gateway uses IAM (SigV4) inbound auth, and a default-deny Cedar policy permits only the harness role (plus roles in `tool_caller_role_names`) to call only the eight tools; `ask_architect` is permitted only for the roles in `tool_caller_role_names`, never the harness role (`hosted/terraform/tools.tf`). With `enable_jwt_gateway = true`, a second gateway accepts only access tokens from the stack's user pool, and its Cedar policy permits only principals issued by that pool.
- Gateway controls (`hosted/scripts/gateway-controls.sh`): the tool list is refreshed after each deploy, and each caller may make 30 tool calls a minute. Nothing screens tool inputs for credentials, so never paste them.
- Tools runtime: a resource policy lets only the gateway role invoke it and denies every other principal every invoke, command and shell action (`restrict_tools_runtime_to_gateway`).
- IAM: one role per component (build, harness, tools runtime, gateway, evaluation, canary), scoped to the stack's resources; the harness may invoke only the configured model, and its foundation model only through that inference profile (`hosted/terraform/iam.tf`). Trust policies carry `aws:SourceAccount` and `aws:SourceArn` conditions.
- Model: an optional Amazon Bedrock guardrail with a prompt attack filter on every harness model request (`enable_guardrail`).
- Storage: S3 buckets block public access, enforce bucket-owner object ownership, deny non-TLS requests and use SSE-S3 encryption (`hosted/terraform/storage.tf`). The ECR repository is encrypted with AWS KMS, tags are immutable and images are scanned on push (`hosted/terraform/image.tf`).
- Container: the agent process and the MCP server run as the image's unprivileged `node` user (`hosted/container/Dockerfile`).
- Inputs: the MCP server takes files as text when hosted (paths are refused), runs every script with an argument array (no shell), and refuses scene files that reach for the process, file system or network before they run (`mcp-server/server.mjs`, `skills/aws-archify/scripts/lib/scene-guard.ts`).
- Limits: the harness caps iterations, run time and output tokens and stops idle sessions after 10 minutes (`hosted/terraform/harness.tf`); `ask_architect` ends a turn before the gateway's 15-minute call limit.
- Monitoring: alarms on errors, throttles and slow tool calls, a canary through the gateway every 15 minutes, and a budget on AgentCore cost (`hosted/terraform/monitoring.tf`, `hosted/terraform/canary.tf`).

## Known considerations

| Consideration | Why it is this way | What to do in production |
|---|---|---|
| The agent has a shell in its session sandbox | The skills run real scripts (renderer, checks, builders); the harness isolates each session in its own microVM, and runtime commands run as root there | Add a harness lifecycle hook that allows only the skill commands; keep `bedrock-agentcore:InvokeAgentRuntimeCommand` and `InvokeAgentRuntimeCommandShell` away from users |
| Prompt injection through user input or fetched documentation | Users and AWS documentation pages are untrusted input to the model | Validate input in your application layer, keep the guardrail on, and keep the execution role narrow |
| Presigned links can be forwarded | Links are bearer URLs for one hour | Shorten `--expires`, or serve outputs through an authenticated front end |
| Public network mode | The harness and runtime reach Amazon Bedrock, ECR and the AWS documentation over the internet | Use VPC mode with interface endpoints |
| Transaction Search is a Region-wide account setting | AgentCore Evaluations reads spans from CloudWatch Logs | Set `enable_transaction_search = false` if your account already manages it |
| Well-Architected Tool and X-Ray actions use `Resource: *` | Well-Architected create and list and the X-Ray tracing actions support no resource-level permissions | Remove the Well-Architected statement if you do not record reviews |
| Gateway rate limits are applied by a script, not Terraform | The AWS provider has no resources for them yet | Run `gateway-controls.sh` after every apply (`deploy.sh` does) |
| SSE-S3 for the buckets and the AWS managed key for ECR | Presigned links stay valid without granting `kms:Decrypt` to every signer; moving ECR to a new key replaces the repository | Use customer managed AWS KMS keys for S3, ECR and AgentCore Memory |

## Production hardening

Before using any of this beyond a sandbox account:

1. Run the harness and the tools runtime in VPC mode with interface endpoints for Amazon Bedrock, ECR, S3 and CloudWatch Logs.
2. Use customer managed AWS KMS keys for the buckets, the ECR repository and AgentCore Memory (log groups already use one).
3. Sign users in with your identity provider rather than local Cognito users, and require MFA (the pool allows optional TOTP MFA).
4. Serve `ask_architect` from the pinned `PROD` endpoint (`promote.sh` points it at a version only after it passes an evaluation).
5. Add a lifecycle hook that allow-lists shell commands, and tune the per-caller rate limit.
6. Confirm the alarm email subscription and set `monthly_budget_usd` to your limit.
7. Keep `tool_caller_role_names` to the roles that must call the tools, and set `create_access_analyzer = true` if the account has no IAM Access Analyzer.

## Clean up

See the README. `terraform destroy` removes every resource the stack created; the `PROD` harness endpoint, workloads that the agent created in the Well-Architected Tool, registry records added by `register-tools.sh` and the state bucket are removed separately.
