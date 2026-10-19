# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
terraform {
  required_version = ">= 1.9"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.67"
    }
    archive = {
      source  = "hashicorp/archive"
      version = ">= 2.4"
    }
  }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = { Project = var.name }
  }
}

data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  partition  = data.aws_partition.current.partition
  # Harness, memory and policy names allow letters, digits and underscores only.
  name_id = replace(var.name, "-", "_")
  # Subnets given: the harness sessions and the tools runtime run in that VPC instead of the public network.
  vpc_mode = length(var.vpc_subnet_ids) > 0
  # A geographic or global prefix (us.anthropic...) marks a cross-Region inference profile.
  model_is_profile    = can(regex("^(us|eu|apac|jp|au|ca|us-gov|global)\\.", var.model_id))
  foundation_model_id = local.model_is_profile ? replace(var.model_id, "/^[a-z-]+\\./", "") : var.model_id
}
