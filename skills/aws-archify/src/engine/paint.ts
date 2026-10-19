// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// SVG output. The structure layer is nested <g> groups that mirror the scene (an AWS container, or an icon with its
// caption, stays one selectable shape after "convert to shapes" in PowerPoint or a vector tool); connectors and arrow
// labels are drawn above it, all inside one translated content group.
import React from "react";
import type { Pt } from "./geometry.ts";
import { CAPTION_SIZE, FONT, GROUP_LABEL_SIZE, SUBTITLE_SIZE, SUBTITLE_Y, TITLE_SIZE, TITLE_X, TITLE_Y, labelBox, linePitch } from "./text.ts";
import { GROUP_BADGE, GROUP_STYLES, SERVICE_GROUP_COLORS, groupTitleOrigin, isServiceGroup } from "./groups.ts";
import type { GroupIconModule, IconComponent } from "./elements.ts";
import type { Flat, PlacedArrow, RawItem, RectItem, RenderItem, TextItem } from "./flatten.ts";

const h = React.createElement;

/** An SVG path through `points`, each inner corner rounded with a small quadratic curve. */
function roundedPath(route: Pt[], radius = 6): string {
  // A route that ends on a zero-size <Anchor> repeats its last point. Kept, it leaves a zero-length last segment,
  // and a browser then has no direction to turn the arrowhead along (it draws it sideways).
  const points = route.filter((p, i) => i === 0 || p[0] !== route[i - 1][0] || p[1] !== route[i - 1][1]);
  if (points.length < 3) return "M " + points.map(([x, y]) => `${x} ${y}`).join(" L ");
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i + 1 < points.length; i++) {
    const [px, py] = points[i - 1], [cx, cy] = points[i], [qx, qy] = points[i + 1];
    const r = Math.min(radius, Math.hypot(cx - px, cy - py) / 2, Math.hypot(qx - cx, qy - cy) / 2);
    const enterX = cx - Math.sign(cx - px) * r, enterY = cy - Math.sign(cy - py) * r;
    const leaveX = cx + Math.sign(qx - cx) * r, leaveY = cy + Math.sign(qy - cy) * r;
    d += ` L ${enterX} ${enterY} Q ${cx} ${cy} ${leaveX} ${leaveY}`;
  }
  const [lx, ly] = points[points.length - 1];
  return d + ` L ${lx} ${ly}`;
}

/** Each arrow colour gets its own pair of arrowhead markers painted in that colour (context-stroke would draw no
 *  head at all in WebKit, Firefox, librsvg and most importers). */
const colorSlug = (color: string): string => color.replace(/[^0-9A-Za-z]/g, "") || "default";

/** The marker slug of each colour, in first-use order. Two colours whose letters and digits are the same
 *  (rgb(1,23,4) and rgb(12,3,4)) would share one marker, so the later ones get -2, -3, ...; a slug with a hyphen
 *  can never equal a plain one. */
function markerSlugs(colors: string[]): Map<string, string> {
  const slugs = new Map<string, string>();
  const uses = new Map<string, number>();
  for (const color of colors) {
    const base = colorSlug(color);
    const n = (uses.get(base) ?? 0) + 1;
    uses.set(base, n);
    slugs.set(color, n === 1 ? base : `${base}-${n}`);
  }
  return slugs;
}

/** Does the arrow move in the animated copy? Flow dashes run toward a single head, so an arrow with both heads or
 *  none stays still; a dot always travels. */
export const arrowMoves = (a: PlacedArrow): boolean =>
  a.animate === "dots" || (a.animate === "flow" && (a.head === "end" || a.head === "start"));

/** The id prefix of one icon instance: the figure's prefix plus the icon's place in the item tree (letters, digits
 *  and hyphens, so the "_" ends it). An icon whose markup points at its own ids prefixes them with it (see
 *  src/icons/runtime.js), so an icon drawn twice, or in two figures on one page, never repeats such an id. */
const iconIdPrefix = (idPrefix: string, place: string): string => `${idPrefix}${place}_`;

/** A short id prefix taken from the scene's title and laid-out content (FNV-1a), so several figures inlined in one
 *  HTML page never share a marker or flow-path id. */
export function sceneIdPrefix(title: string | null, flat: Flat): string {
  const fingerprint = JSON.stringify([
    title,
    flat.arrows.map((a) => [a.points, a.color, a.head, a.animate ?? 0]),
    flat.icons.map((ic) => [ic.x, ic.y, ic.size, ic.key]),
    flat.labels.map((l) => [l.x, l.y, l.text]),
    flat.groups.map((g) => [g.x, g.y, g.w, g.h, g.label]),
  ]);
  let hash = 0x811c9dc5;
  for (let i = 0; i < fingerprint.length; i++) { hash ^= fingerprint.charCodeAt(i); hash = Math.imul(hash, 0x01000193); }
  return `d${(hash >>> 0).toString(36)}-`;
}

