#!/usr/bin/env node
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// Re-renders every bundled example scene: the regression gate after any engine change.
//
//   npm run examples                     rewrite assets/examples/*.svg and print a one-line report per scene
//   npm run examples -- --view           also screenshot each one to a temp folder (needs agent-browser)
//   npm run examples -- --dir <folder>   another folder of scenes
//
// The report is a filter, not the gate: an engine change can keep every count and still break the picture (a bad
// arrowhead, a nonsensical reroute). Look at the renders before trusting the change.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { RENDERER_ROOT, defaultSvgOut, issueCount, issueSummary, renderSvg } from "./lib/render-scene.ts";
import { closeBrowser, screenshotSvg, svgSize } from "./lib/browser-view.ts";

function parseArgs(argv: string[]): { view: boolean; dir: string; width: number } {
  const opts = { view: false, dir: path.join(RENDERER_ROOT, "assets", "examples"), width: 1400 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--view") opts.view = true;
    else if (arg === "--dir") opts.dir = path.resolve(argv[++i]);
    else if (arg === "--width") opts.width = parseInt(argv[++i], 10);
  }
  return opts;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(opts.dir)) { console.error(`no such directory: ${opts.dir}`); process.exit(2); }
  const scenes = fs.readdirSync(opts.dir).filter((f) => /\.(t|j)sx$/.test(f)).sort();
  if (!scenes.length) { console.error(`no .tsx scenes in ${opts.dir}`); process.exit(2); }

  const shotsDir = opts.view ? fs.mkdtempSync(path.join(os.tmpdir(), "aws-diagram-examples-")) : null;
  let failed = 0, flagged = 0;
  for (const file of scenes) {
    const scenePath = path.join(opts.dir, file);
    const name = file.replace(/\.(t|j)sx$/, "");
    try {
      const { svg, report, width, height } = await renderSvg(scenePath);
      const svgOut = defaultSvgOut(scenePath);
      fs.writeFileSync(svgOut, svg);
      const clean = issueCount(report) === 0;
      if (!clean) flagged++;
      console.log(`${clean ? "✓" : "⚠"} ${name.padEnd(30)} ${width}x${height}  arrows=${report.arrows}  ${issueSummary(report)}`);
      if (shotsDir) {
        const [w, h] = svgSize(svg);
        screenshotSvg(svgOut, path.join(shotsDir, `${name}.png`), w, h, opts.width);
      }
    } catch (e: any) {
      failed++;
      console.log(`✗ ${name.padEnd(30)} FAILED TO RENDER: ${e?.message ?? e}`);
    }
  }

  closeBrowser();
  console.log(`\n${scenes.length} example(s): ${scenes.length - failed - flagged} clean, ${flagged} flagged, ${failed} failed.`);
  if (shotsDir) {
    console.log(`\nScreenshots for VISUAL review in: ${shotsDir}`);
    console.log(`  → OPEN each with the Read tool and LOOK — confirm every arrowhead is`);
    console.log(`    clean and correctly oriented, connectors route sensibly, nothing`);
    console.log(`    overlaps or clips. The report above is a filter; the look is the gate.`);
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); closeBrowser(); process.exit(1); });
