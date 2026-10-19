#!/usr/bin/env node
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// Re-renders a scene every time it (or the engine) is saved, for a tight compose-and-look loop.
//
//   npm run watch -- scene.tsx [--width 1400] [--svg out.svg] [--png preview.png]
//
// Writes scene.svg (the deliverable, plus .drawio and, when animated, .animated.svg) next to the scene, and refreshes
// a throwaway preview PNG in the temp folder through agent-browser when it is installed. Only the scene and the
// engine files are watched: after editing another module the scene imports, restart. Editors that save by renaming
// a temp file over the original replace the watched file, so a rename re-arms the watch.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { RENDERER_ROOT, defaultSvgOut, printReport, renderSvg, writeAnimatedSvg, writeDrawio } from "./lib/render-scene.ts";
import { closeBrowser, screenshotSvg, svgSize } from "./lib/browser-view.ts";

interface Options { width: number; svg: string | null; png: string | null }

function parseArgs(argv: string[]): { scene: string; opts: Options } {
  let scene = "";
  const opts: Options = { width: 1400, svg: null, png: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--width") opts.width = parseInt(argv[++i], 10);
    else if (arg === "--svg") opts.svg = argv[++i];
    else if (arg === "--png") opts.png = argv[++i];
    else if (!scene) scene = arg;
  }
  return { scene, opts };
}

async function renderOnce(scene: string, svgOut: string, pngOut: string, width: number, run: number): Promise<void> {
  const started = performance.now();
  try {
    const { svg, animatedSvg, drawio, report, width: w, height } = await renderSvg(scene);
    fs.writeFileSync(svgOut, svg);
    writeDrawio(svgOut, drawio);
    writeAnimatedSvg(svgOut, animatedSvg);
    const [svgW, svgH] = svgSize(svg);
    const [ok, info] = screenshotSvg(svgOut, pngOut, svgW, svgH, width);
    console.log(`\n[${run}] ${new Date().toISOString().slice(11, 19)}  ${w}×${height}  (${Math.round(performance.now() - started)}ms)`);
    printReport(report, pngOut);
    if (!ok) console.log(`  (PNG render failed: ${info})`);
  } catch (e: any) {
    // A broken save is reported and the watch goes on.
    console.log(`\n[${run}] ✗ ${e?.message ?? e}`);
  }
}

/** The files whose saves re-render: the scene, the engine entry and every engine module. */
function watchedFiles(scenePath: string): string[] {
  const engineDir = path.join(RENDERER_ROOT, "src", "engine");
  const modules = fs.existsSync(engineDir) ? fs.readdirSync(engineDir).filter((f) => /\.tsx?$/.test(f)).sort().map((f) => path.join(engineDir, f)) : [];
  return [scenePath, path.join(RENDERER_ROOT, "src", "engine.tsx"), ...modules];
}

async function main(): Promise<void> {
  const { scene, opts } = parseArgs(process.argv.slice(2));
  if (!scene) {
    console.error("usage: node scripts/watch.ts scene.tsx [--width N] [--svg out.svg] [--png out.png]");
    process.exit(2);
  }
  const scenePath = path.resolve(scene);
  if (!fs.existsSync(scenePath)) { console.error(`no such scene: ${scenePath}`); process.exit(2); }
  const svgOut = opts.svg ?? defaultSvgOut(scenePath);
  const pngOut = opts.png ?? path.join(os.tmpdir(), `aws-diagram-view-${path.basename(svgOut, ".svg")}.png`);

  console.log(`Watching ${path.relative(process.cwd(), scenePath)}  →  ${path.basename(svgOut)} (deliverable) + preview ${pngOut}`);
  console.log("Edit & save the scene to re-render; open the preview PNG once and it auto-refreshes. Ctrl-C to stop.\n");

  // One render at a time; saves that land during a render queue exactly one more.
  let runs = 0, busy = false, again = false;
  const rerender = async (): Promise<void> => {
    if (busy) { again = true; return; }
    busy = true;
    await renderOnce(scenePath, svgOut, pngOut, opts.width, ++runs);
    busy = false;
    if (again) { again = false; await rerender(); }
  };
  await rerender();

  // Our own outputs and esbuild's temp files never trigger a render (that would loop); bursts of saves are
  // debounced.
  const ownOutputs = new Set([svgOut, pngOut, svgOut.replace(/\.svg$/, ".drawio"), svgOut.replace(/\.svg$/, ".animated.svg")].map((p) => path.basename(p)));
  let debounce: ReturnType<typeof setTimeout> | null = null;
  const onSave = (file: string | null) => {
    if (file && ownOutputs.has(path.basename(file))) return;
    if (file && /^\.(entry|bundle)-/.test(path.basename(file))) return;
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(rerender, 120);
  };
  const watch = (file: string, retries = 20): void => {
    let watcher: fs.FSWatcher;
    try { watcher = fs.watch(file); }
    catch {
      // Mid atomic save the path can be missing for a moment.
      if (retries > 0) setTimeout(() => watch(file, retries - 1), 50);
      else console.log(`  (stopped watching ${path.basename(file)}: it no longer exists)`);
      return;
    }
    watcher.on("change", (event, name) => {
      onSave(typeof name === "string" ? name : null);
      if (event === "rename") { watcher.close(); setTimeout(() => watch(file), 50); }
    });
    watcher.on("error", () => { watcher.close(); setTimeout(() => watch(file, retries - 1), 50); });
  };
  for (const file of watchedFiles(scenePath)) watch(file);

  const stop = () => { closeBrowser(); process.exit(0); };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((e) => { console.error(e); closeBrowser(); process.exit(1); });
