// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// Optional `--view`: a screenshot of an SVG through agent-browser (headless Chrome), when it is installed. The look
// step does not need it (scripts/svg-to-png.ts covers that); one warm browser session keeps repeated views fast.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const SESSION = "aws-diagram-render";

/** The root width/height attributes of an SVG string (960x600 when missing). */
export function svgSize(svgText: string): [number, number] {
  const width = svgText.match(/\bwidth="([\d.]+)/);
  const height = svgText.match(/\bheight="([\d.]+)/);
  return [width ? parseFloat(width[1]) : 960, height ? parseFloat(height[1]) : 600];
}

/** Screenshots `svgPath` to `outPng`, `outW` px wide. Tries twice (a cold browser launch can fail once).
 *  Returns [ok, what happened]. */
export function screenshotSvg(svgPath: string, outPng: string, svgW: number, svgH: number, outW = 1400): [boolean, string] {
  let browser: string;
  try { browser = execFileSync("which", ["agent-browser"]).toString().trim(); }
  catch { return [false, "agent-browser not installed"]; }
  const session = ["--session", SESSION];
  const steps: string[][] = [
    ["open", pathToFileURL(path.resolve(svgPath)).href, ...session],
    ["set", "viewport", String(Math.round(svgW)), String(Math.round(svgH)), (svgW ? outW / svgW : 1).toFixed(6), ...session],
    ["reload", ...session],
    ["screenshot", "svg", outPng, ...session],
  ];
  let lastError = "unknown error";
  for (let attempt = 0; attempt < 2; attempt++) {
    if (fs.existsSync(outPng)) fs.rmSync(outPng, { force: true });
    let failure: string | null = null;
    for (const step of steps) {
      try { execFileSync(browser, step, { stdio: "pipe" }); }
      catch (e: any) { failure = `agent-browser ${step[0]}: ${String(e.stderr || e).slice(0, 160)}`; break; }
    }
    if (!failure && fs.existsSync(outPng)) return [true, "agent-browser (headless Chrome / Blink)"];
    lastError = failure || "agent-browser screenshot produced no file";
  }
  return [false, lastError];
}

export function closeBrowser(): void {
  try { execFileSync("agent-browser", ["close", "--session", SESSION], { stdio: "pipe" }); } catch { /* no session open */ }
}
