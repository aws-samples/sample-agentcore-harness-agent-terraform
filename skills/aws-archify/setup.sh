#!/usr/bin/env bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
# One-time setup for aws-archify: installs the renderer's Node.js packages next to it.
# Safe to re-run; needs the network once. Nothing runs online afterwards.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
command -v node >/dev/null || { echo "Node.js 22.18+ is required" >&2; exit 1; }
NODE_VER="$(node -p 'process.versions.node')"
IFS=. read -r NODE_MAJOR NODE_MINOR _ <<<"$NODE_VER"
if [ "$NODE_MAJOR" -lt 22 ] || { [ "$NODE_MAJOR" -eq 22 ] && [ "$NODE_MINOR" -lt 18 ]; }; then
  echo "Node.js 22.18+ is required (found $NODE_VER)" >&2
  exit 1
fi
cd "$HERE"
if [ -d node_modules/@napi-rs/canvas ] && [ -d node_modules/esbuild ] && [ -d node_modules/react ]; then
  echo "aws-archify: dependencies already installed"
  exit 0
fi
npm ci --no-audit --no-fund
echo "aws-archify: setup complete"
