// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// The generated icon catalog, read on first use: ranked search (find-icon, the edit CLI and the editor's icon
// picker), lookup by export name, and standalone preview SVGs built from the generated icon modules.
// scripts/build-icons.ts writes src/icons/catalog.json and those modules.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ICONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "icons");
const ICON_MODULES = ["service.js", "resource.js", "group.js", "category.js"];

export interface IconEntry {
  exportName: string;
  name: string;
  raw: string;
  type: string;
  category: string | null;
  size: number | null;
  color: string | null;
  path: string;
  module: string;
}

export interface IconSearchOptions {
  type?: string | null;
  size?: number | null;
  limit?: number;
}

// Short names people search for, mapped to words of the official icon names (the files use full service names, so
// "s3" alone would match nothing).
const ALIASES: Record<string, string> = {
  s3: "simple storage service", sqs: "simple queue service", sns: "simple notification service",
  ses: "simple email service", elb: "elastic load balancing",
  alb: "elastic load balancing application", nlb: "elastic load balancing network",
  ebs: "elastic block store", efs: "elastic file system", ecs: "elastic container service",
  eks: "elastic kubernetes service", ecr: "elastic container registry",
  vpc: "virtual private cloud", iam: "identity and access management",
  apigw: "api gateway", "api gw": "api gateway", ddb: "dynamodb", dynamo: "dynamodb",
  cw: "cloudwatch", r53: "route 53", route53: "route 53", asg: "ec2 auto scaling",
  kms: "key management service", mq: "amazon mq", msk: "managed streaming for apache kafka",
};

interface LoadedCatalog {
  byName: IconEntry[];
  byExportName: Map<string, IconEntry>;
}

let loaded: LoadedCatalog | null = null;

