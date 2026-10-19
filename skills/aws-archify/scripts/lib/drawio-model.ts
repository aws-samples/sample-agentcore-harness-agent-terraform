// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// The editable draw.io (diagrams.net) model of a composed scene. It is written as <name>.drawio and also embedded in
// the SVG's `content` attribute: draw.io rebuilds the diagram from that model on import, so one .svg is both an
// image and an editable diagram.
//
// The model uses the renderer's own assets, not draw.io's AWS shape library: icons are image vertices carrying the
// official icon SVG as a data URI, groups are container rectangles in their border colour, arrows are orthogonal
// edges whose waypoints are our polyline's corners, and arrow labels are edge labels, so they follow the line when
// draw.io re-routes it. Children of a container use coordinates relative to it, as draw.io requires.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Composed, GroupIconModule, GroupKind, GroupStyle } from "../../src/engine.tsx";

type Pt = [number, number];
type Box = { x: number; y: number; w: number; h: number };

const escapeAttr = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A standalone SVG data URI for an icon or badge component. mxGraph styles are `;`-separated, so the comma form
 *  with percent-encoding is used (as draw.io itself writes it): it leaves no `;`, `=` or `"` in the value. */
function svgDataUri(component: React.ComponentType<any>, size: number): string {
  let markup = renderToStaticMarkup(React.createElement(component, { width: size, height: size }));
  if (!/xmlns=/.test(markup)) markup = markup.replace(/^<svg\b/, '<svg xmlns="http://www.w3.org/2000/svg"');
  return `data:image/svg+xml,${encodeURIComponent(markup)}`;
}

/** Arrow ends sit ARROW_GAP off an icon edge; this much slack still counts as attached. */
const ATTACH_SLACK = 12;
const touches = ([x, y]: Pt, b: Box): boolean =>
  x >= b.x - ATTACH_SLACK && x <= b.x + b.w + ATTACH_SLACK && y >= b.y - ATTACH_SLACK && y <= b.y + b.h + ATTACH_SLACK;

interface EdgeRecord { id: string; points: Pt[] }

/** The closest point on any of `edges` to (px, py): which edge, how far along it (0..1) and the signed
 *  perpendicular distance (negative = left of / above the direction of travel). */
function nearestOnEdges(px: number, py: number, edges: EdgeRecord[]): { edgeId: string; along: number; side: number } | null {
  let best: { edgeId: string; along: number; side: number; d2: number } | null = null;
  for (const edge of edges) {
    const pts = edge.points;
    const lengths: number[] = [];
    let total = 0;
    for (let i = 0; i + 1 < pts.length; i++) {
      const length = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
      lengths.push(length); total += length;
    }
    if (total === 0) continue;
    let travelled = 0;
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const ux = bx - ax, uy = by - ay, length = lengths[i];
      if (length === 0) continue;
      const t = Math.max(0, Math.min(1, ((px - ax) * ux + (py - ay) * uy) / (length * length)));
      const cx = ax + t * ux, cy = ay + t * uy;
      const d2 = (px - cx) ** 2 + (py - cy) ** 2;
      if (!best || d2 < best.d2) best = { edgeId: edge.id, along: (travelled + t * length) / total, side: (ux * (py - ay) - uy * (px - ax)) / length, d2 };
      travelled += length;
    }
  }
  return best ? { edgeId: best.edgeId, along: best.along, side: best.side } : null;
}

export interface DrawioOptions {
  groupStyles: Record<GroupKind, GroupStyle>;
  /** The src/icons/group.js module the scene was rendered with, for the corner badges. */
  groupIcons: GroupIconModule;
}

