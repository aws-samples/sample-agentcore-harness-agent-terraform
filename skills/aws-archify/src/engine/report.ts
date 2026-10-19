// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// The canvas fit and the layout report. Both measure icons, groups, labels and rectangles the same way, so the
// canvas fit() sizes is exactly the one the report's clipping check tests against.
import { snapUp } from "./geometry.ts";
import { GROUP_LABEL_SIZE, SUBTITLE_BAND, labelBox, subtitleRight, titleRight } from "./text.ts";
import { LABEL_BAND, groupTitleOrigin } from "./groups.ts";
import type { Flat, PlacedGroup, PlacedIcon, TextItem } from "./flatten.ts";
import { ICON_MARGIN } from "./routing.ts";

export interface LayoutReport {
  overlaps: [string, string][]; label_overlaps: [string, string][]; clipped: string[];
  misaligned: [string, string][]; off_center: [string, string][];
  /** How many <Raw> blocks the scene has: their extent is unknown, so they are neither fitted nor clip-checked. */
  unmeasured_raw: number;
  /** Arrows whose explicit `riser` has nothing to move (an aligned run, `via`, `elbow={false}`, manual points),
   *  named by edit id, "from→to", or a manual arrow's id or end points. Advisory: the arrow still routes. */
  riser_ignored: string[];
  aspect: number; a4_landscape: boolean; icons: number; groups: number; labels: number; arrows: number;
}

/** Margin around the whole drawing. */
export const CANVAS_MARGIN = 24;
/** Canvas height reserved for the title. */
const TITLE_BAND = 34;
/** Labels whose boxes only touch still read fine: each box is narrowed by this share of its width per side. */
const LABEL_SLACK = 1 / 24;
/** Icon centres within this distance share a row or column. */
const ALIGN_TOLERANCE = 8;
/** Content margins of a group may differ by this much before it counts as off centre. */
const CENTER_TOLERANCE = 24;

const iconExtent = (ic: { x: number; y: number; size: number }): [number, number, number, number] =>
  [ic.x - ICON_MARGIN, ic.y - ICON_MARGIN, ic.x + ic.size + ICON_MARGIN, ic.y + ic.size + ICON_MARGIN];

const contains = (g: PlacedGroup, x: number, y: number): boolean => g.x <= x && x <= g.x + g.w && g.y <= y && y <= g.y + g.h;

interface GroupTitle { name: string; item: TextItem; group: PlacedGroup }

/** The title every drawn group with a label paints (where paint.ts puts it), as a one-line text run: SVG draws the
 *  label's line breaks as spaces. Named `[label]`, the way `clipped` names the group. */
function groupTitles(groups: PlacedGroup[]): GroupTitle[] {
  const titles: GroupTitle[] = [];
  for (const g of groups) {
    const origin = g.label ? groupTitleOrigin(g.kind, g.x, g.y) : null;
    if (!origin) continue;
    const text = g.label.replace(/\s*\n\s*/g, " ");
    const item: TextItem = { x: origin[0], y: origin[1], text, size: GROUP_LABEL_SIZE, color: "", anchor: "start", bold: true, chip: false };
    titles.push({ name: `[${g.label}]`, item, group: g });
  }
  return titles;
}

function innermostGroup(ic: PlacedIcon, groups: PlacedGroup[]): PlacedGroup | null {
  let best: PlacedGroup | null = null;
  const cx = ic.x + ic.size / 2, cy = ic.y + ic.size / 2;
  for (const g of groups)
    if (contains(g, cx, cy) && (!best || g.w * g.h < best.w * best.h)) best = g;
  return best;
}

