// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// Group (container box) kinds and how each one is drawn. Plain data with no React, so tools can import this module
// directly with Node: the edit mode lists these kinds, the draw.io model styles its containers from them.
import { cell, requireGrid } from "./geometry.ts";
import type { GroupProps } from "./elements.ts";

export type GroupKind =
  | "aws-cloud" | "region" | "vpc" | "public-subnet" | "private-subnet"
  | "account" | "auto-scaling" | "datacenter" | "generic" | "borderless"
  // AWS's "custom group for a service": a box in one category colour with a corner square that holds the
  // service's own icon (a solid square of that colour until an icon is given).
  | "service-purple" | "service-pink" | "service-green" | "service-teal"
  | "service-orange" | "service-red" | "service-magenta" | "service-devtools";

export interface GroupStyle {
  border: string;
  /** Colour of the group's own label. */
  label: string;
  dashed: boolean;
  /** Name of the group.js badge drawn in the top-left corner, or null for none. */
  badge: string | null;
  fill?: string;
}

export const GROUP_STYLES: Record<GroupKind, GroupStyle> = {
  "aws-cloud": { border: "#242F3E", label: "#242F3E", dashed: false, badge: "AWSCloudLogo" },
  region: { border: "#00A4A6", label: "#00A4A6", dashed: true, badge: "Region" },
  vpc: { border: "#8C4FFF", label: "#8C4FFF", dashed: false, badge: "VirtualPrivateCloudVPC" },
  "public-subnet": { border: "#7AA116", label: "#248814", dashed: false, badge: "PublicSubnet", fill: "#F2F6E8" },
  "private-subnet": { border: "#00A4A6", label: "#147EBA", dashed: false, badge: "PrivateSubnet", fill: "#E6F6F7" },
  account: { border: "#E7157B", label: "#E7157B", dashed: false, badge: "AWSAccount" },
  "auto-scaling": { border: "#ED7100", label: "#ED7100", dashed: true, badge: "AutoScalingGroup" },
  datacenter: { border: "#7D8998", label: "#7D8998", dashed: false, badge: "CorporateDataCenter" },
  generic: { border: "#5A6B86", label: "#5A6B86", dashed: true, badge: null },
  // Lays out and hugs its children like any group, and can be an arrow target, but draws nothing.
  borderless: { border: "none", label: "#5A6B86", dashed: false, badge: null },
  "service-purple": { border: "#8C4FFF", label: "#232F3E", dashed: false, badge: null },
  "service-pink": { border: "#E7157B", label: "#232F3E", dashed: false, badge: null },
  "service-green": { border: "#7AA116", label: "#232F3E", dashed: false, badge: null },
  "service-teal": { border: "#00A4A6", label: "#232F3E", dashed: false, badge: null },
  "service-orange": { border: "#ED7100", label: "#232F3E", dashed: false, badge: null },
  "service-red": { border: "#C7243A", label: "#232F3E", dashed: false, badge: null },
  "service-magenta": { border: "#CD2264", label: "#232F3E", dashed: false, badge: null },
  "service-devtools": { border: "#C925D1", label: "#232F3E", dashed: false, badge: null },
};

/** The category colour of each service group: its corner square when no icon is given. */
export const SERVICE_GROUP_COLORS: Partial<Record<GroupKind, string>> = {
  "service-purple": "#8C4FFF", "service-pink": "#E7157B", "service-green": "#7AA116",
  "service-teal": "#00A4A6", "service-orange": "#ED7100", "service-red": "#C7243A",
  "service-magenta": "#CD2264", "service-devtools": "#C925D1",
};

export const isServiceGroup = (kind: GroupKind): boolean => kind in SERVICE_GROUP_COLORS;

/** Height of the band above a group's content that holds its badge and label. */
export const LABEL_BAND = cell(4);
/** The band of a service group, sized to hold its corner square. It equals LABEL_BAND, so switching a group's kind
 *  never moves its contents; it is its own constant so the service band can change without the others. */
export const SERVICE_BAND = cell(4);
/** The band a group of this kind reserves above its content. */
export const groupBand = (kind?: GroupKind): number => (kind !== undefined && isServiceGroup(kind) ? SERVICE_BAND : LABEL_BAND);
/** Side of a group's corner badge or service square. */
export const GROUP_BADGE = 28;
/** Default inner padding of a drawn group (a borderless one defaults to none). */
export const GROUP_PAD = cell(2);

/** Where a group's title is drawn (its baseline start, text-anchor "start") for a group whose box starts at (x, y):
 *  right of the service square, right of the corner badge, or near the corner for a kind with neither (an unknown
 *  kind is drawn as `generic`). null for a borderless group, which draws nothing. */
export function groupTitleOrigin(kind: GroupKind, x: number, y: number): [number, number] | null {
  if (kind === "borderless") return null;
  if (isServiceGroup(kind)) return [x + GROUP_BADGE + 10, y + GROUP_BADGE / 2 + 5];
  return (GROUP_STYLES[kind] || GROUP_STYLES.generic).badge ? [x + 34, y + 19] : [x + 10, y + 22];
}

export interface Insets { top: number; right: number; bottom: number; left: number }

/** A group's four inner paddings: each side falls back to `pad`, which falls back to `fallback`. */
export function groupInsets(props: GroupProps, fallback: number): Insets {
  const pad = requireGrid(props.pad, "<Group> pad") ?? fallback;
  return {
    top: requireGrid(props.padTop, "<Group> padTop") ?? pad,
    right: requireGrid(props.padRight, "<Group> padRight") ?? pad,
    bottom: requireGrid(props.padBottom, "<Group> padBottom") ?? pad,
    left: requireGrid(props.padLeft, "<Group> padLeft") ?? pad,
  };
}
