#!/usr/bin/env node
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// Look up the icon component to import for a service or resource before writing a scene. Export names follow
// the official AWS icon names exactly, so a guessed name rarely exists.
//
//   node scripts/find-icon.ts "ec2"
//   node scripts/find-icon.ts "lambda function" --type resource
//   node scripts/find-icon.ts "vpc" --type group
//   npm run find -- "aurora" --size 64 --limit 5
//
// Each match prints as an import line plus its name and [type/category/size].
import { searchIcons } from "./lib/icon-catalog.ts";

const USAGE =
  'usage: node scripts/find-icon.ts "<query>" [--type service|resource|group|category] [--size 64] [--limit N]';

interface CommandLine {
  words: string[];
  type: string | null;
  size: number | null;
  limit: number;
}

function parseCommandLine(argv: string[]): CommandLine {
  const words: string[] = [];
  let type: string | null = null;
  let size: number | null = null;
  let limit = 8;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--type") type = argv[++i];
    else if (arg === "--size") size = parseInt(argv[++i], 10);
    else if (arg === "--limit") limit = parseInt(argv[++i], 10);
    else words.push(arg);
  }
  return { words, type, size, limit };
}

function main(): void {
  const { words, type, size, limit } = parseCommandLine(process.argv.slice(2));
  if (words.length === 0) {
    console.error(USAGE);
    process.exit(2);
  }
  const query = words.join(" ");
  const hits = searchIcons(query, { type, size, limit });
  if (hits.length === 0) {
    console.log(`No matches for ${JSON.stringify(query)}. Try fewer/different words or drop --type/--size filters.`);
    return;
  }
  for (const hit of hits) {
    const where = `${hit.type}/${hit.category || "-"}/${hit.size || "-"}`;
    console.log(`import { ${hit.exportName} } from "src/icons/${hit.module}";  |  ${hit.name}  [${where}]`);
  }
}

main();
