#!/usr/bin/env node
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// End-to-end check of the MCP server over stdio: handshake, tools/list, and one real
// call per tool on the bundled examples. Then the hosted mode: the same server over
// stateless Streamable HTTP, with file contents in *_source arguments, plain tool
// descriptions (as behind an Amazon Quick connector) and a stand-in for the S3 upload script. Then the HTTP server's
// default loopback bind and its Origin guard, and a server on 0.0.0.0 (as hosted) that refuses paths. Writes only to a temp folder.
//
//   node mcp-server/test.mjs
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "aws-arch-mcp-"));
// Pinned, so an AWS_ARCH_SKILLS_DIR exported in the shell cannot point the suite at another tree.
const SKILLS_ENV = { ...process.env, AWS_ARCH_SKILLS_DIR: path.join(REPO, "skills") };
// The same for MCP_HOST and MCP_TRANSPORT, which would change the bind address and the transport under test.
delete SKILLS_ENV.MCP_HOST;
delete SKILLS_ENV.MCP_TRANSPORT;
// Each *_source call writes its input to an aws-arch-in-* folder; every one must be gone after the call. The servers get
// a temp folder of their own, so another run of this suite (or any other server) cannot add folders to the count.
const SERVER_TMP = path.join(TMP, "server-tmp");
fs.mkdirSync(SERVER_TMP);
SKILLS_ENV.TMPDIR = SERVER_TMP;
const tempInputs = () => fs.readdirSync(SERVER_TMP).filter((f) => f.startsWith("aws-arch-in-"));
const tempInputsBefore = new Set(tempInputs());

const server = spawn(process.execPath, [path.join(HERE, "server.mjs")], { env: SKILLS_ENV, stdio: ["pipe", "pipe", "inherit"] });
const pending = new Map();
readline.createInterface({ input: server.stdout }).on("line", (line) => {
  const msg = JSON.parse(line);
  pending.get(msg.id)?.(msg);
  pending.delete(msg.id);
});
let nextId = 1;
function call(method, params) {
  const id = nextId++;
  server.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  return new Promise((resolve) => pending.set(id, resolve));
}
const tool = async (name, args) => (await call("tools/call", { name, arguments: args })).result;

let failures = 0;
function expect(label, cond, detail = "") {
  console.log(`${cond ? "ok  " : "FAIL"} ${label}${!cond && detail ? `\n${detail}` : ""}`);
  if (!cond) failures++;
}

const init = await call("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } });
expect("initialize", init.result?.serverInfo?.name === "aws-architecture-agent");
server.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);

const list = await call("tools/list", {});
const names = list.result.tools.map((t) => t.name);
expect("tools/list has 8 tools", names.length === 8, names.join(", "));

const guide = await tool("get_authoring_guide", { topic: "diagram" });
expect("get_authoring_guide diagram", !guide.isError && guide.content[0].text.includes("aws-archify"));

