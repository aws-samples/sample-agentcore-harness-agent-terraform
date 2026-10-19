#!/usr/bin/env node
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// Edit mode without a browser, for agents:
//
//   npm run edit-cli -- <scene.tsx> <command> [args…] [flags]
//
// Edits go through the same applyOp as the visual editor (scripts/edit-server.ts), so a
// command rewrites the source exactly as the matching click would. Unlike the editor, the
// scene file is left alone unless --in-place is given: the edited source goes to stdout,
// or to the --out file. `<scene> help` lists the commands and flags.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { LayoutReport } from "../src/engine.tsx";
import { closeBrowser, screenshotSvg, svgSize } from "./lib/browser-view.ts";
import {
  applyOp, EDIT_SCHEMA, GROUP_KINDS, propKind, trialRender, type EditOp, type EditResult,
} from "./lib/edit-ops.ts";
import { searchIcons } from "./lib/icon-catalog.ts";
import { animatedSvgPath, issueSummary, renderSvg, writeAnimatedSvg, writeDrawio } from "./lib/render-scene.ts";
import { attachableIds, attachTargets, describeElement, scanElements } from "./lib/scene-source.ts";

const HELP = `edit-cli — headless edit mode for a diagram scene

USAGE
  npm run edit-cli -- <scene.tsx> <command> [args…] [flags]

READ COMMANDS (no file change)
  list                         every editable element as JSON (editId, tag, props)
  get <editId>                 one element's props + source
  targets                      arrow from/to attach targets (ids + id-less groups)
  icons [query]                search the AWS icon catalog
  kinds                        group kinds + preview metadata
  schema                       editable-prop schema per tag

EDIT COMMANDS (immutable by default — prints edited source; original untouched)
  set <editId> <prop> <value>          value "" / "null" removes the prop
                                       a bool prop (dashed) set to "false" removes it
                                       — absent IS false, there is no false attribute
  set <editId> color "#0972D3"         arrow line color (any hex; see \`schema\`)
  set-props <editId> <prop=value> …    several props in one edit
  shift <editId> <dx> <dy>             nudge via <Move>
  scale <editId> <side> <delta>        grow/shrink a Group edge (side pad ±delta)
  set-icon <editId> <ExportName>       assign an icon (import added)
  connect <fromId> <toId> [fromSide] [toSide]
  add-node <groupEditId>
  delete <editId>

RENDER
  render                       write <scene>.svg next to the scene (+ layout report)
  render --view                optional: also screenshot the SVG in agent-browser (if
                               installed) to a TEMP file (the SVG is the deliverable)

FLAGS
  --out <path>    write the edited source to <path> (implies immutable)
  --in-place      overwrite the input file (like the visual server)
  --render        also render an .svg beside the output target
  --view          optional agent-browser screenshot of the rendered SVG to a temp file
  --json          machine-readable result envelope on stdout (incl. layout report)
  --quiet         suppress human status lines

Immutable is the default: an edit prints the new source to stdout and leaves the
input file unchanged. Use --out to save it elsewhere, or --in-place to overwrite.

LOOK BEFORE SHIPPING. The SVG is the deliverable. Export a PNG with
  node scripts/svg-to-png.ts <scene>.svg /tmp/<scene>.png --look
and open that PNG — confirm no arrow crosses a node, connectors route sensibly, and
labels are legible. \`--view\` (agent-browser) is optional. The layout report and
SVG source alone are NOT enough.`;

const ICON_LIMIT = 40;

interface Flags {
  out?: string;
  inPlace?: boolean;
  render?: boolean;
  view?: boolean;
  json?: boolean;
  quiet?: boolean;
}

type Note = (line: string) => void;

function fail(message: string): never {
  process.stderr.write("error: " + message + "\n");
  process.exit(1);
}

