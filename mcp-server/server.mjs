#!/usr/bin/env node
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// AWS Architecture Agent MCP server (stdio, or Streamable HTTP for hosting).
//
// Exposes the aws-archify and aws-design-doc skills as MCP tools so any MCP client
// (Kiro, Claude Code, Amazon Q Developer CLI, Cline, Cursor) can draw AWS diagrams
// and build design documents without installing the agent itself.
//
// No dependencies: newline-delimited JSON-RPC 2.0 over stdin/stdout, as the MCP
// stdio transport defines. Every tool runs the skill's own script with an argument
// array (never a shell), on files the caller names by absolute path.
//
//   node mcp-server/server.mjs
//
// Hosted (Amazon Bedrock AgentCore Runtime, MCP protocol): stateless Streamable HTTP,
// POST /mcp on $MCP_HOST:$PORT (default 127.0.0.1:8000; the hosted image sets MCP_HOST=0.0.0.0).
// On a loopback address, a request whose Origin header is not a loopback origin gets 403 (the MCP
// spec's DNS rebinding guard). On any other address the server is remote: callers send file contents
// in the *_source arguments, and *_path and out_dir are refused. With AWS_ARCH_OUTPUT_BUCKET set,
// outputs are uploaded to S3 by hosted/container/publish.py and returned as presigned links.
//
//   node mcp-server/server.mjs --http        (or MCP_TRANSPORT=http)
//
// The skills are found at $AWS_ARCH_SKILLS_DIR, else ../skills beside this file.
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const SERVER = { name: "aws-architecture-agent", version: "2.1.0" };
const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const HERE = path.dirname(fileURLToPath(import.meta.url));
const HTTP_MODE = process.argv.includes("--http") || process.env.MCP_TRANSPORT === "http";
const MAX_BODY = 16 * 1024 * 1024;

// HTTP listens on loopback unless MCP_HOST names another address (AgentCore Runtime needs 0.0.0.0).
const HTTP_HOST = process.env.MCP_HOST || "127.0.0.1";
const isLoopback = (host) => /^(localhost|::1|\[::1\]|127(\.\d{1,3}){3})$/i.test(host);
const LOOPBACK_BIND = isLoopback(HTTP_HOST);
// Served on any other address, the callers are on other machines: they send file contents, never paths on this one.
const REMOTE = HTTP_MODE && !LOOPBACK_BIND;

// A skills folder counts only in the layout this server drives (the renderer's scripts at the aws-archify root). An
// older plugin install still has aws-archify/SKILL.md but keeps its scripts elsewhere; it is named in the error
// instead of being half used.
const LAYOUT_PROBE = path.join("aws-archify", "scripts", "render.ts");

function findSkillsDir() {
  const candidates = [
    process.env.AWS_ARCH_SKILLS_DIR,
    path.join(HERE, "..", "skills"),
  ].filter(Boolean);
  return {
    dir: candidates.find((d) => fs.existsSync(path.join(d, LAYOUT_PROBE))) ?? null,
    older: candidates.find((d) => fs.existsSync(path.join(d, "aws-archify", "SKILL.md"))) ?? null,
  };
}

const { dir: SKILLS, older: OLDER_SKILLS } = findSkillsDir();
const ARCHIFY = SKILLS && path.join(SKILLS, "aws-archify");
const DESIGN_DOC = SKILLS && path.join(SKILLS, "aws-design-doc");

// ---------- helpers ----------

class ToolError extends Error {}

function requireSkills() {
  if (SKILLS) return;
  if (OLDER_SKILLS) throw new ToolError(`The skills at ${OLDER_SKILLS} are from an older plugin version (no ${LAYOUT_PROBE}). Update the plugin, or set AWS_ARCH_SKILLS_DIR to a current skills/ directory.`);
  throw new ToolError("Skills folder not found. Set AWS_ARCH_SKILLS_DIR to the agent's skills/ directory.");
}

function absFile(p, exts, label) {
  if (typeof p !== "string" || !p) throw new ToolError(`${label} is required`);
  if (!path.isAbsolute(p)) throw new ToolError(`${label} must be an absolute path (got ${p})`);
  const resolved = path.resolve(p);
  if (!exts.some((e) => resolved.toLowerCase().endsWith(e))) throw new ToolError(`${label} must end with ${exts.join(" or ")}`);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new ToolError(`${label} not found: ${resolved}`);
  return resolved;
}

