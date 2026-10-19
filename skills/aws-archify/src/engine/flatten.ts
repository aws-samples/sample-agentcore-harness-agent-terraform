// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// The placed layout tree turned into what the later stages need: flat lists of drawn primitives (for arrows, the
// canvas fit, the layout report and the draw.io model) plus a nested item tree that mirrors the scene's groups,
// so the SVG keeps AWS containers and icon+caption nodes as named <g> groups.
import { ICON_SIZE, type Box, type Pt } from "./geometry.ts";
import { CAPTION_GAP, CAPTION_LINE, CAPTION_SIZE, SUB_CAPTION_SIZE, parseTextAnchor, type TextAnchor } from "./text.ts";
import type { GroupKind } from "./groups.ts";
import type { IconComponent } from "./elements.ts";
import type { LayoutNode } from "./layout.ts";

export interface TextItem {
  /** The anchor point (see `anchor`), not the left edge. */
  x: number; y: number;
  text: string; size: number; color: string; anchor: TextAnchor; bold: boolean; chip: boolean;
  italic?: boolean; font?: string; halo?: boolean;
}
export interface ArrowLabelItem extends TextItem {
  editId?: string;
  /** Index of the arrow in `Flat.arrows` the label belongs to. */
  arrowIndex?: number;
  at?: "start" | "middle" | "end";
}
export interface PlacedIcon { icon?: IconComponent; x: number; y: number; size: number; key: string | null }
export interface PlacedGroup { label: string; x: number; y: number; w: number; h: number; kind: GroupKind }
export interface PlacedArrow {
  points: Pt[]; color: string; dashed: boolean; head: string; editId?: string;
  /** The arrow sets a `riser` its geometry cannot use. */
  riserIgnored?: boolean;
  /** How the layout report names it: "from→to", or a manual arrow's id or end points. */
  name?: string;
  animate?: "flow" | "dots";
}
export type RectItem = Box & { kind: "rect"; stroke?: string; fill?: string; strokeWidth?: number; dashed?: boolean; rx?: number };
export type RawItem = { kind: "raw"; svg: string };

/** Something an arrow can attach to. `x/y/w/h` is the icon (arrows leave icon edges); `captionBottom` is where a
 *  node's caption block ends, used for bottom attachments; `footprint` is the same object the node put into
 *  `Flat.obstacles`, so the router can exempt an arrow's own two ends. */
export interface AttachBox extends Box { captionBottom?: number; footprint?: Box }

export interface Flat {
  icons: PlacedIcon[];
  groups: PlacedGroup[];
  /** Every label: node captions, <Label>s and arrow labels (the fit and the report measure them all). */
  labels: TextItem[];
  /** Arrow labels again, drawn in their own layer above the connectors. */
  arrowLabels: ArrowLabelItem[];
  arrows: PlacedArrow[];
  shapes: (RectItem | RawItem)[];
  boxes: Map<string, AttachBox>;
  /** Full icon+caption footprints the elbow router keeps clear of. */
  obstacles: Box[];
}

export type Caption = { x: number; y: number; text: string; size: number; color: string };
export type RenderItem =
  | { t: "group"; label: string; kind: GroupKind; box: Box; children: RenderItem[]; icon?: IconComponent; editId?: string }
  | { t: "node"; label: string; icon?: IconComponent; ix: number; iy: number; size: number; captions: Caption[]; editId?: string }
  | { t: "icon"; label: string; icon?: IconComponent; x: number; y: number; size: number; editId?: string }
  | { t: "label"; label: TextItem }
  | { t: "rect"; r: RectItem }
  | { t: "raw"; svg: string };

export const emptyFlat = (): Flat => ({ icons: [], groups: [], labels: [], arrowLabels: [], arrows: [], shapes: [], boxes: new Map(), obstacles: [] });

const CAPTION_COLOR = "#232F3E";
const SUB_CAPTION_COLOR = "#5A6B86";

/** Appends `n` (and its subtree) to `flat` and `items`; arrows are queued in `arrows` for after every box is known.
 *  Only a <Group> opens a nested item; stacks and Moves have no visible boundary and pass their children through. */
