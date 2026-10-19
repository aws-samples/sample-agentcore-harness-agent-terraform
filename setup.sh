#!/usr/bin/env bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
# Installs every skill's dependencies. Each skill also carries its own setup.sh,
# which the agent runs on first use, so this is only a convenience for a checkout.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
bash "$ROOT/skills/aws-design-doc/setup.sh"
echo "setup complete"
