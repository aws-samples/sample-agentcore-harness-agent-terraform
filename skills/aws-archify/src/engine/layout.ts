// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// From the scene's React tree to positioned boxes: build a layout tree, measure it bottom-up, place it top-down.
import React from "react";
import {
  DEFAULT_GAP, GRID, ICON_SIZE, cell, requireGrid, snap, snapUp, type Align, type LayoutDir, type Size,
} from "./geometry.ts";
import { CAPTION_GAP, CAPTION_LINE, CAPTION_SIZE, GROUP_LABEL_SIZE, SUB_CAPTION_SIZE, textWidth } from "./text.ts";
import { GROUP_BADGE, GROUP_PAD, groupBand, groupInsets, isServiceGroup } from "./groups.ts";
import { ELEMENT_KIND, NUMBERED_STEPS_ERROR } from "./elements.ts";

/** One scene element in the layout tree. `kind` is the element's tag ("node", "group", "row" for an HStack, ...). */
export interface LayoutNode {
  kind: string;
  props: any;
  children: LayoutNode[];
  /** Measured outer size. */
  size: Size;
  /** Width of the measured content inside the padding; placement reuses it to centre a label-widened group. */
  contentW: number;
  /** Top-left corner, absolute, set by place(). */
  x: number; y: number;
  /** Placed by its own x/y instead of by its parent's flow. */
  absolute: boolean;
}

const CONTAINER_KINDS = new Set(["diagram", "row", "col", "grid", "zstack", "free", "group"]);
const TAG_NAMES: Record<string, string> = { row: "HStack", col: "VStack", badge: "StepBadge" };

/** The JSX tag an author wrote for a kind, for error messages. */
const tagName = (kind: string): string => TAG_NAMES[kind] ?? kind[0].toUpperCase() + kind.slice(1);

/** How an error names a container: `<Group "VPC">`, `<Grid>`. */
function describeNode(n: LayoutNode): string {
  const owner = n.props.label ?? n.props.id;
  return `<${tagName(n.kind)}${owner ? ` "${owner}"` : ""}>`;
}

const firstLabelLine = (label: unknown): string => JSON.stringify(String(label).split("\n")[0]);

export function newLayoutNode(kind: string, props: any, children: LayoutNode[]): LayoutNode {
  return { kind, props, children, size: { w: 0, h: 0 }, contentW: 0, x: 0, y: 0, absolute: props.x != null || props.y != null };
}

/** React children -> layout nodes. Fragments and unknown wrapper components are transparent: their children are
 *  read in their place (a wrapper component is never called). */
export function buildLayoutTree(children: React.ReactNode): LayoutNode[] {
  const nodes: LayoutNode[] = [];
  React.Children.forEach(children, (child: any) => {
    if (child == null || typeof child !== "object") return;
    if (child.type === React.Fragment) { nodes.push(...buildLayoutTree(child.props?.children)); return; }
    const kind = (child.type && child.type[ELEMENT_KIND]) || null;
    if (!kind) {
      if (child.props?.children) nodes.push(...buildLayoutTree(child.props.children));
      return;
    }
    const props = child.props || {};
    nodes.push(newLayoutNode(kind, props, buildLayoutTree(props.children)));
  });
  return nodes;
}

/** Refuses an `icon` prop that is present but not a component (a mistyped namespace access, a bad lookup), which
 *  would otherwise render as a blank placeholder. Leaving the prop out is the deliberate placeholder. */
export function requireRealIcons(nodes: LayoutNode[]): void {
  for (const n of nodes) {
    if ((n.kind === "node" || n.kind === "icon" || n.kind === "group") && "icon" in n.props && typeof n.props.icon !== "function") {
      const who = n.props.id ? `id="${n.props.id}"` : n.props.label ? `label=${firstLabelLine(n.props.label)}` : `<${n.kind}>`;
      const got = n.props.icon === undefined ? "undefined" : n.props.icon === null ? "null" : typeof n.props.icon;
      throw new Error(
        `<${tagName(n.kind)} ${who}> has icon={${got}} — not a real icon component. ` +
        `This is usually a typo'd or missing import (e.g. a namespace access like Svc.WrongName, or a bad lookup). ` +
        `Import the exact export name from src/icons/*.js (use scripts/find-icon.ts to look it up), or omit the icon prop entirely to draw an intentional placeholder.`,
      );
    }
    if (n.children.length) requireRealIcons(n.children);
  }
}

