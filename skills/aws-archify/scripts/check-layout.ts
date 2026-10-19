#!/usr/bin/env node
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// Layout defects that BOTH existing checks miss.
//
// The renderer's own CHECKPOINT compares icon with icon (8px margin), text with text on one line,
// clipping and alignment inside a group, and never looks at arrows. check-paths.ts (beside this
// file) compares connector-vs-icon. Neither looks at:
//
//   1. node box vs node box            - two nodes' icon-plus-caption boxes overlapping   (FAIL)
//   2. node box vs a group's border    - a node straddling the container it is not in    (FAIL)
//   3. a label sitting on a group border (FAIL; WARN when the label has a white halo)
//   4. rows that do not line up        - two multi-node rows sharing one vertical band,
//                                        which reads as a broken grid even with zero collisions (WARN)
//   5. uneven column pitch             - one huge hole in an otherwise even row; two nodes
//                                        sharing a centre are reported instead of a ratio  (WARN)
//   6. a node beside a group           - partly level with a group it is outside, so the eye
//                                        reads them as one row of peers                    (WARN)
//   7. aspect ratio past ~2.5:1        - unreadable at document width                     (WARN)
//   8. long arrow                      - a straight run of connector, minus its labels, over 2x the
//                                        node pitch (capped at 160px) and over 240px          (WARN);
//                                        a sparse figure, median gap between neighbouring node
//                                        boxes past 150px (FIX); a wide pitch, median node pitch
//                                        past 240px while the gaps are fine                    (WARN)
//   9. arrowhead on text               - an arrow tip inside or within 6px of a text box other than
//                                        its own label (FAIL); a tip flush under the caption of
//                                        the node it enters from below (WARN)
//  10. uneven siblings                 - structural boxes of one kind (VPC, Account, Region,
//                                        subnet) under one parent: in a row with heights, in a
//                                        column with widths, 10-40% apart; with the same role,
//                                        either more than 10% apart                        (WARN)
//  11. whitespace balance              - a group (or the canvas) more than 65% empty (FIX); a gap
//                                        between its rows/columns over 160px, or over 2.5x its smallest
//                                        and over 64px; a gap between two sibling groups wider than the
//                                        arrow labels in it need (min 48px) plus 32px; one side of a
//                                        group's padding over 80px and over 3x its tightest side (WARN)
//  12. elbow stubs and jogs            - a bent connector whose first or last straight run is under
//                                        32px (arrowhead right under the bend), or a 3-run arrow whose
//                                        middle run is under 12px (a jog: ends out of line) (WARN)
//
// Elements whose coordinates cannot be parsed (NaN) are skipped with a WARN naming how many.
// Repeated identical messages are printed once with a count.
//
//   node $SKILLS/aws-archify/scripts/check-layout.ts <diagram.svg>
//
//  13. numbered arrow labels         - "1 API calls", "(2) pull", "Step 3"                (FAIL)
//  14. zig-zag                       - a one-to-one arrow bent into a Z because its ends are out
//                                        of line; fan-outs, fan-ins and group ends are exempt (FIX)
//  15. document scale                - canvas over 1280px, so icons print under ~30px at 800px (FIX);
//                                       a <Diagram poster> may be up to 3000px and is never placed in a page
//  16. arrows on arrows              - two arrows sharing >24px of line, not a fan-out (FAIL);
//      arrows through text           - a run through a caption, group title or label (FIX)
//      group title band               - an arrow label inside a title band, or an arrow 12px or less from a title (FIX)
//      avoidable bend                 - a one-to-one arrow that turns once with a short leg (FIX)
//      arrow skims an icon            - a run within 10px of an icon it does not connect to (FIX)
//
// Groups are the borders the engine draws for <Group> (filled subnets included) and unfilled, stroked
// <Rect> outlines; an invisible <Rect stroke="none"> spacer is not a group.
//
// Exits 1 on a FAIL (1-3, 9, 13, 16) or a FIX (sparse figure, a group over 65% empty, 14, 15, text
// crossings, title bands, avoidable bends, icon skims): FIX items are never a judgement call for a
// figure going into a document.
// --advisory reports FIX items without failing (for auditing old figures). 0 otherwise; WARNs
// (4-7, 10-12, long arrows) still need judgement.
import { readFileSync } from "node:fs";

type Point = [number, number];
/** An axis-aligned box in content coordinates. */
interface Box { x1: number; y1: number; x2: number; y2: number }
/** A <text> with its estimated box. */
interface TextItem extends Box { text: string; size: number; anchor: string; halo: boolean; chrome: boolean }
/** A group container: its border box, kind (stroke and dash) and caption. */
interface Group extends Box { dashed: boolean; kind: string; name: string }
/** An icon tile unioned with the captions under it. */
interface DiagramNode extends Box { tile: Box; caps: TextItem[]; name: string }
interface Row { cy: number; y1: number; y2: number; members: DiagramNode[] }
/** One straight horizontal or vertical stretch of a connector. */
interface Run { axis: "h" | "v"; a: Point; b: Point }
interface Arrow { pts: Point[]; runs: Run[]; head: boolean; tail: boolean }
/** A box whose whitespace check 11 measures: a group (`self`) or the canvas. */
interface Scope extends Box { name: string; band: number; self?: Group }

const file = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!file) {
  console.error("usage: node check-layout.ts [--advisory] <diagram.svg>");
  process.exit(2);
}
const svg = readFileSync(file, "utf8");
// A <Diagram poster> (one big picture the user asked for) is delivered on its own, never in a page.
const poster = /<svg\b[^>]*\bdata-poster="true"/.test(svg);

// Coordinates that do not parse (a missing x, a percentage, a transform-only element)
// would make every comparison false and silently pass; count them so the report says so.
const skipped = new Map<string, number>();
const finite = (kind: string, ...vals: number[]) => {
  if (vals.every(Number.isFinite)) return true;
  skipped.set(kind, (skipped.get(kind) || 0) + 1);
  return false;
};

// Average glyph width as a fraction of font-size, Amazon Ember / Arial, mixed case.
const CW = 0.55;
const overlap = (a: Box, b: Box) =>
  a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
const area = (a: Box) => Math.max(0, a.x2 - a.x1) * Math.max(0, a.y2 - a.y1);
const inter = (a: Box, b: Box) => area({
  x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1),
  x2: Math.min(a.x2, b.x2), y2: Math.min(a.y2, b.y2),
});

