// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// Where an arrow starts and ends, and the orthogonal ("elbow") router. An elbow leaves its source through a short
// stub perpendicular to the exit face, crosses on a riser placed in a clear lane, and enters the target through
// another stub. The router never searches for long detours: it tries a few lanes and keeps the first clear one.
import {
  ARROW_GAP, cell, isHorizontal, outwardSign, requireGrid, sameBox, snap, type Box, type Pt, type Side,
} from "./geometry.ts";
import type { AttachBox, Flat, PlacedGroup } from "./flatten.ts";

/** Margin around an icon that counts as part of it (layout report, canvas fit, U-turn bounds). */
export const ICON_MARGIN = cell(1);
/** Straight run kept in front of an arrowhead so it does not sit on a bend. */
const HEAD_ROOM = cell(2);
/** Two facing sides this close are drawn as one straight line instead of a tiny jog. */
export const NEAR_STRAIGHT = cell(1);
/** U-turn lift used when the content edge on that side is unknown. */
const UTURN_FALLBACK = cell(16);
/** Default riser position along the source-to-target span: a little toward the source, so the longer straight
 *  run is the one into the arrowhead. */
const DEFAULT_RISER = 0.45;
/** A riser within this many px of a group border reads as running along it. */
const BORDER_TOLERANCE = 2;

function faceCenter(b: Box, side: Side): Pt {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  return side === "left" ? [b.x, cy] : side === "right" ? [b.x + b.w, cy] : side === "top" ? [cx, b.y] : [cx, b.y + b.h];
}

function pushedOut(p: Pt, side: Side, distance: number): Pt {
  return side === "left" ? [p[0] - distance, p[1]] : side === "right" ? [p[0] + distance, p[1]]
    : side === "top" ? [p[0], p[1] - distance] : [p[0], p[1] + distance];
}

/** The arrow end on one face of a box: exactly on an anchor point, below the caption for a node's bottom face,
 *  otherwise ARROW_GAP off the icon edge. Always a fresh point. */
export function endpoint(b: AttachBox, side: Side): Pt {
  if (b.w === 0 && b.h === 0) return [b.x, b.y];
  if (side === "bottom" && b.captionBottom != null) return [b.x + b.w / 2, b.captionBottom];
  return pushedOut(faceCenter(b, side), side, ARROW_GAP);
}

/** Does an axis-aligned segment cross the inside of `r` (shrunk 1 px, so grazing an edge is not a hit)? */
function crossesBox(p: Pt, q: Pt, r: Box): boolean {
  const x0 = r.x + 1, y0 = r.y + 1, x1 = r.x + r.w - 1, y1 = r.y + r.h - 1;
  if (x1 <= x0 || y1 <= y0) return false;
  if (p[1] === q[1]) {
    const y = p[1];
    if (y <= y0 || y >= y1) return false;
    return Math.min(p[0], q[0]) < x1 && Math.max(p[0], q[0]) > x0;
  }
  if (p[0] === q[0]) {
    const x = p[0];
    if (x <= x0 || x >= x1) return false;
    return Math.min(p[1], q[1]) < y1 && Math.max(p[1], q[1]) > y0;
  }
  return false;
}

/** Is every segment clear of every obstacle except the arrow's own two footprints (compared by identity)? */
function isClear(points: Pt[], obstacles: Box[], own: Box[]): boolean {
  for (let i = 0; i + 1 < points.length; i++)
    for (const r of obstacles) {
      if (own.includes(r)) continue;
      if (crossesBox(points[i], points[i + 1], r)) return false;
    }
  return true;
}

/** Removes repeated points, then points lying on a straight line between their neighbours. */
function simplify(points: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  for (let i = 1; i + 1 < out.length;) {
    const a = out[i - 1], b = out[i], c = out[i + 1];
    if ((a[0] === b[0] && b[0] === c[0]) || (a[1] === b[1] && b[1] === c[1])) out.splice(i, 1);
    else i++;
  }
  return out;
}

/** Keeps a default riser at least HEAD_ROOM outside the face the arrow enters. */
function leaveHeadRoom(preferred: number, endCoord: number, toSide: Side): number {
  const limit = endCoord + outwardSign(toSide) * HEAD_ROOM;
  return outwardSign(toSide) > 0 ? snap(Math.max(preferred, limit)) : snap(Math.min(preferred, limit));
}

/** The outermost content coordinate on one side (over groups and icons with their margin), or null if empty.
 *  A same-side arrow with `riser={1}` lifts its crossbar out to here. */
export function contentEdge(flat: Flat, side: Side): number | null {
  const alongX = isHorizontal(side);
  const low = outwardSign(side) < 0;
  let edge = low ? Infinity : -Infinity;
  const take = (v: number) => { edge = low ? Math.min(edge, v) : Math.max(edge, v); };
  for (const g of flat.groups) take(alongX ? (low ? g.x : g.x + g.w) : (low ? g.y : g.y + g.h));
  for (const ic of flat.icons) {
    const lo = (alongX ? ic.x : ic.y) - ICON_MARGIN, hi = (alongX ? ic.x + ic.size : ic.y + ic.size) + ICON_MARGIN;
    take(low ? lo : hi);
  }
  return isFinite(edge) ? edge : null;
}

