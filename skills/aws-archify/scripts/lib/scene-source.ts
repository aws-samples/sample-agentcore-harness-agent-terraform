// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// Edit mode's model of a scene's .tsx text. Nothing parses TypeScript here: the editable
// JSX elements and their attributes are found by scanning characters, and every edit is
// a splice into the original text, so the author's formatting and comments survive.
// Offsets index into the source string; this module never reads files or renders.

export type EditableTag = "Node" | "Group" | "Arrow" | "Icon";
export type PropKind = "string" | "expr" | "bool";

/** One attribute exactly as written: `raw` is the text in [start, end), e.g. `size={64}` or a bare `dashed`. */
export interface AttrSpan {
  name: string;
  raw: string;
  start: number;
  end: number;
}

export interface SourceElement {
  /** "e0", "e1", ... in source order. The editor and the CLI address elements by it. */
  editId: string;
  tag: EditableTag;
  /** Offset of the opening "<". */
  start: number;
  /** Offset right after the tag name, where an added attribute goes. */
  attrsAt: number;
  /** Offset right after the opening tag's ">" (or "/>"). */
  openEnd: number;
  selfClosing: boolean;
  attrs: AttrSpan[];
}

export interface ElementSummary {
  editId: string;
  tag: EditableTag;
  props: Record<string, string | null>;
  source: string;
}

/** An arrow end the editor offers: an element id, or "@<editId>" for a group that has no id yet. */
export interface AttachTarget {
  value: string;
  label: string;
  group: boolean;
  icon?: string;
  kind?: string;
  sub?: string;
}

const EDITABLE_TAGS: ReadonlySet<string> = new Set(["Node", "Group", "Arrow", "Icon"]);
// Of the tags the scan sees, the ones the engine gives an attach box (Anchor has one too, but is never scanned).
const ATTACHABLE_TAGS: ReadonlySet<string> = new Set(["Node", "Icon", "Group"]);
const OPENING_TAG = /<([A-Z][A-Za-z0-9]*)(\s|\/|>)/g;
const ATTR_NAME = /^[A-Za-z_][A-Za-z0-9_]*/;
const WHITESPACE = /\s/;
const PLAIN_ID = /^[A-Za-z0-9_-]+$/;
const ICON_IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const MOVE_OPENED_BEFORE = /<Move(\s[^>]*?)>\s*$/;
const MOVE_DX = /\bdx=\{?(-?\d+)\}?/;
const MOVE_DY = /\bdy=\{?(-?\d+)\}?/;
const ENGINE_IMPORT = /import\s*\{([^}]*)\}\s*from\s*["'][^"']*engine\.tsx["'];?/;
const ENGINE_IMPORT_LINE = /import\s*\{[^}]*\}\s*from\s*["'][^"']*engine\.tsx["']\s*;?/;
const ENGINE_SPECIFIER = /from\s*(["'][^"']*engine\.tsx["'])/;
const LEADING_SPACE = /^\s*/;

const isQuote = (ch: string | undefined): boolean => ch === '"' || ch === "'" || ch === "`";

/**
 * Which characters of `src` are code, as opposed to comment or string/template literal text.
 * An apostrophe right after a letter or digit ("user's", "don't" in an arrow label) is JSX text: no
 * string literal can start there. Other JSX text and `${}` nesting are not modelled.
 */
export function markCode(src: string): boolean[] {
  const n = src.length;
  const code: boolean[] = new Array(n).fill(true);
  let i = 0;
  const skipTo = (end: number): void => {
    for (let k = i; k < end && k < n; k++) code[k] = false;
    i = end;
  };
  while (i < n) {
    const ch = src[i];
    if (ch === "/" && src[i + 1] === "/") {
      const newline = src.indexOf("\n", i);
      skipTo(newline < 0 ? n : newline);
    } else if (ch === "/" && src[i + 1] === "*") {
      // The terminator test looks one character back, so the opening star can end it: "/*/" is closed.
      let k = i + 2;
      while (k < n && !(src[k - 1] === "*" && src[k] === "/")) k++;
      skipTo(k < n ? k + 1 : k);
    } else if (ch === "'" && i > 0 && /[A-Za-z0-9]/.test(src[i - 1])) {
      i++;
    } else if (isQuote(ch)) {
      let k = i + 1;
      while (k < n) {
        if (src[k] === "\\") {
          k += 2;
          continue;
        }
        k++;
        if (src[k - 1] === ch) break;
      }
      skipTo(k);
    } else {
      i++;
    }
  }
  return code;
}

