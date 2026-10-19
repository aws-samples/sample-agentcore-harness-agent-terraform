// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// Loads a scene. The engine is .tsx, which Node's type stripping cannot run, so a scene is bundled with esbuild
// together with the engine and the group badges into one module graph (React stays external, so the bundle and
// this process share one React). The bundle's exports are typed from the engine's own declarations, which keeps
// `npm run typecheck` covering the render pipeline.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import type React from "react";
import type { Composed, ComposeOptions, GroupIconModule, GroupKind, GroupStyle, SceneSvgProps } from "../../src/engine.tsx";
import { sceneGuard } from "./scene-guard.ts";

/** Absolute path of the skill folder, the renderer package's root. */
export const RENDERER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = path.join(RENDERER_ROOT, "src");
const ENGINE = path.join(SRC, "engine.tsx");
const GROUP_ICONS = path.join(SRC, "icons", "group.js");

export interface LoadedScene {
  diagram: React.ReactElement;
  composeScene: (diagram: React.ReactElement, opts?: ComposeOptions) => Composed;
  SceneSvg: React.ComponentType<SceneSvgProps>;
  GroupIcons: GroupIconModule;
  GROUP_STYLES: Record<GroupKind, GroupStyle>;
}

/** Bundles a scene module with the engine it must share a module graph with, imports it, and removes the
 *  temporary entry and bundle files again. */
export async function loadScene(scenePath: string): Promise<LoadedScene> {
  const scene = path.resolve(scenePath);
  const entrySource =
    `export { default as diagram } from ${JSON.stringify(scene)};\n` +
    `export { composeScene, SceneSvg, GROUP_STYLES } from ${JSON.stringify(ENGINE)};\n` +
    `export * as GroupIcons from ${JSON.stringify(GROUP_ICONS)};\n`;
  const stamp = `${process.pid}-${Math.floor(performance.now())}`;
  const entry = path.join(RENDERER_ROOT, `.entry-${stamp}.tsx`);
  const bundle = path.join(RENDERER_ROOT, `.bundle-${stamp}.mjs`);
  fs.writeFileSync(entry, entrySource);
  try {
    try {
      await build({
        entryPoints: [entry], outfile: bundle, bundle: true, format: "esm", platform: "node", jsx: "automatic",
        loader: { ".js": "jsx", ".jsx": "jsx", ".ts": "ts", ".tsx": "tsx" },
        external: ["react", "react-dom", "react-dom/server"], logLevel: "silent",
        absWorkingDir: path.dirname(scene), plugins: [sceneGuard(entry, SRC)],
      });
    } catch (e: any) {
      // esbuild wraps plugin errors; report their own text.
      const message = e?.errors?.map((x: any) => x.text).join("\n");
      throw new Error(message || String(e));
    }
    const mod = await import(pathToFileURL(bundle).href + `?t=${stamp}`);
    return { diagram: mod.diagram, composeScene: mod.composeScene, SceneSvg: mod.SceneSvg, GroupIcons: mod.GroupIcons, GROUP_STYLES: mod.GROUP_STYLES };
  } finally {
    fs.rmSync(entry, { force: true });
    fs.rmSync(bundle, { force: true });
  }
}
