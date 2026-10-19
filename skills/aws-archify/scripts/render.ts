#!/usr/bin/env node
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// Renders one scene (a .tsx/.jsx module whose default export is a <Diagram>) and checks it.
//
//   npm run render -- scene.tsx            scene.svg, scene.drawio, scene.png (4800 px) and a small look PNG in the
//                                          temp folder, then the path and layout checks (exit 3 if either fails)
//   npm run render -- scene.tsx out.svg    another output path
//   flags: --no-png  --png-width N  --no-check  --view [--width N] [--keep-browser]  --canvas WxH
//
// A scene that sets `animate` also gets scene.animated.svg; the .svg and .png stay still. Look at the figure
// before handing it over: Read the look PNG this prints (never the 4800 px one).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultSvgOut, printReport, renderSvg, writeAnimatedSvg, writeDrawio } from "./lib/render-scene.ts";
import { closeBrowser, screenshotSvg, svgSize } from "./lib/browser-view.ts";

const SCRIPTS = path.dirname(fileURLToPath(import.meta.url));
const USAGE = "usage: node scripts/render.ts scene.tsx [out.svg] [--png-width N] [--no-png] [--no-check] [--view] [--width N] [--canvas WxH] [--keep-browser]";

interface Options {
  png: boolean; pngWidth: number; check: boolean;
  view: boolean; viewWidth: number; keepBrowser: boolean;
  /** Debugging only: render into this fixed size at the raw layout origin. A scene never sets its canvas. */
  canvas?: { width: number; height: number };
}

function canvasSize(value: string | undefined): { width: number; height: number } {
  const m = /^(\d+)x(\d+)$/.exec(value ?? "");
  if (!m) { console.error(`--canvas wants a size like 1200x800 (got ${JSON.stringify(value ?? "")})`); process.exit(2); }
  return { width: parseInt(m[1], 10), height: parseInt(m[2], 10) };
}

function parseArgs(argv: string[]): { files: string[]; opts: Options } {
  const files: string[] = [];
  const opts: Options = { png: true, pngWidth: 4800, check: true, view: false, viewWidth: 1400, keepBrowser: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--view") opts.view = true;
    else if (arg === "--width") opts.viewWidth = parseInt(argv[++i], 10);
    else if (arg === "--canvas") opts.canvas = canvasSize(argv[++i]);
    else if (arg === "--keep-browser") opts.keepBrowser = true;
    else if (arg === "--no-png") opts.png = false;
    else if (arg === "--png-width") opts.pngWidth = parseInt(argv[++i], 10);
    else if (arg === "--no-check") opts.check = false;
    // An unknown flag is refused rather than silently read as a file name.
    else if (arg.startsWith("--")) { console.error(`unknown flag ${arg}\n${USAGE}`); process.exit(2); }
    else files.push(arg);
  }
  return { files, opts };
}

/** The 4800 px deliverable PNG beside the SVG, and a copy that fits 1568 px (under the 2000 px a model API accepts
 *  per image once a conversation holds several) for looking at. */
function writePngs(svgOut: string, width: number): boolean {
  const converter = path.join(SCRIPTS, "svg-to-png.ts");
  const pngOut = svgOut.replace(/\.svg$/, ".png");
  const deliverable = spawnSync(process.execPath, [converter, svgOut, pngOut, String(width)], { encoding: "utf8" });
  if (deliverable.status === 0) console.log(`Wrote ${pngOut} (${width} px wide): the deliverable. Do not Read it, it is too large to view.`);
  else console.error(`PNG export failed: ${(deliverable.stderr || deliverable.stdout || "").trim()}`);
  const lookOut = path.join(os.tmpdir(), `${path.basename(svgOut, ".svg")}.look.png`);
  const look = spawnSync(process.execPath, [converter, svgOut, lookOut, "--look"], { encoding: "utf8" });
  if (look.status === 0) console.log(`Wrote ${lookOut} (fits 1568 px): open THIS one with the Read tool and look.`);
  else console.error(`Look PNG export failed: ${(look.stderr || look.stdout || "").trim()}`);
  return deliverable.status === 0 && look.status === 0;
}

/** Runs the arrow-vs-icon and layout checks on the SVG; true when both pass. */
function runChecks(svgOut: string): boolean {
  const checks: [string, string][] = [
    ["path check", path.join(SCRIPTS, "check-paths.ts")],
    ["layout check", path.join(SCRIPTS, "check-layout.ts")],
  ];
  let passed = true;
  for (const [name, script] of checks) {
    const r = spawnSync(process.execPath, [script, svgOut], { encoding: "utf8" });
    console.log(`\n${name.toUpperCase()}: ${r.status === 0 ? "PASS" : "FAIL"}\n${`${r.stdout || ""}${r.stderr || ""}`.trim()}`);
    if (r.status !== 0) passed = false;
  }
  return passed;
}

async function main(): Promise<void> {
  const { files, opts } = parseArgs(process.argv.slice(2));
  if (!files.length) { console.error(USAGE); process.exit(2); }
  const [scenePath, requestedOut] = files;
  const svgOut = requestedOut && requestedOut.endsWith(".svg") ? requestedOut : defaultSvgOut(scenePath);

  const { svg, animatedSvg, drawio, report, width, height } = await renderSvg(scenePath, { canvas: opts.canvas });
  fs.writeFileSync(svgOut, svg);
  console.log(`Wrote ${svgOut} (${width}x${height}, ${report.icons} icons, ${report.groups} groups, ${report.labels} labels, ${report.arrows} arrows)`);
  console.log(`Wrote ${writeDrawio(svgOut, drawio)} (editable in draw.io / diagrams.net)`);
  const animatedOut = writeAnimatedSvg(svgOut, animatedSvg);
  if (animatedOut) console.log(`Wrote ${animatedOut} (moving copy for web pages and READMEs; the .svg and .png stay still)`);
  // A figure whose PNGs failed is not deliverable: exit 1 after the rest is written and checked.
  const pngsFailed = opts.png && !writePngs(svgOut, opts.pngWidth);

  if (opts.view) {
    const [w, h] = svgSize(svg);
    const viewPng = path.join(os.tmpdir(), `aws-diagram-view-${path.basename(svgOut, ".svg")}.png`);
    const [ok, info] = screenshotSvg(svgOut, viewPng, w, h, opts.viewWidth);
    if (!opts.keepBrowser) closeBrowser();
    printReport(report, null, undefined);
    if (ok) console.log(`\nRendered the SVG to a temporary view: ${viewPng}\n  → OPEN it with the Read tool and LOOK — confirm no arrow crosses a node,\n    connectors route sensibly, and no label sits on a group border.`);
    else console.log(`\n(could not open a view: ${info}) — export a PNG with node scripts/svg-to-png.ts ${svgOut} <out.png> --look and LOOK at it. Do not trust the source alone.`);
  } else {
    printReport(report, null, undefined);
  }
  console.log(`Open in diagrams.net: node scripts/drawio-link.ts ${svgOut.replace(/\.svg$/, ".drawio")} --open`);

  // Every render is checked, so a figure cannot reach a reader unchecked; the files are written either way.
  if (opts.check && !runChecks(svgOut)) {
    console.log("\nCHECKS FAILED: fix the scene and render again before handing the figure over.");
    process.exitCode = 3;
  }
  if (pngsFailed) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
