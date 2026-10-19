# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
# kics-scan disable=e592a0c5-5bdb-414c-9066-5dba7cdea370
# IAM Access Analyzer is an account setting (create_access_analyzer in iam.tf), not part of this file.
# Users sign in to a Cognito user pool; the harness accepts its access tokens.
resource "aws_cognito_user_pool" "users" {
  name                     = var.name
  deletion_protection      = "INACTIVE"
  mfa_configuration        = "OPTIONAL"
  auto_verified_attributes = ["email"]
  username_attributes      = ["email"]

  software_token_mfa_configuration {
    enabled = true
  }

  admin_create_user_config {
    allow_admin_create_user_only = true
  }

  password_policy {
    minimum_length    = 14
    require_lowercase = true
    require_uppercase = true
    require_numbers   = true
    require_symbols   = true
  }
}

resource "aws_cognito_user_pool_client" "cli" {
  name                          = "${var.name}-cli"
  user_pool_id                  = aws_cognito_user_pool.users.id
  generate_secret               = false
  explicit_auth_flows           = ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]
  prevent_user_existence_errors = "ENABLED"
  access_token_validity         = 60
  id_token_validity             = 60
  refresh_token_validity        = 7
  # Units for the validity periods above, not token values (kics "Generic Token" false positive).
  # kics-scan ignore-block
  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }
}

locals {
  cognito_discovery_url = "https://cognito-idp.${var.region}.amazonaws.com/${aws_cognito_user_pool.users.id}/.well-known/openid-configuration"
}
