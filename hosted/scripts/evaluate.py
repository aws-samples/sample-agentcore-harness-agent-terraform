#!/usr/bin/env python3
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
"""Score one hosted agent session on demand with AgentCore Evaluations.

    python3 hosted/scripts/evaluate.py --session <id> [--endpoint DEFAULT] [--min 1]

Downloads the session's spans from CloudWatch Logs (the harness runtime log group
and aws/spans, which needs Transaction Search), runs the stack's custom evaluator
plus Builtin.GoalSuccessRate on them, prints each result and exits 1 if any score
is below --min. Spans take a few minutes to arrive after a session ends.
"""
import argparse
import json
import subprocess  # nosec B404 - fixed argument lists of known tools, never a shell
import sys
import time
from pathlib import Path

import boto3

TF = Path(__file__).resolve().parent.parent / "terraform"


def tf_outputs():
    out = subprocess.run(["terraform", f"-chdir={TF}", "output", "-json"], check=True, capture_output=True, text=True).stdout  # nosec B603, B607 - fixed argument list of a tool found on PATH
    return {k: v["value"] for k, v in json.loads(out).items()}


def query(logs, group, session, hours):
    now = int(time.time())
    qid = logs.start_query(
        logGroupName=group, startTime=now - hours * 3600, endTime=now,
        queryString=("fields @timestamp, @message | filter ispresent(scope.name) and ispresent(attributes.session.id)"
                     f' | filter attributes.session.id = "{session}" | sort @timestamp asc | limit 10000'),
    )["queryId"]
    while (res := logs.get_query_results(queryId=qid))["status"] not in ("Complete", "Failed", "Cancelled", "Timeout"):
        time.sleep(1)
    if res["status"] != "Complete":
        sys.exit(f"log query on {group} ended {res['status']}")
    return [json.loads(f["value"]) for row in res["results"] for f in row
            if f["field"] == "@message" and f["value"].lstrip().startswith("{")]


def session_spans(region, runtime_id, endpoint, session, hours):
    logs = boto3.client("logs", region_name=region)
    spans = []
    for group in (f"/aws/bedrock-agentcore/runtimes/{runtime_id}-{endpoint}", "aws/spans"):
        try:
            spans += query(logs, group, session, hours)
        except logs.exceptions.ResourceNotFoundException:
            print(f"no log group {group}", file=sys.stderr)
    return spans


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--session", required=True)
    ap.add_argument("--endpoint", default="DEFAULT", help="harness endpoint the session ran on")
    ap.add_argument("--evaluator", action="append", help="evaluator id (repeatable); default: the stack's evaluator and Builtin.GoalSuccessRate")
    ap.add_argument("--min", type=float, default=1.0, help="lowest acceptable score")
    ap.add_argument("--hours", type=int, default=6, help="how far back to look for the session")
    args = ap.parse_args()

    out = tf_outputs()
    region = out["harness_arn"].split(":")[3]
    spans = session_spans(region, out["harness_runtime_id"], args.endpoint, args.session, args.hours)
    if not spans:
        sys.exit("no spans for this session yet; wait a few minutes and retry")
    print(f"{len(spans)} span records", file=sys.stderr)

    client = boto3.client("bedrock-agentcore", region_name=region)
    failed = False
    for evaluator in args.evaluator or [out["evaluator_id"], "Builtin.GoalSuccessRate"]:
        results = client.evaluate(evaluatorId=evaluator, evaluationInput={"sessionSpans": spans})["evaluationResults"]
        for r in results:
            value = r.get("value")
            ok = value is not None and value >= args.min
            failed |= not ok
            print(json.dumps({"evaluator": evaluator, "value": value, "label": r.get("label"),
                              "ok": ok, "explanation": (r.get("explanation") or r.get("errorMessage") or "")[:300]}))
        if not results:
            print(json.dumps({"evaluator": evaluator, "ok": False, "explanation": "no result"}))
            failed = True
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
