# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
# kics-scan disable=f861041c-8c9f-4156-acfc-5e6e524f5884,568a4d22-3517-44a6-a7ad-6a7eed88722c,e592a0c5-5bdb-414c-9066-5dba7cdea370
# IAM Access Analyzer is an account setting (create_access_analyzer in iam.tf), not part of this file.
# Two buckets: build contexts for the image build, and the agent's finished outputs. Both hold short-lived artifacts
# that expire by lifecycle, so neither has versioning or access logging (see the checkov notes on each bucket).
resource "aws_s3_bucket" "build" {
  #checkov:skip=CKV_AWS_18:Access is through presigned links and roles in this account only; S3 data events in CloudTrail cover an audit need.
  #checkov:skip=CKV_AWS_21:Objects are written once and expire by lifecycle; versions would only keep expired copies.
  #checkov:skip=CKV_AWS_144:Short-lived artifacts; a lost Region means a redeploy, not a restore.
  #checkov:skip=CKV_AWS_145:SSE-S3 with bucket keys; presigned links stay valid without granting kms:Decrypt to every signer.
  #checkov:skip=CKV2_AWS_62:No consumer reacts to new objects.
  bucket_prefix = "${var.name}-build-"
  force_destroy = true
}

resource "aws_s3_bucket" "outputs" {
  #checkov:skip=CKV_AWS_18:Access is through presigned links and roles in this account only; S3 data events in CloudTrail cover an audit need.
  #checkov:skip=CKV_AWS_21:Objects are written once and expire by lifecycle; versions would only keep expired copies.
  #checkov:skip=CKV_AWS_144:Short-lived artifacts; a lost Region means a redeploy, not a restore.
  #checkov:skip=CKV_AWS_145:SSE-S3 with bucket keys; presigned links stay valid without granting kms:Decrypt to every signer.
  #checkov:skip=CKV2_AWS_62:No consumer reacts to new objects.
  bucket_prefix = "${var.name}-outputs-"
  force_destroy = true
}

# One block per bucket (not for_each), so scanners can match each bucket to its block.
resource "aws_s3_bucket_public_access_block" "build" {
  bucket                  = aws_s3_bucket.build.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_public_access_block" "outputs" {
  bucket                  = aws_s3_bucket.outputs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

moved {
  from = aws_s3_bucket_public_access_block.this["build"]
  to   = aws_s3_bucket_public_access_block.build
}

moved {
  from = aws_s3_bucket_public_access_block.this["outputs"]
  to   = aws_s3_bucket_public_access_block.outputs
}

resource "aws_s3_bucket_server_side_encryption_configuration" "this" {
  for_each = { build = aws_s3_bucket.build.id, outputs = aws_s3_bucket.outputs.id }
  bucket   = each.value
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_ownership_controls" "this" {
  for_each = { build = aws_s3_bucket.build.id, outputs = aws_s3_bucket.outputs.id }
  bucket   = each.value
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

data "aws_iam_policy_document" "tls_only_build" {
  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.build.arn, "${aws_s3_bucket.build.arn}/*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "tls_only_build" {
  bucket     = aws_s3_bucket.build.id
  policy     = data.aws_iam_policy_document.tls_only_build.json
  depends_on = [aws_s3_bucket_public_access_block.build]
}

moved {
  from = aws_s3_bucket_policy.tls_only["build"]
  to   = aws_s3_bucket_policy.tls_only_build
}

data "aws_iam_policy_document" "tls_only_outputs" {
  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.outputs.arn, "${aws_s3_bucket.outputs.arn}/*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "tls_only_outputs" {
  bucket     = aws_s3_bucket.outputs.id
  policy     = data.aws_iam_policy_document.tls_only_outputs.json
  depends_on = [aws_s3_bucket_public_access_block.outputs]
}

moved {
  from = aws_s3_bucket_policy.tls_only["outputs"]
  to   = aws_s3_bucket_policy.tls_only_outputs
}

resource "aws_s3_bucket_lifecycle_configuration" "outputs" {
  bucket = aws_s3_bucket.outputs.id
  rule {
    id     = "expire-outputs"
    status = "Enabled"
    filter {}
    expiration {
      days = var.output_retention_days
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "build" {
  bucket = aws_s3_bucket.build.id
  rule {
    id     = "expire-contexts"
    status = "Enabled"
    filter {}
    expiration {
      days = 14
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

# Encrypts the stack's own log groups (image build, gateway payloads, memory). CloudWatch Logs may use it only for log
# groups in this account and Region.
data "aws_iam_policy_document" "logs_key" {
  #checkov:skip=CKV_AWS_109:In a key policy the resource "*" is the key itself; the account root administers it.
  #checkov:skip=CKV_AWS_111:In a key policy the resource "*" is the key itself.
  #checkov:skip=CKV_AWS_356:In a key policy the resource "*" is the key itself.
  statement {
    sid       = "AccountAdministers"
    actions   = ["kms:*"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = ["arn:${local.partition}:iam::${local.account_id}:root"]
    }
  }
  statement {
    sid       = "CloudWatchLogsUse"
    actions   = ["kms:Encrypt*", "kms:Decrypt*", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:Describe*"]
    resources = ["*"]
    principals {
      type        = "Service"
      identifiers = ["logs.${var.region}.amazonaws.com"]
    }
    condition {
      test     = "ArnLike"
      variable = "kms:EncryptionContext:aws:logs:arn"
      values   = ["arn:${local.partition}:logs:${var.region}:${local.account_id}:log-group:*"]
    }
  }
}

resource "aws_kms_key" "logs" {
  description         = "Encrypts the ${var.name} log groups"
  enable_key_rotation = true
  policy              = data.aws_iam_policy_document.logs_key.json
}

resource "aws_kms_alias" "logs" {
  name          = "alias/${var.name}-logs"
  target_key_id = aws_kms_key.logs.key_id
}
