// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// The components a scene is written with, and their props. They render nothing themselves: each one is a tagged
// placeholder that composeScene() reads out of the React tree and lays out.
import type React from "react";
import { ARROW_GAP, ICON_SIZE, snapUp, type Align, type LayoutDir, type Pt, type Side } from "./geometry.ts";
import { CAPTION_GAP, CAPTION_LINE, type TextAnchor } from "./text.ts";
import type { GroupKind } from "./groups.ts";

/** A static AWS icon component from src/icons/*: renders a positioned <svg>. `idPrefix` goes in front of every id
 *  the icon's own markup points at (a clip path); the engine gives each icon instance its own. */
export type IconComponent = React.ComponentType<{ x?: number; y?: number; width?: number; height?: number; idPrefix?: string }>;
/** The src/icons/group.js module: corner-badge name (a GroupStyle `badge`) -> component. */
export type GroupIconModule = Record<string, IconComponent>;
/** One element of a figure, the type a scene's helper functions return. */
export type Figure = React.ReactElement;
/** `animate` values: "flow" moves dashes along the line, "dots" (or `true`) sends a dot down it. */
export type Animate = boolean | "flow" | "dots";

export interface DiagramProps {
  title?: string;
  /** One plain sentence under the title saying what the figure shows. Needs a title. */
  subtitle?: string;
  /** How the top-level children are arranged. Default "row". */
  layout?: LayoutDir;
  gap?: number;
  align?: Align;
  /** Column count for `layout="grid"`; required once there is more than one child. */
  cols?: number;
  /** Refused at render time: diagrams carry no numbered steps. Typed so an old scene fails with that message. */
  steps?: string[];
  /** Animate every arrow (an arrow opts out with `animate={false}`). The motion goes only into
   *  `<name>.animated.svg`; the `.svg` and `.png` stay still. */
  animate?: Animate;
  /** Poster mode, only when one big picture is explicitly wanted: marks the SVG `data-poster`, so the layout check
   *  allows a canvas up to 3000 px and the document builders refuse to embed it. */
  poster?: boolean;
  children?: React.ReactNode;
}

/** HStack / VStack / ZStack / Free. They have no box of their own and so no `id`: name an invisible wrapper with
 *  `<Group kind="borderless" id>` to attach arrows to it. */
export interface StackProps {
  gap?: number;
  align?: Align;
  /** Inner padding on every side. */
  pad?: number;
  /** Absolute position inside the parent's content box (multiples of 8). */
  x?: number; y?: number;
  children?: React.ReactNode;
}
export interface GridProps extends StackProps { cols: number; }

export interface GroupProps extends StackProps {
  kind: GroupKind;
  label?: string;
  /** How the children are arranged inside the box. Default "row". */
  layout?: LayoutDir;
  /** Column count for `layout="grid"`; required once the group holds more than one child. */
  cols?: number;
  /** Lets an `<Arrow from/to>` attach to the group's box. */
  id?: string;
  /** The service icon in a `service-*` group's corner square. Ignored by the other kinds. */
  icon?: IconComponent;
  /** Per-side inner padding, each replacing `pad` for one edge (multiples of 8). `padTop` is the room between the
   *  label band and the content, in place of `pad` there, not added to it. */
  padTop?: number; padRight?: number; padBottom?: number; padLeft?: number;
  /** Set only by edit mode, so a clicked SVG element maps back to its source. */
  __editId?: string;
}

export interface NodeProps {
  /** The service icon. Leave the prop out (do not pass undefined) for a dashed placeholder box. */
  icon?: IconComponent;
  label?: string;
  /** A second, smaller caption line. */
  sub?: string;
  /** Icon size in px (multiple of 8, default 48). */
  size?: number;
  id?: string;
  x?: number; y?: number;
  __editId?: string;
}

export interface IconProps { icon: IconComponent; size?: number; id?: string; x?: number; y?: number; }

export interface LabelProps {
  /** Where the text sits inside the box the label reserves. Default "middle". */
  anchor?: TextAnchor; bold?: boolean; chip?: boolean; size?: number; color?: string;
  x?: number; y?: number; children?: React.ReactNode;
}