/** Travelling dots move at one speed on every arrow; a short arrow's loop is kept long enough to follow. */
const DOT_SPEED = 110;
const DOT_MIN_SECONDS = 1.2;
const DOT_RADIUS = 3.5;

function polylineLength(points: Pt[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return length;
}

function arrowElement(a: PlacedArrow, key: string, idPrefix: string, motion: boolean, slug: string): React.ReactElement {
  const dots = motion && a.animate === "dots";
  const flow = motion && a.animate === "flow" && arrowMoves(a);
  const line: Record<string, unknown> = { key: "l", d: roundedPath(a.points), fill: "none", stroke: a.color, strokeWidth: 1.5, strokeLinejoin: "round" };
  // The line is the dot's motion path, so it needs an id, but only in the moving copy.
  if (dots) line.id = `${idPrefix}flow-${key}`;
  if (a.dashed) line.strokeDasharray = "5 4";
  if (a.head === "end" || a.head === "both") line.markerEnd = `url(#${idPrefix}arrow-${slug})`;
  if (a.head === "start" || a.head === "both") line.markerStart = `url(#${idPrefix}arrow-rev-${slug})`;
  if (flow) line.className = ["flow-line", a.dashed && "flow-dashed", a.head === "start" && "flow-rev"].filter(Boolean).join(" ");
  const parts: React.ReactElement[] = [h("path", line)];
  if (dots) {
    const seconds = Math.max(DOT_MIN_SECONDS, polylineLength(a.points) / DOT_SPEED);
    const track = `#${idPrefix}flow-${key}`;
    // href is SVG 2; xlink:href is what older renderers and importers read.
    parts.push(h("circle", { key: "dot", className: "flow-dot", r: DOT_RADIUS, fill: a.color },
      h("animateMotion", { key: "m", dur: `${seconds.toFixed(2)}s`, repeatCount: "indefinite", fill: "freeze" },
        h("mpath", { key: "p", href: track, xlinkHref: track }))));
  }
  return h("g", { key, "data-edit-id": a.editId }, parts);
}

/** Border, corner badge (or service square) and label of a group; its children are drawn separately. `place` is the
 *  group's key in the item tree. */
function groupChrome(g: Extract<RenderItem, { t: "group" }>, groupIcons: GroupIconModule, idPrefix: string, place: string): React.ReactElement[] {
  const origin = groupTitleOrigin(g.kind, g.box.x, g.box.y);
  if (!origin) return [];
  const style = GROUP_STYLES[g.kind] || GROUP_STYLES.generic;
  const { x, y, w, h: height } = g.box;
  const border: Record<string, unknown> = { key: "r", x, y, width: w, height, rx: 4, fill: style.fill || "none", stroke: style.border, strokeWidth: 2 };
  if (style.dashed) border.strokeDasharray = "6 4";
  const parts: React.ReactElement[] = [h("rect", border)];

  if (isServiceGroup(g.kind)) {
    if (g.icon) {
      // A white square behind the icon, so a transparent icon still reads against the border colour.
      parts.push(h("rect", { key: "sqbg", x, y, width: GROUP_BADGE, height: GROUP_BADGE, fill: "#FFFFFF" }));
      parts.push(h(g.icon, { key: "svc", x, y, width: GROUP_BADGE, height: GROUP_BADGE, idPrefix: iconIdPrefix(idPrefix, `${place}-svc`) }));
    } else {
      parts.push(h("rect", { key: "sq", x, y, width: GROUP_BADGE, height: GROUP_BADGE, fill: SERVICE_GROUP_COLORS[g.kind]! }));
    }
  } else if (style.badge) {
    // The layout report places the title from the kind alone, so a badge that is not there is a broken install,
    // not a reason to draw the title somewhere else.
    const Badge = groupIcons?.[style.badge];
    if (!Badge) throw new Error(
      `The corner badge "${style.badge}" of <Group kind="${g.kind}"> is missing from src/icons/group.js. The icon ` +
      `modules are incomplete or out of date: regenerate them (npm run icons) or reinstall the skill.`);
    parts.push(h(Badge, { key: "b", x, y, width: GROUP_BADGE, height: GROUP_BADGE, idPrefix: iconIdPrefix(idPrefix, `${place}-b`) }));
  }
  if (g.label) parts.push(h("text", { key: "t", x: origin[0], y: origin[1], fontFamily: FONT, fontSize: GROUP_LABEL_SIZE, fontWeight: "bold", fill: style.label }, g.label));
  return parts;
}

/** The dashed box drawn where a node's icon will go once one is picked (edit mode adds nodes without icons). */
function iconPlaceholder(x: number, y: number, size: number, key: string): React.ReactElement {
  return h("g", { key }, [
    h("rect", { key: "r", x, y, width: size, height: size, rx: 6, fill: "#F2F3F3", stroke: "#B6C0D0", strokeWidth: 1.5, strokeDasharray: "5 4" }),
    h("text", { key: "t", x: x + size / 2, y: y + size / 2 + CAPTION_SIZE * 0.35, textAnchor: "middle", fontFamily: FONT, fontSize: CAPTION_SIZE, fill: "#8A98AD" }, "icon"),
  ]);
}

function iconOrPlaceholder(icon: IconComponent | undefined, x: number, y: number, size: number, idPrefix: string): React.ReactElement {
  return icon ? h(icon, { key: "ic", x, y, width: size, height: size, idPrefix }) : iconPlaceholder(x, y, size, "ic");
}

function textElement(l: TextItem, key: string): React.ReactElement {
  const lines = String(l.text).split("\n");
  const parts: React.ReactElement[] = [];
  if (l.chip) {
    // An opaque strip exactly as wide as the inked text, from cap height to just below the last baseline.
    const [x0, , x1] = labelBox(l);
    const top = l.y - l.size * 0.74;
    const height = (lines.length - 1) * linePitch(l.size) + l.size * 0.94;
    parts.push(h("rect", { key: "chip", x: x0, y: top, width: x1 - x0, height, rx: 2, fill: "white", opacity: 0.95 }));
  }
  // A thin white outline painted under the glyphs lifts the text off any line it crosses.
  const halo = l.halo ? { stroke: "#FFFFFF", strokeWidth: Math.max(2, l.size * 0.28), strokeLinejoin: "round", paintOrder: "stroke" } : {};
  lines.forEach((line, i) => parts.push(h("text", {
    key: "t" + i, x: l.x, y: l.y + i * linePitch(l.size), textAnchor: l.anchor, fontFamily: l.font ?? FONT, fontSize: l.size,
    fontWeight: l.bold ? "bold" : "normal", fontStyle: l.italic ? "italic" : "normal", fill: l.color, ...halo,
  }, line)));
  return h("g", { key }, parts);
}

function shapeElement(s: RectItem | RawItem, key: string): React.ReactElement {
  if (s.kind === "rect") {
    const rect: Record<string, unknown> = { key, x: s.x, y: s.y, width: s.w, height: s.h, rx: s.rx ?? 4, fill: s.fill ?? "none", stroke: s.stroke ?? "#5A6B86", strokeWidth: s.strokeWidth ?? 2 };
    if (s.dashed) rect.strokeDasharray = "6 4";
    return h("rect", rect);
  }
  // <Raw> is SVG the scene's author wrote on purpose; inserting it as written is the element's whole job.
  return h("g", { key, dangerouslySetInnerHTML: { __html: s.svg } }); // nosemgrep
}

/** One item and its subtree. `key` is its place in the item tree ("n0-2-1"), unique in the figure. */
function itemElement(it: RenderItem, key: string, groupIcons: GroupIconModule, idPrefix: string): React.ReactElement {
  switch (it.t) {
    case "group": {
      const title = it.label ? [h("title", { key: "ti" }, it.label)] : [];
      const children = it.children.map((c, i) => itemElement(c, key + "-" + i, groupIcons, idPrefix));
      return h("g", { key, "data-name": it.label || undefined, "data-kind": it.kind, "data-edit-id": it.editId },
        [...title, ...groupChrome(it, groupIcons, idPrefix, key), ...children]);
    }
    case "node": {
      const title = it.label ? [h("title", { key: "ti" }, it.label)] : [];
      const captions = it.captions.map((c, i) =>
        h("text", { key: "c" + i, x: c.x, y: c.y, textAnchor: "middle", fontFamily: FONT, fontSize: c.size, fill: c.color }, c.text));
      return h("g", { key, "data-name": it.label || undefined, "data-edit-id": it.editId },
        [...title, iconOrPlaceholder(it.icon, it.ix, it.iy, it.size, iconIdPrefix(idPrefix, key)), ...captions]);
    }
    case "icon":
      return h("g", { key, "data-edit-id": it.editId }, iconOrPlaceholder(it.icon, it.x, it.y, it.size, iconIdPrefix(idPrefix, key)));
    case "label": return textElement(it.label, key);
    case "rect": return shapeElement(it.r, key);
    case "raw": return shapeElement({ kind: "raw", svg: it.svg }, key);
  }
}

/** Flow dashes move at 30 px/s (a 15 px or 9 px dash period every 0.5 s or 0.3 s); a reader who asked for reduced
 *  motion gets still lines and no dots. Only the moving copy carries this, so the still .svg has no <style>. */
const MOTION_CSS =
  ".flow-line{stroke-dasharray:10 5;animation:aws-flow .5s linear infinite}" +
  ".flow-line.flow-dashed{stroke-dasharray:5 4;animation-name:aws-flow-dashed;animation-duration:.3s}" +
  ".flow-rev{animation-direction:reverse}" +
  "@keyframes aws-flow{to{stroke-dashoffset:-15}}@keyframes aws-flow-dashed{to{stroke-dashoffset:-9}}" +
  "@media (prefers-reduced-motion: reduce){.flow-dot{display:none}.flow-line{animation:none;stroke-dasharray:none}.flow-line.flow-dashed{stroke-dasharray:5 4}}";

/** An open chevron with a 60° apex: each barb rises 4·tan(30°) = 2.3094 over a run of 4. */
function arrowheadMarkers(color: string, slug: string, idPrefix: string): React.ReactElement[] {
  const chevron = (d: string) => h("path", { d, fill: "none", stroke: color, strokeWidth: 1, strokeLinecap: "round", strokeLinejoin: "round" });
  const marker = (key: string, id: string, refX: number, d: string) =>
    h("marker", { key, id, markerWidth: 9, markerHeight: 9, refX, refY: 3, orient: "auto", markerUnits: "strokeWidth" }, chevron(d));
  return [
    marker(`a-${slug}`, `${idPrefix}arrow-${slug}`, 5, "M1,0.6906 L5,3 L1,5.3094"),
    marker(`b-${slug}`, `${idPrefix}arrow-rev-${slug}`, 1, "M5,0.6906 L1,3 L5,5.3094"),
  ];
}

export interface SceneSvgProps {
  flat: Flat; items: RenderItem[]; dx: number; dy: number; width: number; height: number;
  title: string | null; subtitle?: string | null; groupIcons: GroupIconModule;
  /** Prepended to every id the figure defines and references (see sceneIdPrefix). */
  idPrefix?: string;
  poster?: boolean;
  /** Draw the arrows' `animate` motion. Off for the still .svg and .png; the moving copy is rendered separately. */
  motion?: boolean;
}

export function SceneSvg({ flat, items, dx, dy, width, height, title, subtitle = null, groupIcons, idPrefix = "", poster = false, motion = false }: SceneSvgProps) {
  const colors = Array.from(new Set(flat.arrows.map((a) => a.color)));
  const slugs = markerSlugs(colors);
  const defs = h("defs", { key: "defs" }, colors.flatMap((color) => arrowheadMarkers(color, slugs.get(color)!, idPrefix)));
  const content = h("g", { key: "content", transform: `translate(${dx} ${dy})` }, [
    ...items.map((it, i) => itemElement(it, "n" + i, groupIcons, idPrefix)),
    h("g", { key: "arrows", "data-name": "connectors" }, flat.arrows.map((a, i) => arrowElement(a, "a" + i, idPrefix, motion, slugs.get(a.color)!))),
    h("g", { key: "arrow-labels", "data-name": "arrow-labels" },
      flat.arrowLabels.map((l, i) => h("g", { key: "al" + i, "data-edit-id": l.editId }, textElement(l, "l" + i)))),
  ]);
  const parts = [
    defs,
    motion && flat.arrows.some(arrowMoves) ? h("style", { key: "style" }, MOTION_CSS) : null,
    h("rect", { key: "bg", x: 0, y: 0, width, height, fill: "#FFFFFF" }),
    title ? h("text", { key: "title", x: TITLE_X, y: TITLE_Y, fontFamily: FONT, fontSize: TITLE_SIZE, fontWeight: "bold", fill: "#232F3E" }, title) : null,
    title && subtitle ? h("text", { key: "subtitle", x: TITLE_X, y: SUBTITLE_Y, fontFamily: FONT, fontSize: SUBTITLE_SIZE, fill: "#545B64" }, subtitle) : null,
    content,
  ];
  return h("svg", { xmlns: "http://www.w3.org/2000/svg", xmlnsXlink: "http://www.w3.org/1999/xlink", width, height, viewBox: `0 0 ${width} ${height}`, ...(poster ? { "data-poster": "true" } : {}) },
    parts.filter(Boolean));
}
