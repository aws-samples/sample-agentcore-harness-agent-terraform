// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// The AWS Architecture Icons package as scripts/build-icons.ts reads it: where the package folder is, which of
// its SVG files are icons, and the name, type, category, size and color each icon gets. The package is not
// shipped with this repo.
import fs from "node:fs";
import path from "node:path";

export const PACKAGE_HELP =
  "The AWS icon library is not shipped with this repo. Download the AWS Architecture Icons package " +
  "(https://aws.amazon.com/architecture/icons/), unzip it, and set AWS_ICONS_DIR to that folder " +
  "(or run: node scripts/build-icons.ts <dir>).";

/** One icon file of the package; `path` is relative to the package folder. */
export interface PackageIcon {
  name: string;
  raw: string;
  type: string;
  category: string | null;
  size: number | null;
  color: string | null;
  path: string;
}

export type IconsDirLookup = { dir: string } | { problem: string };

// The four icon sets, told apart by the name of their top-level folder ("Resource-Icons_04302026", ...).
const ICON_SETS: [folderPrefix: string, type: string][] = [
  ["Architecture-Service-Icons", "service"],
  ["Resource-Icons", "resource"],
  ["Architecture-Group-Icons", "group"],
  ["Category-Icons", "category"],
];

// Category folder names carry one of these prefixes, and so do the icon file names.
const NAME_PREFIXES = ["Arch_", "Res_", "Arch-Category_"];

// Category tile colors: the color of every resource icon, and of service and group icons whose file has no fill.
const CATEGORY_COLORS: Record<string, string> = {
  Analytics: "#8C4FFF", "Application-Integration": "#E7157B", "Artificial-Intelligence": "#01A88D",
  Blockchain: "#ED7100", "Business-Applications": "#DD344C", "Cloud-Financial-Management": "#7AA116",
  Compute: "#ED7100", Containers: "#ED7100", "Customer-Enablement": "#C925D1", Databases: "#C925D1",
  "Developer-Tools": "#C925D1", "End-User-Computing": "#C925D1", "Front-End-Web-Mobile": "#DD344C",
  Games: "#8C4FFF", "General-Icons": "#232F3E", "Internet-of-Things": "#7AA116",
  "Management-Tools": "#E7157B", "Management-Governance": "#E7157B", "Media-Services": "#ED7100",
  "Migration-Modernization": "#01A88D", "Networking-Content-Delivery": "#8C4FFF",
  "Quantum-Technologies": "#ED7100", Satellite: "#C925D1", "Security-Identity": "#DD344C",
  "Security-Identity-Compliance": "#DD344C", Storage: "#7AA116",
};

const isDirectory = (p: string): boolean => fs.existsSync(p) && fs.statSync(p).isDirectory();

/** The package folder: `explicit` (a command-line argument) when given, else `fromEnv` ($AWS_ICONS_DIR), else the
 *  nearest Icons/ folder in `searchFrom` or a folder above it. */
export function locateIconsDir(
  explicit: string | undefined,
  fromEnv: string | undefined,
  searchFrom: string,
): IconsDirLookup {
  if (explicit) {
    const dir = path.resolve(explicit);
    return isDirectory(dir) ? { dir } : { problem: `icons directory not found: ${dir}` };
  }
  if (fromEnv) {
    const dir = path.resolve(fromEnv);
    return isDirectory(dir) ? { dir } : { problem: `AWS_ICONS_DIR is not a directory: ${dir}` };
  }
  for (let dir = searchFrom; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, "Icons");
    if (isDirectory(candidate)) return { dir: path.resolve(candidate) };
    if (path.dirname(dir) === dir) break;
  }
  return {
    problem: "could not find an Icons/ directory (no argument, no AWS_ICONS_DIR, none above the renderer folder).",
  };
}

/** The file's text, or null when it cannot be read. */
export function readSvgText(file: string): string | null {
  try {
    return fs.readFileSync(file, "utf-8");
  } catch {
    return null;
  }
}

/** The viewBox of an icon file and the markup inside its outer <svg> element. */
export function svgParts(text: string): { viewBox: string; markup: string } {
  const viewBox = /viewBox="([^"]+)"/.exec(text)?.[1] ?? "0 0 64 64";
  const markup = text
    .replace(/<\?xml[^>]*\?>/, "")
    .trim()
    .replace(/<svg\b[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "")
    .trim();
  return { viewBox, markup };
}

/** The PascalCase export name for an icon name. A trailing size ("Users 48") is dropped, and a name that would
 *  start with a digit gets an "Icon" prefix so it stays a valid identifier. */
export function componentName(name: string): string {
  const words = name.replace(/\s+(16|32|48|64)$/, "").replace(/[^A-Za-z0-9]+/g, " ").trim().split(/\s+/);
  const joined = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join("");
  if (!joined) return "Icon";
  return /^[0-9]/.test(joined) ? `Icon${joined}` : joined;
}

/** Every icon of the package except the dark variants, sorted by type, then name, then size. */
export function scanIconPackage(root: string): PackageIcon[] {
  const icons: PackageIcon[] = [];
  for (const file of svgFilesUnder(root, [])) {
    const raw = path.basename(file, ".svg");
    // Dark variants are white artwork for dark backgrounds. Diagrams here always have a light canvas, where they
    // would show as blank tiles, and each one has a light twin.
    if (/_Dark$/.test(raw)) continue;
    const rel = path.relative(root, file);
    const segments = rel.split(path.sep);
    const type = ICON_SETS.find(([prefix]) => segments[0].startsWith(prefix))?.[1] ?? "other";
    const category = categoryOf(segments);
    let color = type === "service" || type === "group" ? tileColor(file) : null;
    if (!color && category) color = CATEGORY_COLORS[category] || null;
    const sizeMatch = /_(16|32|48|64)(?:@5x)?(?:_(?:Light|Dark))?$/.exec(raw);
    const size = sizeMatch ? parseInt(sizeMatch[1], 10) : null;
    icons.push({ name: displayName(raw), raw, type, category, size, color, path: rel });
  }
  return icons.sort(byTypeNameSize);
}

// Depth first, each folder's entries in the order readdir gives them; that order settles icons that sort equal.
function svgFilesUnder(dir: string, found: string[]): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) svgFilesUnder(full, found);
    else if (entry.isFile() && entry.name.endsWith(".svg")) found.push(full);
  }
  return found;
}

// The first path segment (folder or file name) with a name prefix names the category: "Arch_Compute" -> "Compute".
function categoryOf(segments: string[]): string | null {
  for (const segment of segments) {
    const prefix = NAME_PREFIXES.find((p) => segment.startsWith(p));
    if (prefix) return segment.slice(prefix.length).replace(/_(16|32|48|64)$/, "");
  }
  return null;
}

// Service and group icons sit on a colored tile; its fill, or else the first fill in the file, is the icon's color.
function tileColor(file: string): string | null {
  const text = readSvgText(file);
  if (text === null) return null;
  const fill = /Icon-Architecture-BG[^>]*fill="(#[0-9A-Fa-f]{6})"/.exec(text) ?? /fill="(#[0-9A-Fa-f]{6})"/.exec(text);
  return fill ? fill[1] : null;
}

function displayName(raw: string): string {
  return raw
    .replace(/_(16|32|48|64)(@5x)?$/, "")
    .replace(/_(Light|Dark)$/, "")
    .replace(/^(Arch_|Res_|Arch-Category_)/, "")
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function byTypeNameSize(a: PackageIcon, b: PackageIcon): number {
  if (a.type !== b.type) return a.type < b.type ? -1 : 1;
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  return (a.size || 0) - (b.size || 0);
}