/** Moves a default riser off a group border it would run along (a border parallel to it whose extent overlaps the
 *  riser's span), whole cells at a time, first away from the target and then toward it. */
function avoidBorders(coord: number, spanLo: number, spanHi: number, vertical: boolean, borders: Box[], targetCoord: number): number {
  const lines: number[] = [];
  for (const g of borders) {
    const from = vertical ? g.y : g.x, to = vertical ? g.y + g.h : g.x + g.w;
    if (spanHi <= from + BORDER_TOLERANCE || spanLo >= to - BORDER_TOLERANCE) continue;
    lines.push(vertical ? g.x : g.y, vertical ? g.x + g.w : g.y + g.h);
  }
  const onLine = (v: number) => lines.some((line) => Math.abs(v - line) <= BORDER_TOLERANCE);
  if (!lines.length || !onLine(coord)) return coord;
  const away = coord <= targetCoord ? -1 : 1;
  for (const direction of [away, -away]) for (const cells of [1, 2]) {
    const moved = snap(coord + direction * cell(cells));
    if (!onLine(moved)) return moved;
  }
  return coord;
}

/** The coordinate an explicit `riser` asks for, given the two stub tips `a` and `b` on the cross axis. */
function requestedRiser(riser: number | undefined, a: number, b: number, fromSide: Side, toSide: Side, bound?: number | null): number | null {
  if (riser == null) return null;
  if (riser < 0 || riser > 1) return requireGrid(riser, "<Arrow> riser (absolute coordinate)")!;
  if (fromSide === toSide) {
    // A U-turn: the fraction lifts the shared crossbar outward from the outer stub, up to the content edge. When the
    // arrow's own icons are the outermost content that edge lies inside the stubs; there is nothing to vault, so
    // every fraction hugs the nodes instead of folding the crossbar back into them.
    const s = outwardSign(fromSide);
    const outer = s < 0 ? Math.min(a, b) : Math.max(a, b);
    const target = bound == null ? outer + s * UTURN_FALLBACK : (bound - outer) * s > 0 ? bound : outer;
    return snap(outer + (target - outer) * riser);
  }
  return snap(a + (b - a) * riser);
}

export interface Route { points: Pt[]; riserUsed: boolean }

/** An orthogonal path from `start` (leaving `fromSide`) to `end` (entering `toSide`). The two end points stay
 *  exact, so the icon gap is not rounded for an icon on a half cell; every inner corner is on the grid.
 *  `riserUsed` tells whether an explicit `riser` shaped the path (an already aligned run has no turn to move). */