export function buildDrawioModel(composed: Composed, opts: DrawioOptions): string {
  const { flat, dx, dy } = composed;
  const onPage = <T extends { x: number; y: number }>(o: T): T => ({ ...o, x: o.x + dx, y: o.y + dy });
  const cells: string[] = [];
  let counter = 0;
  const nextId = () => `c${++counter}`;

  // A cell nests in the smallest container that already holds it, so draw.io grouping mirrors the figure.
  const containers: { id: string; box: Box }[] = [];
  const area = (b: Box) => b.w * b.h;
  const holds = (outer: Box, inner: Box) =>
    inner.x >= outer.x - 0.5 && inner.y >= outer.y - 0.5 && inner.x + inner.w <= outer.x + outer.w + 0.5 && inner.y + inner.h <= outer.y + outer.h + 0.5;
  const parentOf = (box: Box): { id: string; x: number; y: number } => {
    let best: { id: string; box: Box } | null = null;
    for (const c of containers) if (holds(c.box, box) && (!best || area(c.box) < area(best.box))) best = c;
    return best ? { id: best.id, x: best.box.x, y: best.box.y } : { id: "1", x: 0, y: 0 };
  };
  const vertex = (id: string, value: string | null, style: string, parent: string, b: Box) =>
    `<mxCell id="${id}"${value == null ? "" : ` value="${value}"`} style="${style}" vertex="1" parent="${parent}">` +
    `<mxGeometry x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" as="geometry"/></mxCell>`;

  // Groups first, largest first, so a group can nest inside a bigger one. A borderless group draws nothing.
  const groups = flat.groups.map(onPage).map((g) => ({ ...g, box: { x: g.x, y: g.y, w: g.w, h: g.h } }));
  for (const g of [...groups].sort((a, b) => area(b.box) - area(a.box))) {
    if (g.kind === "borderless") continue;
    const id = nextId();
    const parent = parentOf(g.box);
    // The same fallback the SVG uses for an unknown kind.
    const style = opts.groupStyles[g.kind] ?? opts.groupStyles.generic;
    cells.push(vertex(id, escapeAttr(g.label || ""),
      `rounded=1;absoluteArcSize=1;arcSize=8;html=1;strokeColor=${style.border};fillColor=none;` +
      `dashed=${style.dashed ? 1 : 0};verticalAlign=top;align=left;spacingLeft=40;spacingTop=4;` +
      `fontColor=${style.border};fontSize=13;fontStyle=1;container=1;collapsible=0;`,
      parent.id, { x: g.x - parent.x, y: g.y - parent.y, w: g.w, h: g.h }));
    containers.push({ id, box: g.box });
    const Badge = style.badge && opts.groupIcons ? opts.groupIcons[style.badge] : null;
    if (Badge)
      cells.push(vertex(nextId(), null, escapeAttr(`shape=image;imageAspect=1;aspect=fixed;image=${svgDataUri(Badge, 28)}`), id, { x: 0, y: 0, w: 28, h: 28 }));
  }

  const iconCells: { id: string; box: Box }[] = [];
  for (const ic of flat.icons.map(onPage)) {
    if (!ic.icon) continue;
    const id = nextId();
    const box = { x: ic.x, y: ic.y, w: ic.size, h: ic.size };
    const parent = parentOf(box);
    // image= goes last: its encoded value has no ';', so the style needs no trailing one.
    const style = `shape=image;verticalLabelPosition=bottom;verticalAlign=top;imageAspect=1;aspect=fixed;image=${svgDataUri(ic.icon, 80)}`;
    cells.push(vertex(id, escapeAttr(ic.key || ""), escapeAttr(style), parent.id, { ...box, x: box.x - parent.x, y: box.y - parent.y }));
    iconCells.push({ id, box });
  }

  // Arrows as orthogonal edges: draw.io's own router threads our corners as waypoints, so an edge re-routes like a
  // hand-drawn one when a node moves. `edgeOfArrow[i]` is the edge made from flat.arrows[i], if any.
  const edgeOfArrow: (EdgeRecord | undefined)[] = [];
  const edges: EdgeRecord[] = [];
  for (const a of flat.arrows) {
    const points = a.points.map((p) => [p[0] + dx, p[1] + dy] as Pt);
    if (points.length < 2) { edgeOfArrow.push(undefined); continue; }
    const first = points[0], last = points[points.length - 1];
    const source = iconCells.find((c) => touches(first, c.box));
    const target = iconCells.find((c) => touches(last, c.box));
    const id = nextId();
    const style =
      `edgeStyle=orthogonalEdgeStyle;html=1;rounded=1;arcSize=6;jettySize=auto;` +
      `startArrow=${a.head === "both" || a.head === "start" ? "open" : "none"};startFill=0;endArrow=${a.head === "none" ? "none" : "open"};endFill=0;endSize=8;startSize=8;` +
      `strokeColor=${a.color};strokeWidth=1.5;dashed=${a.dashed ? 1 : 0};` +
      // draw.io animates from source to target, so only an end-headed arrow gets its flow animation.
      (a.animate === "flow" && a.head === "end" ? "flowAnimation=1;" : "");
    const waypoints = points.slice(1, -1).map(([x, y]) => `<mxPoint x="${x}" y="${y}"/>`).join("");
    // An end that matched no icon keeps its exact point.
    const loose = (source ? "" : `<mxPoint x="${first[0]}" y="${first[1]}" as="sourcePoint"/>`) +
      (target ? "" : `<mxPoint x="${last[0]}" y="${last[1]}" as="targetPoint"/>`);
    cells.push(
      `<mxCell id="${id}" style="${style}" edge="1" parent="1"${source ? ` source="${source.id}"` : ""}${target ? ` target="${target.id}"` : ""}>` +
      `<mxGeometry relative="1" as="geometry">${loose}${waypoints ? `<Array as="points">${waypoints}</Array>` : ""}</mxGeometry></mxCell>`);
    const record = { id, points };
    edges.push(record);
    edgeOfArrow.push(record);
  }

  // Arrow labels as edge-label children of their own arrow's edge: x in [-1, 1] is the position along the edge (from
  // the engine's start/middle/end, robust to re-routing), y a perpendicular offset on the side the engine chose.
  for (const raw of flat.arrowLabels) {
    const l = onPage(raw);
    if (!l.text) continue;
    const id = nextId();
    const own = raw.arrowIndex != null ? edgeOfArrow[raw.arrowIndex] : undefined;
    const probeY = l.y - l.size * 0.3;
    const edgeId = own ? own.id : nearestOnEdges(l.x, probeY, edges)?.edgeId;
    const font = `fontColor=${l.color};fontSize=${l.size}${l.bold ? ";fontStyle=1" : ""};`;
    if (edgeId) {
      const projected = nearestOnEdges(l.x, probeY, own ? [own] : edges);
      const along = raw.at === "start" ? 0.25 : raw.at === "end" ? 0.75 : 0.5;
      const x = Math.max(-0.9, Math.min(0.9, 2 * along - 1));
      const side = projected && projected.side !== 0 ? Math.sign(projected.side) : -1;
      const offset = side * (l.size * 0.5 + 6);
      // A half-transparent white box behind fully opaque text (labelBackgroundColor has no opacity).
      const style = `edgeLabel;html=1;align=center;verticalAlign=middle;resizable=0;rounded=1;arcSize=40;` +
        `fillColor=#FFFFFF;opacity=50;strokeColor=none;textOpacity=100;spacingLeft=1;spacingRight=1;spacingTop=0;spacingBottom=0;` + font;
      cells.push(
        `<mxCell id="${id}" value="${escapeAttr(l.text)}" style="${style}" connectable="0" vertex="1" parent="${edgeId}">` +
        `<mxGeometry x="${x.toFixed(3)}" y="${Math.round(offset)}" relative="1" as="geometry"><mxPoint as="offset"/></mxGeometry></mxCell>`);
      continue;
    }
    // No edge to ride (a degenerate arrow and no other edges): an absolutely placed text chip.
    const align = l.anchor === "start" ? "left" : l.anchor === "end" ? "right" : "center";
    const lines = l.text.split("\n");
    const w = Math.max(24, Math.max(...lines.map((s: string) => s.length)) * l.size * 0.6 + 4);
    const top = l.y - l.size * 0.74;
    const height = (lines.length - 1) * (l.size + 2) + l.size * 0.94;
    const left = align === "left" ? l.x : align === "right" ? l.x - w : l.x - w / 2;
    const style = `text;html=1;strokeColor=none;fillColor=#FFFFFF;align=${align};verticalAlign=middle;` +
      `spacingLeft=2;spacingRight=2;spacingTop=0;spacingBottom=0;` + font;
    cells.push(vertex(id, escapeAttr(l.text), style, "1", { x: left, y: top, w, h: height }));
  }

  const { width, height } = composed;
  const model =
    `<mxGraphModel dx="${width}" dy="${height}" grid="1" gridSize="8" guides="1" ` +
    `tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" ` +
    `pageWidth="${width}" pageHeight="${height}" math="0" shadow="0">` +
    `<root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells.join("")}</root></mxGraphModel>`;
  return `<mxfile host="app.diagrams.net" type="device"><diagram name="Page-1" id="aws-arch-diagram">${model}</diagram></mxfile>`;
}

/** Puts the model into the root <svg>'s `content` attribute and prepends the prolog draw.io writes. */
export function injectDrawioContent(svg: string, mxfile: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!-- Do not edit this file with editors other than draw.io -->\n` +
    svg.replace(/^<svg\b/, `<svg content="${escapeAttr(mxfile)}"`);
}
