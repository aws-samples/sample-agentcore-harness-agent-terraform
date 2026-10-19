#!/usr/bin/env bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
# Add the tools gateway as an MCP record in the stack's AWS Agent Registry and approve it.
# Terraform has no resource for registry records, so this runs after terraform apply.
#   hosted/scripts/register-tools.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TF="$ROOT/hosted/terraform"
REGISTRY="$(terraform -chdir="$TF" output -raw registry_id)"
GATEWAY_URL="$(terraform -chdir="$TF" output -raw tools_gateway_url)"
[ -n "$REGISTRY" ] && [ -n "$GATEWAY_URL" ] || { echo "registry_id or tools_gateway_url is empty" >&2; exit 1; }

DESCRIPTORS="$(python3 - "$GATEWAY_URL" <<'PY'
import json, sys
server = {
    "name": "aws-architecture-agent/tools",
    "description": "AWS architecture diagrams with the official icons, layout checks and design documents",
    "version": "2.1.0",
    "remotes": [{"type": "streamable-http", "url": sys.argv[1]}],
}
print(json.dumps({"mcpServer": {"data": json.dumps(server), "dataSchemaVersion": "2025-12-11"}}))
PY
)"

aws agent-registry-control create-registry-record --registry-id "$REGISTRY" \
  --name aws-architecture-agent-tools --display-name "AWS Architecture Agent tools" \
  --description "AWS diagrams with the official icons, layout checks and AWS design documents, behind an AgentCore Gateway with Cedar tool rules." \
  --record-type MCP --record-version 2.1.0 --descriptors "$DESCRIPTORS" >/dev/null

# New records start as DRAFT; the registry auto-approves on submit (approval rule APPROVE_ALL).
RECORD="$(aws agent-registry-control list-registry-records --registry-id "$REGISTRY" \
  --query "registryRecords[?name=='aws-architecture-agent-tools'].recordId | [0]" --output text)"
until [ "$(aws agent-registry-control list-registry-records --registry-id "$REGISTRY" \
  --query "registryRecords[?recordId=='$RECORD'].status | [0]" --output text)" != "CREATING" ]; do sleep 3; done
aws agent-registry-control submit-registry-record-for-approval --registry-id "$REGISTRY" --record-id "$RECORD" \
  --query '[recordId,status]' --output text
