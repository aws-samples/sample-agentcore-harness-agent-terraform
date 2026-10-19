// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// What edit mode may change and how: the per-tag prop schema behind the editor's fields
// and the CLI's `schema` command, the group kinds, input checks, `applyOp` (one structured
// edit in, new source text out), and the trial render an edit must pass before either
// front-end (scripts/edit-server.ts, scripts/edit-cli.ts) writes it.
import fs from "node:fs";
import type { ComposeOptions } from "../../src/engine.tsx";
import { GROUP_STYLES, SERVICE_GROUP_COLORS, type GroupKind } from "../../src/engine/groups.ts";
import { iconByExportName } from "./icon-catalog.ts";
import { renderSvg } from "./render-scene.ts";
import {
  addEngineImport, addIconImport, appendChild, attachableIds, deleteWithDependents, ensureId, findAttr,
  insertBeforeDiagramEnd, moveBy, readValue, scanElements, uniqueSlug, writeProp,
  type PropKind, type SourceElement,
} from "./scene-source.ts";

export interface Swatch {
  value: string;
  label: string;
}

export interface PropSpec {
  prop: string;
  kind: PropKind;
  choices?: string[];
  /** Edited as free text. */
  text?: boolean;
  /** Names another element's id (an arrow end). */
  idref?: boolean;
  range?: { min: number; max: number; step: number };
  /** Edited as a colour: swatches plus any hex. */
  color?: boolean;
  swatches?: Swatch[];
}

export type PropSchema = Record<string, PropSpec[]>;

/** One-click arrow colours: the AWS default line colour and the category colours the examples use in legends. */
export const ARROW_SWATCHES: Swatch[] = [
  { value: "#232F3E", label: "default (squid ink)" },
  { value: "#0972D3", label: "blue — request path" },
  { value: "#8C4FFF", label: "purple — invocation" },
  { value: "#5A6B86", label: "gray — async / external" },
  { value: "#7AA116", label: "green — storage" },
  { value: "#ED7100", label: "orange — compute" },
  { value: "#00A4A6", label: "teal — networking" },
  { value: "#C7243A", label: "red — security / failure" },
];

const SIDES = ["left", "right", "top", "bottom"];
const text = (prop: string, kind: PropKind = "string"): PropSpec => ({ prop, kind, text: true });
const pick = (prop: string, choices: string[], kind: PropKind = "string"): PropSpec => ({ prop, kind, choices });

/** The editable props per tag. Group `kind` lists no choices here; EDIT_SCHEMA adds the engine's kinds. */
export const PROP_SCHEMA: PropSchema = {
  Node: [text("label"), text("sub"), text("size", "expr"), text("id")],
  Icon: [text("size", "expr"), text("id")],
  Group: [
    text("label"),
    { prop: "kind", kind: "string" },
    pick("layout", ["row", "col", "grid", "zstack", "free"]),
    pick("align", ["start", "center", "end"]),
    text("gap", "expr"),
    text("cols", "expr"),
    text("id"),
  ],
  Arrow: [
    { prop: "from", kind: "string", idref: true },
    { prop: "to", kind: "string", idref: true },
    pick("fromSide", SIDES),
    pick("toSide", SIDES),
    pick("head", ["end", "start", "both", "none"]),
    pick("dashed", ["true", "false"], "bool"),
    { prop: "color", kind: "string", color: true, swatches: ARROW_SWATCHES },
    pick("elbow", ["true", "false"], "expr"),
    // Where the first turn sits, as a fraction of the way from source to target.
    { prop: "riser", kind: "expr", range: { min: 0, max: 1, step: 0.05 } },
    pick("labelAt", ["start", "middle", "end"]),
    pick("labelSide", ["top", "bottom", "left", "right"]),
  ],
};

/** A group kind as the editor previews it. */
export interface GroupKindInfo {
  kind: GroupKind;
  border: string;
  badge: string | null;
  service: boolean;
}

export const GROUP_KINDS: GroupKindInfo[] = (Object.keys(GROUP_STYLES) as GroupKind[]).map((kind) => ({
  kind,
  // borderless has no border colour ("none"), and the editor paints this value as a swatch
  border: kind === "borderless" ? "transparent" : GROUP_STYLES[kind].border,
  badge: GROUP_STYLES[kind].badge,
  service: kind in SERVICE_GROUP_COLORS,
}));

