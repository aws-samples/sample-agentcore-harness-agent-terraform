#!/usr/bin/env node
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// Prints a link that opens a .drawio file in diagrams.net (app.diagrams.net), loaded and ready to edit.
// Nothing is uploaded: the whole diagram travels in the URL fragment, which a browser never sends to a server.
//
//   node scripts/drawio-link.ts figure.drawio          print the link
//   node scripts/drawio-link.ts figure.drawio --open   print it and open it in the default browser
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { deflateRawSync } from "node:zlib";

const MAX_BYTES = 2 * 1024 * 1024;

// diagrams.net's #create= payload: the URL-encoded XML, raw-deflated and base64-encoded, inside a JSON object.
function diagramsNetLink(xml: string): string {
  const data = deflateRawSync(Buffer.from(encodeURIComponent(xml)), { level: 9 }).toString("base64");
  const payload = JSON.stringify({ type: "xml", compressed: true, data });
  return `https://app.diagrams.net/#create=${encodeURIComponent(payload)}`;
}

function browserOpener(): string {
  if (process.platform === "darwin") return "open";
  if (process.platform === "win32") return "explorer";
  return "xdg-open";
}

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
if (!file) {
  console.error("usage: node scripts/drawio-link.ts <file.drawio> [--open]");
  process.exit(2);
}
const xml = readFileSync(file, "utf8").trim();
if (!xml.startsWith("<mxfile")) {
  console.error(`${file} is not a draw.io file`);
  process.exit(1);
}
if (Buffer.byteLength(xml) > MAX_BYTES) {
  console.error(`${file} is over 2 MB; open it in draw.io instead`);
  process.exit(1);
}
const link = diagramsNetLink(xml);
console.log(link);
if (args.includes("--open")) spawnSync(browserOpener(), [link], { stdio: "ignore" });
