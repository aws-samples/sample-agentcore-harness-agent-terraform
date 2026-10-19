#!/usr/bin/env python3
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
"""Run one turn of the hosted agent (the AgentCore harness) and print the result as JSON.

The MCP server's ask_architect tool runs it inside the tools runtime, and hosted/scripts/promote.sh runs it for its
test request. It reads {"message": ..., "session_id": optional} on stdin, signs the request with the caller's AWS
credentials (SigV4) and prints {"session_id", "text", "tools", "stop_reason"} on stdout.

    AWS_ARCH_HARNESS_ARN=arn:... [AWS_ARCH_HARNESS_ENDPOINT=PROD] python3 ask_harness.py < request.json
"""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid

import boto3
from botocore.auth import SigV4Auth
from botocore.awsrequest import AWSRequest
from botocore.eventstream import EventStreamBuffer

# One turn may take minutes; AgentCore stops a gateway call after 15 minutes, so the turn ends before that.
TURN_SECONDS = int(os.environ.get("AWS_ARCH_TURN_SECONDS", "840"))


def invoke(harness, endpoint, session, message):
    region = harness.split(":")[3]
    url = (f"https://bedrock-agentcore.{region}.amazonaws.com/harnesses/invoke"
           f"?harnessArn={urllib.parse.quote(harness, safe='')}&qualifier={urllib.parse.quote(endpoint)}")
    body = json.dumps({"messages": [{"role": "user", "content": [{"text": message}]}]}).encode()
    headers = {"Content-Type": "application/json", "X-Amzn-Bedrock-AgentCore-Runtime-Session-Id": session}
    signed = AWSRequest(method="POST", url=url, data=body, headers=headers)
    SigV4Auth(boto3.Session().get_credentials(), "bedrock-agentcore", region).add_auth(signed)
    request = urllib.request.Request(url, data=body, headers=dict(signed.headers), method="POST")
    # The URL is always https to the AgentCore endpoint of the harness's own Region.
    return urllib.request.urlopen(request, timeout=TURN_SECONDS)  # nosemgrep: python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected  # nosec B310


def main():
    harness = os.environ.get("AWS_ARCH_HARNESS_ARN", "")
    if not harness.startswith("arn:"):
        sys.exit("AWS_ARCH_HARNESS_ARN is not set")
    endpoint = os.environ.get("AWS_ARCH_HARNESS_ENDPOINT", "DEFAULT")
    request = json.load(sys.stdin)
    message = str(request.get("message", "")).strip()
    if not message:
        sys.exit("message is required")
    # AgentCore session ids are at least 33 characters.
    session = str(request.get("session_id") or f"{uuid.uuid4()}-{uuid.uuid4().hex[:8]}")

    try:
        response = invoke(harness, endpoint, session, message)
    except urllib.error.HTTPError as e:
        sys.exit(f"the agent refused the request: HTTP {e.code} {e.read().decode(errors='replace')[:1000]}")

    text, tools, stop, errors = [], [], None, []
    buffer = EventStreamBuffer()
    try:
        while chunk := response.read(8192):
            buffer.add_data(chunk)
            for event in buffer:
                kind = event.headers.get(":event-type") or event.headers.get(":exception-type")
                payload = json.loads(event.payload or b"{}")
                if kind == "contentBlockDelta" and "text" in payload.get("delta", {}):
                    text.append(payload["delta"]["text"])
                elif kind == "contentBlockStart":
                    tool = payload.get("start", {}).get("toolUse", {}).get("name")
                    if tool:
                        tools.append(tool)
                elif kind == "messageStop":
                    stop = payload.get("stopReason")
                elif event.headers.get(":message-type") == "exception" or "Exception" in str(kind):
                    errors.append(f"{kind}: {json.dumps(payload)[:500]}")
    except TimeoutError:
        stop = "still_running"

    print(json.dumps({"session_id": session, "text": "".join(text), "tools": tools, "stop_reason": stop, "errors": errors}))
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
