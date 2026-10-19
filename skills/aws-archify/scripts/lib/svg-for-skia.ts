// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// Rewrites an SVG so that Skia's SVG module draws it the way a browser does.
//
// Skia ignores three features the renderers use, so the text is changed before it is rasterised:
//   - Markers (marker, marker-start, marker-mid, marker-end). Each reference becomes a copy of the marker's
//     content, moved to its vertex and turned with it: orient auto, auto-start-reverse or an angle, the
//     marker viewBox with preserveAspectRatio, refX/refY and markerUnits are honoured, and context-stroke,
//     context-fill and currentColor take the referencing element's paint. Vertices and directions come from
//     <line>, <polyline>, <polygon> and <path> (M L H V Q T C S A Z, absolute and relative; an arc points
//     along its chord). The marker's viewport clip is not applied.
//   - paint-order that puts the stroke under the fill. The element is drawn twice: stroke only, then fill only.
//   - font-family lists. Skia tries only the first family and drops bold and italic when it is missing, so
//     the list is cut down to the first family that is installed.
// Nested <svg> elements (the icons) pass through as text, and so does everything the rewrite leaves alone.
import { GlobalFonts } from "@napi-rs/canvas";

// ---------- a small XML tree that keeps its source text ----------

interface Attribute {
  name: string;
  value: string; // as written in the source, entities still encoded
  quote: string;
}

interface XmlElement {
  kind: "element";
  tag: string;
  attributes: Attribute[];
  children: XmlNode[];
  selfClosing: boolean;
  startTag: string; // the start tag as read, written back unchanged until the element is edited
  edited: boolean;
  parent: XmlElement | null;
}

// Character data, comments, CDATA, declarations and nested <svg> blocks, copied out exactly as read.
interface Verbatim {
  kind: "verbatim";
  text: string;
}

type XmlNode = XmlElement | Verbatim;

export interface SvgDocument {
  children: XmlNode[];
}

type Container = SvgDocument | XmlElement;

const LEXEME = new RegExp(
  [
    String.raw`<!--[\s\S]*?-->`,
    String.raw`<!\[CDATA\[[\s\S]*?\]\]>`,
    String.raw`<\?[\s\S]*?\?>`,
    String.raw`<![^>]*>`,
    String.raw`</?[A-Za-z][^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>`, // a tag: a quoted value may hold ">"
    String.raw`[^<]+`,
    "<",
  ].join("|"),
  "g",
);
const ATTRIBUTE = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const SELF_CLOSING = /\/\s*>$/;

function readStartTag(lexeme: string): { tag: string; attributes: Attribute[]; selfClosing: boolean } {
  const tag = /^<([^\s/>]+)/.exec(lexeme)![1];
  const attributes: Attribute[] = [];
  for (const [, name, doubleQuoted, singleQuoted] of lexeme.slice(tag.length + 1).matchAll(ATTRIBUTE)) {
    const isDouble = doubleQuoted !== undefined;
    attributes.push({ name, value: isDouble ? doubleQuoted : singleQuoted, quote: isDouble ? '"' : "'" });
  }
  return { tag, attributes, selfClosing: SELF_CLOSING.test(lexeme) };
}

// Index of the lexeme that closes the nested <svg> opened at `open`, or of the last lexeme if none does.
function nestedSvgEnd(lexemes: string[], open: number): number {
  let depth = 1;
  let at = open;
  while (depth > 0 && ++at < lexemes.length) {
    const lexeme = lexemes[at];
    if (/^<svg[\s>]/.test(lexeme) && !SELF_CLOSING.test(lexeme)) depth++;
    else if (/^<\/svg\s*>$/.test(lexeme)) depth--;
  }
  return Math.min(at, lexemes.length - 1);
}

