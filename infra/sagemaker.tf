resource "aws_sagemaker_domain" "this" {
  count       = data.aws_caller_identity.this.id != "000000000000" && var.aws_sagemaker_enabled ? 1 : 0
  domain_name = format("%s-sagemaker-%s", var.aws_project, local.app_id)
  auth_mode   = "IAM"
  subnet_ids  = local.public_subnet_ids
  vpc_id      = data.aws_vpc.this.id

  default_user_settings {
    execution_role = element(data.aws_iam_roles.this.*.arns, 0)

    jupyter_server_app_settings {
      default_resource_spec {
        instance_type = "system"
      }
    }
  }
}

resource "aws_sagemaker_user_profile" "this" {
  count             = data.aws_caller_identity.this.id != "000000000000" && var.aws_sagemaker_enabled ? 1 : 0
  domain_id         = element(aws_sagemaker_domain.this.*.id, 0)
  user_profile_name = format("%s-sagemaker-%s", var.aws_project, local.app_id)
}
