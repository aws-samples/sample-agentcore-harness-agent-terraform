# MCP client configurations

Ready configurations for the stack's IAM tools gateway. Replace the URL with the `tools_gateway_url` output
(`terraform -chdir=hosted/terraform output -raw tools_gateway_url`), and add the IAM role you sign in with to
`tool_caller_role_names` before you connect. Each client starts the [MCP Proxy for AWS](https://github.com/aws/mcp-proxy-for-aws)
with `uvx`, which signs every call with your AWS credentials (SigV4, service `bedrock-agentcore`).

| Client | File | Where it goes |
|---|---|---|
| Claude Code | [`claude-code.mcp.json`](claude-code.mcp.json) | `.mcp.json` at the root of your project, or run the `claude mcp add-json` command in the main README. Set `MCP_TOOL_TIMEOUT=900000` for `ask_architect` |
| Codex | [`codex-config.toml`](codex-config.toml) | `~/.codex/config.toml` |
| Kiro | [`kiro-mcp.json`](kiro-mcp.json) | `.kiro/settings/mcp.json` in your workspace, or `~/.kiro/settings/mcp.json` |

Check the connection by asking the client to list the server's tools: it should show the eight tools and `ask_architect`.