/** Every editable opening tag that sits in code, in source order. */
export function scanElements(src: string): SourceElement[] {
  const code = markCode(src);
  const found: SourceElement[] = [];
  for (const m of src.matchAll(OPENING_TAG)) {
    const tag = m[1];
    const start = m.index;
    if (!EDITABLE_TAGS.has(tag) || !code[start]) continue;
    const attrsAt = start + 1 + tag.length;
    const close = openingTagEnd(src, attrsAt);
    if (!close) continue;
    found.push({
      editId: `e${found.length}`,
      tag: tag as EditableTag,
      start,
      attrsAt,
      openEnd: close.end,
      selfClosing: close.selfClosing,
      attrs: readAttrs(src, attrsAt, close.selfClosing ? close.end - 2 : close.end - 1),
    });
  }
  return found;
}

/** Where the opening tag whose attributes begin at `from` ends; quoted text and {...} are skipped over. */
function openingTagEnd(src: string, from: number): { end: number; selfClosing: boolean } | null {
  let depth = 0;
  let quote: string | null = null;
  for (let i = from; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (isQuote(ch)) {
      quote = ch;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
    } else if (depth === 0) {
      if (ch === "/" && src[i + 1] === ">") return { end: i + 2, selfClosing: true };
      if (ch === ">") return { end: i + 1, selfClosing: false };
    }
  }
  return null;
}

/**
 * The attributes in [from, to). A spread or any other non-name text is stepped over one character
 * at a time, so the identifiers inside it come out as bare attributes, and edit mode lists them.
 */
export function readAttrs(src: string, from: number, to: number): AttrSpan[] {
  const attrs: AttrSpan[] = [];
  let i = from;
  while (i < to) {
    while (i < to && WHITESPACE.test(src[i])) i++;
    if (i >= to) break;
    const name = ATTR_NAME.exec(src.slice(i, to))?.[0];
    if (!name) {
      i++;
      continue;
    }
    const start = i;
    i = attrEnd(src, start + name.length, to);
    attrs.push({ name, raw: src.slice(start, i), start, end: i });
  }
  return attrs;
}

/** End of the attribute whose name ends at `nameEnd`: past its value, or `nameEnd` for a bare attribute. */
function attrEnd(src: string, nameEnd: number, to: number): number {
  let j = nameEnd;
  while (j < to && WHITESPACE.test(src[j])) j++;
  if (src[j] !== "=") return nameEnd;
  j++;
  while (j < to && WHITESPACE.test(src[j])) j++;
  const first = src[j];
  if (isQuote(first)) {
    let k = j + 1;
    while (k < to && src[k] !== first) k++;
    return k + 1;
  }
  if (first === "{") {
    let depth = 0;
    let quote: string | null = null;
    for (let k = j; k < to; k++) {
      const ch = src[k];
      if (quote) {
        if (ch === quote) quote = null;
      } else if (isQuote(ch)) {
        quote = ch;
      } else if (ch === "{") {
        depth++;
      } else if (ch === "}" && --depth === 0) {
        return k + 1;
      }
    }
    return to;
  }
  let k = j;
  while (k < to && !WHITESPACE.test(src[k])) k++;
  return k;
}

export function findAttr(el: SourceElement, name: string): AttrSpan | undefined {
  return el.attrs.find((a) => a.name === name);
}

const unquote = (s: string): string =>
  (s[0] === '"' && s.endsWith('"')) || (s[0] === "'" && s.endsWith("'")) ? s.slice(1, -1) : s;

/** An attribute's value as plain text: quotes and braces stripped, "true" for a bare attribute, null when absent. */
export function readValue(attr: AttrSpan | undefined): string | null {
  if (!attr) return null;
  const eq = attr.raw.indexOf("=");
  if (eq < 0) return "true";
  const text = attr.raw.slice(eq + 1).trim();
  return text[0] === "{" ? unquote(text.slice(1, -1).trim()) : unquote(text);
}