export function parseSvg(source: string): SvgDocument {
  const doc: SvgDocument = { children: [] };
  const lexemes = source.match(LEXEME) ?? [];
  let open: XmlElement | null = null;
  let svgDepth = 0;
  for (let at = 0; at < lexemes.length; at++) {
    const lexeme = lexemes[at];
    const siblings = (open ?? doc).children;
    if (lexeme.startsWith("</")) {
      // An end tag closes the open element only when the names agree; any other is dropped.
      const tag = lexeme.slice(2, -1).trim();
      if (tag === "svg") svgDepth--;
      if (open && open.tag === tag) open = open.parent;
      continue;
    }
    if (!/^<[A-Za-z]/.test(lexeme)) {
      siblings.push({ kind: "verbatim", text: lexeme });
      continue;
    }
    const { tag, attributes, selfClosing } = readStartTag(lexeme);
    if (tag === "svg" && svgDepth >= 1 && !selfClosing) {
      // An icon. It stays text, with any markers or paint-order inside it.
      const end = nestedSvgEnd(lexemes, at);
      siblings.push({ kind: "verbatim", text: lexemes.slice(at, end + 1).join("") });
      at = end;
      continue;
    }
    const element: XmlElement = {
      kind: "element", tag, attributes, children: [], selfClosing, startTag: lexeme, edited: false, parent: open,
    };
    siblings.push(element);
    if (!selfClosing) {
      if (tag === "svg") svgDepth++;
      open = element;
    }
  }
  return doc;
}

function startTagText(el: XmlElement): string {
  if (!el.edited) return el.startTag;
  const attributes = el.attributes.map((a) => ` ${a.name}=${a.quote}${a.value}${a.quote}`).join("");
  return `<${el.tag}${attributes}${el.selfClosing ? "/>" : ">"}`;
}

// End tags are always written as </tag>, whatever the source had (or whether it had one at all).
function writeNode(node: XmlNode): string {
  if (node.kind === "verbatim") return node.text;
  const start = startTagText(node);
  return node.selfClosing ? start : `${start}${writeNodes(node.children)}</${node.tag}>`;
}

function writeNodes(nodes: XmlNode[]): string {
  return nodes.map(writeNode).join("");
}

function copyElement(el: XmlElement, parent: XmlElement | null): XmlElement {
  const copy: XmlElement = { ...el, attributes: el.attributes.map((a) => ({ ...a })), children: [], parent };
  for (const child of el.children) {
    copy.children.push(child.kind === "verbatim" ? { ...child } : copyElement(child, copy));
  }
  return copy;
}

// ---------- presentation properties, from style="" or from an attribute ----------

function attributeValue(el: XmlElement, name: string): string | undefined {
  return el.attributes.find((a) => a.name === name)?.value;
}

function styleDeclarations(el: XmlElement): Array<[string, string]> {
  const declarations: Array<[string, string]> = [];
  for (const piece of (attributeValue(el, "style") ?? "").split(";")) {
    const colon = piece.indexOf(":");
    if (colon >= 0) declarations.push([piece.slice(0, colon).trim(), piece.slice(colon + 1).trim()]);
  }
  return declarations;
}

// A style="" declaration wins over the attribute, and the first declaration of a name wins over later ones.
function property(el: XmlElement, name: string): string | undefined {
  const declared = styleDeclarations(el).find(([key]) => key === name);
  return declared ? declared[1] : attributeValue(el, name);
}

function inheritedProperty(el: XmlElement, name: string): string | undefined {
  for (let at: XmlElement | null = el; at; at = at.parent) {
    const value = property(at, name);
    if (value !== undefined && value !== "inherit") return value;
  }
  return undefined;
}

// Sets the property as an attribute at the end of the start tag, or removes it when `value` is null. A style=""
// loses any declaration of the name and is rewritten in compact form, or removed once nothing is left in it.
function setProperty(el: XmlElement, name: string, value: string | null): void {
  el.edited = true;
  const style = el.attributes.find((a) => a.name === "style");
  if (style) {
    const rest = styleDeclarations(el)
      .filter(([key]) => key !== name)
      .map(([key, v]) => `${key}:${v}`)
      .join(";");
    if (rest) style.value = rest;
    else el.attributes = el.attributes.filter((a) => a !== style);
  }
  el.attributes = el.attributes.filter((a) => a.name !== name);
  if (value !== null) el.attributes.push({ name, value, quote: '"' });
}

// ---------- vertices of a shape, with the directions the outline arrives and leaves in ----------

type Point = [number, number];

interface Vertex {
  at: Point;
  incoming: Point | null;
  outgoing: Point | null;
}

interface SettledVertex {
  at: Point;
  incoming: Point;
  outgoing: Point;
}

