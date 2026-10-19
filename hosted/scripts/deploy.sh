#!/usr/bin/env bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
# Plan and apply the hosted stack with every input it was deployed with, and refuse a plan that deletes anything.
# The inputs live in hosted/terraform/terraform.tfvars (not committed; start from terraform.tfvars.example). The
# image tag comes from a new build (--build), from --tag, or from the running stack, so it is never typed by hand
# and never empty: an empty tag would plan the harness, the tools runtime and the gateways for deletion. After the
# apply it runs gateway-controls.sh (tool list sync, per-caller rate limits).
#   hosted/scripts/deploy.sh [--build | --tag TAG] [--allow-delete] [--yes] [--promote]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TF="$ROOT/hosted/terraform"
BUILD=0 ALLOW_DELETE=0 YES=0 PROMOTE=0 TAG=""
while [ $# -gt 0 ]; do
  case "$1" in
    --build) BUILD=1 ;;
    --tag) TAG="${2:?--tag needs a value}"; shift ;;
    --allow-delete) ALLOW_DELETE=1 ;;
    --yes) YES=1 ;;
    --promote) PROMOTE=1 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

ls "$TF"/*.tf >/dev/null 2>&1 || { echo "no Terraform files in $TF" >&2; exit 1; }
[ -f "$TF/terraform.tfvars" ] || { echo "missing $TF/terraform.tfvars: copy terraform.tfvars.example and fill it in" >&2; exit 1; }
echo "stack: $TF, account $(aws sts get-caller-identity --query Account --output text)" >&2
terraform -chdir="$TF" init -input=false >/dev/null

if [ "$BUILD" = 1 ]; then
  TAG="$("$ROOT/hosted/scripts/build-image.sh")"
elif [ -z "$TAG" ]; then
  TAG="$(terraform -chdir="$TF" output -raw image_tag 2>/dev/null || true)"
fi
[ -n "$TAG" ] || { echo "no image tag in the stack: run with --build or --tag" >&2; exit 1; }
echo "image tag: $TAG" >&2

PLAN="$TF/deploy.tfplan"
terraform -chdir="$TF" plan -input=false -out="$PLAN" -var "image_tag=$TAG"
DELETES="$(terraform -chdir="$TF" show -json "$PLAN" | python3 -c '
import json, sys
for change in json.load(sys.stdin).get("resource_changes", []):
    if "delete" in change["change"]["actions"]:
        print(change["address"])
')"
if [ -n "$DELETES" ]; then
  echo "the plan deletes or replaces:" >&2
  while IFS= read -r address; do echo "  $address" >&2; done <<<"$DELETES"
  [ "$ALLOW_DELETE" = 1 ] || { echo "not applied; rerun with --allow-delete if that is intended" >&2; exit 1; }
fi
if [ "$YES" != 1 ]; then
  read -r -p "apply this plan? [y/N] " answer
  [ "$answer" = "y" ] || { echo "not applied" >&2; exit 1; }
fi
terraform -chdir="$TF" apply -input=false "$PLAN"
"$ROOT/hosted/scripts/gateway-controls.sh"
if [ "$PROMOTE" = 1 ]; then
  "$ROOT/hosted/scripts/promote.sh"
fi
