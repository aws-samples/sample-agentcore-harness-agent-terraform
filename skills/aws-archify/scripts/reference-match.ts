#!/usr/bin/env node
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// A supporting, structural check of "does this render follow the reference's layout?".
//
// It finds positional landmarks in both images and reports how many of the reference's landmarks have a
// counterpart at a similar normalised position:
//   - numbered step badges: dark discs, one per flow step;
//   - service tiles: saturated colour squares (the AWS service icons).
//
// Treat it as a rough proxy, never the verdict. It is strict on purpose and so under-reports: two layouts a
// person calls the same often score far below 95%, because ordinary drift (other renderer proportions, a
// wrapped label nudging a tile, a palette difference) exceeds the tolerance, and shapes inside icons can be
// taken for landmarks. A high score is strong evidence of a match; a low one proves nothing. The verdict on a
// "95% visual match" comes from looking at the overlay (npm run overlay) region by region.
//
//   npm run match -- reference.png output.png [--tol 0.08] [--json]
import { loadRgb, roundHalfEven } from "./lib/raster.ts";
import type { RgbImage } from "./lib/raster.ts";

type Point = [number, number];

interface Region {
  cx: number;
  cy: number;
  w: number; // max - min of the cell coordinates, so one less than the extent
  h: number;
}

interface LandmarkKind {
  isInk(r: number, g: number, b: number): boolean;
  closeRadius(width: number): number;
  sizeRange(width: number): [number, number];
  minArea(width: number): number;
  isSquare(w: number, h: number, width: number): boolean;
}

// Sizes are fractions of the image width, so the same thresholds hold at any render scale. A morphological
// close first fills the white glyph punched out of a badge or tile, so each one reads as a single region.
const BADGE: LandmarkKind = {
  // The disc is about #232F3E: red and green under 78, blue under 92 as that navy carries more blue.
  isInk: (r, g, b) => r < 78 && g < 78 && b < 92,
  closeRadius: (width) => Math.max(3, roundHalfEven(width / 260)),
  sizeRange: (width) => [0.006 * width, 0.036 * width],
  minArea: (width) => Math.trunc(Math.pow(0.005 * width, 2)),
  isSquare: (w, h) => Math.abs(w - h) < 0.5 * Math.max(w, h),
};

const TILE: LandmarkKind = {
  isInk: (r, g, b) => {
    const high = Math.max(r, g, b);
    const low = Math.min(r, g, b);
    return high - low > 55 && high > 90;
  },
  closeRadius: (width) => Math.max(2, roundHalfEven(width / 430)),
  sizeRange: (width) => [0.02 * width, 0.06 * width],
  minArea: (width) => Math.trunc(Math.pow(0.018 * width, 2)),
  // Roughly square, which leaves out long thin coloured strokes and labels.
  isSquare: (w, h, width) => Math.abs(w - h) < 0.018 * width,
};

// One pass of a (2k+1)-cell window along each of `lines` lines of `length` cells. The window wraps around the
// ends of a line, as numpy's np.roll does. Dilation sets a cell when any cell in its window is set, erosion
// when all of them are. Two passes, rows then columns, give the exact square-window result.
function windowPass(
  src: Uint8Array,
  dst: Uint8Array,
  lines: number,
  length: number,
  lineStride: number,
  cellStride: number,
  k: number,
  dilate: boolean,
): void {
  const span = 2 * k + 1;
  const wrap = (j: number) => ((j % length) + length) % length;
  for (let line = 0; line < lines; line++) {
    const base = line * lineStride;
    if (span >= length) {
      let ones = 0;
      for (let j = 0; j < length; j++) ones += src[base + j * cellStride];
      const value = dilate ? (ones > 0 ? 1 : 0) : ones === length ? 1 : 0;
      for (let j = 0; j < length; j++) dst[base + j * cellStride] = value;
      continue;
    }
    let ones = 0;
    for (let d = -k; d <= k; d++) ones += src[base + wrap(d) * cellStride];
    for (let j = 0; j < length; j++) {
      dst[base + j * cellStride] = dilate ? (ones > 0 ? 1 : 0) : ones === span ? 1 : 0;
      ones += src[base + wrap(j + 1 + k) * cellStride] - src[base + wrap(j - k) * cellStride];
    }
  }
}

function morph(mask: Uint8Array, width: number, height: number, k: number, dilate: boolean): Uint8Array {
  const rowsDone = new Uint8Array(width * height);
  windowPass(mask, rowsDone, height, width, width, 1, k, dilate);
  const result = new Uint8Array(width * height);
  windowPass(rowsDone, result, width, height, 1, width, k, dilate);
  return result;
}

function closeMask(mask: Uint8Array, width: number, height: number, k: number): Uint8Array {
  return morph(morph(mask, width, height, k, true), width, height, k, false);
}