/** A child as its container lays it out, with the offset of any `<Move>` it sits in. A Move is not a container:
 *  its children take ordinary slots in the Move's parent and are shifted afterwards. */
interface Slot { node: LayoutNode; dx: number; dy: number }

function slotsOf(children: LayoutNode[], dx = 0, dy = 0): Slot[] {
  const slots: Slot[] = [];
  for (const child of children) {
    if (child.kind === "move") {
      slots.push(...slotsOf(child.children, dx + (requireGrid(child.props.dx, "<Move> dx") ?? 0), dy + (requireGrid(child.props.dy, "<Move> dy") ?? 0)));
    } else slots.push({ node: child, dx, dy });
  }
  return slots;
}

const takesFlowSpace = (n: LayoutNode): boolean => !n.absolute && n.kind !== "arrow" && n.size.w + n.size.h > 0;

const LAYOUTS: readonly LayoutDir[] = ["row", "col", "grid", "zstack", "free"];

function directionOf(n: LayoutNode): LayoutDir {
  switch (n.kind) {
    case "group": case "diagram": {
      // Checked here, before anything is laid out: an unknown value would otherwise behave as "free" and fail on
      // the first child without x/y, naming the wrong cause.
      const layout = n.props.layout ?? "row";
      if (!LAYOUTS.includes(layout))
        throw new Error(
          `${describeNode(n)} has layout=${JSON.stringify(layout)}, which is not a layout. Use one of ` +
          `${LAYOUTS.map((l) => `"${l}"`).join(", ")}${layout === "column" ? ` (a column is "col")` : ""}.`,
        );
      return layout;
    }
    case "row": case "col": case "grid": case "zstack": return n.kind;
    default: return "free";
  }
}

/** Column count of a grid container. Required once two children flow in it: a silent default of one column
 *  would stack them, a layout nobody asked for that no check would flag. */
function gridColumns(n: LayoutNode, flowCount: number): number {
  const cols = n.props.cols | 0;
  if (cols > 0) return cols;
  if (flowCount > 1)
    throw new Error(
      `${describeNode(n)} lays out its children as "grid" but has no cols={…}. A grid needs its ` +
      `column count: without one the ${flowCount} children would be stacked in ONE column. ` +
      `Add cols={…}, or lay the container out as a row/col instead.`,
    );
  return 1;
}

const maxOf = (values: number[]): number => Math.max(0, ...values);
const sumOf = (values: number[]): number => values.reduce((total, v) => total + v, 0);

/** Bottom-up sizes, snapped up to whole grid cells. A Move offset is not counted: a parent sizes as if the Move
 *  were not there. */
