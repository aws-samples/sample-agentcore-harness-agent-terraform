// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// composeScene(): a <Diagram> element in, a laid-out scene out (primitives, render items, canvas, report).
import type React from "react";
import { NUMBERED_STEPS_ERROR, type DiagramProps } from "./elements.ts";
import { buildLayoutTree, checkGroupsOnGrid, measure, newLayoutNode, place, requireRealIcons, type LayoutNode } from "./layout.ts";
import { emptyFlat, flatten, type Flat, type RenderItem } from "./flatten.ts";
import { resolveArrow } from "./connectors.ts";
import { CANVAS_MARGIN, checkLayout, fit, type LayoutReport } from "./report.ts";
import { arrowMoves, sceneIdPrefix } from "./paint.ts";

export interface ComposeOptions {
  /** Render into this fixed canvas instead of fitting the canvas to the content (render.ts `--canvas WxH`). The
   *  content then stays at the raw layout origin, a debugging view of the layout coordinates, and anything past
   *  the size is reported as clipped. The size always comes from the caller, never from the scene. */
  canvas?: { width: number; height: number };
  /** Refuse an `icon` prop that is not a component (default true). Edit mode turns it off so the icon-less nodes
   *  it adds keep rendering. */
  strictIcons?: boolean;
  /** Draw a scene with nothing in it as a blank canvas instead of refusing it (default false). For edit mode's live
   *  view, where deleting the last element must still show the canvas so the edit can be undone. */
  allowEmpty?: boolean;
}

export interface Composed {
  /** Primitives in layout coordinates; `dx`/`dy` move them onto the canvas. */
  flat: Flat;
  items: RenderItem[];
  dx: number; dy: number; width: number; height: number;
  title: string | null; subtitle: string | null;
  report: LayoutReport;
  idPrefix: string;
  poster: boolean;
  /** At least one arrow moves in the animated copy (see arrowMoves); without one there is no animated copy. */
  moving: boolean;
}

/** Nothing was laid out that draws: no icon, group, text, arrow, Rect or Raw (Anchors and Spacers draw nothing). */
const drawsNothing = (flat: Flat): boolean =>
  !flat.icons.length && !flat.groups.length && !flat.labels.length && !flat.arrows.length && !flat.shapes.length;

export function composeScene(diagram: React.ReactElement, { canvas, strictIcons = true, allowEmpty = false }: ComposeOptions = {}): Composed {
  const props: DiagramProps = (diagram.props as any) || {};
  if (props.steps?.length) throw new Error(NUMBERED_STEPS_ERROR);
  const title = props.title ?? null;
  const subtitle = props.subtitle ?? null;
  if (subtitle && !title) throw new Error("<Diagram subtitle> needs a title: the subtitle is the line under it.");

  const root = newLayoutNode("diagram", props, buildLayoutTree(props.children));
  if (strictIcons) requireRealIcons(root.children);
  measure(root);
  place(root, 0, 0);
  checkGroupsOnGrid(root);

  const flat = emptyFlat();
  const arrows: LayoutNode[] = [];
  const items: RenderItem[] = [];
  for (const child of root.children) flatten(child, flat, arrows, items);
  for (const arrow of arrows) resolveArrow(arrow, flat, props.animate);
  if (!allowEmpty && drawsNothing(flat)) throw new Error(
    `<Diagram${title ? ` title=${JSON.stringify(title)}` : ""}> has nothing to draw: no Node, Icon, Group, Label, ` +
    `Rect, Raw or Arrow was laid out, so the figure would be a blank canvas. Put the elements inside the ` +
    `<Diagram>. A function of your own used as a tag (<Part />) is never called: call it instead ({Part()}).`);

  let dx = 0, dy = 0, width = canvas?.width ?? 0, height = canvas?.height ?? 0;
  if (!canvas) ({ dx, dy, width, height } = fit(flat, title, CANVAS_MARGIN, subtitle));
  const moved = <T extends { x: number; y: number }>(o: T): T => ({ ...o, x: o.x + dx, y: o.y + dy });
  const onCanvas: Flat = {
    ...flat,
    icons: flat.icons.map(moved), groups: flat.groups.map(moved), labels: flat.labels.map(moved), arrowLabels: flat.arrowLabels.map(moved),
    // A <Rect> is measured and so moves with the content; a <Raw> carries its own coordinates.
    shapes: flat.shapes.map((s) => (s.kind === "rect" ? moved(s) : s)),
  };
  const report = checkLayout(onCanvas, width, height, title);
  return {
    flat, items, dx, dy, width, height, title, subtitle, report, idPrefix: sceneIdPrefix(title, flat), poster: !!props.poster,
    moving: flat.arrows.some(arrowMoves),
  };
}
