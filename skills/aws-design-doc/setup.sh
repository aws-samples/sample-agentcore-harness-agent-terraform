#!/usr/bin/env bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
# One-time setup for aws-design-doc: installs python-docx into this skill's vendor/python
# with the same python3 the builders use, and sets up aws-archify for figure PNGs.
# Safe to re-run; needs the network once.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
command -v python3 >/dev/null || { echo "Python 3.9 or later is required" >&2; exit 1; }
if ! python3 -c "import sys; sys.path.insert(0, '$HERE/vendor/python'); import docx" 2>/dev/null; then
  python3 -m pip install --quiet --upgrade --target "$HERE/vendor/python" -r "$HERE/requirements.txt"
fi
if [ -x "$HERE/../aws-archify/setup.sh" ] || [ -f "$HERE/../aws-archify/setup.sh" ]; then
  bash "$HERE/../aws-archify/setup.sh"
fi
if ! command -v pandoc >/dev/null; then
  echo "note: install pandoc for Word output (macOS: brew install pandoc; Debian/Ubuntu: sudo apt-get install pandoc; Fedora: sudo dnf install pandoc)"
fi
echo "aws-design-doc: setup complete"