const icon = await tool("find_icon", { query: "lambda function", limit: 3 });
expect("find_icon", !icon.isError && /import \{/.test(icon.content[0].text), icon.content[0].text);

// Render a copy of a bundled example into the temp folder.
const scene = path.join(TMP, "data-lakehouse-analytics.tsx");
fs.copyFileSync(path.join(REPO, "skills", "aws-archify", "assets", "examples", "data-lakehouse-analytics.tsx"), scene);
const render = await tool("render_diagram", { scene_path: scene, png_width: 1600 });
const svg = path.join(TMP, "data-lakehouse-analytics.svg");
expect("render_diagram writes svg, png, drawio",
  !render.isError && ["svg", "png", "drawio"].every((e) => fs.existsSync(svg.replace(/svg$/, e))), render.content[0].text);
expect("render_diagram leaves no copy in scenes/",
  !fs.readdirSync(path.join(REPO, "skills", "aws-archify", "scenes")).some((f) => f.startsWith("mcp-")));

const check = await tool("check_layout", { svg_path: svg, advisory: true });
expect("check_layout returns a real report", !check.isError && /^(PASS|FAIL)\n/.test(check.content[0].text) && /\d+ hard defect\(s\)/.test(check.content[0].text), check.content[0].text);

const bad = await tool("render_diagram", { scene_path: "relative/scene.tsx" });
expect("relative path is refused", bad.isError === true);

const link = await tool("drawio_link", { drawio_path: svg.replace(/svg$/, "drawio") });
expect("drawio_link returns a diagrams.net link", !link.isError && link.content[0].text.startsWith("https://app.diagrams.net/#create="), link.content[0].text.slice(0, 200));

// A scene that reaches for process is refused before it runs.
const evil = path.join(TMP, "evil.tsx");
fs.writeFileSync(evil, 'import { Diagram } from "../src/engine.tsx";\nconst x = process.env.HOME;\nexport default <Diagram title={x} />;\n');
const guard = await tool("render_diagram", { scene_path: evil });
expect("scene guard refuses process", guard.isError === true && /scene guard/.test(guard.content[0].text), guard.content[0].text.slice(0, 300));

// Build a copy of the sample design document (with its figures folder).
const docDir = path.join(TMP, "doc");
fs.cpSync(path.join(REPO, "examples", "sample-design-doc"), docDir, { recursive: true });
for (const f of fs.readdirSync(docDir)) if (/\.(html|docx)$/.test(f)) fs.rmSync(path.join(docDir, f));
const md = path.join(docDir, "RAG-ASSISTANT-HLD.md");
const lint = await tool("lint_doc", { markdown_path: md });
expect("lint_doc returns a real report", !lint.isError && /^(PASS|FAIL)\n/.test(lint.content[0].text) && /lint: \d+ error\(s\)/.test(lint.content[0].text), lint.content[0].text);
const build = await tool("build_design_doc", { markdown_path: md, strict: false });
expect("build_design_doc writes html and docx",
  !build.isError && fs.existsSync(path.join(docDir, "rag-assistant-hld.html")) && fs.existsSync(path.join(docDir, "rag-assistant-hld.docx")),
  build.content[0].text);
const pdf = await tool("build_design_doc", { markdown_path: md, formats: ["pdf"] });
expect("build_design_doc refuses a format other than html and docx", pdf.isError === true && /formats must be/.test(pdf.content[0].text), pdf.content[0].text);

server.stdin.end();

// ---------- Hosted mode: stateless Streamable HTTP ----------

const freePort = () => new Promise((resolve) => {
  const s = net.createServer().listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => resolve(port)); });
});
const port = await freePort();

// Stand-in for hosted/container/publish.py: prints one JSON line per file, as the real one does, and keeps a copy
// under TMP/s3/<key> in place of the bucket (the server removes its own copies once they are uploaded).
const fakePublish = path.join(TMP, "publish.py");
const fakeBucket = path.join(TMP, "s3");
fs.writeFileSync(fakePublish, [
  "import json, os, shutil, sys",
  "args = sys.argv[1:]",
  "assert args[0] == '--prefix' and args[1].startswith('mcp/'), args",
  "for f in args[2:]:",
  "    key = args[1] + '/' + os.path.basename(f)",
  `    dest = os.path.join(${JSON.stringify(fakeBucket)}, key)`,
  "    os.makedirs(os.path.dirname(dest), exist_ok=True)",
  "    shutil.copyfile(f, dest)",
  "    print(json.dumps({'file': f, 's3_uri': 's3://test-bucket/' + key, 'url': 'https://example.com/' + key}))",
  "",
].join("\n"));

const httpEnv = { ...SKILLS_ENV, PORT: String(port), AWS_ARCH_OUTPUT_BUCKET: "test-bucket", AWS_ARCH_PUBLISH_SCRIPT: fakePublish, AWS_ARCH_PLAIN_DESCRIPTIONS: "1" };
let httpLog = "";
const httpServer = spawn(process.execPath, [path.join(HERE, "server.mjs"), "--http"], { env: httpEnv, stdio: ["ignore", "ignore", "pipe"] });
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("HTTP server did not start")), 15_000);
  httpServer.stderr.on("data", (chunk) => {
    httpLog += chunk;
    if (!String(chunk).startsWith("{")) process.stderr.write(chunk);
    if (String(chunk).includes("listening on")) { clearTimeout(timer); resolve(); }
  });
});

