#!/usr/bin/env node
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// Does any connector run through a service icon, and does every arrowhead point somewhere?
//
// The render's CHECKPOINT compares icons with icons and text with text, never arrows, so an arrow drawn straight
// across an icon tile passes it. This compares the connectors with the tiles, and is cheap enough to run after
// every render.
//
//   node scripts/check-paths.ts <diagram.svg>
//
// Exits 1 when any segment crosses a tile, or when an arrowhead sits on a zero-length end segment (a browser has
// no direction to turn it along and draws it sideways), so a loop can stop on it.
//
// Connectors are the <path d="..."> elements after data-name="connectors"; tiles are the nested icon <svg>s
// of 48 px and up. Path data M L H V Q T C S (absolute and relative) and Z is read, curve control points
// counting as polyline vertices (for the engine's rounded elbows that is the corner); an arc A adds only its
// end point. Only horizontal and vertical segments are tested. Numbers may be signed, decimal or in exponent
// form, separated by spaces or commas.
import { readFileSync } from "node:fs";

const NUMBER = String.raw`[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?`;
// Smaller glyphs are group badges on a container's corner, which connectors pass close to by design.
const MIN_TILE = 48;
const ARGUMENTS_PER_COMMAND: Record<string, number> = { M: 2, L: 2, T: 2, H: 1, V: 1, Q: 4, S: 4, C: 6, A: 7 };

type Point = [number, number];

interface Tile {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function iconTiles(svg: string): Tile[] {
  const tag = new RegExp(`overflow="visible" x="(${NUMBER})" y="(${NUMBER})" width="(${NUMBER})"`, "g");
  const tiles: Tile[] = [];
  for (const [, x, y, size] of svg.matchAll(tag)) {
    const side = +size;
    if (side >= MIN_TILE) tiles.push({ x1: +x, y1: +y, x2: +x + side, y2: +y + side });
  }
  return tiles;
}

interface Connector {
  d: string;
  headAtEnd: boolean;
  headAtStart: boolean;
}

function connectorPaths(svg: string): Connector[] {
  const layer = svg.indexOf('data-name="connectors"');
  if (layer === -1) return [];
  return [...svg.slice(layer).matchAll(/<path d="([^"]+)"([^>]*)>/g)].map((m) => ({
    d: m[1],
    headAtEnd: m[2].includes("marker-end"),
    headAtStart: m[2].includes("marker-start"),
  }));
}

// The path's polyline vertices in absolute coordinates.
function polyline(d: string): Point[] {
  const points: Point[] = [];
  let pen: Point = [0, 0];
  let subpathStart: Point = [0, 0];
  for (const text of d.match(/[MmLlHhVvCcSsQqTtAaZz][^MmLlHhVvCcSsQqTtAaZz]*/g) ?? []) {
    const letter = text[0];
    const command = letter.toUpperCase();
    const relative = letter !== command;
    if (command === "Z") {
      points.push(subpathStart);
      pen = subpathStart;
      continue;
    }
    const values = (text.slice(1).match(new RegExp(NUMBER, "g")) ?? []).map(Number);
    const step = ARGUMENTS_PER_COMMAND[command];
    for (let k = 0; k + step <= values.length; k += step) {
      const v = values.slice(k, k + step);
      const from = pen;
      const point = (x: number, y: number): Point => (relative ? [from[0] + x, from[1] + y] : [x, y]);
      let added: Point[];
      if (command === "H") added = [[relative ? from[0] + v[0] : v[0], from[1]]];
      else if (command === "V") added = [[from[0], relative ? from[1] + v[0] : v[0]]];
      else if (command === "A") added = [point(v[5], v[6])];
      else added = Array.from({ length: step / 2 }, (_, j) => point(v[2 * j], v[2 * j + 1]));
      points.push(...added);
      pen = added[added.length - 1];
      if (command === "M" && k === 0) subpathStart = pen;
    }
  }
  return points;
}

function crossings(paths: Connector[], tiles: Tile[]): string[] {
  const found: string[] = [];
  paths.forEach(({ d }, index) => {
    const points = polyline(d);
    for (let k = 0; k + 1 < points.length; k++) {
      const [x1, y1] = points[k];
      const [x2, y2] = points[k + 1];
      for (const t of tiles) {
        // A run exactly on a tile's edge counts (it draws over the tile's outline); one that only touches the tile
        // end-on does not.
        const vertical = x1 === x2 && t.x1 <= x1 && x1 <= t.x2 && Math.min(y1, y2) < t.y2 && Math.max(y1, y2) > t.y1;
        const horizontal = y1 === y2 && t.y1 <= y1 && y1 <= t.y2 && Math.min(x1, x2) < t.x2 && Math.max(x1, x2) > t.x1;
        if (!vertical && !horizontal) continue;
        const segment = `path${index + 1} ${vertical ? "V" : "H"} (${x1},${y1})-(${x2},${y2})`;
        found.push(`  ${segment} cuts icon ${t.x1},${t.y1}-${t.x2},${t.y2}`);
      }
    }
  });
  return found;
}

// An arrowhead takes its direction from the segment it ends; with none to follow it turns to 0 degrees.
function aimlessHeads(paths: Connector[]): string[] {
  const found: string[] = [];
  const same = (a: Point, b: Point): boolean => a[0] === b[0] && a[1] === b[1];
  paths.forEach(({ d, headAtEnd, headAtStart }, index) => {
    const points = polyline(d);
    if (points.length < 2) return;
    if (headAtEnd && same(points[points.length - 1], points[points.length - 2])) {
      found.push(`  path${index + 1} ends on a zero-length segment at (${points[points.length - 1]}): its arrowhead has no direction`);
    }
    if (headAtStart && same(points[0], points[1])) {
      found.push(`  path${index + 1} starts on a zero-length segment at (${points[0]}): its arrowhead has no direction`);
    }
  });
  return found;
}

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/check-paths.ts <diagram.svg>");
  process.exit(2);
}
const svg = readFileSync(file, "utf8");
const tiles = iconTiles(svg);
const paths = connectorPaths(svg);
const hits = crossings(paths, tiles);
const aimless = aimlessHeads(paths);
for (const line of [...hits, ...aimless]) console.log(line);
const failed = hits.length + aimless.length > 0;
console.log(
  `  ${failed ? "FAIL" : "PASS"}: ${hits.length} segment/icon intersection(s), ` +
    `${aimless.length} arrowhead(s) without a direction, ${tiles.length} icons, ${paths.length} connectors`,
);
process.exit(failed ? 1 : 0);