const NUMBER = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
const PATH_COMMAND = /[MmLlHhVvCcSsQqTtAaZz][^MmLlHhVvCcSsQqTtAaZz]*/g;
const ARGUMENTS_PER_COMMAND: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7 };
const QUADRATIC = ["Q", "T"];
const CUBIC = ["C", "S"];

function numbersIn(text: string): number[] {
  return (text.match(NUMBER) ?? []).map(Number);
}

function delta(to: Point, from: Point): Point {
  return [to[0] - from[0], to[1] - from[1]];
}

function hasLength(d: Point): boolean {
  return Math.hypot(d[0], d[1]) > 1e-9;
}

function firstWithLength(...candidates: Point[]): Point {
  return candidates.find(hasLength) ?? [0, 0];
}

interface Pen {
  at: Point;
  control: Point | null; // the last curve control point
  previous: string; // the last command that took effect, upper case
}

interface Segment {
  end: Point;
  incoming: Point;
  outgoing: Point;
  control: Point | null;
}

// The first control point of a smooth curve (S or T): the previous control point mirrored through the pen when
// the previous segment was a curve of the same family, otherwise the pen itself.
function smoothControl(pen: Pen, family: string[]): Point {
  const c = pen.control;
  return c && family.includes(pen.previous) ? [2 * pen.at[0] - c[0], 2 * pen.at[1] - c[1]] : [...pen.at];
}

function segmentTo(command: string, a: number[], relative: boolean, pen: Pen): Segment {
  const from = pen.at;
  const point = (x: number, y: number): Point => (relative ? [from[0] + x, from[1] + y] : [x, y]);
  if (command === "Q" || command === "T") {
    const q = command === "Q" ? point(a[0], a[1]) : smoothControl(pen, QUADRATIC);
    const end = command === "Q" ? point(a[2], a[3]) : point(a[0], a[1]);
    return {
      end,
      outgoing: firstWithLength(delta(q, from), delta(end, from)),
      incoming: firstWithLength(delta(end, q), delta(end, from)),
      control: q,
    };
  }
  if (command === "C" || command === "S") {
    const c1 = command === "C" ? point(a[0], a[1]) : smoothControl(pen, CUBIC);
    const c2 = command === "C" ? point(a[2], a[3]) : point(a[0], a[1]);
    const end = command === "C" ? point(a[4], a[5]) : point(a[2], a[3]);
    return {
      end,
      outgoing: firstWithLength(delta(c1, from), delta(c2, from), delta(end, from)),
      incoming: firstWithLength(delta(end, c2), delta(end, c1), delta(end, from)),
      control: c2,
    };
  }
  let end: Point;
  if (command === "H") end = [relative ? from[0] + a[0] : a[0], from[1]];
  else if (command === "V") end = [from[0], relative ? from[1] + a[0] : a[0]];
  else if (command === "A") end = point(a[5], a[6]); // an arc points along its chord
  else end = point(a[0], a[1]); // L, or a moveto's later coordinate pairs
  const chord = delta(end, from);
  return { end, incoming: chord, outgoing: chord, control: null };
}

function pathVertices(d: string): Vertex[] {
  const vertices: Vertex[] = [];
  const pen: Pen = { at: [0, 0], control: null, previous: "" };
  let subpathStart: Point = [0, 0];
  let subpathOpener = -1; // index of the vertex the current subpath's moveto added

  const append = (at: Point, incoming: Point, outgoingOfLast: Point) => {
    const last = vertices[vertices.length - 1];
    if (last) last.outgoing = outgoingOfLast;
    vertices.push({ at, incoming, outgoing: null });
  };

  for (const text of d.match(PATH_COMMAND) ?? []) {
    const letter = text[0];
    const command = letter.toUpperCase();
    const relative = letter !== command;
    const args = numbersIn(text.slice(1));

    if (command === "Z") {
      const back = delta(subpathStart, pen.at);
      if (hasLength(back)) append([...subpathStart], back, back);
      // The closing vertex leaves the way the subpath's first segment set off.
      const firstDrawn = vertices[subpathOpener + 1];
      const last = vertices[vertices.length - 1];
      if (last && firstDrawn) last.outgoing = firstDrawn.incoming;
      pen.at = [...subpathStart];
      pen.control = null;
      pen.previous = command;
      continue;
    }

    const step = ARGUMENTS_PER_COMMAND[command];
    for (let k = 0; k + step <= args.length; k += step) {
      const a = args.slice(k, k + step);
      if (command === "M" && k === 0) {
        const at: Point = relative ? [pen.at[0] + a[0], pen.at[1] + a[1]] : [a[0], a[1]];
        vertices.push({ at, incoming: null, outgoing: null });
        subpathOpener = vertices.length - 1;
        subpathStart = [...at];
        pen.at = at;
        pen.control = null;
        pen.previous = "M";
        continue;
      }
      const segment = segmentTo(command, a, relative, pen);
      append(segment.end, segment.incoming, segment.outgoing);
      pen.at = segment.end;
      pen.control = segment.control;
      pen.previous = command;
    }
  }
  return vertices;
}