/** Flags may sit anywhere after the scene; everything else is positional. */
function splitArgs(args: string[]): { flags: Flags; positional: string[] } {
  const flags: Flags = {};
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--out") flags.out = args[++i];
    else if (arg === "--in-place") flags.inPlace = true;
    else if (arg === "--render") flags.render = true;
    else if (arg === "--view") flags.view = true;
    else if (arg === "--json") flags.json = true;
    else if (arg === "--quiet") flags.quiet = true;
    else positional.push(arg);
  }
  return { flags, positional };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (!argv.length || argv[0] === "help" || argv[0] === "--help" || argv[0] === "-h") {
    console.log(HELP);
    return;
  }
  const scenePath = path.resolve(argv[0]);
  if (!fs.existsSync(scenePath) || !fs.statSync(scenePath).isFile()) fail(`not a file: ${scenePath}`);
  if (!/\.(t|j)sx$/.test(scenePath)) fail(`expected a .tsx/.jsx scene, got: ${scenePath}`);

  const { flags, positional } = splitArgs(argv.slice(1));
  const [command, ...args] = positional;
  if (!command || command === "help") {
    console.log(HELP);
    return;
  }
  const printJson = (value: unknown): void => {
    if (flags.json) console.log(JSON.stringify(value, null, 2));
  };
  const note: Note = (line) => {
    if (!flags.quiet && !flags.json) process.stderr.write(line + "\n");
  };
  const source = fs.readFileSync(scenePath, "utf8");

  if (command === "list") {
    const elems = scanElements(source).map((el) => describeElement(source, el));
    if (flags.json) console.log(JSON.stringify({ ok: true, scene: path.basename(scenePath), elems }, null, 2));
    else for (const e of elems) console.log(`${e.editId.padEnd(5)} ${e.tag.padEnd(10)} ${JSON.stringify(e.props)}`);
    return;
  }
  if (command === "get") {
    const editId = args[0] || fail("get needs <editId>");
    const el = scanElements(source).find((e) => e.editId === editId);
    if (!el) fail(`no element ${editId}`);
    console.log(JSON.stringify(describeElement(source, el), null, 2));
    return;
  }
  if (command === "targets") {
    const elements = scanElements(source);
    console.log(JSON.stringify({ ids: attachableIds(elements), targets: attachTargets(elements) }, null, 2));
    return;
  }
  if (command === "icons") {
    // Ranked best first, so a short list keeps weak partial matches out of the transcript.
    const hits = searchIcons(args.join(" "), { limit: ICON_LIMIT });
    if (flags.json) {
      console.log(JSON.stringify({ ok: true, count: hits.length, icons: hits }, null, 2));
    } else {
      console.log(`${hits.length} icons`);
      for (const icon of hits) console.log(`  ${icon.exportName.padEnd(40)} ${icon.name}  (${icon.module})`);
      if (hits.length === ICON_LIMIT) console.log("  … truncated at 40 (use a narrower query)");
    }
    return;
  }
  if (command === "kinds") {
    console.log(JSON.stringify({ ok: true, kinds: GROUP_KINDS }, null, 2));
    return;
  }
  if (command === "schema") {
    console.log(JSON.stringify({ ok: true, schema: EDIT_SCHEMA }, null, 2));
    return;
  }
  if (command === "render") {
    const target = flags.out ? path.resolve(flags.out) : scenePath;
    const report = await renderBeside(scenePath, target, !!flags.view, note);
    printJson({ ok: true, report });
    return;
  }

  const op = toEditOp(command, args);
  if (!op) fail(`unknown command: ${command} (run \`<scene> help\`)`);
  let result: EditResult;
  try {
    result = applyOp(source, op);
  } catch (err: any) {
    fail(String(err?.message || err));
  }
  const trialPath = scenePath.replace(/\.(t|j)sx$/, `.__cli-${process.pid}-${Math.floor(performance.now())}.tsx`);
  const renderError = await trialRender(trialPath, result.src);
  if (renderError !== null) fail("edit rejected — the result would not render:\n" + renderError);

  let writtenTo: string | null = null;
  if (flags.inPlace) {
    fs.writeFileSync(scenePath, result.src);
    writtenTo = scenePath;
    note(`✓ ${op.op} — wrote ${path.basename(scenePath)} (in place)`);
  } else if (flags.out) {
    writtenTo = path.resolve(flags.out);
    fs.writeFileSync(writtenTo, result.src);
    note(`✓ ${op.op} — wrote ${writtenTo} (original untouched)`);
  } else if (!flags.json) {
    process.stdout.write(result.src);
    note(`✓ ${op.op} — edited source above (original untouched)`);
  }

  let report: LayoutReport | undefined;
  if (flags.render || flags.view) {
    if (writtenTo) report = await renderBeside(writtenTo, writtenTo, !!flags.view, note);
    else note("note: --render needs --out or --in-place (nothing on disk to render in stdout mode)");
  }
  // With --json and nothing written to disk, the edited source rides in the JSON, so stdout stays one document.
  printJson({ ok: true, op: op.op, newId: result.newId, writtenTo, report, src: writtenTo ? undefined : result.src });
}

