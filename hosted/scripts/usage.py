#!/usr/bin/env python3
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
"""Usage and feedback report for the hosted MCP tools, from the tools runtime's CloudWatch logs.

The MCP server writes one JSON line per tool call (tool, ms, ok, error, session) and one per
send_feedback call. This counts calls, failures, slow calls and sessions, and lists the feedback.

  python3 hosted/scripts/usage.py               # last 7 days
  python3 hosted/scripts/usage.py --days 30
"""
import argparse
import subprocess  # nosec B404 - fixed argument lists of known tools, never a shell
import time
from pathlib import Path

import boto3

TF = Path(__file__).resolve().parent.parent / "terraform"


def tf_output(name):
    return subprocess.run(["terraform", f"-chdir={TF}", "output", "-raw", name], check=True, capture_output=True, text=True).stdout.strip()  # nosec B603, B607 - fixed argument list of a tool found on PATH


def query(logs, group, days, text):
    end = int(time.time())
    qid = logs.start_query(logGroupName=group, startTime=end - days * 86400, endTime=end, queryString=text)["queryId"]
    while True:
        r = logs.get_query_results(queryId=qid)
        if r["status"] in ("Complete", "Failed", "Cancelled", "Timeout"):
            return [{c["field"]: c["value"] for c in row} for row in r["results"]]
        time.sleep(1)


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--days", type=int, default=7)
    args = ap.parse_args()
    runtime_id = tf_output("tools_runtime_arn").rsplit("/", 1)[-1]
    group = f"/aws/bedrock-agentcore/runtimes/{runtime_id}-DEFAULT"
    logs = boto3.client("logs")
    calls = 'filter event = "tool_call"'
    failed = "sum(strcontains(@message, '\"ok\":false')) as failed"
    totals = query(logs, group, args.days, f'{calls} | stats count(*) as calls, {failed}, count_distinct(session) as sessions')
    per_tool = query(logs, group, args.days, f'{calls} | stats count(*) as calls, {failed}, avg(ms) as avg_ms, max(ms) as max_ms by tool | sort calls desc')
    errors = query(logs, group, args.days, f'{calls} | filter @message like \'"ok":false\' | stats count(*) as n by tool, error | sort n desc | limit 10')
    feedback = query(logs, group, args.days, 'filter event = "feedback" | fields @timestamp, rating, artifact, comment | sort @timestamp desc | limit 50')

    t = totals[0] if totals else {}
    print(f"Last {args.days} days: {t.get('calls', 0)} tool calls, {t.get('failed', 0)} failed, {t.get('sessions', 0)} sessions\n")
    print(f"{'tool':22s} {'calls':>6s} {'failed':>6s} {'avg ms':>8s} {'max ms':>8s}")
    for r in per_tool:
        print(f"{r.get('tool', ''):22s} {r.get('calls', ''):>6s} {r.get('failed', ''):>6s} {float(r.get('avg_ms', 0)):8.0f} {float(r.get('max_ms', 0)):8.0f}")
    if errors:
        print("\nTop errors:")
        for r in errors:
            print(f"  {r.get('n')} x {r.get('tool')}: {r.get('error', '')[:160]}")
    good = sum(1 for f in feedback if f.get("rating") == "good")
    print(f"\nFeedback: {len(feedback)} ({good} good, {len(feedback) - good} bad)")
    for f in feedback:
        print(f"  {f.get('@timestamp', '')[:16]}  {f.get('rating', ''):4s}  {f.get('artifact') or '-'}: {f.get('comment', '')[:200]}")
    print(f"\nLog group: {group}")


if __name__ == "__main__":
    main()
