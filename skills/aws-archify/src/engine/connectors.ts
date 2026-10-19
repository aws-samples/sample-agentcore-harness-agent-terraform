// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// Arrows: from an <Arrow> element and the attach boxes to a polyline, plus the placement of its label beside the
// line (never on it).
import { cell, isHorizontal, requireGrid, sameBox, type Pt, type Side } from "./geometry.ts";
import { ARROW_LABEL_FONT, CAPTION_SIZE, linePitch, type TextAnchor } from "./text.ts";
import type { Animate, ArrowProps } from "./elements.ts";
import type { Flat, TextItem } from "./flatten.ts";
import type { LayoutNode } from "./layout.ts";
import {
  NEAR_STRAIGHT, contentEdge, endpoint, leavesLabelledGroup, routeElbow, sideAvoidingTitle, sideBlocked,
} from "./routing.ts";

type At = "start" | "middle" | "end";

/** `true` keeps its first meaning, a travelling dot. */
const animationOf = (value: Animate | undefined): "flow" | "dots" | undefined =>
  value === true ? "dots" : value === "flow" || value === "dots" ? value : undefined;

/** An arrow's stroke when the scene gives no `color`. */
const ARROW_COLOR = "#232F3E";
/** Arrow label text, whatever colour its arrow is. */
const ARROW_LABEL_COLOR = "#232F3E";