/** The edit a command asks for, or null when the command is not an edit command. */
function toEditOp(command: string, a: string[]): EditOp | null {
  const valueOf = (s: string | undefined): string | null => (s === undefined || s === "" || s === "null" ? null : s);
  switch (command) {
    case "set": {
      const [editId, prop, ...words] = a;
      if (!editId || !prop) fail("set needs <editId> <prop> <value>");
      const value = valueOf(words.join(" ") || undefined);
      return { op: "setProp", editId, prop, value, kind: propKind(prop, value) };
    }
    case "set-props": {
      const [editId, ...pairs] = a;
      if (!editId || !pairs.length) fail("set-props needs <editId> <prop=value> …");
      const props = pairs.map((pair) => {
        const eq = pair.indexOf("=");
        const prop = eq < 0 ? pair : pair.slice(0, eq);
        const value = eq < 0 ? null : valueOf(pair.slice(eq + 1));
        return { prop, value, kind: propKind(prop, value) };
      });
      return { op: "setProps", editId, props };
    }
    case "shift": {
      const [editId, dx, dy] = a;
      if (!editId) fail("shift needs <editId> <dx> <dy>");
      return { op: "shift", editId, dx: parseInt(dx || "0", 10) || 0, dy: parseInt(dy || "0", 10) || 0 };
    }
    case "scale": {
      const [editId, side, delta] = a;
      if (!editId || !side) fail("scale needs <editId> <side> <delta>");
      return { op: "scale", editId, side, d: parseInt(delta || "8", 10) || 0 };
    }
    case "set-icon": {
      const [editId, icon] = a;
      if (!editId || !icon) fail("set-icon needs <editId> <ExportName>");
      return { op: "setIcon", editId, icon };
    }
    case "connect": {
      const [fromEditId, toEditId, fromSide, toSide] = a;
      if (!fromEditId || !toEditId) fail("connect needs <fromEditId> <toEditId> [fromSide] [toSide]");
      return { op: "connect", fromEditId, toEditId, fromSide, toSide };
    }
    case "add-node": {
      const [editId] = a;
      if (!editId) fail("add-node needs <groupEditId>");
      return { op: "addNode", editId };
    }
    case "delete": {
      const [editId] = a;
      if (!editId) fail("delete needs <editId>");
      return { op: "delete", editId };
    }
    default:
      return null;
  }
}

/**
 * Renders `scenePath` to an .svg (plus .drawio and, for an animated scene, .animated.svg) beside `target`
 * and returns the layout report. With `view`, also screenshots the SVG to a throwaway PNG when agent-browser can.
 */
async function renderBeside(scenePath: string, target: string, view: boolean, note: Note): Promise<LayoutReport> {
  const svgPath = target.replace(/\.(t|j)sx$/, ".svg");
  const { svg, animatedSvg, drawio, report } = await renderSvg(scenePath);
  fs.writeFileSync(svgPath, svg);
  writeDrawio(svgPath, drawio);
  // A target not ending in .svg has no animated path of its own: writing (or, for a still scene, removing)
  // it would hit the SVG itself.
  const animatedOut = animatedSvgPath(svgPath) !== svgPath ? writeAnimatedSvg(svgPath, animatedSvg) : null;
  note(`✓ rendered ${path.basename(svgPath)} — ${issueSummary(report)} · aspect=${report.aspect}`);
  if (animatedOut) note(`  · also wrote ${path.basename(animatedOut)}, the moving copy for READMEs and web pages`);
  // Not a layout issue (the arrow still routes), but a riser that changes nothing should say so.
  if (report.riser_ignored.length) {
    note(`  · riser has no effect on ${report.riser_ignored.join(", ")} — ` +
      "that run is straight (or uses via/elbow={false}), so there is no turn to move");
  }
  if (view) {
    const [w, h] = svgSize(svg);
    const png = path.join(os.tmpdir(), `aws-diagram-view-${path.basename(svgPath, ".svg")}.png`);
    const [ok, info] = screenshotSvg(svgPath, png, w, h);
    note(ok
      ? `→ opened the SVG for review: ${png} — Read it and LOOK (arrows, routing, labels)`
      : `✗ could not open a view: ${info} — open ${path.basename(svgPath)} in a browser and LOOK`);
  }
  return report;
}

main()
  .then(() => closeBrowser())
  .catch((err) => {
    closeBrowser();
    fail(String(err?.stack || err));
  });