/** PROP_SCHEMA with the Group `kind` choices filled in: what the editor and `schema` serve. */
export const EDIT_SCHEMA: PropSchema = {
  ...PROP_SCHEMA,
  Group: PROP_SCHEMA.Group.map((spec) =>
    (spec.prop === "kind" ? { ...spec, choices: GROUP_KINDS.map((k) => k.kind) } : spec)),
};

/** The kind of the first schema prop with this name, across tags in schema order. A prop the schema does not know
 *  is written the way its value reads: a number or true/false as an expression, anything else as a string. */
export function propKind(prop: string, value?: string | null): PropKind {
  for (const specs of Object.values(PROP_SCHEMA)) {
    const spec = specs.find((s) => s.prop === prop);
    if (spec) return spec.kind;
  }
  return value != null && /^(-?\d+(\.\d+)?|true|false)$/.test(value.trim()) ? "expr" : "string";
}

export interface PropWrite {
  prop: string;
  value: string | null;
  kind?: PropKind;
}

export type EditOp =
  | ({ op: "setProp"; editId: string } & PropWrite)
  | { op: "setProps"; editId: string; props: PropWrite[] }
  | { op: "shift"; editId: string; dx?: number; dy?: number }
  | { op: "scale"; editId: string; side: string; d: number }
  | { op: "setIcon"; editId: string; icon: string }
  | { op: "delete"; editId: string }
  | { op: "connect"; fromEditId: string; fromSide?: string; toEditId: string; toSide?: string }
  | { op: "addNode"; editId: string };

export interface EditResult {
  src: string;
  /** The id given to a node that addNode created. */
  newId?: string;
}

type Untrusted = Record<string, unknown> | null | undefined;

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const EXPR_VALUE = /^(-?\d+(\.\d+)?|true|false|[A-Za-z_$][\w$]*)$/;
const PROP_KINDS: unknown[] = ["string", "expr", "bool"];

/**
 * Why a prop write must be refused, or null. The value is spliced into the .tsx, so a name must
 * be an identifier, an expr a number, boolean or identifier, and a string must not end its quotes.
 */
export function propError(input: unknown): string | null {
  const p = input as Untrusted;
  if (!p || typeof p.prop !== "string" || !IDENTIFIER.test(p.prop)) return "invalid prop name";
  const kind = p.kind ?? "string";
  if (!PROP_KINDS.includes(kind)) return `invalid prop kind "${kind}"`;
  const value = p.value;
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return "prop value must be a string or null";
  if (kind === "expr" && !EXPR_VALUE.test(value.trim())) {
    return `"${p.prop}" must be a number, true/false or an identifier`;
  }
  if (kind === "string" && value.includes('"')) return `"${p.prop}" may not contain a double quote`;
  return null;
}

/** Why an edit request must be refused before it is applied, or null. */
export function editError(input: unknown): string | null {
  const cmd = input as Untrusted;
  if (!cmd || typeof cmd !== "object" || typeof cmd.op !== "string") return "invalid edit command";
  if (cmd.op === "setProp") return propError(cmd);
  if (cmd.op === "setProps") {
    if (!Array.isArray(cmd.props)) return "setProps needs a props array";
    for (const p of cmd.props) {
      const problem = propError(p);
      if (problem) return problem;
    }
  }
  return null;
}

// Indexed as a plain object on purpose: a request's side such as "constructor" resolves through the
// prototype, and the trial render then rejects the edit.
const PAD_BY_SIDE: Record<string, string> = { top: "padTop", right: "padRight", bottom: "padBottom", left: "padLeft" };

const intValue = (v: string | null): number | null => (v != null && /^-?\d+$/.test(v) ? parseInt(v, 10) : null);