function loadedCatalog(): LoadedCatalog {
  if (loaded) return loaded;
  const file = JSON.parse(fs.readFileSync(path.join(ICONS_DIR, "catalog.json"), "utf8")) as IconEntry[];
  // The file names modules as "./service.js"; callers want the bare file name.
  const entries = file.map((entry) => ({ ...entry, module: entry.module.replace(/^\.\//, "") }));
  const byExportName = new Map<string, IconEntry>();
  for (const entry of entries) {
    if (entry.exportName && !byExportName.has(entry.exportName)) byExportName.set(entry.exportName, entry);
  }
  loaded = { byName: entries.slice().sort((a, b) => a.name.localeCompare(b.name)), byExportName };
  return loaded;
}

const searchWords = (text: string): string[] => text.split(/[\s\-_]+/).filter(Boolean);

// Higher is a better match. `query` is a search term or an alias expansion.
function relevance(query: unknown, entry: IconEntry): number {
  const q = String(query).toLowerCase().trim();
  const name = entry.name.toLowerCase();
  const raw = entry.raw.toLowerCase();
  const exportName = entry.exportName.toLowerCase();
  const nameWords = new Set(searchWords(name));
  const queryWords = searchWords(q);
  let score = 0;
  if (q === name) score += 100;
  // A pasted export name ("AmazonSimpleStorageService") has no separators, so compare it with the query squashed.
  if (exportName === q.replace(/[^a-z0-9]/g, "")) score += 100;
  if (name.includes(q)) score += 40;
  if (raw.includes(q)) score += 20;
  if (exportName.includes(q)) score += 20;
  score += queryWords.filter((word) => nameWords.has(word)).length * 15;
  if (queryWords.length && queryWords.every((word) => name.includes(word) || raw.includes(word))) score += 25;
  score -= name.length * 0.05;
  return score;
}

/** Icons matching `query`, best first. An empty query lists the whole (filtered) catalog in name order, which is
 *  what the editor's picker shows before anything is typed; pass `limit: Infinity` for no cap. */
export function searchIcons(
  query: string,
  { type = null, size = null, limit = 8 }: IconSearchOptions = {},
): IconEntry[] {
  const pool = loadedCatalog().byName.filter(
    (e) => (!type || e.type === type) && (!size || !e.size || e.size === size),
  );
  if (!String(query).trim()) return pool.slice(0, limit);
  const term = ALIASES[String(query).toLowerCase().trim()] || query;
  return pool
    .map((entry): [number, IconEntry] => [relevance(term, entry), entry])
    .filter(([score]) => score > 0)
    .sort((a, b) => b[0] - a[0] || (a[1].path < b[1].path ? -1 : 1))
    .slice(0, limit)
    .map(([, entry]) => entry);
}

export function iconByExportName(exportName: string): IconEntry | undefined {
  return loadedCatalog().byExportName.get(exportName);
}

/** The source line scripts/build-icons.ts writes for one icon in a generated module. */
export function iconModuleLine(exportName: string, viewBox: string, markup: string): string {
  return `export const ${exportName} = /* @__PURE__ */ icon(${JSON.stringify(viewBox)}, ${JSON.stringify(markup)});`;
}

/** The whole of src/icons/runtime.js, which scripts/build-icons.ts writes beside the modules: the `icon()` factory
 *  each generated line above calls. Kept verbatim (String.raw), so the regular expressions read as they run. */
export const ICON_RUNTIME_JS = String.raw`// AUTO-GENERATED by scripts/build-icons.ts from the AWS Architecture Icons package; do not edit.
// The factory behind every icon export: the icon's official SVG markup inside a positioned <svg>
// that keeps the file's own viewBox. A few icons point at ids of their own (a clip path). Given an
// idPrefix, such an icon puts it in front of each of those ids, so two copies of it on one page
// never share an id. Every other icon drops the prop and renders its markup unchanged.
import React from "react";

// Where markup points at an id: url(#a), url('#a'), href="#a" (xlink:href too).
const ID_REFERENCE = /(?:url\(['"]?|href=")#([^"')\s]+)/g;
// The same spots plus each definition, id="a"; the second group is the id.
const ID_SPOT = /(\sid="|url\(['"]?#|href="#)([^"')\s]+)/g;

export function icon(viewBox, markup) {
  const own = new Set(Array.from(markup.matchAll(ID_REFERENCE), (m) => m[1]));
  const prefixed = (prefix) => markup.replace(ID_SPOT, (spot, lead, id) => (own.has(id) ? lead + prefix + id : spot));
  return ({ idPrefix, ...props }) => React.createElement("svg", {
    viewBox,
    overflow: "visible",
    ...props,
    // The markup is the bundled AWS icon's own SVG, never user input.
    dangerouslySetInnerHTML: { __html: idPrefix && own.size ? prefixed(idPrefix) : markup }, // nosemgrep: typescript.react.security.audit.react-dangerouslysetinnerhtml.react-dangerouslysetinnerhtml
  });
}
`;

// Reads back what iconModuleLine writes.
const ICON_LINE = /^export const (\w+) = \/\* @__PURE__ \*\/ icon\("((?:[^"\\]|\\.)*)", "((?:[^"\\]|\\.)*)"\);$/;

// Only \n, \t, \" and \\ are decoded, in this order, and the viewBox is taken as written: generated icon markup
// holds no other escapes.
const decodeMarkup = (literal: string): string =>
  literal.replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\"/g, '"').replace(/\\\\/g, "\\");

let glyphs: Map<string, { viewBox: string; markup: string }> | null = null;

function iconGlyphs(): Map<string, { viewBox: string; markup: string }> {
  if (glyphs) return glyphs;
  glyphs = new Map();
  for (const module of ICON_MODULES) {
    let text: string;
    try {
      text = fs.readFileSync(path.join(ICONS_DIR, module), "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      const icon = ICON_LINE.exec(line);
      if (icon && !glyphs.has(icon[1])) glyphs.set(icon[1], { viewBox: icon[2], markup: decodeMarkup(icon[3]) });
    }
  }
  return glyphs;
}

/** A standalone <svg> of one icon at `px` square, for the editor's icon picker; null for an unknown export name. */
export function iconPreviewSvg(exportName: string, px = 40): string | null {
  const glyph = iconGlyphs().get(exportName);
  if (!glyph) return null;
  const { viewBox, markup } = glyph;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${px}" height="${px}">${markup}</svg>`;
}
