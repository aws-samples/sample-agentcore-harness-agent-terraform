// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// Scene -> SVG string (with the draw.io model inside), the files written beside it, and the printed layout report.
// render.ts, watch.ts, render-examples.ts and both edit-mode front ends go through here.
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ComposeOptions, LayoutReport } from "../../src/engine.tsx";
import { loadScene, RENDERER_ROOT } from "./scene-bundle.ts";
import { buildDrawioModel, injectDrawioContent } from "./drawio-model.ts";

export { RENDERER_ROOT };

export interface RenderedScene { svg: string; animatedSvg: string | null; drawio: string; report: LayoutReport; width: number; height: number }

/** Renders a scene. `strictIcons` (default true) refuses an icon prop that is not a component; `canvas` pins the
 *  canvas size instead of fitting it; a scene with nothing in it throws unless `allowEmpty` is set. A scene in which
 *  an arrow moves (flow toward a single head, or dots) also gets a moving copy; the .svg itself stays still. */
export async function renderSvg(scenePath: string, opts: ComposeOptions = {}): Promise<RenderedScene> {
  const { diagram, composeScene, SceneSvg, GroupIcons, GROUP_STYLES } = await loadScene(scenePath);
  if (!diagram) throw new Error(`${scenePath} must default-export a <Diagram> element.`);
  const composed = composeScene(diagram, opts);
  const drawio = buildDrawioModel(composed, { groupStyles: GROUP_STYLES, groupIcons: GroupIcons });
  const markup = (motion: boolean) => renderToStaticMarkup(React.createElement(SceneSvg, { ...composed, groupIcons: GroupIcons, motion }));
  const svg = injectDrawioContent(markup(false), drawio);
  const animatedSvg = composed.moving ? injectDrawioContent(markup(true), drawio) : null;
  return { svg, animatedSvg, drawio, report: composed.report, width: composed.width, height: composed.height };
}

/** a/scene.tsx -> <absolute>/a/scene.svg */
export const defaultSvgOut = (scenePath: string): string =>
  path.resolve(path.dirname(scenePath), path.basename(scenePath).replace(/\.(t|j)sx?$/, ".svg"));
export const drawioPath = (svgPath: string): string => svgPath.replace(/\.svg$/, ".drawio");
export const animatedSvgPath = (svgPath: string): string => svgPath.replace(/\.svg$/, ".animated.svg");

export function writeDrawio(svgPath: string, drawio: string): string {
  const out = drawioPath(svgPath);
  fs.writeFileSync(out, drawio);
  return out;
}

/** Writes the moving copy, or removes a stale one when nothing in the scene moves. Returns the path written. */
export function writeAnimatedSvg(svgPath: string, animatedSvg: string | null): string | null {
  const out = animatedSvgPath(svgPath);
  if (animatedSvg) { fs.writeFileSync(out, animatedSvg); return out; }
  fs.rmSync(out, { force: true });
  return null;
}

export const issueCount = (r: LayoutReport): number =>
  (r.overlaps?.length || 0) + (r.label_overlaps?.length || 0) + (r.clipped?.length || 0) + (r.misaligned?.length || 0);

/** "clean", or the one-line breakdown of the report's issues. */
export function issueSummary(r: LayoutReport): string {
  const n = issueCount(r);
  if (n === 0) return "clean";
  return `⚠ ${n} issue(s): overlaps=${r.overlaps?.length || 0} labels=${r.label_overlaps?.length || 0} clipped=${r.clipped?.length || 0} misaligned=${r.misaligned?.length || 0}`;
}

/** Prints the CHECKPOINT block. Its "no overlaps" covers text against text (group titles included), icons against
 *  icons, clipping and grid alignment; arrows are left to scripts/check-paths.ts and the layout check. `pngPath` is a
 *  view small enough to open (watch's preview); without one the closing line names render's look copy. */
export function printReport(r: LayoutReport, pngPath: string | null, note?: string): void {
  console.log(`CHECKPOINT${note ? ` — ${note}` : ""}${pngPath ? ": " + pngPath : ""}`);
  console.log(`  aspect=${r.aspect} a4_landscape=${r.a4_landscape} icons=${r.icons} groups=${r.groups} labels=${r.labels} arrows=${r.arrows}`);
  const warn = (what: string, items: unknown[]) => { if (items.length) console.log(`  ⚠ ${what}: ${JSON.stringify(items)}`); };
  warn("node overlaps", r.overlaps);
  warn("label collisions", r.label_overlaps);
  warn("clipped at edge", r.clipped);
  warn("not grid-aligned in its group", r.misaligned);
  if (r.off_center.length) console.log(`  · contents off-center in container (advisory): ${JSON.stringify(r.off_center)}`);
  // <Raw> carries its own coordinates, so it is neither fitted into the canvas nor clip-checked; say so.
  if (r.unmeasured_raw) console.log(`  · ${r.unmeasured_raw} <Raw> block(s) NOT measured (opaque SVG) — check in the render that they sit inside the canvas`);
  if (r.riser_ignored.length) console.log(`  · riser ignored on: ${r.riser_ignored.join(", ")} — straight run (or via/elbow={false}); nothing to move`);
  if (!r.overlaps.length && !r.label_overlaps.length && !r.clipped.length && !r.misaligned.length) {
    const view = pngPath ?? "the look copy, $TMPDIR/<name>.look.png (never the 4800 px PNG beside the SVG),";
    console.log(`  ✓ no overlaps / aligned / no clipping — now OPEN ${view} and look`);
  }
}