// Lines, polylines and polygons go through the path reader as the equivalent path data.
function shapeVertices(el: XmlElement): Vertex[] {
  const coordinate = (name: string) => Number(attributeValue(el, name) ?? 0);
  switch (el.tag) {
    case "path":
      return pathVertices(attributeValue(el, "d") ?? "");
    case "line":
      return pathVertices(`M ${coordinate("x1")} ${coordinate("y1")} L ${coordinate("x2")} ${coordinate("y2")}`);
    case "polyline":
    case "polygon": {
      const values = numbersIn(attributeValue(el, "points") ?? "");
      let d = "";
      for (let k = 0; k + 1 < values.length; k += 2) d += `${k === 0 ? "M" : "L"} ${values[k]} ${values[k + 1]} `;
      return pathVertices(el.tag === "polygon" ? `${d}Z` : d);
    }
    default:
      return [];
  }
}

// Every missing or zero-length direction takes the one before it along the outline. Leading gaps take the
// first real direction, and an outline without any points east.
function settleDirections(vertices: Vertex[]): SettledVertex[] {
  const slots = vertices.flatMap((v) => [v.incoming, v.outgoing]).map((d) => (d && hasLength(d) ? d : null));
  const firstReal: Point = slots.find((d): d is Point => d !== null) ?? [1, 0];
  const settled: Point[] = [];
  for (const d of slots) settled.push(d ?? settled[settled.length - 1] ?? firstReal);
  return vertices.map((v, i) => ({ at: v.at, incoming: settled[2 * i], outgoing: settled[2 * i + 1] }));
}

function degrees(d: Point): number {
  return (Math.atan2(d[1], d[0]) * 180) / Math.PI;
}

function halfwayAngle(a: Point, b: Point): number {
  const from = degrees(a);
  let turn = degrees(b) - from;
  while (turn > 180) turn -= 360;
  while (turn < -180) turn += 360;
  return from + turn / 2;
}

// ---------- markers ----------

type MarkerPosition = "start" | "mid" | "end";

const MARKER_POSITIONS: MarkerPosition[] = ["start", "mid", "end"];
const MARKER_PROPERTIES = ["marker", "marker-start", "marker-mid", "marker-end"];
const MARKER_HOSTS = new Set(["path", "line", "polyline", "polygon"]);
const NOT_RENDERED = new Set(["marker", "clipPath", "mask", "pattern", "symbol", "defs"]);
const PAINT_PROPERTIES = [
  "fill", "stroke", "color", "fill-opacity", "stroke-opacity", "stroke-width", "stroke-linecap", "stroke-linejoin",
  "stroke-dasharray", "stroke-dashoffset", "stroke-miterlimit", "opacity",
];
// Marker content inherits from the marker's own ancestors, not from where it is used. The copy sits under the
// referencing element's ancestors instead, so it starts from the initial values of what those could pass down.
const INITIAL_PAINT =
  'fill="#000000" stroke="none" stroke-width="1" stroke-dasharray="none" stroke-dashoffset="0" ' +
  'stroke-linecap="butt" stroke-linejoin="miter" fill-opacity="1" stroke-opacity="1"';

interface ContextPaint {
  stroke: string;
  fill: string;
  color: string;
}

interface RewriteCounts {
  markers: number;
  paintSplits: number;
}