// The 4-connected regions of set cells with at least `minArea` cells, ordered by their first cell in row-major
// order (the order numpy's np.where yields).
function regions(mask: Uint8Array, width: number, height: number, minArea: number): Region[] {
  const seen = new Uint8Array(width * height);
  const pending = new Int32Array(width * height);
  let top = 0;
  const visit = (cell: number) => {
    if (mask[cell] && !seen[cell]) {
      seen[cell] = 1;
      pending[top++] = cell;
    }
  };
  const found: Region[] = [];
  for (let first = 0; first < width * height; first++) {
    if (!mask[first] || seen[first]) continue;
    const y0 = (first / width) | 0;
    const x0 = first - y0 * width;
    let area = 0;
    let sumX = 0;
    let sumY = 0;
    let minX = x0;
    let maxX = x0;
    let minY = y0;
    let maxY = y0;
    visit(first);
    while (top > 0) {
      const cell = pending[--top];
      const y = (cell / width) | 0;
      const x = cell - y * width;
      area++;
      sumX += x;
      sumY += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (y + 1 < height) visit(cell + width);
      if (y > 0) visit(cell - width);
      if (x + 1 < width) visit(cell + 1);
      if (x > 0) visit(cell - 1);
    }
    if (area >= minArea) found.push({ cx: sumX / area, cy: sumY / area, w: maxX - minX, h: maxY - minY });
  }
  return found;
}

// Centroids of the landmarks of one kind, as fractions of the image width and height.
function findLandmarks(image: RgbImage, kind: LandmarkKind): Point[] {
  const { rgb, width, height } = image;
  const mask = new Uint8Array(width * height);
  for (let cell = 0, p = 0; cell < width * height; cell++, p += 3) {
    if (kind.isInk(rgb[p], rgb[p + 1], rgb[p + 2])) mask[cell] = 1;
  }
  const solid = closeMask(mask, width, height, kind.closeRadius(width));
  const [lo, hi] = kind.sizeRange(width);
  const centroids: Point[] = [];
  for (const { cx, cy, w, h } of regions(solid, width, height, kind.minArea(width))) {
    const sized = lo <= w && w <= hi && lo <= h && h <= hi;
    if (sized && kind.isSquare(w, h, width)) centroids.push([cx / width, cy / height]);
  }
  return centroids;
}

// Rescales one image's landmarks together so that their union spans [0,1] x [0,1]. Two diagrams with the same
// internal layout but different margins or canvas proportions then line up, and the score measures relative
// placement rather than framing.
function fitUnitSquare(groups: Point[][]): Point[][] {
  const all = groups.flat();
  if (all.length === 0) return groups;
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const sx = x1 - x0 || 1.0;
  const sy = y1 - y0 || 1.0;
  return groups.map((group) => group.map(([px, py]): Point => [(px - x0) / sx, (py - y0) / sy]));
}

// Greedy one-to-one pairing: each reference point takes the closest unused output point within `tol`.
function countMatches(reference: Point[], output: Point[], tol: number): number {
  const taken = new Array<boolean>(output.length).fill(false);
  let matched = 0;
  for (const [rx, ry] of reference) {
    let best = -1;
    let bestDistance = tol;
    output.forEach(([ox, oy], i) => {
      if (taken[i]) return;
      const distance = Math.sqrt((rx - ox) ** 2 + (ry - oy) ** 2);
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = i;
      }
    });
    if (best >= 0) {
      taken[best] = true;
      matched++;
    }
  }
  return matched;
}

interface MatchScore {
  tol: number;
  badges: { reference: number; output: number; matched: number };
  tiles: { reference: number; output: number; matched: number };
  reference_landmarks: number;
  matched: number;
  layout_match: number;
}

async function score(referencePath: string, outputPath: string, tol: number): Promise<MatchScore> {
  const reference = await loadRgb(referencePath);
  const output = await loadRgb(outputPath);
  const [refBadges, refTiles] = fitUnitSquare([findLandmarks(reference, BADGE), findLandmarks(reference, TILE)]);
  const [outBadges, outTiles] = fitUnitSquare([findLandmarks(output, BADGE), findLandmarks(output, TILE)]);
  const badgeMatches = countMatches(refBadges, outBadges, tol);
  const tileMatches = countMatches(refTiles, outTiles, tol);
  const landmarks = refBadges.length + refTiles.length;
  const matched = badgeMatches + tileMatches;
  return {
    tol,
    badges: { reference: refBadges.length, output: outBadges.length, matched: badgeMatches },
    tiles: { reference: refTiles.length, output: outTiles.length, matched: tileMatches },
    reference_landmarks: landmarks,
    matched,
    layout_match: landmarks ? roundHalfEven(matched / landmarks, 4) : 0.0,
  };
}

interface MatchRequest {
  reference: string;
  output: string;
  tol: number;
  json: boolean;
}

function parseArgs(argv: string[]): MatchRequest {
  const files: string[] = [];
  let tol = 0.08;
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--tol") tol = parseFloat(argv[++i]);
    else if (arg.startsWith("--tol=")) tol = parseFloat(arg.slice("--tol=".length));
    else if (arg === "--json") json = true;
    else files.push(arg);
  }
  if (files.length < 2) {
    console.error("usage: npm run match -- reference output [--tol 0.08] [--json]");
    process.exit(2);
  }
  return { reference: files[0], output: files[1], tol, json };
}

async function main(): Promise<void> {
  const request = parseArgs(process.argv.slice(2));
  const result = await score(request.reference, request.output, request.tol);
  if (request.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  const { badges, tiles } = result;
  console.log(`badges: ${badges.matched}/${badges.reference} matched (output detected ${badges.output})`);
  console.log(`tiles:  ${tiles.matched}/${tiles.reference} matched (output detected ${tiles.output})`);
  console.log(
    `LAYOUT MATCH: ${(result.layout_match * 100).toFixed(1)}%  ` +
      `(${result.matched}/${result.reference_landmarks} landmarks, tol=${request.tol})`,
  );
}

main();