function absDir(p, label) {
  if (!path.isAbsolute(p)) throw new ToolError(`${label} must be an absolute path (got ${p})`);
  fs.mkdirSync(p, { recursive: true });
  return path.resolve(p);
}

function run(cmd, args, { cwd, timeoutMs = 180_000 } = {}) {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 });
  const out = `${r.stdout ?? ""}${r.stderr ? `\n${r.stderr}` : ""}`.trim();
  if (r.error) return { ok: false, out: `${cmd} failed to start: ${r.error.message}\n${out}`.trim() };
  if (r.signal) return { ok: false, out: `${cmd} stopped by ${r.signal} (timeout ${timeoutMs / 1000}s)\n${out}`.trim() };
  return { ok: r.status === 0, code: r.status, out };
}

function tail(text, max = 12_000) {
  return text.length > max ? `...(${text.length - max} chars cut)\n${text.slice(-max)}` : text;
}

// First use on a machine installs each skill's dependencies with the skill's own setup.sh.
const setupDone = new Set();
function ensureSetup(skillDir, readyCheck) {
  if (setupDone.has(skillDir) || readyCheck()) { setupDone.add(skillDir); return; }
  const r = run("bash", [path.join(skillDir, "setup.sh")], { cwd: skillDir, timeoutMs: 600_000 });
  if (!r.ok) throw new ToolError(`setup.sh in ${skillDir} failed:\n${tail(r.out)}`);
  setupDone.add(skillDir);
}
const archifyReady = () => fs.existsSync(path.join(ARCHIFY, "node_modules", "@napi-rs", "canvas"));
const designDocReady = () => run("python3", ["-c", "import docx"]).ok;

// A tool input is either an absolute path or, for remote callers, the file's text,
// which is written to a fresh temp folder and then handled like a path.
const tempInputDirs = new Set();

function inputFile(input, { pathKey, sourceKey, exts, fileName }) {
  const p = input[pathKey], src = input[sourceKey];
  if (REMOTE && p !== undefined) throw new ToolError(`${pathKey} is not accepted by a remote server, which cannot see your files: pass the file's text as ${sourceKey}`);
  if ((p === undefined) === (src === undefined)) throw new ToolError(`pass exactly one of ${pathKey} or ${sourceKey}`);
  if (p !== undefined) return absFile(p, exts, pathKey);
  if (typeof src !== "string" || !src.trim()) throw new ToolError(`${sourceKey} must be non-empty text`);
  // An optional `name` sets the output file names (serverless-api.svg, not scene.svg).
  if (input.name !== undefined && !/^[a-z0-9][a-z0-9-]{0,62}$/.test(input.name)) throw new ToolError("name must be lower-case letters, digits and hyphens");
  const stem = input.name ?? fileName.replace(/\.[^.]+$/, "");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aws-arch-in-"));
  tempInputDirs.add(dir);
  const file = path.join(dir, stem + path.extname(fileName));
  fs.writeFileSync(file, src);
  return file;
}

