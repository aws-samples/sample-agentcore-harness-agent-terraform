// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// The 8 px lattice every coordinate lives on, and the small geometry vocabulary the engine shares.

export type Pt = [number, number];
export type Size = { w: number; h: number };
export type Box = { x: number; y: number; w: number; h: number };
export type Side = "left" | "right" | "top" | "bottom";
/** Cross-axis alignment of children in a container. */
export type Align = "start" | "center" | "end";
export type LayoutDir = "row" | "col" | "grid" | "zstack" | "free";

export const GRID = 8;
/** `n` grid cells in pixels. */
export const cell = (n: number): number => n * GRID;

/** Default icon size of a `<Node>` or `<Icon>`. */
export const ICON_SIZE = cell(6);
/** Space between an arrow's end and the icon it points at. */
export const ARROW_GAP = cell(1);
/** Default space between siblings in a container. */
export const DEFAULT_GAP = cell(3);

export const snap = (v: number): number => Math.round(v / GRID) * GRID;
export const snapUp = (v: number): number => Math.ceil(v / GRID) * GRID;

/** Validates an author-supplied coordinate or distance: it must be a finite multiple of the grid. Off-grid values
 *  are refused rather than rounded, so a scene never renders somewhere its author did not ask for. */
export function requireGrid(value: number | undefined, what: string): number | undefined {
  if (value == null) return value;
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error(`${what} must be a finite number on the ${GRID}px grid, got ${JSON.stringify(value)}`);
  if (value % GRID !== 0)
    throw new Error(
      `${what}=${value} is off the ${GRID}px grid (not a multiple of ${GRID}). ` +
      `Use a multiple of ${GRID} — nearest is ${snap(value)}.`,
    );
  return value;
}

export const isHorizontal = (side: Side): boolean => side === "left" || side === "right";
/** +1 for the faces at the high end of an axis (right, bottom), -1 for left and top. */
export const outwardSign = (side: Side): number => (side === "right" || side === "bottom" ? 1 : -1);

export const sameBox = (a: Box, b: Box): boolean => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