export function flatten(n: LayoutNode, flat: Flat, arrows: LayoutNode[], items: RenderItem[]): void {
  const id: string | undefined = n.props.id;
  const editId: string | undefined = n.props.__editId;
  switch (n.kind) {
    case "node": {
      const size = n.props.size ?? ICON_SIZE;
      // The icon is centred exactly (unsnapped) in the node's box so it shares its caption's centre line.
      const icon: Box = { x: n.x + (n.size.w - size) / 2, y: n.y, w: size, h: size };
      flat.icons.push({ icon: n.props.icon, x: icon.x, y: icon.y, size, key: n.props.label ?? id ?? null });
      const centerX = icon.x + size / 2;
      const firstBaseline = n.y + size + CAPTION_GAP + CAPTION_SIZE;
      const lines: string[] = n.props.label ? String(n.props.label).split("\n") : [];
      const captions: Caption[] = [];
      const addCaption = (text: string, y: number, size: number, color: string) => {
        flat.labels.push({ x: centerX, y, text, size, color, anchor: "middle", bold: false, chip: false });
        captions.push({ x: centerX, y, text, size, color });
      };
      lines.forEach((line, i) => addCaption(line, firstBaseline + i * CAPTION_LINE, CAPTION_SIZE, CAPTION_COLOR));
      const sub = n.props.sub;
      if (sub) addCaption(sub, firstBaseline + lines.length * CAPTION_LINE, SUB_CAPTION_SIZE, SUB_CAPTION_COLOR);
      const footprint: Box = { x: n.x, y: n.y, w: n.size.w, h: n.size.h };
      if (id) flat.boxes.set(id, { ...icon, captionBottom: n.y + n.size.h, footprint });
      flat.obstacles.push(footprint);
      items.push({ t: "node", label: n.props.label ?? id ?? "", icon: n.props.icon, ix: icon.x, iy: icon.y, size, captions, editId });
      return;
    }
    case "icon": {
      const size = n.props.size ?? ICON_SIZE;
      flat.icons.push({ icon: n.props.icon, x: n.x, y: n.y, size, key: id ?? null });
      const footprint: Box = { x: n.x, y: n.y, w: size, h: size };
      if (id) flat.boxes.set(id, { ...footprint, footprint });
      flat.obstacles.push(footprint);
      items.push({ t: "icon", label: id ?? "", icon: n.props.icon, x: n.x, y: n.y, size, editId });
      return;
    }
    case "label": {
      const size = n.props.size ?? CAPTION_SIZE;
      const anchor = parseTextAnchor(n.props.anchor);
      // Anchor point inside the reserved box: its left edge, centre or right edge.
      const x = anchor === "start" ? n.x : anchor === "end" ? n.x + n.size.w : n.x + n.size.w / 2;
      const label: TextItem = {
        x, y: n.y + size, text: String(n.props.children ?? ""), size, color: n.props.color ?? CAPTION_COLOR,
        anchor, bold: !!n.props.bold, chip: !!n.props.chip,
      };
      flat.labels.push(label);
      items.push({ t: "label", label });
      return;
    }
    case "rect": {
      const p = n.props;
      const r: RectItem = { kind: "rect", x: n.x, y: n.y, w: n.size.w, h: n.size.h, stroke: p.stroke, fill: p.fill, strokeWidth: p.strokeWidth, dashed: p.dashed, rx: p.rx };
      flat.shapes.push(r);
      items.push({ t: "rect", r });
      return;
    }
    case "raw": {
      const svg = String(n.props.children ?? "");
      flat.shapes.push({ kind: "raw", svg });
      items.push({ t: "raw", svg });
      return;
    }
    case "anchor":
      // A point box: arrows attach to it, the router may pass through it.
      if (id) flat.boxes.set(id, { x: n.x, y: n.y, w: 0, h: 0 });
      return;
    case "arrow":
      arrows.push(n);
      return;
    case "group": {
      const box: Box = { x: n.x, y: n.y, w: n.size.w, h: n.size.h };
      flat.groups.push({ label: n.props.label ?? "", ...box, kind: n.props.kind ?? "generic" });
      if (id) flat.boxes.set(id, { ...box });
      const children: RenderItem[] = [];
      for (const c of n.children) flatten(c, flat, arrows, children);
      items.push({ t: "group", label: n.props.label ?? "", kind: n.props.kind ?? "generic", box, children, icon: n.props.icon, editId });
      return;
    }
    default:
      for (const c of n.children) flatten(c, flat, arrows, items);
  }
}