/** Resolves one <Arrow> into `flat.arrows` (and its label into `flat.labels` and `flat.arrowLabels`). */
export function resolveArrow(n: LayoutNode, flat: Flat, sceneAnimate?: Animate): void {
  const p: ArrowProps = n.props;
  const animate = animationOf(p.animate ?? sceneAnimate);
  const color = p.color ?? ARROW_COLOR;
  const dashed = !!p.dashed;
  const head = p.head ?? "end";

  if (Array.isArray(p.points)) {
    // Hand-drawn: used as given, no label.
    const points = p.points.map(([x, y], i) => [requireGrid(x, `<Arrow> point ${i + 1} x`)!, requireGrid(y, `<Arrow> point ${i + 1} y`)!] as Pt);
    const [x0, y0] = points[0] ?? [0, 0], [x1, y1] = points[points.length - 1] ?? [0, 0];
    const name = p.id ?? `points (${x0},${y0})→(${x1},${y1})`;
    flat.arrows.push({ points, color, dashed, head, editId: p.__editId, riserIgnored: p.riser != null, name, animate });
    return;
  }

  const a = p.from ? flat.boxes.get(p.from) : undefined;
  const b = p.to ? flat.boxes.get(p.to) : undefined;
  if (!a || !b) throw new Error(
    `<Arrow from="${p.from}" to="${p.to}"> — unknown id (${!a ? p.from : p.to}). An arrow attaches to ` +
    `an id on a <Node>, <Icon>, <Group> or <Anchor> (a bare stack has no box; use ` +
    `<Group kind="borderless" id="…"> to make one).`);

  const dx = (b.x + b.w / 2) - (a.x + a.w / 2), dy = (b.y + b.h / 2) - (a.y + a.h / 2);
  const mostlyHorizontal = Math.abs(dx) >= Math.abs(dy);
  let fromSide: Side = p.fromSide ?? (mostlyHorizontal ? (dx >= 0 ? "right" : "left") : (dy >= 0 ? "bottom" : "top"));
  let toSide: Side = p.toSide ?? (mostlyHorizontal ? (dx >= 0 ? "left" : "right") : (dy >= 0 ? "top" : "bottom"));
  // An inferred face of a node in a labelled group (on a link that leaves the group) avoids the group's title and
  // any sibling right beside it. Explicit sides are always kept.
  if (p.toSide == null && leavesLabelledGroup(b, a, flat.groups)) {
    if (toSide === "top") toSide = sideAvoidingTitle(b, dx, flat.obstacles);
    else if ((toSide === "left" || toSide === "right") && sideBlocked(b, toSide, flat.obstacles)) toSide = sideAvoidingTitle(b, dx, flat.obstacles);
  }
  if (p.fromSide == null && leavesLabelledGroup(a, b, flat.groups)) {
    if (fromSide === "top") fromSide = sideAvoidingTitle(a, -dx, flat.obstacles);
    else if ((fromSide === "left" || fromSide === "right") && sideBlocked(a, fromSide, flat.obstacles)) fromSide = sideAvoidingTitle(a, -dx, flat.obstacles);
  }

  const start = endpoint(a, fromSide);
  const end = endpoint(b, toSide);
  // Facing sides a few px out of line (nodes at different group depths) are drawn straight: the start slides along
  // its own face onto the target's line instead of making a tiny Z that a scene cannot fix with 8 px moves.
  if (!p.via?.length && p.elbow !== false && fromSide !== toSide && isHorizontal(fromSide) === isHorizontal(toSide)) {
    const axis = isHorizontal(fromSide) ? 1 : 0;
    const d = end[axis] - start[axis];
    const lo = axis ? a.y : a.x, hi = axis ? a.y + a.h : a.x + a.w;
    if (d !== 0 && Math.abs(d) <= NEAR_STRAIGHT && end[axis] > lo && end[axis] < hi) start[axis] = end[axis];
  }

  let points: Pt[];
  let riserUsed = false;
  if (p.via && p.via.length) {
    const bends = p.via.map(([x, y], i) => [requireGrid(x, `<Arrow> via ${i + 1} x`)!, requireGrid(y, `<Arrow> via ${i + 1} y`)!] as Pt);
    points = [start, ...bends, end];
  } else if (p.elbow === false) {
    points = [start, end];
  } else {
    const bound = fromSide === toSide ? contentEdge(flat, fromSide) : null;
    // Borders a default riser must not run along: drawn groups other than the arrow's own end boxes.
    const borders = p.riser == null
      ? flat.groups.filter((g) => g.kind !== "borderless" && !sameBox(g, a) && !sameBox(g, b)).map((g) => ({ x: g.x, y: g.y, w: g.w, h: g.h }))
      : undefined;
    const own = [a.footprint, b.footprint].filter((r) => r != null);
    const route = routeElbow(start, end, fromSide, toSide, flat.obstacles, own, p.riser, bound, borders);
    points = route.points;
    riserUsed = route.riserUsed;
  }
  const arrowIndex = flat.arrows.length;
  flat.arrows.push({
    points, color, dashed, head, editId: p.__editId, animate,
    riserIgnored: p.riser != null && !riserUsed,
    name: p.from && p.to ? `${p.from}→${p.to}` : undefined,
  });

  const text = p.children;
  if (text == null || text === false) return;
  const label = placeArrowLabel(points, text, p.labelAt, p.labelSide);
  flat.arrowLabels.push({ ...label.item, editId: p.__editId, arrowIndex, at: label.at });
  flat.labels.push(label.item);
}

const LABEL_GAP = 4;
const ARROW_LABEL_ASCENT = CAPTION_SIZE * 0.8, ARROW_LABEL_DESCENT = CAPTION_SIZE * 0.2;
/** Beside a vertical run the italic lean needs a little more room. */
const SIDE_GAP = LABEL_GAP + 3;
const END_INSET = cell(1);

const direction = (a: Pt, b: Pt): Pt => {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
};

/** Places an arrow label. Default: the middle of a straight arrow; on an elbow, the longer of the two horizontal
 *  end stubs (the middle would be on the cramped riser), above the line. */