export function measure(n: LayoutNode): Size {
  switch (n.kind) {
    case "icon": {
      const s = requireGrid(n.props.size, "<Icon> size") ?? ICON_SIZE;
      return (n.size = { w: s, h: s });
    }
    case "node": {
      const s = requireGrid(n.props.size, "<Node> size") ?? ICON_SIZE;
      const label = n.props.label;
      const lineCount = label ? String(label).split("\n").length : 0;
      const sub = n.props.sub;
      const captionW = Math.max(lineCount ? textWidth(label, CAPTION_SIZE) : 0, sub ? textWidth(sub, SUB_CAPTION_SIZE) : 0);
      let captionH = 0;
      if (lineCount) captionH += lineCount * CAPTION_LINE;
      if (sub) captionH += CAPTION_LINE;
      return (n.size = { w: snapUp(Math.max(s, captionW)), h: snapUp(s + (captionH ? CAPTION_GAP + captionH : 0)) });
    }
    case "label": {
      // The label reserves [x, x + w]; its anchor only decides where the glyphs sit inside that box.
      const size = n.props.size ?? CAPTION_SIZE;
      return (n.size = { w: snapUp(textWidth(String(n.props.children ?? ""), size)), h: snapUp(size + 4) });
    }
    case "spacer": {
      const s = requireGrid(n.props.size, "<Spacer> size") ?? DEFAULT_GAP;
      return (n.size = { w: s, h: s });
    }
    case "badge": throw new Error(NUMBERED_STEPS_ERROR);
    case "rect": return (n.size = { w: requireGrid(n.props.w, "<Rect> w")!, h: requireGrid(n.props.h, "<Rect> h")! });
    case "anchor": case "arrow": case "raw": return (n.size = { w: 0, h: 0 });
  }

  const kids = slotsOf(n.children).map((slot) => { slot.node.size = measure(slot.node); return slot.node; });
  const flow = kids.filter(takesFlowSpace);
  const gap = requireGrid(n.props.gap, `<${n.kind}> gap`) ?? DEFAULT_GAP;
  const widths = flow.map((c) => c.size.w), heights = flow.map((c) => c.size.h);
  const content: Size = { w: 0, h: 0 };
  const dir = directionOf(n);
  if (dir === "row") {
    content.w = sumOf(widths) + gap * Math.max(0, flow.length - 1);
    content.h = maxOf(heights);
  } else if (dir === "col") {
    content.h = sumOf(heights) + gap * Math.max(0, flow.length - 1);
    content.w = maxOf(widths);
  } else if (dir === "grid") {
    const cols = gridColumns(n, flow.length);
    const rows = Math.ceil(flow.length / cols);
    content.w = cols * maxOf(widths) + gap * (cols - 1);
    content.h = rows * maxOf(heights) + gap * (rows - 1);
  } else if (dir === "zstack") {
    content.w = maxOf(widths);
    content.h = maxOf(heights);
  } else {
    // free: the bounding box of the children's own positions (an unknown layout has already thrown)
    for (const c of kids) {
      content.w = Math.max(content.w, (requireGrid(c.props.x, "x") ?? 0) + c.size.w);
      content.h = Math.max(content.h, (requireGrid(c.props.y, "y") ?? 0) + c.size.h);
    }
  }
  n.contentW = content.w;

  if (n.kind === "group" && n.props.kind === "borderless") {
    const p = groupInsets(n.props, 0);
    n.size = { w: snapUp(content.w + p.left + p.right), h: snapUp(content.h + p.top + p.bottom) };
  } else if (n.kind === "group") {
    const p = groupInsets(n.props, GROUP_PAD);
    // The box must also fit its own label: badge (or service square) + bold text + a little slack.
    const label = String(n.props.label ?? "");
    const badgeW = isServiceGroup(n.props.kind) ? GROUP_BADGE + cell(1) : cell(5);
    const labelW = label ? badgeW + textWidth(label, GROUP_LABEL_SIZE) + cell(1) : 0;
    n.size = { w: snapUp(Math.max(content.w + p.left + p.right, labelW)), h: snapUp(content.h + p.top + p.bottom + groupBand(n.props.kind)) };
  } else {
    const pad = requireGrid(n.props.pad, `<${n.kind}> pad`) ?? 0;
    n.size = { w: snapUp(content.w + pad * 2), h: snapUp(content.h + pad * 2) };
  }
  return n.size;
}