/** `src` with `__editId="eN"` on every element that lacks one; the engine turns it into data-edit-id. */
export function withEditIds(src: string, elements: SourceElement[]): string {
  let out = "";
  let copied = 0;
  for (const el of elements) {
    if (findAttr(el, "__editId")) continue;
    out += src.slice(copied, el.attrsAt) + ` __editId="${el.editId}"`;
    copied = el.attrsAt;
  }
  return out + src.slice(copied);
}

/**
 * Sets, replaces or (value null) removes one attribute. JSX has no false spelling for a bool
 * attribute, where absence is false, so "false" and "0" remove a bool too.
 */
export function writeProp(src: string, el: SourceElement, name: string, value: string | null, kind: PropKind): string {
  const remove = value === null || (kind === "bool" && (value === "false" || value === "0"));
  const current = findAttr(el, name);
  if (remove) {
    if (!current) return src;
    const from = src[current.start - 1] === " " ? current.start - 1 : current.start;
    return src.slice(0, from) + src.slice(current.end);
  }
  const text = `${name}${kind === "bool" ? "" : kind === "expr" ? `={${value}}` : `="${value}"`}`;
  if (current) return src.slice(0, current.start) + text + src.slice(current.end);
  return src.slice(0, el.attrsAt) + " " + text + src.slice(el.attrsAt);
}

/** The element's whole text: through its matching closing tag, or just its opening tag if self-closing or unmatched. */
export function elementSpan(src: string, el: SourceElement): { start: number; end: number } {
  if (el.selfClosing) return { start: el.start, end: el.openEnd };
  const closeTag = `</${el.tag}>`;
  const opener = new RegExp(`<${el.tag}\\b`, "g");  // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp -- a JSX tag name parsed from the scene
  let depth = 1;
  let at = el.openEnd;
  while (depth > 0) {
    const close = src.indexOf(closeTag, at);
    if (close < 0) return { start: el.start, end: el.openEnd };
    opener.lastIndex = at;
    const open = opener.exec(src);
    if (open && open.index < close) {
      depth++;
      at = open.index + 1;
    } else {
      depth--;
      at = close + closeTag.length;
    }
  }
  return { start: el.start, end: at };
}

export function describeElement(src: string, el: SourceElement): ElementSummary {
  const props: Record<string, string | null> = {};
  for (const attr of el.attrs) props[attr.name] = readValue(attr);
  const span = elementSpan(src, el);
  return { editId: el.editId, tag: el.tag, props, source: src.slice(el.start, Math.min(span.end, el.start + 400)) };
}

/** A literal id an arrow can name; computed ids such as `${id}-vpc` do not count. */
export const isPlainId = (v: string | null): v is string => !!v && PLAIN_ID.test(v);

export function attachableIds(elements: SourceElement[]): string[] {
  const ids = new Set<string>();
  for (const el of elements) {
    if (!ATTACHABLE_TAGS.has(el.tag)) continue;
    const id = readValue(findAttr(el, "id"));
    if (isPlainId(id)) ids.add(id);
  }
  return [...ids].sort();
}

function iconName(el: SourceElement): string | undefined {
  const v = readValue(findAttr(el, "icon"));
  return v && ICON_IDENTIFIER.test(v) ? v : undefined;
}

export function attachTargets(elements: SourceElement[]): AttachTarget[] {
  const targets: AttachTarget[] = [];
  const seen = new Set<string>();
  for (const el of elements) {
    if (!ATTACHABLE_TAGS.has(el.tag)) continue;
    const id = readValue(findAttr(el, "id"));
    const isGroup = el.tag === "Group";
    const icon = iconName(el);
    const kind = isGroup ? readValue(findAttr(el, "kind")) || "generic" : undefined;
    if (isPlainId(id)) {
      if (seen.has(id)) continue;
      seen.add(id);
      const label = readValue(findAttr(el, "label")) || id;
      targets.push({ value: id, label, group: isGroup, icon, kind, sub: isGroup ? `group #${id}` : `#${id}` });
    } else if (isGroup) {
      const label = readValue(findAttr(el, "label")) || "group";
      targets.push({ value: `@${el.editId}`, label, group: true, kind, icon, sub: "group · assign id" });
    }
  }
  return targets;
}