// ---- icon tiles (48+; smaller ones are group badges on a container corner)
const tiles: Box[] = [...svg.matchAll(/overflow="visible" x="([-+]?[\d.]+)" y="([-+]?[\d.]+)" width="([\d.]+)"/g)]
  .map(([, x, y, w]) => ({ x: +x, y: +y, w: +w }))
  .filter((t) => finite("icon tile", t.x, t.y, t.w) && t.w >= 48)
  .map((t) => ({ x1: t.x, y1: t.y, x2: t.x + t.w, y2: t.y + t.w }));

// ---- every text, with an estimated box that respects text-anchor. The diagram title and subtitle are drawn in
//      canvas coordinates before the translated content group; everything else is in content coordinates, which
//      start near 0, so only document order (not a y threshold) tells them apart.
const contentStart = svg.search(/<g transform="translate\(/);
const texts: TextItem[] = [...svg.matchAll(/<text([^>]*)>([^<]*)/g)].map(({ 1: attrs, 2: body, index }) => {
  const g = (k: string) => (attrs.match(new RegExp(`${k}="([^"]+)"`)) || [])[1];  // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp -- k is a fixed attribute name
  const x = +g("x"), y = +g("y"), size = +(g("font-size") || 12);
  const anchor = g("text-anchor") || "start";
  const w = body.trim().length * size * CW;
  const x1 = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x;
  return { text: body.trim(), size, anchor,
           x1, x2: x1 + w, y1: y - size * 0.8, y2: y + size * 0.25,
           halo: /paint-order="stroke"/.test(attrs), chrome: contentStart >= 0 && index < contentStart };
}).filter((t) => t.text && finite("text", t.x1, t.y1, t.x2));

// ---- group containers. The engine draws every group as a <g data-kind="..."> whose first element after its
//      <title> is the border <rect>, filled (public and private subnets) or not; kind "borderless" draws no
//      border, so the first <rect> inside it belongs to its content. A hand-drawn <Rect> outline (unfilled and
//      stroked) is checked as a box too; an invisible <Rect stroke="none"> spacer is not. Checks 2, 3 and 6 look
//      at the large ones only; 10 and 11 need every box, since a one-node VPC is often narrower than 160px.
const borderAt = new Set<number>();
for (const m of svg.matchAll(/<g\b[^>]*\bdata-kind="([^"]*)"[^>]*>(?:<title>[^<]*<\/title>)?(?=<rect\b)/g))
  if (m[1] !== "borderless") borderAt.add(m.index + m[0].length);
const allGroups: Group[] = [...svg.matchAll(/<rect([^>]*?)\/?>/g)].map(({ 1: a, index }) => {
  const g = (k: string) => (a.match(new RegExp(`${k}="([^"]+)"`)) || [])[1];  // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp -- k is a fixed attribute name
  return { x: +g("x"), y: +g("y"), w: +g("width"), h: +g("height"), border: borderAt.has(index),
           fill: g("fill"), stroke: g("stroke"), dash: g("stroke-dasharray") || "" };
}).filter((r) => (r.border || (r.fill === "none" && r.stroke && r.stroke !== "none")) &&
                 finite("group rect", r.x, r.y, r.w, r.h) && r.w >= 48 && r.h >= 48)
  .map((r) => ({ x1: r.x, y1: r.y, x2: r.x + r.w, y2: r.y + r.h, dashed: !!r.dash,
                 kind: `${r.stroke}${r.dash ? " dashed" : ""}`, name: "" }));
// A group's caption is the bold start-anchored text on its top band, just right of the badge.
for (const g of allGroups) {
  const cap = texts.find((t) => t.anchor === "start" && !t.halo && t.size < 14 && t.x1 >= g.x1 && t.x1 < g.x1 + 56 &&
                                t.y1 >= g.y1 - 2 && t.y2 <= g.y1 + 40);
  g.name = cap ? cap.text : `group at (${g.x1},${g.y1})`;
}
const groups = allGroups.filter((g) => g.x2 - g.x1 > 160 && g.y2 - g.y1 > 80);

// ---- a node = its tile unioned with the labels sitting directly under it
const nodes: DiagramNode[] = tiles.map((t) => {
  const cx = (t.x1 + t.x2) / 2;
  const own = texts.filter((s) => s.anchor === "middle" && Math.abs((s.x1 + s.x2) / 2 - cx) < 6 &&
                                  s.y1 >= t.y2 - 2 && s.y1 < t.y2 + 40);
  const box = own.reduce((b, s) => ({
    x1: Math.min(b.x1, s.x1), y1: Math.min(b.y1, s.y1),
    x2: Math.max(b.x2, s.x2), y2: Math.max(b.y2, s.y2),
  }), { ...t });
  return { ...box, tile: t, caps: own, name: own.map((s) => s.text).join(" / ") || `icon at (${t.x1},${t.y1})` };
});

// must: advisories that are never a judgement call for a figure going into a document — sprawl,
// zig-zags, a document-scale canvas. They print as FIX and fail the run unless --advisory.
const fails: string[] = [], advis: string[] = [], must: string[] = [];

// 1. node vs node
for (let i = 0; i < nodes.length; i++)
  for (let j = i + 1; j < nodes.length; j++)
    if (overlap(nodes[i], nodes[j]))
      fails.push(`node/node overlap: ${Math.round(inter(nodes[i], nodes[j]))}px² between ` +
                 `(${nodes[i].x1.toFixed(0)},${nodes[i].y1.toFixed(0)}) and ` +
                 `(${nodes[j].x1.toFixed(0)},${nodes[j].y1.toFixed(0)})`);

// 2. node straddling a group border it is not wholly inside or outside
for (const n of nodes)
  for (const g of groups) {
    const insideX = n.x1 >= g.x1 && n.x2 <= g.x2, insideY = n.y1 >= g.y1 && n.y2 <= g.y2;
    const outside = n.x2 <= g.x1 || n.x1 >= g.x2 || n.y2 <= g.y1 || n.y1 >= g.y2;
    if (!outside && !(insideX && insideY))
      fails.push(`node straddles a group border at ` +
                 `(${n.x1.toFixed(0)},${n.y1.toFixed(0)})-(${n.x2.toFixed(0)},${n.y2.toFixed(0)})`);
  }

// 3. label sitting on a group border line (the trap nothing else catches).
//    Excluded, because each legitimately spans borders: the diagram title, a group's own
//    caption on its top edge, and any wide free-text note. Every other text is judged; a halo'd
//    one (an arrow label) is a WARN because the white knockout hides the line rather than
//    colliding with it; it still leaves a visible gap in the border.
const canvasW = +((svg.match(/viewBox="0 0 ([\d.]+)/) || [])[1] || 0);
// The <Diagram title> and <Diagram subtitle> (chrome) are excluded, and so is any large free text (14px and up).
const isTitle = (t: TextItem) => t.size >= 14 || t.chrome;
const isNote = (t: TextItem) => canvasW && t.x2 - t.x1 > canvasW * 0.3;
for (const t of texts) {
  if (isTitle(t) || isNote(t)) continue;
  for (const g of groups)
    for (const [axis, v] of [["y", g.y1], ["y", g.y2], ["x", g.x1], ["x", g.x2]] as const) {
      const on = axis === "y"
        ? t.y1 - 2 < v && v < t.y2 + 2 && t.x1 < g.x2 && t.x2 > g.x1
        : t.x1 - 2 < v && v < t.x2 + 2 && t.y1 < g.y2 && t.y2 > g.y1;
      const isCaption = axis === "y" && v === g.y1 && t.anchor === "start" && !t.halo;
      if (!on || isCaption) continue;
      const where = `label "${t.text.slice(0, 32)}" sits on a group ${axis === "y" ? "horizontal" : "vertical"} border at ${v}`;
      (t.halo ? advis : fails).push(t.halo ? `${where} — its halo breaks the border line; re-anchor with labelAt` : where);
    }
}

// 4. rows that do not line up: cluster node centres by y, then flag clusters that
//    overlap each other's vertical span. Two "rows" sharing a band is a broken grid.
const rows: Row[] = [];
for (const n of [...nodes].sort((a, b) => a.y1 - b.y1)) {
  const r = rows.find((r) => Math.abs(r.cy - (n.y1 + n.y2) / 2) < 24);
  if (r) { r.members.push(n); r.y1 = Math.min(r.y1, n.y1); r.y2 = Math.max(r.y2, n.y2); }
  else rows.push({ cy: (n.y1 + n.y2) / 2, y1: n.y1, y2: n.y2, members: [n] });
}
// A single node stepping down beside another is a flow, not a grid — only two genuine
// multi-node rows sharing a band read as a broken row.
for (let i = 0; i < rows.length; i++)
  for (let j = i + 1; j < rows.length; j++)
    if (rows[i].members.length >= 2 && rows[j].members.length >= 2 &&
        rows[i].y1 < rows[j].y2 && rows[j].y1 < rows[i].y2)
      advis.push(`rows overlap vertically: ${rows[i].members.length} node(s) at y≈${rows[i].y1.toFixed(0)}` +
                 `-${rows[i].y2.toFixed(0)} share a band with ${rows[j].members.length} at y≈` +
                 `${rows[j].y1.toFixed(0)}-${rows[j].y2.toFixed(0)} — they read as one misaligned row`);

// 5. uneven column pitch inside a row = a hole
for (const r of rows.filter((r) => r.members.length >= 3)) {
  const cx = r.members.map((n) => (n.x1 + n.x2) / 2).sort((a, b) => a - b);
  const gaps = cx.slice(1).map((v, i) => v - cx[i]);
  const min = Math.min(...gaps), max = Math.max(...gaps);
  if (min === 0) {
    advis.push(`two nodes share a centre in the row at y≈${r.y1.toFixed(0)} — stacked or duplicated, check them`);
    continue;
  }
  if (max > min * 1.8)
    advis.push(`uneven column pitch in the row at y≈${r.y1.toFixed(0)}: gaps ` +
               `${gaps.map((g) => g.toFixed(0)).join(", ")} — the widest is ${(max / min).toFixed(1)}x the narrowest, which reads as a hole`);
}

// 6. a node beside a group, at the same height but outside it. No pixels collide, so every
//    other check passes - but the eye reads the two as one row of peers and they are not.
//    This is what "overlapping rows" usually turns out to mean.
// A node inside ANOTHER group that is itself beside g is not the peer of g - its own group
// is - so it is skipped. (A g nested in a group the node is outside, a subnet in a VPC, is
// still judged.)
const contains = (o: Box, i: Box) => i.x1 >= o.x1 && i.x2 <= o.x2 && i.y1 >= o.y1 && i.y2 <= o.y2;
for (const n of nodes)
  for (const g of groups) {
    if (groups.some((h) => h !== g && contains(h, n) && !contains(h, g) && !overlap(h, g))) continue;
    const besideX = n.x2 <= g.x1 || n.x1 >= g.x2;
    const share = Math.min(n.y2, g.y2) - Math.max(n.y1, g.y1);
    const frac = share / (n.y2 - n.y1);
    // PARTIAL overlap is the defect. A node whose whole height sits inside the group's band is
    // deliberately aligned with it - an external actor beside an account, say - and is fine.
    if (besideX && frac > 0.2 && frac < 0.8 && (g.x2 - g.x1) < canvasW * 0.85)
      advis.push(`node at (${n.x1.toFixed(0)},${n.y1.toFixed(0)}) sits beside a group ` +
                 `(${g.x1.toFixed(0)}-${g.x2.toFixed(0)}) sharing ${share.toFixed(0)}px of its height ` +
                 `— they read as one row of peers but the node is outside the group`);
  }

// 7. aspect ratio
const vb = (svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/) || []);
if (vb[1]) {
  const ar = +vb[1] / +vb[2];
  if (ar > 2.5 && !poster) advis.push(`aspect ratio ${ar.toFixed(2)}:1 — past ~2.5:1 a figure is unreadable at document width`);
}

// ---- connectors, for 8 and 9: every path after data-name="connectors", as axis-aligned runs.
//      The engine rounds each elbow with a Q whose control point is the corner, so collapsing
//      collinear vertices gives one run per straight stretch of line.
const NUM = String.raw`[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?`;
function pathPoints(d: string): Point[] {
  const pts: Point[] = [];
  let cx = 0, cy = 0;
  for (const seg of d.match(/[MmLlHhVvCcSsQqTtAaZz][^MmLlHhVvCcSsQqTtAaZz]*/g) ?? []) {
    const c = seg[0], C = c.toUpperCase(), rel = c !== C;
    const n = (seg.slice(1).match(new RegExp(NUM, "g")) ?? []).map(Number);
    if (C === "Z") { if (pts.length) pts.push(pts[0]); continue; }
    const stride = ({ M: 2, L: 2, T: 2, H: 1, V: 1, Q: 4, S: 4, C: 6, A: 7 } as Record<string, number | undefined>)[C] ?? 2;
    for (let k = 0; k + stride <= n.length; k += stride) {
      const v = n.slice(k, k + stride);
      const abs = (x: number, y: number): Point => (rel ? [cx + x, cy + y] : [x, y]);
      const add: Point[] = C === "H" ? [[rel ? cx + v[0] : v[0], cy]]
        : C === "V" ? [[cx, rel ? cy + v[0] : v[0]]]
        : C === "A" ? [abs(v[5], v[6])]
        : Array.from({ length: stride / 2 }, (_, j) => abs(v[2 * j], v[2 * j + 1]));
      pts.push(...add);
      [cx, cy] = add[add.length - 1];
    }
  }
  return pts;
}
const cAt = svg.indexOf('data-name="connectors"');
const lAt = svg.indexOf('data-name="arrow-labels"');
const connSvg = cAt === -1 ? "" : svg.slice(cAt, lAt > cAt ? lAt : undefined);
const arrows: Arrow[] = [...connSvg.matchAll(/<path d="([^"]+)"([^>]*)>/g)].map(([, d, rest]) => {
  const pts = pathPoints(d).filter((p) => p.every(Number.isFinite));
  const runs: Run[] = [];
  for (let k = 0; k + 1 < pts.length; k++) {
    const [[x1, y1], [x2, y2]] = [pts[k], pts[k + 1]];
    const axis = y1 === y2 ? "h" : x1 === x2 ? "v" : null;
    if (!axis || (x1 === x2 && y1 === y2)) continue;
    const last = runs[runs.length - 1];
    if (last && last.axis === axis && last.b[0] === x1 && last.b[1] === y1) last.b = [x2, y2];
    else runs.push({ axis, a: [x1, y1], b: [x2, y2] });
  }
  return { pts, runs, head: /marker-end/.test(rest), tail: /marker-start/.test(rest) };
}).filter((a) => a.pts.length >= 2);
const arrowLabels = texts.filter((t) => t.halo);
const boxDist = (b: Box, [x, y]: Point) => Math.hypot(Math.max(b.x1 - x, 0, x - b.x2), Math.max(b.y1 - y, 0, y - b.y2));
const nearestNode = (p: Point) =>
  nodes.reduce<DiagramNode | null>((best, n) => (!best || boxDist(n, p) < boxDist(best, p) ? n : best), null);
const endName = (p: Point) => {
  const n = nearestNode(p);
  if (n && boxDist(n, p) <= 24) return `"${n.name}"`;
  const g = allGroups.filter((g) => boxDist(g, p) <= 12).sort((a, b) => area(a) - area(b))[0];
  return g ? `group "${g.name}"` : `(${p[0].toFixed(0)},${p[1].toFixed(0)})`;
};

// The figure's node pitch: median centre-to-centre distance between neighbours in a row or column.
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const pitchOf = (key: (t: Box) => number, along: (t: Box) => number) => {
  const lines: { c: number; v: number[] }[] = [];
  for (const n of nodes) {
    const c = key(n.tile), l = lines.find((l) => Math.abs(l.c - c) < 24);
    if (l) l.v.push(along(n.tile)); else lines.push({ c, v: [along(n.tile)] });
  }
  return lines.flatMap((l) => l.v.sort((a, b) => a - b).slice(1).map((v, i) => v - l.v[i])).filter((d) => d > 0);
};
const mid = (a: number, b: number) => (a + b) / 2;
const pitch = median([...pitchOf((t) => mid(t.y1, t.y2), (t) => mid(t.x1, t.x2)),
                      ...pitchOf((t) => mid(t.x1, t.x2), (t) => mid(t.y1, t.y2))]);

// 8. long arrows and a sparse figure.
//    A straight run whose empty length (the run minus the labels riding on it) is more than
//    LONG_PITCHES node pitches and more than LONG_MIN px is two nodes placed far apart with the
//    arrow stretched to reach: move the node, keep the arrow. The pitch used is the figure's own,
//    capped at PITCH_REF: a sprawling figure must not excuse its own long arrows. When the median
//    pitch is past PITCH_MAX the whole figure is spread out; that is reported once.
//    Calibration (the 30-scene gallery, 2026-10-14): median pitches 112-232px; a run over the
//    threshold only where an example does stretch an arrow across the canvas.
const LONG_PITCHES = 2, LONG_MIN = 240, PITCH_REF = 160, PITCH_MAX = 240, SPARSE_GAP = 150;
// Sparse is judged on the empty gap between neighbouring node boxes (tile plus caption), not on
// centre distance (the gallery's median gaps: 27-131px)
// - wide captions make a compact figure's pitch large but its gaps small.
const gapOf = (key: (t: Box) => number, lo: (n: DiagramNode) => number, hi: (n: DiagramNode) => number) => {
  const lines: { c: number; v: DiagramNode[] }[] = [];
  for (const n of nodes) {
    const c = key(n.tile), l = lines.find((l) => Math.abs(l.c - c) < 24);
    if (l) l.v.push(n); else lines.push({ c, v: [n] });
  }
  return lines.flatMap((l) => l.v.sort((a, b) => lo(a) - lo(b)).slice(1).map((n, i) => lo(n) - hi(l.v[i]))).filter((d) => d > 0);
};
const boxGap = median([...gapOf((t) => mid(t.y1, t.y2), (n) => n.x1, (n) => n.x2),
                       ...gapOf((t) => mid(t.x1, t.x2), (n) => n.y1, (n) => n.y2)]);
if (boxGap > SPARSE_GAP)
  must.push(`sparse figure: the median gap between neighbouring nodes is ${boxGap.toFixed(0)}px (limit ${SPARSE_GAP}px) — ` +
            `pull connected nodes closer and cut the gaps`);
else if (pitch > PITCH_MAX)
  advis.push(`wide pitch: the median node pitch is ${pitch.toFixed(0)}px (bundled examples: 112-232), gaps are fine — check the captions are not longer than they need to be`);
for (const a of arrows)
  for (const r of a.runs) {
    const h = r.axis === "h", lo = Math.min(h ? r.a[0] : r.a[1], h ? r.b[0] : r.b[1]);
    const len = Math.abs(h ? r.b[0] - r.a[0] : r.b[1] - r.a[1]), hi = lo + len, line = h ? r.a[1] : r.a[0];
    const covered = arrowLabels.filter((t) => h
      ? t.y1 - 20 < line && line < t.y2 + 20 && t.x1 < hi && t.x2 > lo
      : t.x1 - 20 < line && line < t.x2 + 20 && t.y1 < hi && t.y2 > lo)
      .reduce((s, t) => s + (h ? Math.min(t.x2, hi) - Math.max(t.x1, lo) : Math.min(t.y2, hi) - Math.max(t.y1, lo)), 0);
    const empty = len - covered;
    if (pitch && (empty > LONG_PITCHES * Math.min(pitch, PITCH_REF) && empty > LONG_MIN))
      advis.push(`long arrow: ${endName(a.pts[0])} -> ${endName(a.pts[a.pts.length - 1])} runs ` +
                 `${empty.toFixed(0)}px of empty line (limit ${Math.max(LONG_MIN, LONG_PITCHES * Math.min(pitch, PITCH_REF)).toFixed(0)}px, ` +
                 `2x a ${Math.min(pitch, PITCH_REF).toFixed(0)}px pitch) — move the nodes closer instead of stretching the arrow`);
  }

// 9. arrowhead on text: a tip inside, or within TIP_CLEAR px of, a text box that is not the
//    arrow's own label riding its last run. An arrow into a node's BOTTOM face is the one
//    exception to FAIL: the engine ends it flush under that node's caption by design (every
//    bundled example that uses a bottom entry does it), so it is a WARN - enter the top or a side
//    face instead when the layout allows.
const TIP_CLEAR = 6;
for (const a of arrows) {
  const tips: [Point, Point][] = [];
  if (a.head) tips.push([a.pts[a.pts.length - 1], a.pts[a.pts.length - 2]]);
  if (a.tail) tips.push([a.pts[0], a.pts[1]]);
  for (const [tip, prev] of tips) {
    const h = prev[1] === tip[1];
    const riding = (t: TextItem) => t.halo && (h
      ? t.y1 - 20 < tip[1] && tip[1] < t.y2 + 20 && t.x1 < Math.max(tip[0], prev[0]) && t.x2 > Math.min(tip[0], prev[0])
      : t.x1 - 20 < tip[0] && tip[0] < t.x2 + 20 && t.y1 < Math.max(tip[1], prev[1]) && t.y2 > Math.min(tip[1], prev[1]));
    const hit = texts.find((t) => t.size < 14 && !riding(t) && boxDist(t, tip) < TIP_CLEAR);
    if (!hit) continue;
    const n = nearestNode(tip);
    const fromBelow = !h && prev[1] > tip[1] && n && n.caps.includes(hit);
    (fromBelow ? advis : fails).push(
      `arrowhead on text: the arrow into ${endName(tip)} ends ${boxDist(hit, tip).toFixed(0)}px from ` +
      `"${hit.text.slice(0, 32)}"` + (fromBelow
        ? " — it enters the bottom face flush under the caption; enter the top or a side face"
        : " — move the label or the node so the tip has clear space"));
  }
}

// 10. uneven siblings. Structural boxes of one kind (same border and caption boundary name: VPC,
//     Account, Region, subnet) that share a parent and sit in one row should share a height; in
//     one column, a width. Boxes with different roles are only judged when they are within 40%
//     of each other: nearly equal reads as a mistake, clearly different reads as intended. Two
//     boxes with the same role (captions equal once a one-letter or one-digit id is removed,
//     "Workload A"/"Workload B") must share both. Generic tier boxes are not judged: their
//     contents differ by design.
const SIB_TOL = 0.10, SIB_NEAR = 0.40;
const STRUCTURAL = /^(VPC|Account|Region|Public Subnet|Private Subnet|Subnet|Availability Zone|AZ|Auto Scaling)\b/i;
const parentOf = (g: Group) => allGroups.filter((h) => h !== g && contains(h, g) && area(h) > area(g))
  .sort((a, b) => area(a) - area(b))[0];
const role = (g: Group) => g.name.replace(/\b[A-Z0-9]\b/g, "").replace(/\s+/g, " ").trim().toLowerCase();
for (let i = 0; i < allGroups.length; i++)
  for (let j = i + 1; j < allGroups.length; j++) {
    const [p, q] = [allGroups[i], allGroups[j]];
    const bp = (p.name.match(STRUCTURAL) || [])[1], bq = (q.name.match(STRUCTURAL) || [])[1];
    if (!bp || p.kind !== q.kind || bp.toLowerCase() !== (bq || "").toLowerCase() || parentOf(p) !== parentOf(q)) continue;
    const [pw, ph, qw, qh] = [p.x2 - p.x1, p.y2 - p.y1, q.x2 - q.x1, q.y2 - q.y1];
    const same = role(p) === role(q);
    const row = p.y1 < q.y2 && q.y1 < p.y2, col = p.x1 < q.x2 && q.x1 < p.x2;
    const dw = Math.abs(pw - qw) / Math.max(pw, qw), dh = Math.abs(ph - qh) / Math.max(ph, qh);
    const bad = [];
    const near = (d: number) => d > SIB_TOL && (same || d <= SIB_NEAR);
    if ((same || col) && near(dw)) bad.push(`width ${(dw * 100).toFixed(0)}%`);
    if ((same || row) && near(dh)) bad.push(`height ${(dh * 100).toFixed(0)}%`);
    if (bad.length)
      advis.push(`uneven siblings: "${p.name}" is ${pw}x${ph} and "${q.name}" is ${qw}x${qh} ` +
                 `(${bad.join(", ")} apart) — give same-kind boxes one shared size (a size constant in the scene)`);
  }

// 11. whitespace balance, per group and for the canvas, on an 8px raster: covered is the caption
//     band, the group's own nodes (with a CELL_PAD margin), its child groups and arrow labels; the
//     rest is empty. Then the gaps between a group's own rows (and columns) of nodes and child
//     groups: one over GAP_MAX px, or over GAP_RATIO x the smallest and over 64px, is a hole.
//     Calibration: the examples' groups are at most 62% empty,
//     their gaps at most 136px.
const EMPTY_MAX = 0.65, GAP_RATIO = 2.5, GAP_MAX = 160, CELL = 8, CELL_PAD = 16;
const GROUP_GAP_MIN = 48, GROUP_GAP_SLACK = 32, LABEL_ROOM = 16, PAD_MAX = 80, PAD_RATIO = 3;
const tr = (svg.match(/transform="translate\(([-\d.]+)[ ,]+([-\d.]+)\)"/) || []).slice(1).map(Number);
const canvas = vb[1] ? { x1: -(tr[0] || 0), y1: -(tr[1] || 0), x2: +vb[1] - (tr[0] || 0), y2: +vb[2] - (tr[1] || 0),
                         name: "canvas", band: 0 } : null;
const scopes: Scope[] = [...allGroups.map((g) => ({ ...g, band: 40, self: g })), ...(canvas ? [canvas] : [])];
for (const g of scopes) {
  const kids = allGroups.filter((h) => h !== g.self && (g.self ? contains(g.self, h) && parentOf(h) === g.self : !parentOf(h)));
  const own = nodes.filter((n) => contains(g, n) && !kids.some((k) => contains(k, n)));
  if (!own.length && !kids.length) continue;
  const inner = { x1: g.x1, y1: g.y1 + g.band, x2: g.x2, y2: g.y2 };
  const boxes = [...own.map((n) => ({ x1: n.x1 - CELL_PAD, y1: n.y1 - CELL_PAD, x2: n.x2 + CELL_PAD, y2: n.y2 + CELL_PAD })),
                 ...kids, ...arrowLabels.filter((t) => overlap(t, inner))];
  let total = 0, empty = 0;
  for (let y = inner.y1; y < inner.y2; y += CELL)
    for (let x = inner.x1; x < inner.x2; x += CELL) {
      total++;
      const c = { x1: x, y1: y, x2: x + CELL, y2: y + CELL };
      if (!boxes.some((b) => overlap(b, c))) empty++;
    }
  if (total && empty / total > EMPTY_MAX)
    must.push(`whitespace: "${g.name}" is ${Math.round((100 * empty) / total)}% empty — tighten its gaps or padding`);
  for (const [axis, lo, hi] of [["row", "y1", "y2"], ["column", "x1", "x2"]] as const) {
    const bands: Record<string, number>[] = [];
    for (const it of [...own, ...kids].sort((a, b) => a[lo] - b[lo])) {
      const b = bands.find((b) => it[lo] < b[hi] && b[lo] < it[hi]);
      if (b) { b[lo] = Math.min(b[lo], it[lo]); b[hi] = Math.max(b[hi], it[hi]); } else bands.push({ [lo]: it[lo], [hi]: it[hi] });
    }
    const gaps = bands.slice(1).map((b, i) => b[lo] - bands[i][hi]).filter((d) => d > 0);
    const max = Math.max(...gaps), min = Math.min(...gaps);
    if (gaps.length && (max > GAP_MAX || (gaps.length >= 2 && max > GAP_RATIO * min && max > 64)))
      advis.push(`${axis} gap in "${g.name}": ${gaps.map((d) => d.toFixed(0)).join(", ")}px — ` +
                 (max > GAP_MAX ? `${max.toFixed(0)}px is an empty band, pull the ${axis}s together`
                                : `the widest is ${(max / min).toFixed(1)}x the narrowest, which reads as a hole`));
    // A gap between two sibling GROUPS carries only arrows: it should be as wide as the labels in
    // it need (their extent plus LABEL_ROOM a side, at least GROUP_GAP_MIN), give or take
    // GROUP_GAP_SLACK. The gallery's widest group gaps (96-112px) carry labels that need 91-111px.
    for (let i = 1; i < bands.length; i++) {
      const a0 = bands[i - 1][hi], b0 = bands[i][lo], d = b0 - a0;
      const sideA = kids.filter((k) => k[hi] <= a0 + 1 && k[hi] >= a0 - 1), sideB = kids.filter((k) => Math.abs(k[lo] - b0) <= 1);
      if (!sideA.length || !sideB.length || d <= GROUP_GAP_MIN) continue;
      const inGap = arrowLabels.filter((t) => t[lo] < b0 && t[hi] > a0);
      const need = Math.max(GROUP_GAP_MIN, ...inGap.map((t) => t[hi] - t[lo] + 2 * LABEL_ROOM));
      if (d > need + GROUP_GAP_SLACK)
        advis.push(`${axis} gap between groups in "${g.name}" is ${d.toFixed(0)}px; its labels need ${need.toFixed(0)}px — ` +
                   `close it to what the labels need`);
    }
  }
  // Padding: the space between the group border (below its caption band) and its content. One
  // side over PAD_RATIO x the tightest side and over PAD_MAX px means the box does not hug. A box
  // padded out to match a sibling (check 10) raises it too: say why when you keep it.
  if (g.self) {
    const all = [...own, ...kids, ...arrowLabels.filter((t) => contains(inner, t))];
    const c = all.reduce((b, n) => ({ x1: Math.min(b.x1, n.x1), y1: Math.min(b.y1, n.y1), x2: Math.max(b.x2, n.x2), y2: Math.max(b.y2, n.y2) }),
                         { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity });
    const pads = { top: c.y1 - inner.y1, bottom: g.y2 - c.y2, left: c.x1 - g.x1, right: g.x2 - c.x2 };
    const vals = Object.values(pads).filter(Number.isFinite), lo = Math.max(8, Math.min(...vals));
    const worst = Object.entries(pads).filter(([, v]) => v > PAD_MAX && v > PAD_RATIO * lo);
    if (worst.length)
      advis.push(`padding in "${g.name}": ${worst.map(([k, v]) => `${k} ${v.toFixed(0)}px`).join(", ")} against ${lo.toFixed(0)}px ` +
                 `elsewhere — let the box hug its content with one padding`);
  }
}

// 12. elbow stubs and jogs. On a bent connector the first run (leaving the source) and the last
//     run (into the arrowhead) need a clear straight stub of STUB_MIN px, or the arrowhead sits
//     right under the bend. A WARN, not a FAIL: the engine's own minimum stub is 8px (the gallery
//     once shipped ai-native-trading at 8px x3 and eks-ecommerce at 4px). A middle run under
//     JOG_MAX px is a jog - two ends a few px out of line - which reads as a mistake: align them.
const STUB_MIN = 32, STUB_BAD = 12, JOG_MAX = 12;
const runLen = (r: Run) => Math.abs(r.axis === "h" ? r.b[0] - r.a[0] : r.b[1] - r.a[1]);
for (const a of arrows) {
  if (a.runs.length < 2) continue;
  const from = endName(a.pts[0]), to = endName(a.pts[a.pts.length - 1]);
  const mids = a.runs.slice(1, -1).filter((r) => runLen(r) < JOG_MAX);
  if (a.runs.length === 3 && mids.length) {
    advis.push(`jog: ${from} -> ${to} steps ${runLen(mids[0]).toFixed(0)}px sideways — line the two ends up so the arrow is straight`);
    continue;
  }
  for (const [r, which] of [[a.runs[a.runs.length - 1], "last"], [a.runs[0], "first"]] as const) {
    const len = runLen(r);
    if (len >= STUB_MIN) continue;
    advis.push(
      `short ${which} stub: ${from} -> ${to} ${which === "last" ? "turns into its target" : "turns after leaving its source"} ` +
      `${len.toFixed(0)}px from the ${which === "last" ? "arrowhead" : "node"} (want ${STUB_MIN}px+)` +
      `${len < STUB_BAD ? ", the arrowhead sits on the bend" : ""} — move the bend or the node`);
  }
}

// 13. numbered arrow labels ("1 API calls", "(2) pull", "Step 3: ..."). House style is a short
//     label that says what happens on the arrow itself; numbers send the reader to a legend and go
//     stale when the flow changes (FAIL).
const NUMBERED = /^\s*(?:\(?\d+[).:]?|step\s*\d+[.:]?)\s+\S/i;
for (const t of arrowLabels)
  if (NUMBERED.test(t.text)) fails.push(`numbered label "${t.text}" — drop the number and let the label say what happens`);

// 14. zig-zags. A 3-run connector whose first and last runs point the same way (right, down,
//     right) only exists because its two ends are out of line: put the two nodes on one row or
//     column and it runs straight. Middle runs under JOG_MAX are check 12's jogs; steps past
//     ZIG_MAX are routes around something. Fan-outs, fan-ins and group ends are skipped.
const ZIG_MAX = 180;
const dir = (r: Run) => Math.sign(r.axis === "h" ? r.b[0] - r.a[0] : r.b[1] - r.a[1]);
const near = (p: Point, q: Point) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= 4;
const endNode = (p: Point) => { const n = nearestNode(p); return n && boxDist(n, p) <= 24 ? n : null; };
for (const a of arrows) {
  if (a.runs.length !== 3) continue;
  const s0 = a.pts[0], s1 = a.pts[a.pts.length - 1];
  // A fan-out or fan-in (several arrows sharing this start or end point) cannot put every target
  // in line, and an end on a group box is routed to the box, not a node: both bend by necessity.
  if (!endNode(s0) || !endNode(s1)) continue;
  if (arrows.some((b) => b !== a && (near(b.pts[0], s0) || near(b.pts[b.pts.length - 1], s1)))) continue;
  const [r0, r1, r2] = a.runs, m = runLen(r1);
  if (r0.axis === r2.axis && dir(r0) === dir(r2) && m >= JOG_MAX && m <= ZIG_MAX)
    must.push(`zig-zag: ${endName(a.pts[0])} -> ${endName(a.pts[a.pts.length - 1])} steps ${m.toFixed(0)}px ` +
              `${r1.axis === "v" ? "up or down" : "sideways"} between two parallel runs — put the two nodes on one ` +
              `${r1.axis === "v" ? "row" : "column"} so the arrow is straight`);
}

// 14b. avoidable bends. A one-to-one arrow with a single bend (an L) between two nodes means the
//      two nodes are out of line: the user's rule is that an arrow bends only for a fan-out or
//      fan-in or to get around something. Put the nodes on one row or column. Legs longer than
//      BEND_MAX are routes around something and are left alone, as are fans and group ends.
const BEND_MAX = 240;
for (const a of arrows) {
  if (a.runs.length !== 2) continue;
  const s0 = a.pts[0], s1 = a.pts[a.pts.length - 1];
  const n0 = endNode(s0), n1 = endNode(s1);
  if (!n0 || !n1) continue;
  // A fan is decided per node: a source with two or more outgoing arrows, or a target with two or
  // more incoming ones, cannot line up with all of them.
  const outOf = (n: DiagramNode) => arrows.filter((b) => endNode(b.pts[0]) === n).length;
  const into = (n: DiagramNode) => arrows.filter((b) => endNode(b.pts[b.pts.length - 1]) === n).length;
  if (outOf(n0) > 1 || into(n1) > 1) continue;
  const off = Math.min(runLen(a.runs[0]), runLen(a.runs[1]));
  if (off <= BEND_MAX)
    must.push(`avoidable bend: ${endName(s0)} -> ${endName(s1)} turns once with a ${off.toFixed(0)}px leg — ` +
              `put the two nodes on one row or column so the arrow runs straight`);
}

// 14c. arrows skimming icons. A run that passes within NEAR_ICON px of an icon it does not connect
//      to (just above, below or beside the tile) reads as touching it; check-paths only catches a
//      run through the tile.
const NEAR_ICON = 10;
const segRectDist = (r: Run, t: Box) => {
  const [x1, y1] = r.a, [x2, y2] = r.b;
  const lx = Math.min(x1, x2), hx = Math.max(x1, x2), ly = Math.min(y1, y2), hy = Math.max(y1, y2);
  const dx = Math.max(t.x1 - hx, 0, lx - t.x2), dy = Math.max(t.y1 - hy, 0, ly - t.y2);
  return Math.hypot(dx, dy);
};
for (const a of arrows) {
  const ends = [endNode(a.pts[0]), endNode(a.pts[a.pts.length - 1])].filter((n): n is DiagramNode => Boolean(n)).map((n) => n.tile);
  for (const t of tiles) {
    if (ends.includes(t)) continue;
    const d = Math.min(...a.runs.map((r) => segRectDist(r, t)));
    if (d > 0 && d < NEAR_ICON) {
      const n = nodes.find((x) => x.tile === t);
      must.push(`arrow ${endName(a.pts[0])} -> ${endName(a.pts[a.pts.length - 1])} skims the icon of ` +
                `"${n ? n.name : "an icon"}" (${d.toFixed(0)}px) — move it ${NEAR_ICON}px+ clear`);
    }
  }
}

// 16. arrows on arrows and arrows through text. Two arrows whose runs lie on one line (within
//     OVER_GAP px) for more than OVER_MIN px read as one arrow; unless they share a start or an
//     end (a fan-out trunk), that is a routing mistake (FAIL). A run that cuts through a node's
//     caption, a group title or another arrow's label hides the words (must-fix).
const OVER_GAP = 6, OVER_MIN = 24;
const span = (r: Run) => { const h = r.axis === "h"; const u = h ? r.a[0] : r.a[1], v = h ? r.b[0] : r.b[1];
  return { lo: Math.min(u, v), hi: Math.max(u, v), line: h ? r.a[1] : r.a[0] }; };
for (let i = 0; i < arrows.length; i++)
  for (let j = i + 1; j < arrows.length; j++) {
    const a = arrows[i], b = arrows[j];
    const ends = (x: Arrow) => [x.pts[0], x.pts[x.pts.length - 1]];
    if (near(a.pts[0], b.pts[0]) || near(ends(a)[1], ends(b)[1])) continue;
    let worst = 0;
    for (const ra of a.runs) for (const rb of b.runs) {
      if (ra.axis !== rb.axis) continue;
      const A = span(ra), B = span(rb);
      if (Math.abs(A.line - B.line) > OVER_GAP) continue;
      worst = Math.max(worst, Math.min(A.hi, B.hi) - Math.max(A.lo, B.lo));
    }
    if (worst > OVER_MIN)
      fails.push(`arrows overlap: ${endName(a.pts[0])} -> ${endName(ends(a)[1])} and ${endName(b.pts[0])} -> ${endName(ends(b)[1])} ` +
                 `share ${worst.toFixed(0)}px of line — move a node or route one of them on another face`);
  }
const captions = [...nodes.flatMap((n) => n.caps), ...texts.filter((t) => !t.halo && t.anchor === "start" && allGroups.some((g) => g.name === t.text))];
// 17. group title bands. A group's title sits in a band along its top border; an arrow label
//     inside that band reads as part of the title, and an arrow brushing past the title words
//     crowds them (both must-fix). Seen on a 20-node figure that passed every other check.
const TITLE_BAND = 28, TITLE_CLEAR = 12;
const titled = allGroups.filter((g) => !g.name.startsWith("group at"));
for (const g of titled) {
  const cap = texts.find((t) => t.text === g.name && !t.halo && t.anchor === "start");
  for (const t of arrowLabels)
    if (t.y1 < g.y1 + TITLE_BAND && t.y2 > g.y1 && t.x1 >= g.x1 && t.x2 <= g.x2)
      must.push(`label "${t.text}" sits in the title band of group "${g.name}" — it reads as part of the title; move it below the band with labelAt or route the arrow in from the side`);
  if (!cap) continue;
  for (const a of arrows) for (const r of a.runs) {
    const S = span(r);
    if (r.axis !== "v" || S.line <= cap.x2 || S.line - cap.x2 > TITLE_CLEAR) continue;
    if (S.lo < cap.y2 && S.hi > cap.y1)
      must.push(`arrow ${endName(a.pts[0])} -> ${endName(a.pts[a.pts.length - 1])} passes ${(S.line - cap.x2).toFixed(0)}px from the title of group "${g.name}" — keep ${TITLE_CLEAR}px+ clear, or route it in from the side`);
  }
}

for (const a of arrows) {
  const own = arrowLabels.filter((t) => a.runs.some((r) => { const S = span(r), h = r.axis === "h";
    return h ? t.y1 - 20 < S.line && S.line < t.y2 + 20 && t.x1 < S.hi && t.x2 > S.lo
             : t.x1 - 20 < S.line && S.line < t.x2 + 20 && t.y1 < S.hi && t.y2 > S.lo; }));
  for (const r of a.runs) {
    const S = span(r), h = r.axis === "h";
    for (const t of [...captions, ...arrowLabels.filter((l) => !own.includes(l))]) {
      const hit = h ? t.y1 + 2 < S.line && S.line < t.y2 - 2 && t.x1 + 2 < S.hi && t.x2 - 2 > S.lo
                    : t.x1 + 2 < S.line && S.line < t.x2 - 2 && t.y1 + 2 < S.hi && t.y2 - 2 > S.lo;
      if (hit) must.push(`arrow through text: ${endName(a.pts[0])} -> ${endName(a.pts[a.pts.length - 1])} crosses "${t.text}" — reroute or move the node`);
    }
  }
}

// 15. document scale. Figures go into pages about DOC_W px wide; a canvas wider than that is
//     scaled down, and so is every icon and caption. Past DOC_MAX_W the 48px icons print under
//     ~30px and 11px captions under ~7px: unreadable without zooming. Tighten the layout (checks
//     8 and 11 say where) rather than shrinking the page.
//     A poster (`<Diagram poster>`, asked for explicitly) is never placed in a page, so it may be
//     up to POSTER_MAX_W wide; every other check still applies.
const DOC_W = 800, DOC_MAX_W = 1280, POSTER_MAX_W = 3000;
const cw = +((svg.match(/viewBox="0 0 ([\d.]+)/) || [])[1] || 0);
if (poster && cw > POSTER_MAX_W)
  must.push(`too wide even for a poster: the canvas is ${cw.toFixed(0)}px — keep it under ${POSTER_MAX_W}px, or split it into an overview and detail figures`);
else if (!poster && cw > DOC_MAX_W)
  must.push(`too wide for a document: the canvas is ${cw.toFixed(0)}px, so at a ${DOC_W}px page width icons print at ` +
            `${(48 * DOC_W / cw).toFixed(0)}px and captions at ${(11 * DOC_W / cw).toFixed(1)}px — keep it under ${DOC_MAX_W}px ` +
            `(or, only when the user asked for one big picture, mark the scene <Diagram poster>)`);
if (poster) advis.push(`poster figure (${cw.toFixed(0)}px wide): deliver it as SVG and .drawio on its own, never inside a document page`);

for (const [kind, n] of skipped)
  advis.push(`skipped ${n} ${kind}(s) whose coordinates did not parse — they were not checked`);
const tally = (list: string[]) => [...list.reduce((m, s) => m.set(s, (m.get(s) || 0) + 1), new Map<string, number>())]
  .map(([m, n]) => (n > 1 ? `${m} (x${n})` : m));
const advisoryOnly = process.argv.includes("--advisory");
tally(fails).forEach((m) => console.log(`  FAIL ${m}`));
tally(must).forEach((m) => console.log(`  FIX  ${m}`));
tally(advis).forEach((m) => console.log(`  WARN ${m}`));
const bad = fails.length || (!advisoryOnly && must.length);
console.log(`  ${bad ? "FAIL" : "PASS"}: ${fails.length} hard defect(s), ${must.length} must-fix, ${advis.length} advisory, ` +
            `${nodes.length} nodes, ${groups.length} groups, ${rows.length} row(s)`);
process.exit(bad ? 1 : 0);
