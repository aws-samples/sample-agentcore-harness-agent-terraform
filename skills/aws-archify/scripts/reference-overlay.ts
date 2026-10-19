#!/usr/bin/env node
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// Puts a reference image above your render, both scaled to one width, in a single PNG.
//
// When asked to reproduce a diagram, the way to judge a visual layout match of 95% or better is to look at the
// two at the same scale, region by region. Open the stacked PNG with the Read tool and grade it against the
// rubric this prints: components in the same places, steps at the same spots and pointing the same way,
// the same nesting and floating actors, close proportions.
//
//   npm run overlay -- reference.png render.png compare.png [--width 1200]
import { writeFile } from "node:fs/promises";
import { loadAtWidth, whiteCanvas } from "./lib/raster.ts";

const RUBRIC = `VISUAL LAYOUT-MATCH RUBRIC (score each, target: overall >= 95% match)
  1. Component placement  — each labeled component (every group, service and
     floating actor in the reference) in the SAME relative position and rough
     proportion as the reference.
  2. Nesting              — same containment (for example AWS Cloud > Region >
     VPC > subnet > the groups inside it), boundaries in the same places.
  3. Node positions       — each icon in the same slot within its component
     (same row/column order, same side).
  4. Numbered steps       — every badge present, at the same spot along its arrow
     and on the correct side, arrows in the same direction.
  5. Connector routing    — long arrows take the same path (around/below/over the
     same components), no crossings the reference doesn't have.
  6. Framing              — overall aspect ratio and outer margins close; nothing
     clipped; landscape like the reference.
Judge region by region. "95% visual match" means a viewer would take yours for
the reference at a glance, with only minor cosmetic differences (palette, label
wrapping, a few px of routing offset).`;

const DEFAULT_WIDTH = 1200;
const GAP = 28; // white band between the two images

interface OverlayRequest {
  reference: string;
  render: string;
  out: string;
  width: number;
}

function parseArgs(argv: string[]): OverlayRequest {
  const files: string[] = [];
  let width = DEFAULT_WIDTH;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--width") width = parseInt(argv[++i], 10);
    else if (arg.startsWith("--width=")) width = parseInt(arg.slice("--width=".length), 10);
    else files.push(arg);
  }
  if (files.length < 3) {
    console.error("usage: npm run overlay -- reference render out [--width 1200]");
    process.exit(2);
  }
  const [reference, render, out] = files;
  return { reference, render, out, width };
}

// Writes the stacked PNG and returns its size.
async function writeStack(request: OverlayRequest): Promise<[number, number]> {
  const upper = await loadAtWidth(request.reference, request.width);
  const lower = await loadAtWidth(request.render, request.width);
  const height = upper.height + lower.height + GAP;
  const { canvas, ctx } = whiteCanvas(request.width, height);
  ctx.drawImage(upper.image, 0, 0, request.width, upper.height);
  ctx.drawImage(lower.image, 0, upper.height + GAP, request.width, lower.height);
  await writeFile(request.out, canvas.toBuffer("image/png"));
  return [request.width, height];
}

async function main(): Promise<void> {
  const request = parseArgs(process.argv.slice(2));
  const [width, height] = await writeStack(request);
  console.log(`Wrote ${request.out} (${width}, ${height}) — reference on top, your render below.`);
  console.log("OPEN it with the Read tool and grade against this rubric:\n");
  console.log(RUBRIC);
}

main();
