# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
# CloudWatch Synthetics canary: talks to the IAM tools gateway the way an MCP client does (initialize, list the
# tools, call find_icon), signing each request with the canary role. Any error or missing tool fails the run.
import json
import os
import urllib.request

import botocore.session
from botocore.auth import SigV4Auth
from botocore.awsrequest import AWSRequest
from aws_synthetics.common import synthetics_logger as logger

URL = os.environ["GATEWAY_URL"]
if not URL.startswith("https://"):
    raise ValueError("GATEWAY_URL must be an https URL")
TOOL = os.environ["TOOL_NAME"]
REGION = os.environ["AWS_REGION"]
PROTOCOL = "2025-03-26"


def post(message, session_id=None):
    body = json.dumps(message).encode()
    headers = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream"}
    if session_id:
        headers["Mcp-Session-Id"] = session_id
    signed = AWSRequest(method="POST", url=URL, data=body, headers=headers)
    credentials = botocore.session.get_session().get_credentials().get_frozen_credentials()
    SigV4Auth(credentials, "bedrock-agentcore", REGION).add_auth(signed)
    request = urllib.request.Request(URL, data=body, headers=dict(signed.headers), method="POST")
    # The URL is the stack's own gateway, checked to be https above.
    with urllib.request.urlopen(request, timeout=25) as response:  # nosemgrep: python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected  # nosec B310
        text = response.read().decode()
        session_id = response.headers.get("Mcp-Session-Id") or session_id
    if "id" not in message:
        return None, session_id
    # A streamed reply carries the JSON-RPC message on its data line.
    if text.lstrip().startswith(("event:", "data:")):
        text = next(line[5:] for line in text.splitlines() if line.startswith("data:"))
    reply = json.loads(text)
    if "error" in reply:
        raise RuntimeError(f"{message['method']} failed: {reply['error']}")
    return reply["result"], session_id


def handler(event, context):
    _, session = post({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
        "protocolVersion": PROTOCOL, "capabilities": {}, "clientInfo": {"name": "tool-canary", "version": "1"}}})
    post({"jsonrpc": "2.0", "method": "notifications/initialized"}, session)
    listed, session = post({"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}, session)
    names = [tool["name"] for tool in listed.get("tools", [])]
    if TOOL not in names:
        raise RuntimeError(f"{TOOL} is not among the {len(names)} tools the gateway lists")
    result, _ = post({"jsonrpc": "2.0", "id": 3, "method": "tools/call",
                      "params": {"name": TOOL, "arguments": {"query": "lambda", "limit": 1}}}, session)
    if result.get("isError"):
        raise RuntimeError(f"{TOOL} returned an error")
    logger.info(f"{len(names)} tools listed; {TOOL} answered")
    return "ok"