/** The machine-checkable layout problems of a fitted scene (`flat` already in canvas coordinates). */
export function checkLayout(flat: Flat, width: number, height: number, title: string | null = null): LayoutReport {
  const { icons, groups, labels, arrows } = flat;

  const overlaps: [string, string][] = [];
  for (let i = 0; i < icons.length; i++)
    for (let j = i + 1; j < icons.length; j++) {
      const [ax0, ay0, ax1, ay1] = iconExtent(icons[i]);
      const [bx0, by0, bx1, by1] = iconExtent(icons[j]);
      if (!(ax1 <= bx0 || bx1 <= ax0 || ay1 <= by0 || by1 <= ay0)) overlaps.push([icons[i].key || "?", icons[j].key || "?"]);
    }

  // Two labels collide when they share a line (baselines within 0.9 em; a looser test would pair the lines of one
  // caption) and their narrowed horizontal spans overlap.
  const span = (l: TextItem): [number, number] => {
    const [x0, , x1] = labelBox(l);
    const inset = (x1 - x0) * LABEL_SLACK;
    return [x0 + inset, x1 - inset];
  };
  const collide = (a: TextItem, b: TextItem, em: number): boolean => {
    if (Math.abs(a.y - b.y) >= em * 0.9) return false;
    const [ax0, ax1] = span(a), [bx0, bx1] = span(b);
    return !(ax1 <= bx0 || bx1 <= ax0);
  };
  const labelOverlaps: [string, string][] = [];
  for (let i = 0; i < labels.length; i++)
    for (let j = i + 1; j < labels.length; j++)
      if (collide(labels[i], labels[j], labels[i].size)) labelOverlaps.push([labels[i].text, labels[j].text]);
  // Group titles are text too: after the pairs above, each title against every label and every later title.
  const titles = groupTitles(groups);
  titles.forEach((t, k) => {
    for (const l of labels) if (collide(t.item, l, Math.max(t.item.size, l.size))) labelOverlaps.push([t.name, l.text]);
    for (const u of titles.slice(k + 1)) if (collide(t.item, u.item, Math.max(t.item.size, u.item.size))) labelOverlaps.push([t.name, u.name]);
  });

  const outside = (x0: number, y0: number, x1: number, y1: number) => x0 < 0 || y0 < 0 || x1 > width || y1 > height;
  const clipped: string[] = [];
  for (const ic of icons) if (outside(...iconExtent(ic))) clipped.push(ic.key || "?");
  for (const g of groups) if (outside(g.x, g.y, g.x + g.w, g.y + g.h)) clipped.push(`[${g.label}]`);
  // A title stays inside its box unless its label has line breaks (drawn on one line, measured by its widest one),
  // so it is checked only where the box itself is not already listed.
  for (const t of titles)
    if (!outside(t.group.x, t.group.y, t.group.x + t.group.w, t.group.y + t.group.h) && outside(...labelBox(t.item))) clipped.push(`${t.name} title`);
  for (const l of labels)
    if (outside(...labelBox(l))) {
      const lines = String(l.text).split("\n");
      clipped.push(lines.length > 1 ? `"${lines[0]}…" (${lines.length} lines)` : `"${lines[0]}"`);
    }
  for (const s of flat.shapes) if (s.kind === "rect" && outside(s.x, s.y, s.x + s.w, s.y + s.h)) clipped.push(`<Rect ${s.w}x${s.h}>`);
  // fit() widens the canvas for the title, so this only fires on a fixed canvas.
  if (title && titleRight(title) > width) clipped.push(`title "${title}"`);

  const misaligned: [string, string][] = [], offCenter: [string, string][] = [];
  for (const g of groups) {
    const members = icons.filter((ic) => contains(g, ic.x + ic.size / 2, ic.y + ic.size / 2) && innermostGroup(ic, groups) === g);
    if (members.length < 2) continue;
    for (const m of members) {
      const mx = m.x + m.size / 2, my = m.y + m.size / 2;
      const aligned = members.some((o) => o !== m && (Math.abs(o.x + o.size / 2 - mx) <= ALIGN_TOLERANCE || Math.abs(o.y + o.size / 2 - my) <= ALIGN_TOLERANCE));
      if (!aligned) misaligned.push([g.label, m.key || "?"]);
    }
    const left = Math.min(...members.map((m) => m.x)), right = Math.max(...members.map((m) => m.x + m.size));
    const top = Math.min(...members.map((m) => m.y)), bottom = Math.max(...members.map((m) => m.y + m.size));
    const l = left - g.x, r = g.x + g.w - right, t = top - (g.y + LABEL_BAND), b = g.y + g.h - bottom;
    if (Math.abs(l - r) > CENTER_TOLERANCE || Math.abs(t - b) > CENTER_TOLERANCE)
      offCenter.push([g.label, `L${Math.round(l)}/R${Math.round(r)} T${Math.round(t)}/B${Math.round(b)}`]);
  }

  const aspect = height ? width / height : 0;
  return {
    overlaps, label_overlaps: labelOverlaps, clipped, misaligned, off_center: offCenter,
    unmeasured_raw: flat.shapes.filter((s) => s.kind === "raw").length,
    // `arrow#i` counts every arrow in the scene, not only the ignored ones.
    riser_ignored: arrows.flatMap((a, i) => (a.riserIgnored ? [a.editId || a.name || `arrow#${i}`] : [])),
    aspect: Math.round(aspect * 100) / 100, a4_landscape: aspect >= 1.25 && aspect <= 1.75,
    icons: icons.length, groups: groups.length, labels: labels.length, arrows: arrows.length,
  };
}

/** The translation that puts the content an even margin from the canvas edge (below the title), and the canvas
 *  size, both on the grid. A <Raw> block cannot be measured and does not grow the canvas. */
export function fit(flat: Flat, title: string | null, margin = CANVAS_MARGIN, subtitle: string | null = null) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const grow = (x: number, y: number) => {
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  };
  for (const ic of flat.icons) { const [x0, y0, x1, y1] = iconExtent(ic); grow(x0, y0); grow(x1, y1); }
  for (const g of flat.groups) { grow(g.x, g.y); grow(g.x + g.w, g.y + g.h); }
  for (const a of flat.arrows) for (const [x, y] of a.points) grow(x, y);
  for (const l of flat.labels) { const [x0, y0, x1, y1] = labelBox(l); grow(x0, y0); grow(x1, y1); }
  for (const s of flat.shapes) if (s.kind === "rect") { grow(s.x, s.y); grow(s.x + s.w, s.y + s.h); }
  // Nothing measurable: only <Raw> blocks, or an empty scene that edit mode asked to draw (composeScene refuses
  // one otherwise).
  if (minX === Infinity) return { dx: 0, dy: 0, width: 960, height: 600 };
  const top = margin + (title ? TITLE_BAND : 0) + (title && subtitle ? SUBTITLE_BAND : 0);
  const dx = snapUp(margin - minX), dy = snapUp(top - minY);
  const width = snapUp(Math.max(dx + maxX, title ? titleRight(title) : 0, title && subtitle ? subtitleRight(subtitle) : 0) + margin);
  return { dx, dy, width, height: snapUp(dy + maxY + margin) };
}