export interface ArrowProps {
  id?: string;
  /** Ids of the `<Node>`, `<Icon>`, `<Group>` or `<Anchor>` the arrow joins. */
  from?: string; to?: string;
  /** The faces the arrow leaves and enters; inferred from the geometry when omitted. */
  fromSide?: Side; toSide?: Side;
  /** A hand-drawn polyline in layout coordinates (the diagram's own origin, before the canvas margin and title
   *  band). Multiples of 8. Replaces from/to. */
  points?: Pt[];
  /** Bend points inserted between the resolved ends, in the same coordinates. Multiples of 8. */
  via?: Pt[];
  head?: "end" | "start" | "both" | "none";
  dashed?: boolean; color?: string;
  /** Moving dashes ("flow") or a travelling dot ("dots" / `true`) toward the head, written only to
   *  `<name>.animated.svg`. Arrows with `head="both"` or `"none"` stay still under "flow". */
  animate?: Animate;
  /** "auto" (default): straight when the ends line up, otherwise right-angled segments. `false`: one straight,
   *  possibly diagonal, segment. */
  elbow?: boolean | "auto";
  /** Where the first turn of an elbow goes. A fraction 0..1 is the share of the way from the source stub to the
   *  target stub, or, when both ends leave the same face (a U-turn), how far the crossbar is lifted outward (1 = the
   *  outermost content edge). Any value below 0 or above 1 is an absolute coordinate (multiple of 8). */
  riser?: number;
  /** The arrow's label. */
  children?: React.ReactNode;
  labelAt?: "start" | "middle" | "end";
  /** The side of the line the label sits on; default above a horizontal run, left of a vertical one. */
  labelSide?: Side;
  __editId?: string;
}

export interface MoveProps { dx?: number; dy?: number; children?: React.ReactNode; }
export interface SpacerProps { size?: number; }
/** Refused at render time; kept so an old scene fails with a clear message instead of an import error. */
export interface StepBadgeProps {
  n: number | string; x?: number; y?: number;
  near?: string; on?: string; at?: "start" | "middle" | "end"; side?: Side;
  dx?: number; dy?: number;
  __editId?: string;
}
/** A plain rectangle: `w`/`h` are its box (multiples of 8), `strokeWidth` its border thickness (default 2). */
export interface RectProps { w: number; h: number; x?: number; y?: number; stroke?: string; fill?: string; strokeWidth?: number; dashed?: boolean; rx?: number; }
/** SVG markup inserted as written. Its extent is unknown to the engine. */
export interface RawProps { children?: string; }
/** An invisible, zero-size point (x/y relative to the parent's content box, multiples of 8) that arrows attach
 *  to exactly, with no gap: route a connector around a stack as two arrows meeting here. */
export interface AnchorProps { id: string; x: number; y: number; }

/** The property composeScene() reads to recognise a scene element. */
export const ELEMENT_KIND = "__awsSvgKind";

function element<P>(kind: string): (props: P) => null {
  const placeholder = (_props: P): null => null;
  (placeholder as any)[ELEMENT_KIND] = kind;
  return placeholder;
}

export const Diagram = element<DiagramProps>("diagram");
export const HStack = element<StackProps>("row");
export const VStack = element<StackProps>("col");
export const Grid = element<GridProps>("grid");
export const ZStack = element<StackProps>("zstack");
export const Free = element<StackProps>("free");
export const Group = element<GroupProps>("group");
export const Node = element<NodeProps>("node");
export const Icon = element<IconProps>("icon");
export const Label = element<LabelProps>("label");
export const Arrow = element<ArrowProps>("arrow");
export const Move = element<MoveProps>("move");
export const Spacer = element<SpacerProps>("spacer");
export const StepBadge = element<StepBadgeProps>("badge");
export const Rect = element<RectProps>("rect");
export const Raw = element<RawProps>("raw");
export const Anchor = element<AnchorProps>("anchor");

export const NUMBERED_STEPS_ERROR =
  "Numbered step badges are not supported: label the arrows instead (see references/arrows.md)";

/** Edge points of an icon placed at (x, y), for hand-drawn `<Arrow points>`: exact edge centres, the same points
 *  pushed out by `gap`, and `capBottom(lines)`, a grid point just below a captioned icon. */
export function edges(x: number, y: number, size = ICON_SIZE, gap = ARROW_GAP) {
  const cx = x + size / 2, cy = y + size / 2;
  return {
    cx, cy,
    left: [x, cy] as Pt, right: [x + size, cy] as Pt, top: [cx, y] as Pt, bottom: [cx, y + size] as Pt,
    center: [cx, cy] as Pt,
    leftGap: [x - gap, cy] as Pt, rightGap: [x + size + gap, cy] as Pt,
    topGap: [cx, y - gap] as Pt, bottomGap: [cx, y + size + gap] as Pt,
    capBottom: (lines = 1): Pt => [cx, snapUp(y + size + CAPTION_GAP + lines * CAPTION_LINE + gap)],
  };
}