const MCP_URL = `http://127.0.0.1:${port}/mcp`;
const HEADERS = { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-session-id": "platform-session-1" };
let httpId = 1000;
async function post(body) {
  const r = await fetch(MCP_URL, { method: "POST", headers: HEADERS, body: typeof body === "string" ? body : JSON.stringify(body) });
  const text = await r.text();
  return { status: r.status, type: r.headers.get("content-type") ?? "", session: r.headers.get("mcp-session-id"), json: text ? JSON.parse(text) : null };
}
const rpc = (method, params) => post({ jsonrpc: "2.0", id: httpId++, method, params });
const httpTool = async (name, args) => (await rpc("tools/call", { name, arguments: args })).json.result;

const hInit = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } });
expect("http initialize returns JSON and keeps the platform session id",
  hInit.status === 200 && hInit.type.startsWith("application/json") && hInit.json.result?.serverInfo?.name === "aws-architecture-agent" &&
  hInit.session === "platform-session-1", JSON.stringify(hInit));

const hNote = await post({ jsonrpc: "2.0", method: "notifications/initialized" });
expect("http notification gets 202 with no body", hNote.status === 202 && hNote.json === null, JSON.stringify(hNote));

const hList = await rpc("tools/list", {});
expect("http tools/list has 8 tools", hList.json.result?.tools?.length === 8);
const richText = [];
const descriptions = (o) => Array.isArray(o) ? o.forEach(descriptions) : o && typeof o === "object" &&
  Object.entries(o).forEach(([k, v]) => (k === "description" && typeof v === "string" ? richText.push(v) : descriptions(v)));
descriptions(hList.json.result?.tools ?? []);
expect("http plain mode: every description has only words, digits, periods and commas (Amazon Quick)",
  richText.length > 20 && richText.every((d) => /^[A-Za-z0-9 .,]+$/.test(d)), richText.filter((d) => !/^[A-Za-z0-9 .,]+$/.test(d)).join("\n"));

const sceneText = fs.readFileSync(path.join(REPO, "skills", "aws-archify", "assets", "examples", "data-lakehouse-analytics.tsx"), "utf8");
const hRender = await httpTool("render_diagram", { scene_source: sceneText, png_width: 1600 });
const hRenderText = hRender?.content?.[0]?.text ?? "";
expect("http render_diagram from scene_source writes svg, png, drawio",
  !hRender.isError && ["svg", "png", "drawio"].every((e) => hRenderText.split("\n").some((l) => l.startsWith("- /") && l.endsWith(`scene.${e}`))), hRenderText.slice(-1500));
expect("http render_diagram returns download links",
  /Download links/.test(hRenderText) && /https:\/\/example\.com\/mcp\/\d{4}-\d{2}-\d{2}\/[0-9a-f]{8}\/scene\.svg/.test(hRenderText), hRenderText.slice(-800));

expect("http render_diagram returns the diagrams.net link itself",
  /Open in diagrams\.net \(editable, nothing uploaded\): https:\/\/app\.diagrams\.net\/#create=/.test(hRenderText), hRenderText.slice(-400));

const hFlow = await httpTool("render_diagram", { scene_source: sceneText.replace("<Diagram ", '<Diagram animate="flow" '), name: "flow-check", png_width: 800 });
const hFlowText = hFlow?.content?.[0]?.text ?? "";
const flowKey = hFlowText.match(/https:\/\/example\.com\/(\S+\/flow-check\.animated\.svg)/)?.[1];
const flowSvg = flowKey && path.join(fakeBucket, flowKey);
const flowText = flowSvg && fs.existsSync(flowSvg) ? fs.readFileSync(flowSvg, "utf8") : "";
const stillText = flowSvg ? fs.readFileSync(flowSvg.replace(/\.animated\.svg$/, ".svg"), "utf8") : "";
expect("http render_diagram with animate flow adds a moving .animated.svg and keeps the .svg still",
  !hFlow.isError && /class="flow-line/.test(flowText) && /@keyframes aws-flow/.test(flowText) && !/flow-line|<style/.test(stillText.replace(/ content="[^"]*"/, "")) &&
  /https:\/\/example\.com\/mcp\/\S+\/flow-check\.animated\.svg/.test(hFlowText), hFlowText.slice(-1500));