/** Top-down absolute positions; (x, y) is the node's top-left corner. */
export function place(n: LayoutNode, x: number, y: number): void {
  // A group draws a border and badge, so its absolute corner is snapped to the grid here. Its parent may have
  // centred it on a half cell (sibling icons share a centre line that way), and only the absolute value can fix
  // an offset inherited from further up.
  if (n.kind === "group") { x = snap(x); y = snap(y); }
  n.x = x; n.y = y;
  if (!CONTAINER_KINDS.has(n.kind)) return;

  const dir = directionOf(n);
  const gap = n.props.gap ?? DEFAULT_GAP;
  // Rows inside the figure align their children's tops so icons share a line and longer captions grow downward;
  // the diagram's own row and every other direction centre on the cross axis.
  const align: Align = n.props.align ?? (dir === "row" && n.kind !== "diagram" ? "start" : "center");

  let left = x, top = y, innerW = n.size.w, innerH = n.size.h;
  if (n.kind === "group" && n.props.kind === "borderless") {
    const p = groupInsets(n.props, 0);
    left = x + p.left; top = y + p.top;
    innerW = n.size.w - p.left - p.right; innerH = n.size.h - p.top - p.bottom;
  } else if (n.kind === "group") {
    const p = groupInsets(n.props, GROUP_PAD);
    // A label wider than the content leaves slack; centre the content in it. The width is the one measure() sized
    // the box from, so an all-absolute group (no flow width) is not pushed out of its own box.
    const slack = Math.max(0, n.size.w - p.left - p.right - n.contentW);
    const band = groupBand(n.props.kind);
    left = x + p.left + snap(slack / 2); top = y + band + p.top;
    innerW = n.size.w - p.left - p.right - slack; innerH = n.size.h - p.top - p.bottom - band;
  } else if (n.kind !== "diagram") {
    const pad = n.props.pad ?? 0;
    left = x + pad; top = y + pad;
    innerW = n.size.w - pad * 2; innerH = n.size.h - pad * 2;
  }

  const slots = slotsOf(n.children);
  const flow = slots.filter((s) => takesFlowSpace(s.node));
  for (const s of slots)
    if (s.node.absolute)
      place(s.node, left + (requireGrid(s.node.props.x, "x") ?? 0) + s.dx, top + (requireGrid(s.node.props.y, "y") ?? 0) + s.dy);

  // Offsets from centring stay unsnapped: snapping each sibling separately would split a shared centre line
  // whenever two boxes differ in width by an odd number of cells.
  const along = (base: number, extent: number, size: number): number =>
    base + (align === "start" ? 0 : align === "end" ? extent - size : (extent - size) / 2);
  // A node's icon sits at the top of its box and the caption hangs below, so cross-axis alignment uses the icon
  // height: nodes with different caption lengths keep their icons on one line.
  const iconBand = (c: LayoutNode): number => (c.kind === "node" || c.kind === "icon" ? (c.props.size ?? ICON_SIZE) : c.size.h);

  if (dir === "row") {
    const band = maxOf(flow.map((s) => iconBand(s.node)));
    let cursor = left;
    for (const s of flow) {
      place(s.node, cursor + s.dx, along(top, band, iconBand(s.node)) + s.dy);
      cursor += s.node.size.w + gap;
    }
  } else if (dir === "col") {
    let cursor = top;
    for (const s of flow) {
      place(s.node, along(left, innerW, s.node.size.w) + s.dx, cursor + s.dy);
      cursor += s.node.size.h + gap;
    }
  } else if (dir === "grid") {
    const cols = gridColumns(n, flow.length);
    const cellW = maxOf(flow.map((s) => s.node.size.w));
    const cellH = maxOf(flow.map((s) => s.node.size.h));
    const band = maxOf(flow.map((s) => iconBand(s.node)));
    flow.forEach((s, i) => {
      const cellX = left + (i % cols) * (cellW + gap), cellY = top + Math.floor(i / cols) * (cellH + gap);
      place(s.node, along(cellX, cellW, s.node.size.w) + s.dx, along(cellY, band, iconBand(s.node)) + s.dy);
    });
  } else if (dir === "zstack") {
    for (const s of flow) place(s.node, along(left, innerW, s.node.size.w) + s.dx, along(top, innerH, s.node.size.h) + s.dy);
  } else if (flow.length) {
    // A free container places only children with x/y; any other child would be drawn at the layout origin.
    const kid = flow[0].node;
    const which = kid.props.id ? ` id="${kid.props.id}"` : kid.props.label ? ` label=${firstLabelLine(kid.props.label)}` : "";
    throw new Error(
      `${describeNode(n)} lays out its children as "free", but its child ` +
      `<${tagName(kid.kind)}${which}> has no x/y. A free container positions ONLY children that carry ` +
      `x and/or y — it has no flow, so this child would be drawn at the origin, on top of its siblings. ` +
      `Give it x={} / y={} (multiples of ${GRID}, relative to the container's content box), or lay the ` +
      `container out as a row/col/grid/zstack instead.`,
    );
  }
}

/** Every group must have landed on the grid (place() snaps them); a miss is an engine bug, not a scene error. */
export function checkGroupsOnGrid(n: LayoutNode): void {
  if (n.kind === "group" && (n.x % GRID !== 0 || n.y % GRID !== 0))
    throw new Error(
      `Layout produced an off-${GRID}px-grid position for ${describeNode(n)}: ` +
      `x=${n.x}, y=${n.y}. This is an engine layout bug (a computed coordinate wasn't snapped) — please report it.`,
    );
  for (const c of n.children) checkGroupsOnGrid(c);
}