function threeDecimals(x: number): string {
  return String(Math.round(x * 1000) / 1000);
}

function escapeAttribute(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function decodeEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function collectMarkers(nodes: XmlNode[], byId: Map<string, XmlElement>): void {
  for (const node of nodes) {
    if (node.kind !== "element") continue;
    if (node.tag === "marker") {
      const id = attributeValue(node, "id");
      if (id) byId.set(id, node);
    }
    collectMarkers(node.children, byId);
  }
}

function referencedId(value: string | undefined): string | null {
  if (!value) return null;
  const m = /url\(\s*['"]?#([^'")\s]+)['"]?\s*\)/.exec(decodeEntities(value));
  return m ? m[1] : null;
}

function resolvePaintKeyword(value: string, paint: ContextPaint): string {
  if (value === "context-stroke") return paint.stroke;
  if (value === "context-fill") return paint.fill;
  return /^currentColor$/i.test(value) ? paint.color : value;
}

function applyContextPaint(el: XmlElement, paint: ContextPaint): void {
  for (const attr of el.attributes) {
    const before = attr.value;
    if (attr.name === "style") {
      attr.value = attr.value
        .replace(/context-stroke/g, paint.stroke)
        .replace(/context-fill/g, paint.fill)
        .replace(/currentColor/gi, paint.color);
    } else if (PAINT_PROPERTIES.includes(attr.name) || attr.name === "stop-color" || attr.name === "flood-color") {
      attr.value = resolvePaintKeyword(attr.value, paint);
    }
    if (attr.value !== before) el.edited = true;
  }
  for (const child of el.children) if (child.kind === "element") applyContextPaint(child, paint);
}

function markerAngle(orient: string, position: MarkerPosition, v: SettledVertex): number {
  if (orient === "auto" || orient === "auto-start-reverse") {
    const along =
      position === "start"
        ? degrees(v.outgoing)
        : position === "end"
          ? degrees(v.incoming)
          : halfwayAngle(v.incoming, v.outgoing);
    return orient === "auto-start-reverse" && position === "start" ? along + 180 : along;
  }
  const m = /^([-+]?[\d.]+)(deg|rad|grad|turn)?$/.exec(orient);
  if (!m) return 0;
  const x = Number(m[1]);
  if (m[2] === "rad") return (x * 180) / Math.PI;
  if (m[2] === "grad") return x * 0.9;
  if (m[2] === "turn") return x * 360;
  return x;
}

// One drawn copy of `marker` at vertex `v` of `host`.
function placeMarker(marker: XmlElement, host: XmlElement, v: SettledVertex, position: MarkerPosition): string {
  const setting = (name: string) => attributeValue(marker, name);
  const strokeWidth = parseFloat(inheritedProperty(host, "stroke-width") ?? "1");
  const userSpace = (setting("markerUnits") ?? "strokeWidth") === "userSpaceOnUse";
  const unit = userSpace ? 1 : isFinite(strokeWidth) ? strokeWidth : 1;
  const markerWidth = parseFloat(setting("markerWidth") ?? "3");
  const markerHeight = parseFloat(setting("markerHeight") ?? "3");
  const refX = parseFloat(setting("refX") ?? "0") || 0;
  const refY = parseFloat(setting("refY") ?? "0") || 0;
  let sx = 1;
  let sy = 1;
  const viewBox = numbersIn(setting("viewBox") ?? "");
  if (viewBox.length === 4 && viewBox[2] > 0 && viewBox[3] > 0) {
    sx = markerWidth / viewBox[2];
    sy = markerHeight / viewBox[3];
    if ((setting("preserveAspectRatio") ?? "").trim() !== "none") sx = sy = Math.min(sx, sy);
  }
  const angle = markerAngle((setting("orient") ?? "0").trim(), position, v);

  const paint: ContextPaint = {
    stroke: inheritedProperty(host, "stroke") ?? "none",
    fill: inheritedProperty(host, "fill") ?? "#000000",
    color: inheritedProperty(host, "color") ?? "#000000",
  };
  const ownPaint = marker.attributes
    .filter((a) => PAINT_PROPERTIES.includes(a.name))
    .map((a) => ` ${a.name}="${a.value}"`)
    .join("")
    .replace(/context-stroke/g, paint.stroke)
    .replace(/context-fill/g, paint.fill)
    .replace(/"currentColor"/gi, `"${paint.color}"`);
  const content = marker.children
    .map((child) => {
      if (child.kind === "verbatim") return child.text;
      const copy = copyElement(child, null);
      applyContextPaint(copy, paint);
      return writeNode(copy);
    })
    .join("");

  const transform =
    `translate(${threeDecimals(v.at[0])} ${threeDecimals(v.at[1])}) rotate(${threeDecimals(angle)}) ` +
    `scale(${threeDecimals(unit * sx)} ${threeDecimals(unit * sy)}) ` +
    `translate(${threeDecimals(-refX)} ${threeDecimals(-refY)})`;
  return `<g ${INITIAL_PAINT}${ownPaint} transform="${transform}">${content}</g>`;
}

// Takes the marker references off `host` and returns the markup that draws them, to go right after it.
function expandHost(host: XmlElement, markers: Map<string, XmlElement>, counts: RewriteCounts): string {
  const shorthand = referencedId(property(host, "marker"));
  const ids: Record<MarkerPosition, string | null> = {
    start: referencedId(property(host, "marker-start")) ?? shorthand,
    mid: referencedId(property(host, "marker-mid")) ?? shorthand,
    end: referencedId(property(host, "marker-end")) ?? shorthand,
  };
  if (!ids.start && !ids.mid && !ids.end) return "";

  let drawn = "";
  const outline = shapeVertices(host);
  if (outline.length) {
    const vertices = settleDirections(outline);
    const placesFor: Record<MarkerPosition, SettledVertex[]> = {
      start: [vertices[0]],
      mid: vertices.slice(1, -1),
      end: [vertices[vertices.length - 1]],
    };
    for (const position of MARKER_POSITIONS) {
      const id = ids[position];
      const marker = id ? markers.get(id) : undefined;
      if (!marker) continue;
      for (const v of placesFor[position]) {
        drawn += placeMarker(marker, host, v, position);
        counts.markers++;
      }
    }
  }
  for (const name of MARKER_PROPERTIES) if (property(host, name) !== undefined) setProperty(host, name, null);

  if (!drawn) return "";
  if (property(host, "visibility") === "hidden" || property(host, "display") === "none") return "";
  const transform = attributeValue(host, "transform");
  return transform ? `<g transform="${transform}">${drawn}</g>` : drawn;
}

function expandMarkers(container: Container, markers: Map<string, XmlElement>, counts: RewriteCounts): void {
  const nodes = container.children;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.kind !== "element" || NOT_RENDERED.has(node.tag)) continue;
    if (MARKER_HOSTS.has(node.tag)) {
      const drawn = expandHost(node, markers, counts);
      if (drawn) nodes.splice(++i, 0, { kind: "verbatim", text: drawn });
    }
    expandMarkers(node, markers, counts);
  }
}