// Models copy find_icon's import lines or a bundled example's ../../src paths; both must render.
const exampleScene = fs.readFileSync(path.join(REPO, "skills", "aws-archify", "assets", "examples", "serverless-api.tsx"), "utf8");
for (const [label, text] of [["../../src/", exampleScene], ["src/", exampleScene.replace(/"(\.\.\/)+src\//g, '"src/')]]) {
  const r = await httpTool("render_diagram", { scene_source: text, name: "imports-check", png_width: 800 });
  expect(`http render_diagram accepts ${label} imports`, !r.isError, (r?.content?.[0]?.text ?? "").slice(0, 600));
}
const hIcon = await httpTool("find_icon", { query: "lambda", limit: 1 });
expect("find_icon prints the import path a scene uses", /from "\.\.\/src\/icons\//.test(hIcon?.content?.[0]?.text ?? ""), hIcon?.content?.[0]?.text);

const hFeedback = await httpTool("send_feedback", { rating: "bad", comment: "Arrow label overlaps the icon", artifact: "imports-check" });
const hBadFeedback = await httpTool("send_feedback", { rating: "meh", comment: "x" });
const logLines = httpLog.split("\n").filter((l) => l.startsWith("{")).map((l) => JSON.parse(l));
expect("http send_feedback records a feedback line with the platform session id",
  !hFeedback.isError && logLines.some((l) => l.event === "feedback" && l.rating === "bad" && l.artifact === "imports-check" && l.session === "platform-session-1"),
  httpLog.slice(-600));
expect("http send_feedback refuses an unknown rating", hBadFeedback.isError === true);
expect("http every tool call writes one usage line (tool, ms, ok, session), never the arguments",
  logLines.some((l) => l.event === "tool_call" && l.tool === "render_diagram" && l.ok === true && Number.isInteger(l.ms) && l.session === "platform-session-1") &&
  logLines.some((l) => l.event === "tool_call" && l.tool === "send_feedback" && l.ok === false) &&
  !httpLog.includes("scene_source") && !logLines.some((l) => l.event === "tool_call" && "arguments" in l),
  httpLog.slice(-800));

const hBoth = await httpTool("render_diagram", { scene_path: scene, scene_source: sceneText });
expect("http path plus source is refused", hBoth.isError === true && /exactly one/.test(hBoth.content[0].text));

const hLint = await httpTool("lint_doc", { markdown_source: fs.readFileSync(md, "utf8") });
expect("http lint_doc from markdown_source", !hLint.isError && /^(PASS|FAIL)\n/.test(hLint.content[0].text) && /lint: \d+ error\(s\)/.test(hLint.content[0].text), hLint.content[0].text);
const leftover = tempInputs().filter((f) => !tempInputsBefore.has(f));
expect("every *_source temp folder is removed after its call", leftover.length === 0, leftover.join(", "));

const hBatch = await post([{ jsonrpc: "2.0", id: httpId++, method: "ping" }, { jsonrpc: "2.0", method: "notifications/initialized" }]);
expect("http batch answers only the request", hBatch.status === 200 && Array.isArray(hBatch.json) && hBatch.json.length === 1, JSON.stringify(hBatch));

const hBad = await post("{not json");
expect("http bad JSON gets 400 parse error", hBad.status === 400 && hBad.json?.error?.code === -32700, JSON.stringify(hBad));

const hGet = await fetch(MCP_URL);
expect("http GET /mcp gets 405", hGet.status === 405 && hGet.headers.get("allow") === "POST");
const hDelete = await fetch(MCP_URL, { method: "DELETE" });
expect("http DELETE /mcp gets 405", hDelete.status === 405);
const hOther = await fetch(`http://127.0.0.1:${port}/other`, { method: "POST", body: "{}" });
expect("http other path gets 404", hOther.status === 404);

// ---------- Default bind: loopback only, with the MCP spec's Origin check ----------

expect("http binds to 127.0.0.1 by default", httpLog.includes(`listening on http://127.0.0.1:${port}/mcp`), httpLog.slice(0, 300));
// Nothing answers on this machine's own network address, so other machines cannot reach the server either.
const lanAddress = Object.values(os.networkInterfaces()).flat().find((i) => i?.family === "IPv4" && !i.internal)?.address;
if (lanAddress) {
  const reached = await fetch(`http://${lanAddress}:${port}/mcp`, { method: "POST", headers: HEADERS, body: "{}", signal: AbortSignal.timeout(5000) })
    .then((r) => `HTTP ${r.status}`, (e) => e.cause?.code ?? e.name ?? String(e));
  expect(`http default bind does not answer on ${lanAddress}`, !reached.startsWith("HTTP "), reached);
}
const withOrigin = async (origin) => {
  const r = await fetch(MCP_URL, { method: "POST", headers: { ...HEADERS, origin }, body: JSON.stringify({ jsonrpc: "2.0", id: httpId++, method: "ping" }) });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* reported below as the raw body */ }
  return { origin, status: r.status, body: text, json };
};
const foreign = await Promise.all(["http://attacker.example", "null", "http://127.0.0.1.attacker.example:8000"].map(withOrigin));
expect("http on loopback answers a request from a non-loopback Origin with 403 and no id",
  foreign.every((o) => o.status === 403 && o.json?.id === null && o.json?.error), JSON.stringify(foreign));
const local = await Promise.all([`http://localhost:${port}`, `http://127.0.0.1:${port}`, "http://[::1]:3000"].map(withOrigin));
expect("http on loopback accepts a loopback Origin", local.every((o) => o.status === 200), JSON.stringify(local));
const noOrigin = await rpc("ping", {});
expect("http on loopback accepts a request with no Origin (clients other than browsers)", noOrigin.status === 200 && noOrigin.json?.result !== undefined, JSON.stringify(noOrigin));

httpServer.kill();

// ---------- A server on another address (hosted, MCP_HOST=0.0.0.0) takes file contents only ----------

const remotePort = await freePort();
const remoteServer = spawn(process.execPath, [path.join(HERE, "server.mjs"), "--http"],
  { env: { ...SKILLS_ENV, PORT: String(remotePort), MCP_HOST: "0.0.0.0" }, stdio: ["ignore", "ignore", "pipe"] });
try {
  let remoteLog = "";
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("remote HTTP server did not start")), 15_000);
    remoteServer.stderr.on("data", (chunk) => {
      remoteLog += chunk;
      if (String(chunk).includes("listening on")) { clearTimeout(timer); resolve(); }
    });
  });
  expect("http with MCP_HOST=0.0.0.0 binds every address", remoteLog.includes(`listening on http://0.0.0.0:${remotePort}/mcp`), remoteLog.slice(0, 300));
  const REMOTE_URL = `http://127.0.0.1:${remotePort}/mcp`;
  const remoteTool = async (name, args, origin) => {
    const r = await fetch(REMOTE_URL, {
      method: "POST", headers: { ...HEADERS, ...(origin ? { origin } : {}) },
      body: JSON.stringify({ jsonrpc: "2.0", id: httpId++, method: "tools/call", params: { name, arguments: args } }),
    });
    const text = await r.text();
    try { return { status: r.status, ...JSON.parse(text).result }; } catch { return { status: r.status, isError: undefined, content: [{ text }] }; }
  };
  // Every one of these files exists, so only the remote rule can refuse them.
  const pathCalls = [
    ["render_diagram", { scene_path: scene }], ["check_layout", { svg_path: svg }], ["drawio_link", { drawio_path: svg.replace(/svg$/, "drawio") }],
    ["lint_doc", { markdown_path: md }], ["build_design_doc", { markdown_path: md, formats: ["html"] }],
  ];
  const refused = [];
  for (const [name, args] of pathCalls) refused.push({ name, ...(await remoteTool(name, args)) });
  expect("http on 0.0.0.0 refuses every *_path input",
    refused.every((r) => r.isError === true && /is not accepted by a remote server/.test(r.content?.[0]?.text)),
    refused.map((r) => `${r.name}: ${r.content?.[0]?.text?.slice(0, 160)}`).join("\n"));
  const outDir = path.join(TMP, "remote-out");
  const outRefused = await remoteTool("render_diagram", { scene_source: sceneText, name: "remote-check", out_dir: outDir });
  expect("http on 0.0.0.0 refuses out_dir and writes nothing there",
    outRefused.isError === true && /out_dir is not accepted/.test(outRefused.content?.[0]?.text) && !fs.existsSync(outDir), outRefused.content?.[0]?.text);
  const drawioText = fs.readFileSync(svg.replace(/svg$/, "drawio"), "utf8");
  const sourceOk = await remoteTool("drawio_link", { drawio_source: drawioText });
  expect("http on 0.0.0.0 still takes *_source inputs", sourceOk.isError !== true && /^https:\/\/app\.diagrams\.net\/#create=/.test(sourceOk.content?.[0]?.text ?? ""),
    (sourceOk.content?.[0]?.text ?? "").slice(0, 200));
  // Off loopback the caller reaches the server through the AgentCore gateway, so the Origin check stays off there.
  const remoteOrigin = await remoteTool("drawio_link", { drawio_source: drawioText }, "http://attacker.example");
  expect("http on 0.0.0.0 does not apply the loopback Origin check", remoteOrigin.status === 200 && remoteOrigin.isError !== true, JSON.stringify(remoteOrigin).slice(0, 200));
  // A pasted document must not pull another server file into its output (the builders' --confine).
  const pulled = path.join(REPO, "skills", "aws-archify", "assets", "examples", "serverless-api.svg");
  const confineDoc = `---\ntitle: Confine check\n---\n\n# Confine check\n\nText.\n\n<!-- aws-svg: ${pulled} -->\n`;
  const confineBuild = await remoteTool("build_design_doc", { markdown_source: confineDoc, formats: ["html"], strict: false });
  expect("http on 0.0.0.0 refuses a document figure outside the document's folder",
    confineBuild.isError === true && /outside the document's folder/.test(confineBuild.content?.[0]?.text ?? ""), (confineBuild.content?.[0]?.text ?? "").slice(-400));
  const remoteLeftover = tempInputs().filter((f) => !tempInputsBefore.has(f));
  expect("every *_source temp folder is removed after the remote calls too", remoteLeftover.length === 0, remoteLeftover.join(", "));
} finally {
  remoteServer.kill();
}

