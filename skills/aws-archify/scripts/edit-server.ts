#!/usr/bin/env node
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// The visual editor:
//
//   npm run edit -- <scene.tsx | dir/> [--port 5178] [--open]
//
// Serves scripts/edit-ui.html and a JSON API on 127.0.0.1. The page shows the scene rendered
// from a temporary copy in which every editable element carries __editId="eN"; the engine
// draws that as data-edit-id, so a click names an element of the source. An edit is applied
// with applyOp, trial-rendered, then written over the real .tsx (with undo and redo); Save
// writes the clean .svg, .drawio and, for an animated scene, .animated.svg beside it. Given
// a directory, the editor serves every scene in it, chosen per request with ?scene=<file>.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { closeBrowser } from "./lib/browser-view.ts";
import { applyOp, EDIT_SCHEMA, editError, GROUP_KINDS, trialRender } from "./lib/edit-ops.ts";
import { iconPreviewSvg, searchIcons } from "./lib/icon-catalog.ts";
import { renderSvg, writeAnimatedSvg, writeDrawio } from "./lib/render-scene.ts";
import {
  attachableIds, attachTargets, describeElement, findAttr, readValue, scanElements, withEditIds,
} from "./lib/scene-source.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_LIMIT = 100;
// The live view and the trial render before every write. A node the editor just added has no icon yet and must
// still draw as a placeholder, and a scene whose last element was deleted must still show its blank canvas so the
// delete can be undone. Save keeps the strict defaults: neither is a deliverable.
const LIVE_VIEW = { strictIcons: false, allowEmpty: true };

interface Options {
  scene: string;
  port: number;
  open: boolean;
}

interface History {
  undo: string[];
  redo: string[];
}

function readOptions(argv: string[]): Options {
  const options: Options = { scene: "", port: 5178, open: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--port") options.port = parseInt(argv[++i], 10);
    else if (arg === "--open") options.open = true;
    else if (!options.scene) options.scene = arg;
  }
  return options;
}

/** Best effort: the tutorial always prints the URL, so a browser that fails to open is not an error. */
function openInBrowser(url: string): void {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    spawn(command, args, { stdio: "ignore", detached: true }).unref();
  } catch {
    // nothing to do: the URL is on screen
  }
}

function printTutorial(url: string, editing: string): void {
  console.log(`
  ┌─ Edit mode ───────────────────────────────────────────────────────────┐
  │  ${url}
  │  Editing: ${editing}
  ├─────────────────────────────────────────────────────────────────────────
  │  A visual editor over your REAL .tsx — every change rewrites the file and
  │  live re-renders. The 8px grid overlay marks edit mode (never saved).
  │
  │   • CLICK a node / arrow / group          → panel focuses its source props
  │   • DROPDOWNS (preview combos) set props  → Group kind/layout/align,
  │       Arrow from/to + sides/head/dashed/elbow
  │   • TYPE to edit a Node/Group label and a Node sub caption
  │   • COLOR swatches recolor an arrow's line (or any hex you type)
  │   • RISER slider slides an elbow's first turn; it tells you when an arrow's
  │       geometry has no turn to move instead of doing nothing silently
  │   • MOVE ←→↑↓ nudges 8px · SCALE ←→↑↓ resizes a Group's padding
  │   • CONNECT: press a node's edge handle, then a + on another → new Arrow
  │   • green + on a group adds a Node,
  │       then the icon combobox assigns its real AWS icon
  │   • ⌘Z / ⇧⌘Z undo/redo · "Save SVG" writes the clean deliverable SVG
  │
  │  Every edit is trial-rendered first, so a bad change is rejected, not saved.
  │  Full reference: references/edit-mode.md   ·   Ctrl-C to stop.
  └─────────────────────────────────────────────────────────────────────────┘
`);
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body));
  });
}

