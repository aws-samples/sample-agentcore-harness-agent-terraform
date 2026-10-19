// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// Cuts a horizontal band out of a tall PNG (a page screenshot, say) and scales it to 980 px wide.
//
//   node scripts/crop-png.ts <in.png> <out.png> <top> <height>
import { createCanvas, loadImage } from "@napi-rs/canvas";
import type { Image } from "@napi-rs/canvas";
import { writeFileSync } from "node:fs";

const USAGE = "Usage: node scripts/crop-png.ts <in.png> <out.png> <top> <height>";
const OUTPUT_WIDTH = 980;

function fail(message: string): never {
  console.error(`crop-png: ${message}\n${USAGE}`);
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length !== 4) fail(`expected 4 arguments, got ${args.length}`);
const [inputPath, outputPath, topArg, heightArg] = args;
if (!/^\d+$/.test(topArg)) fail(`top must be a whole number of pixels >= 0, got "${topArg}"`);
if (!/^\d+$/.test(heightArg) || Number(heightArg) <= 0) {
  fail(`height must be a whole number of pixels > 0, got "${heightArg}"`);
}

let page: Image;
try {
  page = await loadImage(inputPath);
} catch (e) {
  fail(`cannot load ${inputPath}: ${(e as Error).message}`);
}
console.log("page", page.width, "x", page.height);

const top = Number(topArg);
if (top >= page.height) fail(`top ${top} is outside the image (height ${page.height})`);
const band = Math.min(Number(heightArg), page.height - top);
const height = Math.max(1, Math.round((band * OUTPUT_WIDTH) / page.width));
const canvas = createCanvas(OUTPUT_WIDTH, height);
canvas.getContext("2d").drawImage(page, 0, top, page.width, band, 0, 0, OUTPUT_WIDTH, height);
writeFileSync(outputPath, canvas.toBuffer("image/png"));
