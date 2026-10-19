#!/usr/bin/env bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
# Package the working tree the image needs, upload it, build the arm64 image on
# CodeBuild and print the new tag. Run from anywhere after the first terraform apply.
#   hosted/scripts/build-image.sh [TAG]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TF="$ROOT/hosted/terraform"
[ -f "$TF/terraform.tfstate" ] || [ -d "$TF/.terraform" ] || { echo "run terraform apply in $TF first" >&2; exit 1; }
TAG="${1:-$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo local)-$(date +%Y%m%d%H%M%S)}"
BUCKET="$(terraform -chdir="$TF" output -raw build_bucket)"
PROJECT="$(terraform -chdir="$TF" output -raw codebuild_project)"
[ -n "$BUCKET" ] && [ -n "$PROJECT" ] || { echo "terraform outputs are empty" >&2; exit 1; }

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
# Tracked and new, non-ignored files under the folders the image uses.
git -C "$ROOT" ls-files --cached --others --exclude-standard -z -- skills mcp-server agents hosted/container \
  | (cd "$ROOT" && xargs -0 zip -q "$STAGE/context.zip")
KEY="context/$TAG.zip"
aws s3 cp --only-show-errors "$STAGE/context.zip" "s3://$BUCKET/$KEY"

BUILD_ID="$(aws codebuild start-build --project-name "$PROJECT" \
  --source-location-override "$BUCKET/$KEY" \
  --environment-variables-override "name=IMAGE_TAG,value=$TAG,type=PLAINTEXT" \
  --query build.id --output text)"
echo "build $BUILD_ID started (tag $TAG)" >&2
while :; do
  STATUS="$(aws codebuild batch-get-builds --ids "$BUILD_ID" --query 'builds[0].buildStatus' --output text)"
  case "$STATUS" in
    IN_PROGRESS) sleep 15 ;;
    SUCCEEDED) echo "$TAG"; exit 0 ;;
    *) echo "build $BUILD_ID ended $STATUS" >&2; exit 1 ;;
  esac
done
