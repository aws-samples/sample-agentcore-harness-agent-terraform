#!/usr/bin/env bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
# Promote a harness version to a named endpoint (default PROD) after it passes an evaluation.
#   hosted/scripts/promote.sh [--version N] [--endpoint PROD] [--skip-eval]
# Without --version it promotes the latest version (the one DEFAULT serves). Unless --skip-eval,
# it first runs one test request on DEFAULT, waits for the spans and scores the session with
# scripts/evaluate.py; a failing score stops the promotion. Roll back with --version <older> --skip-eval.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
TF="$HERE/../terraform"
ENDPOINT=PROD VERSION="" EVAL=1
while [ $# -gt 0 ]; do
  case "$1" in
    --version) VERSION="$2"; shift 2 ;;
    --endpoint) ENDPOINT="$2"; shift 2 ;;
    --skip-eval) EVAL=0; shift ;;
    *) echo "unknown argument $1" >&2; exit 2 ;;
  esac
done

HARNESS_ARN="$(terraform -chdir="$TF" output -raw harness_arn)"
[ -n "$HARNESS_ARN" ] || { echo "no harness in the Terraform state" >&2; exit 1; }
REGION="$(echo "$HARNESS_ARN" | cut -d: -f4)"
HARNESS_ID="${HARNESS_ARN##*/}"
if [ -z "$VERSION" ]; then
  VERSION="$(aws bedrock-agentcore-control list-harness-versions --region "$REGION" --harness-id "$HARNESS_ID" \
    --query 'max_by(harnessVersions, &to_number(harnessVersion)).harnessVersion' --output text)"
fi
echo "harness $HARNESS_ID: promote version $VERSION to $ENDPOINT"

if [ "$EVAL" = 1 ]; then
  SESSION="$(printf '%s' '{"message": "Draw a serverless REST API on AWS: Amazon API Gateway, AWS Lambda and Amazon DynamoDB. Hand over the links."}' \
    | AWS_ARCH_HARNESS_ARN="$HARNESS_ARN" AWS_ARCH_HARNESS_ENDPOINT=DEFAULT python3 "$HERE/../container/ask_harness.py" \
    | python3 -c 'import json, sys; print(json.load(sys.stdin)["session_id"])')"
  echo "test session $SESSION; waiting for its spans"
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    sleep 60
    if python3 "$HERE/evaluate.py" --session "$SESSION" --endpoint DEFAULT; then PASSED=1; break; fi
    PASSED=0
  done
  [ "${PASSED:-0}" = 1 ] || { echo "evaluation did not pass; $ENDPOINT left unchanged" >&2; exit 1; }
fi

if aws bedrock-agentcore-control get-harness-endpoint --region "$REGION" --harness-id "$HARNESS_ID" --endpoint-name "$ENDPOINT" >/dev/null 2>&1; then
  aws bedrock-agentcore-control update-harness-endpoint --region "$REGION" --harness-id "$HARNESS_ID" \
    --endpoint-name "$ENDPOINT" --target-version "$VERSION" >/dev/null
else
  aws bedrock-agentcore-control create-harness-endpoint --region "$REGION" --harness-id "$HARNESS_ID" \
    --endpoint-name "$ENDPOINT" --target-version "$VERSION" --description "Promoted by scripts/promote.sh" >/dev/null
fi
echo "$ENDPOINT now serves version $VERSION (ask_architect calls the endpoint set in ask_architect_endpoint)"
