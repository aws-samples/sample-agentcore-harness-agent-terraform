// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// The scene guard: an esbuild plugin that keeps a scene to what a diagram needs. A scene is code the model writes
// and rendering runs it, so it may import only the engine and icons (src/), React and sibling scene files, and it
// may not use the language features that reach outside (process, dynamic import, eval, Function, constructor
// tricks, network calls). It is a static check that raises the bar for a scene nobody reviewed, not a sandbox.
import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "esbuild";

const ALLOWED_PACKAGES = new Set(["react", "react/jsx-runtime"]);
// Checked on the parsed source, so the same words in label text or comments are fine.
const FORBIDDEN_GLOBALS = new Set([
  "process", "globalThis", "global", "window", "self", "require", "module", "exports", "eval", "Function",
  "fetch", "XMLHttpRequest", "WebSocket", "EventSource", "Deno", "Bun", "Reflect", "Proxy", "WebAssembly",
]);
const FORBIDDEN_MEMBERS = new Set(["constructor", "prototype", "__proto__", "__defineGetter__", "__lookupGetter__"]);
const SCRIPT_FILE = /\.(tsx|ts|jsx|js)$/;

/** Is `file` strictly inside `dir`? */
export function isInside(file: string, dir: string): boolean {
  const rel = path.relative(dir, file);
  return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}

let typescript: any;

/** The first forbidden construct in a scene file, as "line N uses …", or null. */
async function firstViolation(file: string): Promise<string | null> {
  typescript ??= (await import("typescript")).default;
  const ts = typescript;
  const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const line = (node: any) => `line ${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`;
  let found: string | null = null;
  const visit = (node: any): void => {
    if (found) return;
    if (ts.isIdentifier(node) && FORBIDDEN_GLOBALS.has(node.text)) {
      // The same name as a property, a JSX attribute or an import/export specifier is not the global.
      const parent = node.parent;
      const notTheGlobal = (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
        (ts.isPropertyAssignment(parent) && parent.name === node) || ts.isJsxAttribute(parent) ||
        ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent);
      if (!notTheGlobal) found = `${line(node)} uses ${node.text}`;
    } else if (ts.isPropertyAccessExpression(node) && FORBIDDEN_MEMBERS.has(node.name.text)) {
      found = `${line(node)} reads .${node.name.text}`;
    } else if (ts.isElementAccessExpression(node)) {
      // Only a literal index: a computed name is how "constructor" would be spelled past the check above.
      const index = node.argumentExpression;
      const literal = ts.isNumericLiteral(index) || (ts.isStringLiteralLike(index) && !FORBIDDEN_MEMBERS.has(index.text));
      if (!literal) found = `${line(node)} uses a computed member name`;
    } else if (node.kind === ts.SyntaxKind.ImportKeyword && ts.isCallExpression(node.parent)) {
      found = `${line(node)} uses dynamic import()`;
    } else if (ts.isMetaProperty(node)) {
      found = `${line(node)} uses ${node.getText(source)}`;
    } else if (node.kind === ts.SyntaxKind.WithStatement) {
      found = `${line(node)} uses a with statement`;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** Marks the guard's own resolve probe, so the probe is not judged again. */
const PROBE = "sceneGuardProbe";

/** The plugin for one bundle. `entry` is the generated entry file and `srcDir` the trusted engine + icons folder. */
export function sceneGuard(entry: string, srcDir: string): Plugin {
  return {
    name: "scene-guard",
    setup(build) {
      build.onResolve({ filter: /.*/ }, async (args) => {
        if (args.pluginData?.[PROBE]) return undefined;
        if (args.importer === entry || args.kind === "entry-point" || isInside(args.importer, srcDir)) return undefined;
        if (ALLOWED_PACKAGES.has(args.path)) return undefined;
        if (args.path.startsWith(".")) {
          // Judge the file esbuild would really load: an extensionless "./x" may resolve to x.json or to a
          // file outside the scene's folder, which the specifier as written does not show.
          const resolved = await build.resolve(args.path, {
            kind: args.kind, importer: args.importer, resolveDir: args.resolveDir, pluginData: { [PROBE]: true },
          });
          // A relative import that resolves nowhere is a broken import, not a guard case: esbuild reports it.
          if (resolved.errors.length) return undefined;
          const target = resolved.path;
          if (isInside(target, srcDir) || (isInside(target, args.resolveDir) && SCRIPT_FILE.test(target))) return undefined;
        }
        return { errors: [{ text: `scene guard: ${path.basename(args.importer)} imports "${args.path}". A scene may import only the engine (src/engine.tsx), the icons (src/icons/*), React and other scene files beside it.` }] };
      });
      build.onLoad({ filter: SCRIPT_FILE }, async (args) => {
        if (args.path === entry || isInside(args.path, srcDir)) return undefined;
        const violation = await firstViolation(args.path);
        if (violation) return { errors: [{ text: `scene guard: ${path.basename(args.path)} ${violation}, which a diagram scene never needs.` }] };
        return undefined;
      });
    },
  };
}