function placeArrowLabel(points: Pt[], text: unknown, labelAt?: At, labelSide?: Side): { item: TextItem; at: At } {
  let at: At = labelAt ?? "middle";
  let side = labelSide;
  const bent = points.length > 2;
  if (bent && labelAt == null) {
    const horizontalRun = (a: Pt, b: Pt) => (Math.abs(a[1] - b[1]) < 1 ? Math.abs(b[0] - a[0]) : 0);
    const startRun = horizontalRun(points[0], points[1]);
    const endRun = horizontalRun(points[points.length - 2], points[points.length - 1]);
    at = endRun > startRun ? "end" : "start";
    if (side == null) side = "top";
  }

  let { p: spot, dir } = pointAlong(points, at);
  // On an elbow, a start or end label centres on the middle of that end's stub.
  let onStub = false;
  if (at === "start" && points.length > 2) {
    spot = [(points[0][0] + points[1][0]) / 2, (points[0][1] + points[1][1]) / 2];
    dir = direction(points[0], points[1]);
    onStub = true;
  } else if (at === "end" && points.length > 2) {
    const last = points.length - 1;
    spot = [(points[last - 1][0] + points[last][0]) / 2, (points[last - 1][1] + points[last][1]) / 2];
    dir = direction(points[last - 1], points[last]);
    onStub = true;
  } else if (at === "start") spot = [spot[0] + dir[0] * END_INSET, spot[1] + dir[1] * END_INSET];
  else if (at === "end") spot = [spot[0] - dir[0] * END_INSET, spot[1] - dir[1] * END_INSET];

  const offset = perpendicular(dir, side);
  let x: number, y: number, anchor: TextAnchor;
  if (Math.abs(dir[0]) >= Math.abs(dir[1])) {
    anchor = onStub ? "middle" : at === "start" ? "start" : at === "end" ? "end" : "middle";
    x = spot[0];
    // Lines are drawn downward from the first baseline: above the arrow the block ends just over the line, below
    // it the block starts just under it.
    const lineCount = String(text).split("\n").length;
    y = offset[1] < 0
      ? spot[1] - LABEL_GAP - ARROW_LABEL_DESCENT - (lineCount - 1) * linePitch(CAPTION_SIZE)
      : spot[1] + LABEL_GAP + ARROW_LABEL_ASCENT;
  } else {
    anchor = offset[0] < 0 ? "end" : "start";
    x = spot[0] + offset[0] * SIDE_GAP;
    y = spot[1] + CAPTION_SIZE * 0.35;
  }
  const item: TextItem = {
    x, y, text: String(text), size: CAPTION_SIZE, color: ARROW_LABEL_COLOR, anchor, bold: false, chip: false,
    italic: true, font: ARROW_LABEL_FONT, halo: true,
  };
  return { item, at };
}

/** A point along a polyline and the unit direction of its segment there: the first or last vertex, or the point
 *  at half the total length. */
function pointAlong(points: Pt[], at: At): { p: Pt; dir: Pt } {
  if (points.length === 0) return { p: [0, 0], dir: [1, 0] };
  if (points.length === 1) return { p: points[0], dir: [1, 0] };
  const last = points.length - 1;
  if (at === "start") return { p: points[0], dir: direction(points[0], points[1]) };
  if (at === "end") return { p: points[last], dir: direction(points[last - 1], points[last]) };
  const lengths = points.slice(1).map((q, i) => Math.hypot(q[0] - points[i][0], q[1] - points[i][1]));
  let remaining = lengths.reduce((total, l) => total + l, 0) / 2;
  for (let i = 0; i < lengths.length; i++) {
    const length = lengths[i];
    if (remaining <= length) {
      const t = length === 0 ? 0 : remaining / length;
      const a = points[i], b = points[i + 1];
      return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], dir: direction(a, b) };
    }
    remaining -= length;
  }
  return { p: points[last], dir: direction(points[last - 1], points[last]) };
}

const SIDE_VECTORS: Record<Side, Pt> = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] };

/** The unit normal of a segment direction toward `side`, or by default the upper one (the left one for a vertical
 *  segment). */
function perpendicular(dir: Pt, side?: Side): Pt {
  const first: Pt = [-dir[1], dir[0]], second: Pt = [dir[1], -dir[0]];
  if (side) {
    const v = SIDE_VECTORS[side];
    return first[0] * v[0] + first[1] * v[1] >= second[0] * v[0] + second[1] * v[1] ? first : second;
  }
  if (first[1] !== second[1]) return first[1] < second[1] ? first : second;
  return first[0] <= second[0] ? first : second;
}
