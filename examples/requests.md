# Example requests

Requests that exercise the hosted agent from an MCP client such as Claude Code, Codex or Kiro, after
[connecting it](mcp-clients/README.md). Each one says what comes back.

## Tool by tool (your client's model drives the tools)

| Ask your client | What it does | You get |
|---|---|---|
| "Draw a serverless REST API on AWS: Amazon API Gateway, AWS Lambda and Amazon DynamoDB." | `get_authoring_guide`, `find_icon` for each service, then `render_diagram` with the scene as `scene_source` | An SVG, a 4800 px PNG and a draw.io file as download links, the layout check results and a diagrams.net link |
| "Check the layout of this SVG" (paste it) | `check_layout` with `svg_source` | The findings, or PASS |
| "Turn this markdown into an HLD as HTML and Word" (paste it) | `lint_doc`, then `build_design_doc` with `markdown_source` | The lint findings, then HTML and Word download links |
| "That diagram was wrong: the database is missing" | `send_feedback` | A note in the tools runtime's logs, listed by `hosted/scripts/usage.py` |

## The whole job (the hosted agent drives the tools)

| Ask your client | You get |
|---|---|
| "Use ask_architect: draw the architecture of this Terraform" (paste the files) | The agent plans the figures, renders and checks them, reviews each one and returns the links with a `session_id` |
| "Use ask_architect with the same session_id: now write a one-page reference architecture of it as HTML and Word" | The document built around the figure, in the same session and sandbox |
| "Use ask_architect: write a Well-Architected review of this design" (paste it) | A review document with findings per pillar; on request the agent also records it as a workload in the AWS Well-Architected Tool |
| "Use ask_architect: does Amazon S3 support the aws:SourceVpce condition key for PutObject?" | The answer quoted from the AWS documentation, with the page link |

An `ask_architect` turn takes a few minutes; if the client reports that the agent is still working, call it again
with the same `session_id` and ask for the result.

Do not paste confidential, regulated or personal data, or AWS credentials: nothing screens the tool inputs, and
scene and document sources are stored in the outputs bucket.