/** A slug of `label` (or `fallback`) that is not in `taken`: "api", then "api-2", "api-3", ... */
export function uniqueSlug(label: string | null, fallback: string, taken: ReadonlySet<string>): string {
  const slug = (label || fallback).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const base = slug || fallback;
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

/** Gives the element a plain id when it has none (a slug of its label) and returns the source with that id. */
export function ensureId(src: string, editId: string): [string, string] {
  const elements = scanElements(src);
  const el = elements.find((e) => e.editId === editId);
  if (!el) throw new Error("element not found — reload");
  const current = readValue(findAttr(el, "id"));
  if (isPlainId(current)) return [src, current];
  const id = uniqueSlug(readValue(findAttr(el, "label")), el.tag.toLowerCase(), new Set(attachableIds(elements)));
  return [writeProp(src, el, "id", id, "string"), id];
}

/**
 * Offsets an element by wrapping it in <Move>. A <Move> that wraps only this element takes the
 * offset instead, and is removed when its offset comes to zero.
 */
export function moveBy(src: string, el: SourceElement, dx: number, dy: number): string {
  const span = elementSpan(src, el);
  const head = src.slice(0, span.start);
  const body = src.slice(span.start, span.end);
  const tail = src.slice(span.end);
  const wrapper = MOVE_OPENED_BEFORE.exec(head);
  if (wrapper && tail.trimStart().startsWith("</Move>")) {
    const offset = (axis: RegExp): number => {
      const v = axis.exec(wrapper[1])?.[1];
      return v == null ? 0 : parseInt(v, 10);
    };
    const nx = offset(MOVE_DX) + dx;
    const ny = offset(MOVE_DY) + dy;
    const outside = head.slice(0, head.length - wrapper[0].length);
    const afterWrapper = tail.slice(tail.indexOf("</Move>") + "</Move>".length);
    if (nx === 0 && ny === 0) return outside + body + afterWrapper;
    return `${outside}<Move dx={${nx}} dy={${ny}}>${body}</Move>${afterWrapper}`;
  }
  if (dx === 0 && dy === 0) return src;
  return `${head}<Move dx={${dx}} dy={${dy}}>${body}</Move>${tail}`;
}

const importedNames = (list: string): string[] => list.split(",").map((s) => s.trim()).filter(Boolean);

function replaceMatch(src: string, m: RegExpExecArray, text: string): string {
  return src.slice(0, m.index) + text + src.slice(m.index + m[0].length);
}

/**
 * Makes `exportName` imported from the icon module `moduleFile` (e.g. "service.js"). A new import
 * line goes after the engine import, with a path that assumes the scene sits in assets/examples/.
 */
export function addIconImport(src: string, exportName: string, moduleFile: string): string {
  const escaped = moduleFile.replace(/\./g, "\\.");
  const existing = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*(["'][^"']*icons/${escaped}["'])\\s*;?`).exec(src);  // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp -- the icon module name, regex-escaped above
  if (existing) {
    const names = importedNames(existing[1]);
    if (names.includes(exportName)) return src;
    return replaceMatch(src, existing, `import { ${[...names, exportName].join(", ")} } from ${existing[2]};`);
  }
  const engine = ENGINE_IMPORT_LINE.exec(src);
  // The new import takes the folder of an icon import the scene already has; else the folder beside its
  // engine import (a scene in scenes/ imports "../src/engine.tsx", a gallery scene "../../src/engine.tsx").
  const iconImport = /from\s*["']([^"']*\/icons\/)[^"'/]+\.js["']/.exec(src);
  const engineFrom = engine && ENGINE_SPECIFIER.exec(engine[0])![1].slice(1, -1);
  const iconsDir = iconImport ? iconImport[1] : engineFrom ? engineFrom.replace(/engine\.tsx$/, "icons/") : "../src/icons/";
  const line = `\nimport { ${exportName} } from "${iconsDir}${moduleFile}";`;
  if (!engine) return line.trimStart() + "\n" + src;
  const at = engine.index + engine[0].length;
  return src.slice(0, at) + line + src.slice(at);
}

/** Adds `name` to the scene's engine import, if it has one and the name is missing. */
export function addEngineImport(src: string, name: string): string {
  const m = ENGINE_IMPORT.exec(src);
  if (!m) return src;
  const names = importedNames(m[1]);
  if (names.includes(name)) return src;
  const specifier = ENGINE_SPECIFIER.exec(m[0])![1];
  return replaceMatch(src, m, `import { ${[...names, name].join(", ")} } from ${specifier};`);
}

/** Cuts the element out, and its whole line when nothing else is on it. */
export function removeElement(src: string, el: SourceElement): string {
  const span = elementSpan(src, el);
  const lineStart = src.lastIndexOf("\n", span.start - 1) + 1;
  const newline = src.indexOf("\n", span.end);
  const lineEnd = newline < 0 ? src.length : newline;
  const alone = src.slice(lineStart, span.start).trim() === "" && src.slice(span.end, lineEnd).trim() === "";
  if (!alone) return src.slice(0, span.start) + src.slice(span.end);
  return src.slice(0, lineStart) + src.slice(newline < 0 ? src.length : newline + 1);
}

/** Top-level `const NAME = "text"` declarations: a scene may name an id once and write `to={NAME}`. */
function stringConstants(src: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of src.matchAll(/^\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(["'])([^"'\\\n]*)\2\s*;?\s*$/gm)) out.set(m[1], m[3]);
  return out;
}

/** An attribute's value with a bare `{NAME}` resolved through the scene's string constants. */
function resolvedValue(el: SourceElement, prop: string, constants: Map<string, string>): string | null {
  const attr = findAttr(el, prop);
  const value = readValue(attr);
  const bare = attr && /=\s*\{\s*[A-Za-z_$][\w$]*\s*\}\s*$/.test(attr.raw);
  return bare && value !== null && constants.has(value) ? constants.get(value)! : value;
}

/**
 * Deletes an element after first deleting every Arrow outside it that names an id inside it, written
 * as a string or as a `{NAME}` constant. Every cut is found in the original text and made from the
 * last one back, so the offsets of each element still hold when its turn comes.
 */
export function deleteWithDependents(src: string, editId: string): string {
  const elements = scanElements(src);
  const target = elements.find((e) => e.editId === editId);
  if (!target) throw new Error("element not found — reload");
  const span = elementSpan(src, target);
  const within = (el: SourceElement): boolean => el.start >= span.start && el.start < span.end;
  const constants = stringConstants(src);
  const goneIds = new Set<string>();
  for (const el of elements) {
    const id = resolvedValue(el, "id", constants);
    if (within(el) && isPlainId(id)) goneIds.add(id);
  }
  const namesGoneId = (el: SourceElement): boolean =>
    ["from", "to"].some((p) => goneIds.has(resolvedValue(el, p, constants)!));
  const dependents = elements.filter((el) => el.tag === "Arrow" && !within(el) && namesGoneId(el));
  return [target, ...dependents]
    .sort((a, b) => b.start - a.start)
    .reduce((out, el) => removeElement(out, el), src);
}

/** Inserts `jsx` on its own line just above the last </Diagram>, indented one step deeper than it. */
export function insertBeforeDiagramEnd(src: string, jsx: string): string {
  const close = src.lastIndexOf("</Diagram>");
  if (close < 0) throw new Error("no </Diagram> to insert before");
  const lineStart = src.lastIndexOf("\n", close) + 1;
  const indent = LEADING_SPACE.exec(src.slice(lineStart, close))![0] + "  ";
  return `${src.slice(0, lineStart)}${indent}${jsx}\n${src.slice(lineStart)}`;
}

/** Appends `jsx` as the group's last child, opening a self-closing group first. */
export function appendChild(src: string, group: SourceElement, jsx: string): string {
  const lineStart = src.lastIndexOf("\n", group.start - 1) + 1;
  const indent = LEADING_SPACE.exec(src.slice(lineStart, group.start))![0];
  const childIndent = indent + "  ";
  if (group.selfClosing) {
    const opening = src.slice(group.start, group.openEnd - 2).replace(/\s*$/, "") + ">";
    return `${src.slice(0, group.start)}${opening}\n${childIndent}${jsx}\n${indent}</Group>${src.slice(group.openEnd)}`;
  }
  const close = src.lastIndexOf("</Group>", elementSpan(src, group).end);
  const closeLineStart = src.lastIndexOf("\n", close - 1) + 1;
  return `${src.slice(0, closeLineStart)}${childIndent}${jsx}\n${src.slice(closeLineStart)}`;
}
