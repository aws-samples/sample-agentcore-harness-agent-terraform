# AWS Architecture Agent MCP server

The aws-archify and aws-design-doc skills as MCP tools, for MCP clients that do not run the agent itself (Amazon Q Developer CLI, Cline, Cursor, or Kiro and Claude Code without the plugin).

| Tool | What it does |
|---|---|
| `get_authoring_guide` | Returns the skill guide for `diagram` or `design-doc`. Read it before writing a scene or a document. |
| `find_icon` | Finds the exact AWS Architecture Icons component and import line for a service or resource. |
| `render_diagram` | Renders a scene `.tsx` to SVG, a 4800 px PNG and an editable `.drawio`, then runs the layout checks. |
| `check_layout` | Runs the layout checks on a rendered SVG. |
| `build_design_doc` | Builds a markdown design document into themed HTML and Word, with its figures inline. |
| `drawio_link` | Returns a link that opens a `.drawio` in diagrams.net, loaded and editable. |
| `lint_doc` | Checks a design document before it is built or sent. |
| `send_feedback` | Records that a result was good or bad, with the user's comment, for the maintainers. Hosted, it lands in the runtime's logs; `hosted/scripts/usage.py` lists it. |
| `ask_architect` | Hosted only, when the server knows a harness (`AWS_ARCH_HARNESS_ARN`): hands the whole request to the hosted agent, which plans, renders, checks and reviews the figures itself, and returns its answer with download links and a `session_id` to continue. A turn takes minutes, so set the client's tool timeout to 15 minutes. |

![MCP server: one server with the same tools, local over stdio with file paths, hosted over HTTP behind an AgentCore Gateway with file contents and download links; ask_architect only hosted](../docs/diagrams/mcp-server.svg)

The server has no dependencies: it speaks MCP over stdio and runs the skills' own scripts with argument arrays, on files the caller names by absolute path. The first diagram or Word build on a machine runs the skill's `setup.sh`, which needs the network once.

## Requirements

- Node.js 22.18 or later
- Python 3 (design documents)

## Run it locally

Point the client at `server.mjs` in this repository. Kiro (`~/.kiro/settings/mcp.json`) and Claude Code (`claude mcp add`) both take the same entry:

```json
{
  "mcpServers": {
    "aws-architecture-agent": {
      "command": "node",
      "args": ["/path/to/aws-architecture-agent/mcp-server/server.mjs"]
    }
  }
}
```

The skills are found in `../skills` next to the server. Set `AWS_ARCH_SKILLS_DIR` to use another copy.


## Test

```bash
node mcp-server/test.mjs
```

It runs the MCP handshake and one real call per tool on the bundled examples, then the same server over HTTP: on the default loopback bind with its Origin guard, and on `0.0.0.0` as hosted, where paths are refused and documents are confined. It writes only to a temp folder, and its servers get their own temp folder, so a second run at the same time cannot disturb it.

## Hosted mode (HTTP)

For a remote host such as Amazon Bedrock AgentCore Runtime (MCP protocol), start the server with `--http` (or `MCP_TRANSPORT=http`):

```bash
MCP_HOST=0.0.0.0 PORT=8000 node mcp-server/server.mjs --http
```

- Stateless Streamable HTTP: `POST /mcp` on `$MCP_HOST:$PORT`. The default is `127.0.0.1:8000`, so a server started on a laptop is reachable from that machine only; the hosted image sets `MCP_HOST=0.0.0.0`. A request gets a JSON response, a notification gets `202`, and `GET` or `DELETE /mcp` get `405`. A platform `Mcp-Session-Id` is accepted and returned.
- On a loopback bind, a request whose `Origin` header names another site gets `403` (the DNS-rebinding guard the MCP specification asks for); clients that send no `Origin` are not affected.
- Each tool also takes the file's text: `scene_source`, `svg_source`, `drawio_source` or `markdown_source`, in place of the matching `*_path`. Pass exactly one of the two. On any address other than loopback the server is remote: it refuses every `*_path` and `out_dir`, and builds and lints documents with `--confine`, so a figure or image in a pasted document cannot pull another file on the server into the output.
- With `AWS_ARCH_OUTPUT_BUCKET` set, `render_diagram` and `build_design_doc` upload their outputs with `hosted/container/publish.py` and add presigned download links to the result.
- In HTTP mode every tool call writes one JSON usage line to stderr (tool, duration, OK or error, session id), never the arguments.
- With `AWS_ARCH_HARNESS_ARN` set (and `AWS_ARCH_HARNESS_ENDPOINT`, default `DEFAULT`), the server lists `ask_architect`, which runs one turn of that harness with `hosted/container/ask_harness.py`, signed with the server's own AWS credentials. It runs outside the one-call-at-a-time queue, so other tools keep answering during a turn. To connect Claude Code, Codex or Kiro to the hosted server, see [Use in the hosted README](../hosted/README.md#use).
- AgentCore Runtime needs a `linux/arm64` image with Node.js 22.18 or later, Python 3 and pandoc, and the skills' packages installed. Set `AWS_ARCH_SKILLS_DIR` to the skills folder in the image.