/** Applies one edit to the scene source and returns the new source. Throws with the reason for a bad edit. */
export function applyOp(src: string, cmd: EditOp): EditResult {
  const problem = editError(cmd);
  if (problem) throw new Error(problem);
  if (cmd.op === "connect") return connect(src, cmd);
  if (cmd.op === "addNode") return addNode(src, cmd.editId);

  const elements = scanElements(src);
  const el = elements.find((e) => e.editId === cmd.editId);
  if (!el) throw new Error("element not found (source changed?)");
  switch (cmd.op) {
    case "setProp":
      return { src: setProp(src, elements, el, cmd) };
    case "setProps": {
      let out = src;
      for (const p of cmd.props) {
        const current = scanElements(out).find((e) => e.editId === cmd.editId);
        if (!current) throw new Error("element not found");
        out = writeProp(out, current, p.prop, p.value, p.kind || "string");
      }
      return { src: out };
    }
    case "shift": {
      const dx = (cmd.dx as number) | 0;
      const dy = (cmd.dy as number) | 0;
      return { src: addEngineImport(moveBy(src, el, dx, dy), "Move") };
    }
    case "scale":
      return { src: scale(src, el, cmd.side, cmd.d) };
    case "setIcon": {
      const icon = iconByExportName(cmd.icon);
      if (!icon) throw new Error("unknown icon: " + cmd.icon);
      return { src: addIconImport(writeProp(src, el, "icon", icon.exportName, "expr"), icon.exportName, icon.module) };
    }
    case "delete":
      return { src: deleteWithDependents(src, cmd.editId) };
  }
  throw new Error("unknown op: " + (cmd as { op: string }).op);
}

function connect(src: string, cmd: Extract<EditOp, { op: "connect" }>): EditResult {
  const [withFrom, fromId] = ensureId(src, cmd.fromEditId);
  const [withBoth, toId] = ensureId(withFrom, cmd.toEditId);
  if (fromId === toId) throw new Error("cannot connect an element to itself");
  const attrs = [`from="${fromId}"`, `to="${toId}"`];
  if (SIDES.includes(cmd.fromSide as string)) attrs.push(`fromSide="${cmd.fromSide}"`);
  if (SIDES.includes(cmd.toSide as string)) attrs.push(`toSide="${cmd.toSide}"`);
  return { src: insertBeforeDiagramEnd(withBoth, `<Arrow ${attrs.join(" ")} />`) };
}

function addNode(src: string, groupEditId: string): EditResult {
  const elements = scanElements(src);
  const group = elements.find((e) => e.editId === groupEditId);
  if (!group || group.tag !== "Group") throw new Error("target is not a group");
  const id = uniqueSlug(null, "node", new Set(attachableIds(elements)));
  const withNode = appendChild(src, group, `<Node id="${id}" label="New node" />`);
  return { src: addEngineImport(withNode, "Node"), newId: id };
}

/** A from/to value "@<editId>" names an id-less group: it gets an id from its label, and the arrow end points at it. */
function setProp(
  src: string, elements: SourceElement[], el: SourceElement, cmd: Extract<EditOp, { op: "setProp" }>,
): string {
  const value = cmd.value;
  if ((cmd.prop === "from" || cmd.prop === "to") && typeof value === "string" && value.startsWith("@")) {
    const group = elements.find((e) => e.editId === value.slice(1));
    if (!group) throw new Error("target group not found");
    const id = uniqueSlug(readValue(findAttr(group, "label")), "group", new Set(attachableIds(elements)));
    const withId = writeProp(src, group, "id", id, "string");
    const arrow = scanElements(withId).find((e) => e.editId === cmd.editId)!;
    return writeProp(withId, arrow, cmd.prop, id, "string");
  }
  return writeProp(src, el, cmd.prop, value, cmd.kind || "string");
}

/** Grows or shrinks one edge of a group through its per-side padding, never below 0. */
function scale(src: string, el: SourceElement, side: string, delta: number): string {
  if (el.tag !== "Group") throw new Error("only a Group can be scaled");
  const prop = PAD_BY_SIDE[side];
  if (!prop) throw new Error("scale needs side: top|right|bottom|left");
  const fallback = readValue(findAttr(el, "kind")) === "borderless" ? 0 : 16;
  const base = intValue(readValue(findAttr(el, "pad"))) ?? fallback;
  const current = intValue(readValue(findAttr(el, prop))) ?? base;
  return writeProp(src, el, prop, String(Math.max(0, current + (delta | 0))), "expr");
}

/**
 * Renders `source` from `tempPath` (deleted afterwards) to prove an edit still renders. Returns
 * the render error's message, or null on success. Each front-end picks its own temp name and options.
 */
export async function trialRender(tempPath: string, source: string, options?: ComposeOptions): Promise<string | null> {
  fs.writeFileSync(tempPath, source);
  try {
    await renderSvg(tempPath, options);
    return null;
  } catch (err: any) {
    return String(err?.message || err);
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
}