// Removes the temp folder inputFile made for a *_source input (never a caller's own folder). A tool keeps it only
// when it handed the caller local paths to outputs inside it, that is, when nothing was uploaded.
function dropTempInput(file) {
  const dir = path.dirname(file);
  if (tempInputDirs.delete(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

// A check script exits 0 (pass) or 1 (fail) after printing its report line. Anything else, such as a missing
// script, a crash or a usage error, is a broken install rather than a verdict on the figure or document, so it is
// a tool error: the model must not start "fixing" a figure that never got checked.
function runCheck(script, args, { cwd, report }) {
  if (!fs.existsSync(script)) throw new ToolError(`${path.basename(script)} is missing from the skills folder (${script}).`);
  const r = run(script.endsWith(".py") ? "python3" : process.execPath, [script, ...args], { cwd, timeoutMs: 60_000 });
  if ((r.code === 0 || r.code === 1) && report.test(r.out)) return r;
  throw new ToolError(`${path.basename(script)} did not run to completion${r.code === undefined ? "" : ` (exit ${r.code})`}:\n${tail(r.out)}`);
}
const LAYOUT_REPORT = /^\s*(PASS|FAIL): \d+ hard defect/m;
const PATHS_REPORT = /^\s*(PASS|FAIL): \d+ segment\/icon intersection/m;
const LINT_REPORT = /^lint: \d+ error\(s\)/m;

const DOC_FORMATS = ["html", "docx"];

// Hosted only (AWS_ARCH_OUTPUT_BUCKET set): upload outputs and return their links.
function publish(files) {
  if (!process.env.AWS_ARCH_OUTPUT_BUCKET || !files.length) return "";
  const script = process.env.AWS_ARCH_PUBLISH_SCRIPT || path.join(HERE, "..", "hosted", "container", "publish.py");
  if (!fs.existsSync(script)) return "";
  const prefix = `mcp/${new Date().toISOString().slice(0, 10)}/${crypto.randomBytes(4).toString("hex")}`;
  const r = run("python3", [script, "--prefix", prefix, ...files], { timeoutMs: 120_000 });
  if (!r.ok) throw new ToolError(`Upload to S3 failed:\n${tail(r.out, 4000)}`);
  const links = r.out.split("\n").flatMap((line) => {
    try { const o = JSON.parse(line); return o?.url ? [o] : []; } catch { return []; }
  });
  return `\n\nDownload links (presigned):\n${links.map((o) => `- ${path.basename(o.file)}: ${o.url}\n  ${o.s3_uri}`).join("\n")}`;
}

// Amazon Quick accepts tool descriptions with periods and commas only, so a server behind a Quick
// connector (AWS_ARCH_PLAIN_DESCRIPTIONS=1) lists every description reduced to words, digits, "." and ",".
const PLAIN_DESCRIPTIONS = process.env.AWS_ARCH_PLAIN_DESCRIPTIONS === "1";

function plain(text) {
  return text.replace(/(\w)'(\w)/g, "$1$2").replace(/[^A-Za-z0-9 .,]+/g, " ").replace(/ +([.,])/g, "$1").replace(/\s+/g, " ").trim();
}

function plainSchema(schema) {
  if (Array.isArray(schema)) return schema.map(plainSchema);
  if (!schema || typeof schema !== "object") return schema;
  return Object.fromEntries(Object.entries(schema).map(([k, v]) =>
    [k, k === "description" && typeof v === "string" ? plain(v) : k === "enum" ? v : plainSchema(v)]));
}

function plainTool(tool) {
  return { ...tool, description: plain(tool.description), inputSchema: plainSchema(tool.inputSchema) };
}

// A remote caller's next request can land on another host, where this render's files do not exist,
// so a hosted render returns the diagrams.net link itself instead of leaving it to drawio_link.
function hostedDrawioLink(drawio) {
  if (!fs.existsSync(drawio)) return "";
  const r = run(process.execPath, [path.join(ARCHIFY, "scripts", "drawio-link.ts"), drawio], { cwd: ARCHIFY, timeoutMs: 30_000 });
  return r.ok ? `\n\nOpen in diagrams.net (editable, nothing uploaded): ${r.out.trim()}` : "";
}

// One JSON line per tool call on stderr. Hosted, that is the runtime's CloudWatch log group, where
// hosted/scripts/usage.py counts calls, failures, sessions and feedback. Tool arguments are never logged.
function usage(fields) {
  if (HTTP_MODE) process.stderr.write(`${JSON.stringify({ event: "tool_call", ...fields })}\n`);
}

// ---------- tools ----------

const TOOLS = [
  {
    name: "get_authoring_guide",
    description:
      "Return the authoring guide to read BEFORE using the other tools. topic 'diagram' gives the aws-archify skill plus the renderer guide " +
      "(how to write a scene .tsx with AWS icons, layout primitives, arrows and the figure rules). topic 'design-doc' gives the aws-design-doc " +
      "skill (document structure, front matter, figure markers, HLD/LLD/ADR/runbook templates).",
    inputSchema: {
      type: "object",
      properties: { topic: { type: "string", enum: ["diagram", "design-doc"] } },
      required: ["topic"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    handler({ topic }) {
      requireSkills();
      const files = topic === "diagram"
        ? [path.join(ARCHIFY, "SKILL.md"), path.join(ARCHIFY, "GUIDE.md")]
        : topic === "design-doc"
          ? [path.join(DESIGN_DOC, "SKILL.md")]
          : null;
      if (!files) throw new ToolError("topic must be 'diagram' or 'design-doc'");
      const missing = files.filter((f) => !fs.existsSync(f));
      if (missing.length) throw new ToolError(`The authoring guide is incomplete: ${missing.map((f) => path.relative(SKILLS, f)).join(", ")} not found under ${SKILLS}.`);
      const body = files.map((f) => `===== ${path.relative(SKILLS, f)} =====\n${fs.readFileSync(f, "utf8")}`).join("\n\n");
      return `Skills folder: ${SKILLS}\nScenes import the engine as "../src/engine.tsx" and icons from "../src/icons/<module>.js"; render_diagram places the scene so those imports resolve.\n\n${body}`;
    },
  },
  {
    name: "find_icon",
    description: "Search the official AWS Architecture Icons catalog and return the exact React component names and import lines to use in a scene.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Service or resource, for example 'lambda function' or 'transit gateway'" },
        type: { type: "string", enum: ["service", "resource", "group", "category"] },
        limit: { type: "integer", minimum: 1, maximum: 25 },
      },
      required: ["query"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    handler({ query, type, limit }) {
      requireSkills();
      if (typeof query !== "string" || !query.trim()) throw new ToolError("query is required");
      ensureSetup(ARCHIFY, archifyReady);
      const args = [path.join(ARCHIFY, "scripts", "find-icon.ts"), query];
      if (type) args.push("--type", type);
      if (limit) args.push("--limit", String(limit));
      const r = run(process.execPath, args, { cwd: ARCHIFY, timeoutMs: 60_000 });
      if (!r.ok) throw new ToolError(tail(r.out));
      // render_diagram runs a scene from scenes/, so print the import path that works from there.
      return r.out.replace(/from "src\//g, 'from "../src/');
    },
  },
  {
    name: "render_diagram",
    description:
      "Render an aws-archify scene (.tsx) to SVG, a PNG (4800 px wide by default) and an editable draw.io file, then run the layout checks on the SVG. " +
      "When the scene sets animate to flow on its Diagram, the render also writes a moving copy, name.animated.svg, and the other files stay still. " +
      "Write the scene first (see get_authoring_guide topic 'diagram'). Pass the scene as scene_path, or as scene_source (the .tsx text) when the " +
      "server runs remotely. Outputs are written to out_dir, or beside the scene; a hosted server also returns download links. A FAIL in the layout " +
      "report means the figure must be fixed and rendered again.",
    inputSchema: {
      type: "object",
      properties: {
        scene_path: { type: "string", description: "Absolute path of the scene .tsx (or use scene_source)" },
        scene_source: { type: "string", description: "The scene .tsx text, instead of scene_path" },
        name: { type: "string", description: "File name stem for outputs made from a *_source input, for example serverless-api" },
        out_dir: { type: "string", description: "Absolute output folder (default: the scene's folder)" },
        png_width: { type: "integer", minimum: 400, maximum: 9600, description: "PNG width in px (default 4800)" },
      },
      additionalProperties: false,
    },
    handler(input) {
      requireSkills();
      if (REMOTE && input.out_dir !== undefined) throw new ToolError("out_dir is not accepted by a remote server: it writes outputs to its own temporary folder");
      const scene = inputFile(input, { pathKey: "scene_path", sourceKey: "scene_source", exts: [".tsx", ".jsx"], fileName: "scene.tsx" });
      let tmp = null, keepInput = false;
      try {
        const { out_dir, png_width } = input;
        const outDir = out_dir ? absDir(out_dir, "out_dir") : path.dirname(scene);
        ensureSetup(ARCHIFY, archifyReady);
        const stem = path.basename(scene).replace(/\.(tsx|jsx)$/i, "");
        const outSvg = path.join(outDir, `${stem}.svg`);
        // Scenes import the engine by relative path, so the render runs on a copy inside scenes/.
        const scenesDir = path.join(ARCHIFY, "scenes");
        fs.mkdirSync(scenesDir, { recursive: true });
        tmp = path.join(scenesDir, `mcp-${crypto.randomBytes(4).toString("hex")}-${path.basename(scene)}`);
        // The scene runs from scenes/, so any src/ import (src/, ./src/, ../../src/) must be ../src/.
        fs.writeFileSync(tmp, fs.readFileSync(scene, "utf8").replace(/(from\s+["'])(?:\.{1,2}\/)*src\//g, "$1../src/"));
        // The server runs the layout check itself below, so the render skips its own.
        const args = [path.join(ARCHIFY, "scripts", "render.ts"), tmp, outSvg, "--no-check"];
        if (png_width) args.push("--png-width", String(png_width));
        const r = run(process.execPath, args, { cwd: ARCHIFY });
        if (!r.ok) throw new ToolError(`Render failed:\n${tail(r.out)}`);
        const check = runCheck(path.join(ARCHIFY, "scripts", "check-layout.ts"), [outSvg], { cwd: ARCHIFY, report: LAYOUT_REPORT });
        const outputs = [outSvg, outSvg.replace(/\.svg$/, ".png"), outSvg.replace(/\.svg$/, ".drawio"), outSvg.replace(/\.svg$/, ".animated.svg")].filter((f) => fs.existsSync(f));
        const paths = runCheck(path.join(ARCHIFY, "scripts", "check-paths.ts"), [outSvg], { cwd: ARCHIFY, report: PATHS_REPORT });
        const pass = check.ok && paths.ok;
        const links = publish(outputs);
        keepInput = !links && outDir === path.dirname(scene);
        return `${r.out}\n\nOutputs:\n${outputs.map((f) => `- ${f}`).join("\n")}\n\n` +
          `Path check (${paths.ok ? "PASS" : "FAIL"}):\n${tail(paths.out, 2000)}\n\nLayout check (${check.ok ? "PASS" : "FAIL"}):\n${tail(check.out)}\n\n` +
          (pass ? "Both checks pass. Look at the PNG before handing the figure over." : "A check FAILED: fix the scene and call render_diagram again.") +
          links + (links ? hostedDrawioLink(outSvg.replace(/\.svg$/, ".drawio")) : "");
      } finally {
        if (tmp) fs.rmSync(tmp, { force: true });
        if (!keepInput) dropTempInput(scene);
      }
    },
  },
  {
    name: "check_layout",
    description: "Run the aws-archify layout checks on a rendered diagram SVG: overlaps, arrows through icons or text, zig-zags, numbered labels, sparse or oversized canvases.",
    inputSchema: {
      type: "object",
      properties: {
        svg_path: { type: "string", description: "Absolute path of the diagram .svg (or use svg_source)" },
        svg_source: { type: "string", description: "The diagram SVG text, instead of svg_path" },
        advisory: { type: "boolean", description: "Report must-fix items without failing (for auditing old figures)" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    handler(input) {
      requireSkills();
      const svg = inputFile(input, { pathKey: "svg_path", sourceKey: "svg_source", exts: [".svg"], fileName: "diagram.svg" });
      try {
        ensureSetup(ARCHIFY, archifyReady);
        const args = input.advisory ? ["--advisory", svg] : [svg];
        const r = runCheck(path.join(ARCHIFY, "scripts", "check-layout.ts"), args, { cwd: ARCHIFY, report: LAYOUT_REPORT });
        return `${r.ok ? "PASS" : "FAIL"}\n${tail(r.out)}`;
      } finally {
        dropTempInput(svg);
      }
    },
  },
  {
    name: "drawio_link",
    description: "Return a link that opens a rendered .drawio file directly in diagrams.net, loaded and editable. Nothing is uploaded: the diagram travels inside the link.",
    inputSchema: {
      type: "object",
      properties: {
        drawio_path: { type: "string", description: "Absolute path of the .drawio file (or use drawio_source)" },
        drawio_source: { type: "string", description: "The .drawio XML text, instead of drawio_path" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    handler(input) {
      requireSkills();
      const file = inputFile(input, { pathKey: "drawio_path", sourceKey: "drawio_source", exts: [".drawio"], fileName: "diagram.drawio" });
      try {
        const r = run(process.execPath, [path.join(ARCHIFY, "scripts", "drawio-link.ts"), file], { cwd: ARCHIFY, timeoutMs: 30_000 });
        if (!r.ok) throw new ToolError(tail(r.out));
        return r.out;
      } finally {
        dropTempInput(file);
      }
    },
  },
  {
    name: "build_design_doc",
    description:
      "Build a markdown design document (HLD, LLD, ADR or runbook written to the aws-design-doc structure) into a themed, self-contained HTML page " +
      "and/or a Word file, with its aws-svg figures inline. Outputs are written beside the markdown (MY-DOC.md -> my-doc.html, my-doc.docx). " +
      "Pass markdown_source (the markdown text) instead of markdown_path when the server runs remotely; a hosted server also returns download links.",
    inputSchema: {
      type: "object",
      properties: {
        markdown_path: { type: "string", description: "Absolute path of the design document .md (or use markdown_source)" },
        markdown_source: { type: "string", description: "The design document markdown text, instead of markdown_path" },
        name: { type: "string", description: "File name stem for outputs made from a *_source input, for example serverless-api" },
        formats: { type: "array", items: { type: "string", enum: DOC_FORMATS }, description: "Default: both" },
        strict: { type: "boolean", description: "Fail on a lint error or an unresolved link (default true)" },
      },
      additionalProperties: false,
    },
    handler(input) {
      requireSkills();
      const { formats, strict = true } = input;
      if (formats !== undefined && (!Array.isArray(formats) || formats.some((f) => !DOC_FORMATS.includes(f))))
        throw new ToolError(`formats must be a list of ${DOC_FORMATS.join(" and ")}`);
      const md = inputFile(input, { pathKey: "markdown_path", sourceKey: "markdown_source", exts: [".md"], fileName: "document.md" });
      let keepInput = false;
      try {
        const want = formats?.length ? [...new Set(formats)] : DOC_FORMATS;
        if (want.includes("docx")) ensureSetup(DESIGN_DOC, designDocReady);
        const outPath = (fmt) => path.join(path.dirname(md), `${path.basename(md, ".md").toLowerCase()}.${fmt}`);
        const results = [];
        const built = [];
        let ok = true;
        for (const fmt of want) {
          const script = path.join(DESIGN_DOC, "scripts", fmt === "html" ? "build-html.py" : "build-docx.py");
          const args = [script, md];
          if (strict) args.push("--strict");
          // Hosted, a pasted document must not pull other server files into its output.
          if (REMOTE) args.push("--confine");
          const r = run("python3", args, { cwd: path.dirname(md) });
          ok &&= r.ok;
          const out = outPath(fmt);
          if (r.ok && fs.existsSync(out)) built.push(out);
          results.push(`== ${fmt}: ${r.ok ? "built" : "FAILED"}${fs.existsSync(out) ? ` -> ${out}` : ""}\n${tail(r.out, 6000)}`);
        }
        const links = ok ? publish(built) : "";
        keepInput = !links && want.some((fmt) => fs.existsSync(outPath(fmt)));
        if (!ok) throw new ToolError(results.join("\n\n"));
        return results.join("\n\n") + links;
      } finally {
        if (!keepInput) dropTempInput(md);
      }
    },
  },
  {
    name: "lint_doc",
    description: "Check a markdown design document before it is built or sent: structure, front matter, figure markers, glossary, banned wording, real account IDs.",
    inputSchema: {
      type: "object",
      properties: {
        markdown_path: { type: "string", description: "Absolute path of the design document .md (or use markdown_source)" },
        markdown_source: { type: "string", description: "The design document markdown text, instead of markdown_path" },
        ascii: { type: "boolean", description: "Treat any non-ASCII character as an error" },
        strict: { type: "boolean", description: "Fail on warnings too" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    handler(input) {
      requireSkills();
      const md = inputFile(input, { pathKey: "markdown_path", sourceKey: "markdown_source", exts: [".md"], fileName: "document.md" });
      try {
        const args = [];
        if (input.ascii) args.push("--ascii");
        if (input.strict) args.push("--strict");
        if (REMOTE) args.push("--confine");
        args.push(md);
        const r = runCheck(path.join(DESIGN_DOC, "scripts", "lint-doc.py"), args, { cwd: path.dirname(md), report: LINT_REPORT });
        return `${r.ok ? "PASS" : "FAIL"}\n${tail(r.out)}`;
      } finally {
        dropTempInput(md);
      }
    },
  },
  {
    name: "send_feedback",
    description:
      "Send feedback about a diagram or document this server made, so the maintainers can fix the skill. " +
      "Call it when the user says a result was good or wrong, or asks to report a problem. Do not include customer names, account IDs or secrets.",
    inputSchema: {
      type: "object",
      properties: {
        rating: { type: "string", enum: ["good", "bad"], description: "Whether the result was good or bad" },
        comment: { type: "string", description: "What worked or what was wrong, in the user's words (up to 2000 characters)" },
        artifact: { type: "string", description: "Optional name of the diagram or document, for example serverless-api" },
      },
      required: ["rating", "comment"],
      additionalProperties: false,
    },
    handler({ rating, comment, artifact }, session) {
      if (rating !== "good" && rating !== "bad") throw new ToolError("rating must be good or bad");
      if (typeof comment !== "string" || !comment.trim()) throw new ToolError("comment is required");
      process.stderr.write(`${JSON.stringify({ event: "feedback", rating, comment: comment.slice(0, 2000), artifact: typeof artifact === "string" ? artifact.slice(0, 100) : undefined, session })}\n`);
      return "Thanks, the feedback was recorded for the maintainers.";
    },
  },
];

// Hosted only (AWS_ARCH_HARNESS_ARN set): the whole hosted agent as one tool, for MCP clients that want the agent's own
// plan, render, check and review loop instead of driving the tools themselves. A turn takes minutes, so it runs outside
// the one-call-at-a-time queue and never on the Amazon Quick gateway (Quick stops a call after 60 seconds).
const HARNESS_ARN = process.env.AWS_ARCH_HARNESS_ARN;

function askHarness(message, sessionId) {
  const script = process.env.AWS_ARCH_ASK_SCRIPT || path.join(HERE, "..", "hosted", "container", "ask_harness.py");
  return new Promise((resolve, reject) => {
    const child = spawn("python3", [script], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("error", (e) => reject(new ToolError(`The hosted agent could not start: ${e.message}`)));
    child.on("close", () => {
      try { resolve(JSON.parse(out.trim().split("\n").pop())); } catch { reject(new ToolError(`The hosted agent failed: ${tail(err || out, 2000)}`)); }
    });
    child.stdin.end(JSON.stringify({ message, session_id: sessionId }));
  });
}

if (HARNESS_ARN) {
  TOOLS.push({
    name: "ask_architect",
    description:
      "Hand a whole request to the hosted AWS architecture agent: it plans the figures, renders and checks them, reviews them and " +
      "writes design documents, then returns its answer with download links. Use it when the user wants the finished result rather " +
      "than step by step tool calls. A turn takes a few minutes. Pass session_id from the previous answer to continue the same work.",
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string", description: "The request in the user's words, with any brief or Terraform it needs" },
        session_id: { type: "string", description: "Session id from an earlier ask_architect answer, to continue that conversation" },
      },
      required: ["message"],
      additionalProperties: false,
    },
    async handler({ message, session_id }) {
      if (typeof message !== "string" || !message.trim()) throw new ToolError("message is required");
      if (session_id !== undefined && (typeof session_id !== "string" || !/^[A-Za-z0-9-]{33,100}$/.test(session_id)))
        throw new ToolError("session_id must be the id an earlier ask_architect answer returned");
      const r = await askHarness(message.slice(0, 100_000), session_id);
      if (r.errors?.length) throw new ToolError(`The hosted agent stopped with an error:\n${r.errors.join("\n")}\nsession_id: ${r.session_id}`);
      const status = r.stop_reason === "still_running"
        ? "The agent is still working. Call ask_architect again with the same session_id and ask for the result."
        : r.stop_reason && r.stop_reason !== "end_turn" ? `The agent stopped: ${r.stop_reason}.` : "";
      return [r.text.trim(), status, `session_id: ${r.session_id}`].filter(Boolean).join("\n\n");
    },
  });
}

// ---------- JSON-RPC ----------

const result = (id, res) => ({ jsonrpc: "2.0", id, result: res });
const error = (id, code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });

// Returns the response for a request, or undefined for a notification or a client response.
async function handle(msg, session) {
  const { id, method, params } = msg ?? {};
  if (id === undefined || id === null || typeof method !== "string") return undefined;
  switch (method) {
    case "initialize": {
      const asked = params?.protocolVersion;
      return result(id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER,
        instructions: "Call get_authoring_guide before writing a scene or a design document. Pass absolute paths, " +
          "or file contents in the *_source arguments when the server runs remotely. When the user says a result is good or wrong, call send_feedback.",
      });
    }
    case "ping":
      return result(id, {});
    case "tools/list":
      return result(id, { tools: TOOLS.map(({ handler, ...t }) => (PLAIN_DESCRIPTIONS ? plainTool(t) : t)) });
    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === params?.name);
      if (!tool) return error(id, -32602, `Unknown tool: ${params?.name}`);
      const started = Date.now();
      try {
        const text = await tool.handler(params.arguments ?? {}, session);
        usage({ tool: tool.name, ms: Date.now() - started, ok: true, session });
        return result(id, { content: [{ type: "text", text }] });
      } catch (e) {
        // A hosted caller gets the message only; the stack, with the server's own paths, goes to the log.
        if (!(e instanceof ToolError) && HTTP_MODE) process.stderr.write(`${e?.stack ?? e}\n`);
        const text = e instanceof ToolError ? e.message : `Internal error: ${HTTP_MODE ? (e?.message ?? e) : (e?.stack ?? e)}`;
        usage({ tool: tool.name, ms: Date.now() - started, ok: false, error: text.split("\n").slice(0, 3).join(" ").slice(0, 300), session });
        // Tool failures are results the model can read and act on, not protocol errors.
        return result(id, { content: [{ type: "text", text }], isError: true });
      }
    }
    default:
      return error(id, -32601, `Method not found: ${method}`);
  }
}

// One call at a time: tools share the renderer's scenes/ folder and the CPU.
let queue = Promise.resolve();
function enqueue(msg, session) {
  if (msg?.method === "tools/call" && msg?.params?.name === "ask_architect") return handle(msg, session);
  const run = queue.then(() => handle(msg, session)).catch((e) => {
    process.stderr.write(`${e?.stack ?? e}\n`);
    return msg?.id === undefined || msg?.id === null ? undefined : error(msg.id, -32603, "Internal error");
  });
  queue = run;
  return run;
}

// ---------- stdio transport ----------

function serveStdio() {
  const send = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);
  const rl = readline.createInterface({ input: process.stdin });
  // Every call still running when stdin closes is answered before the process exits (ask_architect runs outside the queue).
  const pending = new Set();
  rl.on("line", (line) => {
    if (!line.trim()) return;
    let msg;
    try { msg = JSON.parse(line); } catch { return send(error(null, -32700, "Parse error")); }
    const call = enqueue(msg).then((res) => res && send(res)).finally(() => pending.delete(call));
    pending.add(call);
  });
  rl.on("close", () => Promise.allSettled([...pending]).then(() => process.exit(0)));
}

// ---------- Streamable HTTP transport (stateless) ----------

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => { size += c.length; if (size <= MAX_BODY) chunks.push(c); });
    req.on("end", () => (size > MAX_BODY ? reject(new Error(`request body is over ${MAX_BODY} bytes`)) : resolve(Buffer.concat(chunks).toString("utf8"))));
    req.on("error", reject);
  });
}

function respond(res, status, body) {
  if (body === undefined) { res.writeHead(status); return res.end(); }
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

// A browser sends an Origin header; clients other than browsers send none.
function loopbackOrigin(origin) {
  try {
    const { protocol, hostname } = new URL(origin);
    return (protocol === "http:" || protocol === "https:") && isLoopback(hostname);
  } catch {
    return false;
  }
}

function serveHttp() {
  const port = Number(process.env.PORT || 8000);
  const server = http.createServer(async (req, res) => {
    try {
      // DNS rebinding guard (MCP spec): on loopback, a page from any other origin must not reach the server.
      if (LOOPBACK_BIND && req.headers.origin !== undefined && !loopbackOrigin(req.headers.origin))
        return respond(res, 403, error(null, -32000, "Forbidden origin"));
      if (new URL(req.url, "http://localhost").pathname !== "/mcp") return respond(res, 404);
      if (req.method !== "POST") { res.setHeader("Allow", "POST"); return respond(res, 405); }
      // AgentCore Runtime adds its own Mcp-Session-Id; accept it and hand it back.
      const sessionId = req.headers["mcp-session-id"];
      if (sessionId) res.setHeader("Mcp-Session-Id", sessionId);
      // The usage log counts sessions; a direct runtime invoke carries only the runtime's own session header.
      const usageSession = sessionId ?? req.headers["x-amzn-bedrock-agentcore-runtime-session-id"];
      let msg;
      try { msg = JSON.parse(await readBody(req)); } catch (e) {
        return respond(res, e instanceof SyntaxError ? 400 : 413, error(null, e instanceof SyntaxError ? -32700 : -32600, e instanceof SyntaxError ? "Parse error" : e.message));
      }
      const batch = Array.isArray(msg);
      if (batch && !msg.length) return respond(res, 400, error(null, -32600, "Invalid Request"));
      const out = (await Promise.all((batch ? msg : [msg]).map((m) => enqueue(m, usageSession)))).filter(Boolean);
      if (!out.length) return respond(res, 202);
      respond(res, 200, batch ? out : out[0]);
    } catch (e) {
      process.stderr.write(`${e?.stack ?? e}\n`);
      if (!res.headersSent) respond(res, 500, error(null, -32603, "Internal error"));
    }
  });
  // A first render can run the skill's setup.sh for minutes; never cut a request short.
  server.requestTimeout = 0;
  server.listen(port, HTTP_HOST, () => {
    const { address } = server.address();
    process.stderr.write(`aws-architecture-agent MCP server listening on http://${address.includes(":") ? `[${address}]` : address}:${port}/mcp\n`);
  });
}

if (HTTP_MODE) serveHttp();
else serveStdio();
