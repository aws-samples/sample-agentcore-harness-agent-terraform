// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// Rasterises an SVG to a PNG of a given width on a white ground, with @napi-rs/canvas (MIT; Skia, BSD-3-Clause).
//
//   node scripts/svg-to-png.ts <in.svg> <out.png> [width | --look]     (1100 px wide by default)
//
// --look sizes the PNG to fit inside 1568 x 1568 px whatever the figure's shape: small enough for an agent to
// Read. Model APIs refuse an image over 2000 px on a side once a conversation holds several, and the refused
// image stays in the history, so one tall or wide export at a fixed width can stall a session.
//
// Skia's SVG module misses markers, paint-order and font fallback, so the SVG is rewritten first
// (lib/svg-for-skia.ts). Set SVG2PNG_DEBUG=<file> to save the rewritten SVG.
import { Image } from "@napi-rs/canvas";
import { readFileSync, writeFileSync } from "node:fs";
import { whiteCanvas } from "./lib/raster.ts";
import { parseSvg, prepareForSkia, rootSize } from "./lib/svg-for-skia.ts";

const USAGE = "Usage: node scripts/svg-to-png.ts <in.svg> <out.png> [width | --look]";
const DEFAULT_WIDTH = 1100;
const MAX_WIDTH = 20000;
const LOOK_FIT = 1568;

function fail(message: string): never {
  console.error(`svg-to-png: ${message}\n${USAGE}`);
  process.exit(1);
}

const [inputPath, outputPath, widthArg, ...surplus] = process.argv.slice(2);
if (!inputPath || !outputPath || surplus.length) fail(surplus.length ? "too many arguments" : "missing arguments");
const look = widthArg === "--look";
let width = DEFAULT_WIDTH;
if (widthArg !== undefined && !look) {
  const pixels = Number(widthArg);
  if (!/^\d+$/.test(widthArg) || pixels < 1 || pixels > MAX_WIDTH) {
    fail(`width must be a whole number of pixels (1-${MAX_WIDTH}), got "${widthArg}"`);
  }
  width = pixels;
}

let source: string;
try {
  source = readFileSync(inputPath, "utf8");
} catch (e) {
  fail(`cannot read ${inputPath}: ${(e as Error).message}`);
}

const doc = parseSvg(source);
const size = rootSize(doc);
if ("problem" in size) fail(size.problem);
if (look) width = Math.max(1, Math.floor(Math.min(LOOK_FIT / size.width, LOOK_FIT / size.height) * size.width));
const prepared = prepareForSkia(doc);
if (process.env.SVG2PNG_DEBUG) writeFileSync(process.env.SVG2PNG_DEBUG, prepared.svg);

const height = Math.max(1, Math.round((size.height / size.width) * width));
// Giving the image its size before its source makes Skia draw the vector at that size, not scale a bitmap.
const picture = new Image();
picture.width = width;
picture.height = height;
picture.src = Buffer.from(prepared.svg);
const { canvas, ctx } = whiteCanvas(width, height);
ctx.drawImage(picture, 0, 0, width, height);
writeFileSync(outputPath, canvas.toBuffer("image/png"));
const counts = `${prepared.markers} marker(s) expanded, ${prepared.paintSplits} paint-order split(s)`;
console.log(`${outputPath}: ${width}x${height} (${counts})`);
