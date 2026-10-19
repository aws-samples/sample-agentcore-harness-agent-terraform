#!/usr/bin/env python3
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
"""Upload finished figures or documents to the outputs bucket and print download links.

    python3 publish.py [--prefix PREFIX] [--expires SECONDS] FILE_OR_DIR...

Reads the bucket from AWS_ARCH_OUTPUT_BUCKET. Prints one JSON object per file:
{"file": ..., "s3_uri": ..., "url": ...}. Presigned links last at most as long as
the session's credentials, so they are for hand-off, not for sharing long term.
"""
import argparse
import datetime
import json
import mimetypes
import os
import secrets
import sys
from pathlib import Path

import boto3

TYPES = {".svg": "image/svg+xml", ".drawio": "application/xml", ".md": "text/markdown"}
# Model-written SVG and HTML can carry script; send them as downloads so a shared
# link never renders them in the browser on the bucket's origin.
DOWNLOAD_ONLY = {".svg", ".html", ".htm", ".drawio", ".xml"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("paths", nargs="+")
    ap.add_argument("--prefix")
    ap.add_argument("--expires", type=int, default=3600)
    args = ap.parse_args()

    bucket = os.environ.get("AWS_ARCH_OUTPUT_BUCKET")
    if not bucket:
        sys.exit("AWS_ARCH_OUTPUT_BUCKET is not set")
    prefix = (args.prefix or f"{datetime.date.today():%Y-%m-%d}/{secrets.token_hex(4)}").strip("/")

    files = []
    for p in map(Path, args.paths):
        if p.is_dir():
            files += sorted(f for f in p.rglob("*") if f.is_file())
        elif p.is_file():
            files.append(p)
        else:
            sys.exit(f"not found: {p}")

    s3 = boto3.client("s3")
    for f in files:
        key = f"{prefix}/{f.name}"
        ctype = TYPES.get(f.suffix.lower()) or mimetypes.guess_type(f.name)[0] or "application/octet-stream"
        extra = {"ContentType": ctype}
        if f.suffix.lower() in DOWNLOAD_ONLY:
            extra["ContentDisposition"] = f'attachment; filename="{f.name}"'
        s3.upload_file(str(f), bucket, key, ExtraArgs=extra)
        url = s3.generate_presigned_url("get_object", Params={"Bucket": bucket, "Key": key}, ExpiresIn=args.expires)
        print(json.dumps({"file": str(f), "s3_uri": f"s3://{bucket}/{key}", "url": url}))


if __name__ == "__main__":
    main()