/** Renders the scene with edit ids, which is what the page shows and clicks resolve against. */
async function renderForEditing(scenePath: string) {
  const source = fs.readFileSync(scenePath, "utf8");
  const elements = scanElements(source);
  const tempPath = scenePath.replace(/\.(t|j)sx?$/, `.__edit-${process.pid}.tsx`);
  fs.writeFileSync(tempPath, withEditIds(source, elements));
  try {
    const { svg, report, width, height } = await renderSvg(tempPath, LIVE_VIEW);
    return { svg, elements, report, width, height };
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
}

async function main(): Promise<void> {
  const { scene, port, open } = readOptions(process.argv.slice(2));
  if (!scene) {
    console.error("usage: node scripts/edit-server.ts <scene.tsx | dir/> [--port N] [--open]");
    process.exit(2);
  }
  const target = path.resolve(scene);
  if (!fs.existsSync(target)) {
    console.error(`not found: ${target}`);
    process.exit(2);
  }
  const folderMode = fs.statSync(target).isDirectory();
  const sceneDir = folderMode ? target : path.dirname(target);
  const sceneFiles = (): string[] =>
    fs.readdirSync(sceneDir).filter((f) => /\.(t|j)sx$/.test(f) && !f.startsWith(".") && !f.startsWith("_")).sort();
  const scenesAtStart = sceneFiles();
  const defaultScene = folderMode ? (scenesAtStart[0] ?? "") : path.basename(target);
  const page = fs.readFileSync(path.join(HERE, "edit-ui.html"), "utf8");

  /** The scene a request names (?scene=<file name>, else the launch scene), if that is a .tsx/.jsx file in sceneDir. */
  const sceneOf = (url: URL): string | null => {
    const name = url.searchParams.get("scene") || defaultScene;
    if (!name || name !== path.basename(name) || !/\.(t|j)sx$/.test(name) || name.startsWith(".")) return null;
    const file = path.resolve(sceneDir, name);
    if (path.dirname(file) !== sceneDir || !fs.existsSync(file) || !fs.statSync(file).isFile()) return null;
    return file;
  };

  // Whole-source snapshots per scene, most recent last.
  const histories = new Map<string, History>();
  const historyOf = (scenePath: string): History => {
    let history = histories.get(scenePath);
    if (!history) histories.set(scenePath, (history = { undo: [], redo: [] }));
    return history;
  };

  /** The page's view of a scene after a change. */
  const changedView = async (scenePath: string) => {
    const view = await renderForEditing(scenePath);
    const source = fs.readFileSync(scenePath, "utf8");
    const history = historyOf(scenePath);
    return {
      ok: true, svg: view.svg, width: view.width, height: view.height, report: view.report, source,
      elems: view.elements.map((e) => describeElement(source, e)), ids: attachableIds(view.elements),
      targets: attachTargets(view.elements), canUndo: history.undo.length > 0, canRedo: history.redo.length > 0,
    };
  };

  /** Writes `after` over the scene if its trial render passes, keeping `before` for undo. Returns the error or null. */
  const commit = async (scenePath: string, before: string, after: string): Promise<string | null> => {
    const trialPath = scenePath + `.__try-${process.pid}.tsx`;
    const problem = await trialRender(trialPath, withEditIds(after, scanElements(after)), LIVE_VIEW);
    if (problem !== null) return problem;
    const history = historyOf(scenePath);
    history.undo.push(before);
    if (history.undo.length > HISTORY_LIMIT) history.undo.shift();
    history.redo = [];
    fs.writeFileSync(scenePath, after);
    return null;
  };

  // Guards against DNS rebinding and cross-site requests: the Host must be this loopback server, an
  // Origin (browsers send one cross-origin and on POST) must match it, and a POST must be JSON, which
  // a cross-site form or no-cors fetch cannot send without a preflight this server never answers.
  const allowedHosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`]);
  const server = http.createServer(async (req, res) => {
    const send = (status: number, type: string, body: string): void => {
      res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
      res.end(body);
    };
    const sendJson = (value: unknown): void => send(200, "application/json", JSON.stringify(value));
    // An absolute-form target can be one the URL parser refuses (GET http://[x); that is the client's error.
    let url: URL;
    try {
      url = new URL(req.url || "/", `http://localhost:${port}`);
    } catch {
      return send(400, "text/plain", "bad request URL");
    }
    const host = (req.headers.host || "").toLowerCase();
    if (!allowedHosts.has(host)) return send(403, "text/plain", "forbidden host");
    const origin = req.headers.origin;
    if (origin !== undefined && origin !== `http://${host}`) return send(403, "text/plain", "forbidden origin");
    if (req.method === "POST" && !/^application\/json\s*(;|$)/i.test(req.headers["content-type"] || "")) {
      return send(415, "text/plain", "POST requires content-type: application/json");
    }
    if (req.method !== "GET" && req.method !== "POST") return send(405, "text/plain", "method not allowed");
    const post = req.method === "POST";

    try {
      switch (url.pathname) {
        case "/":
          return send(200, "text/html; charset=utf-8",
            page.replace("__SCENE__", folderMode ? path.basename(sceneDir) + "/" : defaultScene));
        case "/scenes":
          return sendJson({ dir: path.basename(sceneDir), scenes: sceneFiles(), active: defaultScene });
        case "/icons":
          // An empty query is the picker's browse-everything list, so it is not capped.
          return sendJson({ icons: searchIcons(url.searchParams.get("q") || "", { limit: Infinity }) });
        case "/icon-svg": {
          const px = parseInt(url.searchParams.get("px") || "40", 10) || 40;
          const svg = iconPreviewSvg(url.searchParams.get("export") || "", px);
          if (!svg) return send(404, "image/svg+xml", "");
          return send(200, "image/svg+xml", svg);
        }
        case "/kinds":
          return sendJson({ kinds: GROUP_KINDS });
      }

      const scenePath = sceneOf(url);
      if (!scenePath) return sendJson({ ok: false, error: "unknown scene" });

      if (url.pathname === "/state") {
        const view = await renderForEditing(scenePath);
        const source = fs.readFileSync(scenePath, "utf8");
        const history = historyOf(scenePath);
        return sendJson({
          svg: view.svg, width: view.width, height: view.height, report: view.report, scene: path.basename(scenePath),
          source, elems: view.elements.map((e) => describeElement(source, e)), schema: EDIT_SCHEMA,
          ids: attachableIds(view.elements), targets: attachTargets(view.elements),
          canUndo: history.undo.length > 0, canRedo: history.redo.length > 0,
        });
      }
      if (post && (url.pathname === "/undo" || url.pathname === "/redo")) {
        const history = historyOf(scenePath);
        const [from, to] = url.pathname === "/undo" ? [history.undo, history.redo] : [history.redo, history.undo];
        if (!from.length) return sendJson({ ok: false, error: `nothing to ${url.pathname.slice(1)}` });
        to.push(fs.readFileSync(scenePath, "utf8"));
        fs.writeFileSync(scenePath, from.pop()!);
        return sendJson(await changedView(scenePath));
      }
      if (post && url.pathname === "/edit") {
        const cmd = JSON.parse(await readBody(req));
        const invalid = editError(cmd);
        if (invalid) return sendJson({ ok: false, error: invalid });
        const before = fs.readFileSync(scenePath, "utf8");
        let result;
        try {
          result = applyOp(before, cmd);
        } catch (err: any) {
          return sendJson({ ok: false, error: String(err?.message || err) });
        }
        const renderError = await commit(scenePath, before, result.src);
        if (renderError !== null) return sendJson({ ok: false, error: renderError });
        if (cmd.op === "addNode" && result.newId) {
          // The page selects the new node, so it needs the node's editId in the rewritten source.
          const added = scanElements(fs.readFileSync(scenePath, "utf8"))
            .find((e) => e.tag === "Node" && readValue(findAttr(e, "id")) === result.newId);
          return sendJson({ ...(await changedView(scenePath)), newEditId: added?.editId, newId: result.newId });
        }
        return sendJson(await changedView(scenePath));
      }
      if (post && url.pathname === "/save") {
        // A placeholder node (no icon picked yet) must not ship; strict icons below also refuse a misspelt one.
        const placeholders = scanElements(fs.readFileSync(scenePath, "utf8"))
          .filter((e) => e.tag === "Node" && !findAttr(e, "icon"))
          .map((e) => readValue(findAttr(e, "label")) || readValue(findAttr(e, "id")) || e.editId);
        if (placeholders.length) {
          return sendJson({ ok: false, error: `pick an icon for every node before saving: ${placeholders.join(", ")} still ha${placeholders.length > 1 ? "ve" : "s"} none` });
        }
        const svgPath = scenePath.replace(/\.(t|j)sx?$/, ".svg");
        const { svg, animatedSvg, drawio } = await renderSvg(scenePath, { strictIcons: true });
        fs.writeFileSync(svgPath, svg);
        writeDrawio(svgPath, drawio);
        writeAnimatedSvg(svgPath, animatedSvg);
        return sendJson({ ok: true, svgPath: path.basename(svgPath) });
      }
      send(404, "text/plain", "not found");
    } catch (err: any) {
      sendJson({ ok: false, error: String(err?.stack || err) });
    }
  });

  server.listen(port, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${port}`;
    printTutorial(url, folderMode ? `${sceneDir}  (${scenesAtStart.length} scenes — pick from the panel)` : target);
    if (open) openInBrowser(url);
  });
  process.on("SIGINT", () => {
    closeBrowser();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
