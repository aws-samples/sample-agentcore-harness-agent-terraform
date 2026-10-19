#!/usr/bin/env bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
# Gateway controls the AWS provider has no resources for yet, applied to every tools gateway after terraform apply
# (deploy.sh runs this). Safe to run again: each step updates what is already there.
#   1. Refresh each gateway's tool list from its target, so clients never see the previous release's tools.
#   2. Cap tool calls per caller (IAM principal, or the token's sub claim) to TOOL_CALLS_PER_MINUTE (default 30).
# Guardrail checks inside gateway policies are not added: with one in the policy engine, tools/list failed with
# "Policy evaluation failed for list tools" for every caller (a listing has no tool input to screen).
#   hosted/scripts/gateway-controls.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TF="$ROOT/hosted/terraform"
RATE="${TOOL_CALLS_PER_MINUTE:-30}"

GATEWAYS="$(terraform -chdir="$TF" output -json tools_gateways)"
[ "$GATEWAYS" != "{}" ] || { echo "no tools gateways in the stack outputs" >&2; exit 1; }
CLI=(aws bedrock-agentcore-control)

echo "$GATEWAYS" | python3 -c '
import json, sys
for name, g in json.load(sys.stdin).items():
    print(name, g["id"], g["authorizer"])
' | while read -r NAME ID AUTH; do
  echo "== $NAME" >&2

  TARGETS="$("${CLI[@]}" list-gateway-targets --gateway-identifier "$ID" --query 'items[].targetId' --output json)"
  "${CLI[@]}" synchronize-gateway-targets --gateway-identifier "$ID" --target-id-list "$TARGETS" >/dev/null
  echo "  tool list synchronized" >&2

  if [ "$AUTH" = "AWS_IAM" ]; then CALLER='$.context.iam.principal'; else CALLER='$.context.jwt.sub'; fi
  ENTRIES="$(python3 -c 'import json, sys; print(json.dumps([{"dimensions": {sys.argv[1]: "*"}, "requests": [{"rate": int(sys.argv[2]), "period": "minute"}]}]))' "$CALLER" "$RATE")"
  if [ -n "$("${CLI[@]}" list-gateway-rate-limits --gateway-identifier "$ID" --query "rateLimits[?rateLimitId=='per-caller'].rateLimitId" --output text)" ]; then
    "${CLI[@]}" update-gateway-rate-limit --gateway-identifier "$ID" --rate-limit-id per-caller --entries "$ENTRIES" >/dev/null
  else
    "${CLI[@]}" create-gateway-rate-limit --gateway-identifier "$ID" --rate-limit-id per-caller \
      --description "Tool calls per caller per minute" --dimension-keys "[\"$CALLER\"]" --entries "$ENTRIES" >/dev/null
  fi
  echo "  $RATE tool calls per minute per caller ($CALLER)" >&2
done
