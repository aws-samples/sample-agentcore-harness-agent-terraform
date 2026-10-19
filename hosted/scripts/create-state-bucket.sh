#!/usr/bin/env bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
# Create the S3 bucket that holds this stack's Terraform state, once per account and Region, and write
# hosted/terraform/backend.tf (not committed) pointing at it. Versioned, encrypted, TLS only, public access
# blocked; Terraform locks the state with a lock file next to it (use_lockfile).
#   hosted/scripts/create-state-bucket.sh [NAME]      NAME defaults to aws-arch-agent
# Then move an existing local state across: terraform -chdir=hosted/terraform init -migrate-state
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
NAME="${1:-aws-arch-agent}"
REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
BUCKET="$NAME-tfstate-$ACCOUNT"
BACKEND="$ROOT/hosted/terraform/backend.tf"

if aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  echo "bucket $BUCKET exists" >&2
else
  if [ "$REGION" = "us-east-1" ]; then
    aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" >/dev/null
  else
    aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" --create-bucket-configuration "LocationConstraint=$REGION" >/dev/null
  fi
  echo "created $BUCKET" >&2
fi
aws s3api put-public-access-block --bucket "$BUCKET" --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-versioning --bucket "$BUCKET" --versioning-configuration Status=Enabled
aws s3api put-bucket-encryption --bucket "$BUCKET" --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"aws:kms"},"BucketKeyEnabled":true}]}'
aws s3api put-bucket-ownership-controls --bucket "$BUCKET" --ownership-controls 'Rules=[{ObjectOwnership=BucketOwnerEnforced}]'
aws s3api put-bucket-policy --bucket "$BUCKET" --policy "$(cat <<EOF
{"Version":"2012-10-17","Statement":[{"Sid":"TlsOnly","Effect":"Deny","Principal":"*","Action":"s3:*",
"Resource":["arn:aws:s3:::$BUCKET","arn:aws:s3:::$BUCKET/*"],"Condition":{"Bool":{"aws:SecureTransport":"false"}}}]}
EOF
)"

cat > "$BACKEND" <<EOF
terraform {
  backend "s3" {
    bucket       = "$BUCKET"
    key          = "$NAME/terraform.tfstate"
    region       = "$REGION"
    encrypt      = true
    use_lockfile = true
  }
}
EOF
echo "wrote $BACKEND" >&2