export function routeElbow(
  start: Pt, end: Pt, fromSide: Side, toSide: Side, obstacles: Box[], own: Box[],
  riser?: number, bound?: number | null, borders?: Box[],
): Route {
  const s: Pt = [start[0], start[1]];
  const e: Pt = [end[0], end[1]];
  const stubOut: Pt = isHorizontal(fromSide)
    ? [snap(s[0] + outwardSign(fromSide) * ARROW_GAP), s[1]] : [s[0], snap(s[1] + outwardSign(fromSide) * ARROW_GAP)];
  // The entry stub points out of the target, so the last leg runs straight into it.
  const stubIn: Pt = isHorizontal(toSide)
    ? [snap(e[0] + outwardSign(toSide) * ARROW_GAP), e[1]] : [e[0], snap(e[1] + outwardSign(toSide) * ARROW_GAP)];

  // Stubs in line make one straight run between them. A U-turn (both ends leaving the same face) is the exception
  // when its two ends sit on one row (top or bottom faces) or one column (left or right faces): the run between the
  // stubs is its crossbar, and an explicit riser still sets how far out that runs.
  const uTurnCrossbar = fromSide === toSide && (isHorizontal(fromSide) ? stubOut[1] !== stubIn[1] : stubOut[0] !== stubIn[0]);
  if ((stubOut[0] === stubIn[0] || stubOut[1] === stubIn[1]) && !(riser != null && uTurnCrossbar))
    return { points: simplify([s, stubOut, stubIn, e]), riserUsed: false };

  const via = (corners: Pt[]): Pt[] => simplify([s, stubOut, ...corners, stubIn, e]);
  const candidates: Pt[][] = [];
  if (isHorizontal(fromSide) && isHorizontal(toSide)) {
    // Both faces horizontal: a vertical riser at some x.
    const forced = requestedRiser(riser, stubOut[0], stubIn[0], fromSide, toSide, bound);
    if (forced != null) return { points: via([[forced, stubOut[1]], [forced, stubIn[1]]]), riserUsed: true };
    const mid = snap(stubOut[0] + (stubIn[0] - stubOut[0]) * DEFAULT_RISER);
    const roomy = leaveHeadRoom(mid, e[0], toSide);
    const primary = borders ? avoidBorders(roomy, Math.min(stubOut[1], stubIn[1]), Math.max(stubOut[1], stubIn[1]), true, borders, stubIn[0]) : roomy;
    const lanes = [primary, roomy, mid, stubOut[0], stubIn[0], snap(stubOut[0] + outwardSign(fromSide) * cell(3)), snap(stubIn[0] + outwardSign(toSide) * cell(3))];
    for (const x of new Set(lanes)) candidates.push(via([[x, stubOut[1]], [x, stubIn[1]]]));
  } else if (!isHorizontal(fromSide) && !isHorizontal(toSide)) {
    // Both faces vertical: a horizontal riser at some y.
    const forced = requestedRiser(riser, stubOut[1], stubIn[1], fromSide, toSide, bound);
    if (forced != null) return { points: via([[stubOut[0], forced], [stubIn[0], forced]]), riserUsed: true };
    const mid = snap(stubOut[1] + (stubIn[1] - stubOut[1]) * DEFAULT_RISER);
    const roomy = leaveHeadRoom(mid, e[1], toSide);
    const primary = borders ? avoidBorders(roomy, Math.min(stubOut[0], stubIn[0]), Math.max(stubOut[0], stubIn[0]), false, borders, stubIn[1]) : roomy;
    const lanes = [primary, roomy, mid, stubOut[1], stubIn[1], snap(stubOut[1] + outwardSign(fromSide) * cell(3)), snap(stubIn[1] + outwardSign(toSide) * cell(3))];
    for (const y of new Set(lanes)) candidates.push(via([[stubOut[0], y], [stubIn[0], y]]));
  } else {
    // One face of each orientation: an L whose corner is fixed by the two stub axes. An explicit riser makes it a
    // staircase that turns earlier; at riser={1} the staircase folds back into the plain L.
    const forced = isHorizontal(fromSide)
      ? requestedRiser(riser, stubOut[0], stubIn[0], fromSide, toSide, bound)
      : requestedRiser(riser, stubOut[1], stubIn[1], fromSide, toSide, bound);
    if (forced != null) {
      const corners: Pt[] = isHorizontal(fromSide)
        ? [[forced, stubOut[1]], [forced, stubIn[1]]] : [[stubOut[0], forced], [stubIn[0], forced]];
      return { points: via(corners), riserUsed: true };
    }
    candidates.push(via([isHorizontal(fromSide) ? [stubIn[0], stubOut[1]] : [stubOut[0], stubIn[1]]]));
    candidates.push(via([isHorizontal(fromSide) ? [stubOut[0], stubIn[1]] : [stubIn[0], stubOut[1]]]));
  }
  for (const c of candidates) if (isClear(c, obstacles, own)) return { points: c, riserUsed: false };
  return { points: candidates[0], riserUsed: false };
}

/** Is `box` inside a labelled group that does not also hold `other`? A link out of such a group should not
 *  dive across its title. The group an arrow attaches to directly does not count. */
export function leavesLabelledGroup(box: Box, other: Box, groups: PlacedGroup[]): boolean {
  const bx = box.x + box.w / 2, by = box.y + box.h / 2;
  const ox = other.x + other.w / 2, oy = other.y + other.h / 2;
  return groups.some((g) => {
    if (!g.label || sameBox(g, box)) return false;
    const holdsBox = g.x <= bx && bx <= g.x + g.w && g.y <= by && by <= g.y + g.h;
    const holdsOther = g.x <= ox && ox <= g.x + g.w && g.y <= oy && oy <= g.y + g.h;
    return holdsBox && !holdsOther;
  });
}

/** Is the horizontal approach to `box` from `side` blocked by another footprint right beside it? */
export function sideBlocked(box: Box, side: "left" | "right", obstacles: Box[]): boolean {
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const lane = side === "left" ? [box.x - cell(4), box.x] : [box.x + box.w, box.x + box.w + cell(4)];
  for (const r of obstacles) {
    // Skip the node's own footprint, which is wider than the icon box we were given.
    if (r.x <= cx && cx <= r.x + r.w && r.y <= cy && cy <= r.y + r.h) continue;
    const overlapsY = r.y < cy + 1 && r.y + r.h > cy - 1;
    const inLane = r.x < lane[1] && r.x + r.w > lane[0];
    if (overlapsY && inLane) return true;
  }
  return false;
}

/** A face for a node inside a labelled group that avoids its title: the side facing the other end (`toward` is
 *  the signed dx to it), else the opposite side, else the bottom. */
export function sideAvoidingTitle(box: Box, toward: number, obstacles: Box[]): Side {
  const facing: "left" | "right" = toward >= 0 ? "left" : "right";
  const opposite: "left" | "right" = facing === "left" ? "right" : "left";
  if (!sideBlocked(box, facing, obstacles)) return facing;
  if (!sideBlocked(box, opposite, obstacles)) return opposite;
  return "bottom";
}