// ---------- paint-order ----------

function strokeUnderFill(order: string | undefined): boolean {
  if (!order) return false;
  const layers = order.trim().split(/\s+/);
  if (layers[0] === "normal") return false;
  for (const layer of ["fill", "stroke", "markers"]) if (!layers.includes(layer)) layers.push(layer);
  return layers.indexOf("stroke") < layers.indexOf("fill");
}

// Descendants of a split element (tspans) simply follow the copy they end up in.
function clearPaintOrder(nodes: XmlNode[]): void {
  for (const node of nodes) {
    if (node.kind !== "element") continue;
    if (property(node, "paint-order") !== undefined) setProperty(node, "paint-order", null);
    clearPaintOrder(node.children);
  }
}

function splitPaintOrder(container: Container, counts: RewriteCounts): void {
  const nodes = container.children;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.kind !== "element") continue;
    const order = property(node, "paint-order");
    if (order !== undefined && strokeUnderFill(order)) {
      const strokePass = copyElement(node, node.parent);
      setProperty(strokePass, "paint-order", null);
      setProperty(strokePass, "fill", "none");
      setProperty(strokePass, "id", null);
      clearPaintOrder(strokePass.children);
      setProperty(node, "paint-order", null);
      setProperty(node, "stroke", "none");
      clearPaintOrder(node.children);
      nodes.splice(i++, 0, strokePass);
      counts.paintSplits++;
      continue;
    }
    if (order !== undefined) setProperty(node, "paint-order", null);
    splitPaintOrder(node, counts);
  }
}

