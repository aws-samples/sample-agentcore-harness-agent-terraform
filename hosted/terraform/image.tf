# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
# kics-scan disable=0e32d561-4b5a-4664-a6e3-a3fa85649157,69e7c320-b65d-41bb-be02-d63ecc0bcc9d,e592a0c5-5bdb-414c-9066-5dba7cdea370
# IAM Access Analyzer is an account setting (create_access_analyzer in iam.tf), not part of this file.
# The environment image (Node.js, Python, pandoc, the skills and their packages) is
# built on an ARM CodeBuild host, because AgentCore runs linux/arm64 images only.
# The repository uses the AWS managed KMS key: moving to a customer managed key replaces the repository and deletes
# its images. It has no repository policy because only roles in this account pull from it, through IAM.
resource "aws_ecr_repository" "env" {
  name                 = var.name
  image_tag_mutability = "IMMUTABLE"
  force_delete         = true
  image_scanning_configuration {
    scan_on_push = true
  }
  encryption_configuration {
    encryption_type = "KMS"
  }
}

resource "aws_ecr_lifecycle_policy" "env" {
  repository = aws_ecr_repository.env.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the last 10 images"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 10 }
      action       = { type = "expire" }
    }]
  })
}

resource "aws_cloudwatch_log_group" "build" {
  name              = "/aws/codebuild/${var.name}-image"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.logs.arn
}

resource "aws_codebuild_project" "image" {
  #checkov:skip=CKV_AWS_316:Privileged mode is required to run docker build inside CodeBuild; the project runs only the repository's buildspec.
  name           = "${var.name}-image"
  description    = "Builds the arm64 environment image for the hosted AWS Architecture Agent"
  service_role   = aws_iam_role.build.arn
  build_timeout  = 30
  encryption_key = "arn:${local.partition}:kms:${var.region}:${local.account_id}:alias/aws/s3"

  source {
    type      = "S3"
    location  = "${aws_s3_bucket.build.id}/context/latest.zip"
    buildspec = "hosted/container/buildspec.yml"
  }

  artifacts {
    type = "NO_ARTIFACTS"
  }

  environment {
    type            = "ARM_CONTAINER"
    compute_type    = "BUILD_GENERAL1_LARGE"
    image           = "aws/codebuild/amazonlinux-aarch64-standard:3.0"
    privileged_mode = true

    environment_variable {
      name  = "IMAGE_REPO_URI"
      value = aws_ecr_repository.env.repository_url
    }
    environment_variable {
      name  = "IMAGE_TAG"
      value = "unset"
    }
  }

  logs_config {
    cloudwatch_logs {
      group_name = aws_cloudwatch_log_group.build.name
    }
  }
}
