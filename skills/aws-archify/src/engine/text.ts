// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// Fonts and text metrics. Widths are estimates (no font is loaded at layout time), but every consumer — layout,
// canvas fit, the clipping report and the label chips — measures through the same functions, so they agree.
import { cell } from "./geometry.ts";

/** Where a text run sits relative to its anchor point, in SVG's own `text-anchor` words. */
export type TextAnchor = "start" | "middle" | "end";

export const FONT = "Amazon Ember, Arial, Helvetica, sans-serif";
/** Arrow labels are set in Arial italic. */
export const ARROW_LABEL_FONT = "Arial, Helvetica, sans-serif";

export const CAPTION_SIZE = 12;
export const SUB_CAPTION_SIZE = 11;
/** Vertical distance between caption lines under a node's icon. */
export const CAPTION_LINE = 14;
/** Gap between an icon's bottom edge and its first caption line. */
export const CAPTION_GAP = cell(1);
export const GROUP_LABEL_SIZE = 13;

export const TITLE_X = 24;
export const TITLE_Y = 30;
export const TITLE_SIZE = 18;
export const SUBTITLE_Y = TITLE_Y + 22;
export const SUBTITLE_SIZE = 13;
/** Extra canvas height a subtitle needs below the title. */
export const SUBTITLE_BAND = 22;

/** Estimated width of the widest line of `text` at font `size`. */
export function textWidth(text: unknown, size: number): number {
  const lines = String(text).split("\n");
  return Math.max(0, ...lines.map((line) => line.length * size * 0.6));
}

/** Baseline-to-baseline distance of a multi-line label. */
export const linePitch = (size: number): number => size + 2;

export const titleRight = (title: string): number => TITLE_X + textWidth(title, TITLE_SIZE);
export const subtitleRight = (subtitle: string): number => TITLE_X + textWidth(subtitle, SUBTITLE_SIZE);

/** Reads a `<Label anchor>`; anything but the three SVG words is a scene error ("center" is spelled "middle"). */
export function parseTextAnchor(value: unknown): TextAnchor {
  if (value == null) return "middle";
  if (value === "start" || value === "middle" || value === "end") return value;
  throw new Error(
    `<Label anchor=${JSON.stringify(value)}> is not a text anchor. ` +
    `Use "start", "middle" or "end" (SVG's vocabulary — "center" is spelled "middle").`,
  );
}

/** Room below a label's last baseline in its ink box. */
const BOX_DESCENT = 4;

/** The box a label inks, `[x0, y0, x1, y1]`: anchor-aware horizontally, every line vertically, with a full font
 *  size of room above the first baseline and a little descent below the last one. */
export function labelBox(l: { x: number; y: number; text: unknown; size: number; anchor: TextAnchor }): [number, number, number, number] {
  const lineCount = String(l.text).split("\n").length;
  const w = textWidth(l.text, l.size);
  const x0 = l.anchor === "start" ? l.x : l.anchor === "end" ? l.x - w : l.x - w / 2;
  const lastBaseline = l.y + (lineCount - 1) * linePitch(l.size);
  return [x0, l.y - l.size, x0 + w, lastBaseline + BOX_DESCENT];
}