// ---------- fonts ----------

// A Map, because the names come from the SVG: a plain object would also answer "constructor" or "toString".
const GENERIC_FAMILIES = new Map<string, string[]>([
  ["sans-serif", ["Arial", "Helvetica", "Helvetica Neue", "Liberation Sans", "DejaVu Sans", "Noto Sans"]],
  ["serif", ["Times New Roman", "Times", "Liberation Serif", "DejaVu Serif", "Noto Serif"]],
  ["monospace", ["Courier New", "Menlo", "Consolas", "Liberation Mono", "DejaVu Sans Mono"]],
]);

function firstInstalledFamily(list: string): string | null {
  for (const entry of decodeEntities(list).split(",")) {
    const family = entry.trim().replace(/^['"]|['"]$/g, "");
    if (!family) continue;
    const standIns = GENERIC_FAMILIES.get(family);
    if (standIns) {
      const installed = standIns.find((name) => GlobalFonts.has(name));
      if (installed) return installed;
      continue;
    }
    if (GlobalFonts.has(family)) return family;
  }
  return null;
}

function reduceFontFamilies(nodes: XmlNode[], resolved: Map<string, string | null>): void {
  for (const node of nodes) {
    if (node.kind !== "element") continue;
    const list = property(node, "font-family");
    if (list !== undefined) {
      if (!resolved.has(list)) resolved.set(list, firstInstalledFamily(list));
      const family = resolved.get(list);
      if (family) setProperty(node, "font-family", escapeAttribute(family));
    }
    reduceFontFamilies(node.children, resolved);
  }
}

// ---------- the public steps ----------

export type RootSize = { width: number; height: number } | { problem: string };

// The size of the root <svg> in px: width and height, or what the viewBox gives for a missing one.
export function rootSize(doc: SvgDocument): RootSize {
  const root = doc.children.find((n): n is XmlElement => n.kind === "element");
  if (!root || root.tag !== "svg") return { problem: "input has no root <svg> element" };
  const pixels = (value: string | undefined): number | undefined => {
    if (value === undefined) return undefined;
    const m = /^\s*([\d.]+(?:e[-+]?\d+)?)\s*(px)?\s*$/i.exec(value);
    return m && Number(m[1]) > 0 ? Number(m[1]) : undefined;
  };
  const viewBoxText = attributeValue(root, "viewBox");
  let viewBox: number[] | undefined;
  if (viewBoxText !== undefined) {
    const parts = viewBoxText.trim().split(/[\s,]+/).map(Number);
    if (parts.length !== 4 || parts.some((x) => !isFinite(x)) || parts[2] <= 0 || parts[3] <= 0) {
      return { problem: `root <svg> has an invalid viewBox "${viewBoxText}"` };
    }
    viewBox = parts;
  }
  let width = pixels(attributeValue(root, "width"));
  let height = pixels(attributeValue(root, "height"));
  if (viewBox) {
    if (width === undefined && height === undefined) [width, height] = [viewBox[2], viewBox[3]];
    else if (width === undefined && height !== undefined) width = (height * viewBox[2]) / viewBox[3];
    else if (height === undefined && width !== undefined) height = (width * viewBox[3]) / viewBox[2];
  }
  if (width === undefined || height === undefined) {
    return { problem: "root <svg> needs numeric width and height (px) or a viewBox" };
  }
  return { width, height };
}

export interface PreparedSvg {
  svg: string;
  markers: number; // marker copies drawn in
  paintSplits: number; // elements drawn twice for paint-order
}

// Applies the three rewrites in place and returns the resulting SVG text.
export function prepareForSkia(doc: SvgDocument): PreparedSvg {
  const markers = new Map<string, XmlElement>();
  collectMarkers(doc.children, markers);
  const counts: RewriteCounts = { markers: 0, paintSplits: 0 };
  expandMarkers(doc, markers, counts);
  splitPaintOrder(doc, counts);
  reduceFontFamilies(doc.children, new Map());
  return { svg: writeNodes(doc.children), ...counts };
}