// ask_architect: listed only with a harness configured, answered with the stand-in's text and session id, and run
// outside the one-call-at-a-time queue (a quick tool sent after it answers first).
{
  const stub = path.join(TMP, "ask-stub.py");
  fs.writeFileSync(stub, [
    "import json, sys, time",
    "r = json.load(sys.stdin)",
    "time.sleep(2)",
    "print(json.dumps({'session_id': r.get('session_id') or 'a' * 36, 'text': 'Diagram ready.', 'tools': ['render_diagram'], 'stop_reason': 'end_turn', 'errors': []}))",
  ].join("\n"));
  const askServer = spawn(process.execPath, [path.join(HERE, "server.mjs")], {
    env: { ...SKILLS_ENV, AWS_ARCH_HARNESS_ARN: "arn:aws:bedrock-agentcore:us-east-1:111122223333:harness/example", AWS_ARCH_ASK_SCRIPT: stub },
    stdio: ["pipe", "pipe", "inherit"],
  });
  const answered = [];
  const replies = new Map();
  readline.createInterface({ input: askServer.stdout }).on("line", (line) => {
    const msg = JSON.parse(line);
    answered.push(msg.id);
    replies.get(msg.id)?.(msg);
  });
  const ask = (id, method, params) => {
    askServer.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    return new Promise((resolve) => replies.set(id, resolve));
  };
  try {
    await ask(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } });
    const askList = await ask(2, "tools/list", {});
    expect("ask_architect is listed when a harness is configured", askList.result.tools.some((t) => t.name === "ask_architect"));
    expect("ask_architect is not listed without a harness", !names.includes("ask_architect"));
    const slow = ask(3, "tools/call", { name: "ask_architect", arguments: { message: "Draw a serverless API" } });
    const quick = await ask(4, "tools/call", { name: "find_icon", arguments: { query: "lambda" } });
    const reply = (await slow).result;
    expect("ask_architect returns the agent's text and session id",
      reply.isError !== true && /Diagram ready\./.test(reply.content[0].text) && /session_id: a{36}/.test(reply.content[0].text), reply.content[0].text);
    expect("ask_architect runs outside the tool queue", quick.result.isError !== true && answered.indexOf(4) < answered.indexOf(3), answered.join(","));
    const bad = (await ask(5, "tools/call", { name: "ask_architect", arguments: { message: "x", session_id: "not a session" } })).result;
    expect("ask_architect refuses a malformed session_id", bad.isError === true && /session_id must be/.test(bad.content[0].text));
  } finally {
    askServer.kill();
  }
}

fs.rmSync(TMP, { recursive: true, force: true });
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
