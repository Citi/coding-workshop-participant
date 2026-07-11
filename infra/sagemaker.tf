resource "aws_sagemaker_domain" "this" {
  count       = data.aws_caller_identity.this.id != "000000000000" && var.aws_sagemaker_enabled ? 1 : 0
  domain_name = format("%s-sagemaker-%s", var.aws_project, local.app_id)
  auth_mode   = "IAM"
  subnet_ids  = local.public_subnet_ids
  vpc_id      = data.aws_vpc.this.id

  default_space_settings {
    execution_role = one(one(data.aws_iam_roles.this.*.arns))

    jupyter_lab_app_settings {
      code_repository {
        repository_url = "https://github.com/citi/coding-workshop-participant"
      }
    }
  }

  default_user_settings {
    execution_role    = one(one(data.aws_iam_roles.this.*.arns))
    studio_web_portal = "ENABLED"

    jupyter_server_app_settings {
      code_repository {
        repository_url = "https://github.com/citi/coding-workshop-participant"
      }
      default_resource_spec {
        instance_type = "system"
      }
    }
  }

  tags = local.app_tags
}

resource "aws_sagemaker_user_profile" "this" {
  count             = data.aws_caller_identity.this.id != "000000000000" && var.aws_sagemaker_enabled ? 1 : 0
  domain_id         = one(aws_sagemaker_domain.this.*.id)
  user_profile_name = format("%s-sagemaker-%s", var.aws_project, local.app_id)
  tags              = local.app_tags
}

resource "aws_sagemaker_space" "this" {
  count      = data.aws_caller_identity.this.id != "000000000000" && var.aws_sagemaker_enabled ? 1 : 0
  domain_id  = one(aws_sagemaker_domain.this.*.id)
  space_name = format("%s-sagemaker-%s", var.aws_project, local.app_id)

  ownership_settings {
    owner_user_profile_name = one(aws_sagemaker_user_profile.this.*.user_profile_name)
  }

  space_sharing_settings {
    sharing_type = "Private"
  }

  space_settings {
    app_type = "JupyterLab"

    jupyter_lab_app_settings {
      default_resource_spec {
        instance_type = "ml.t3.medium"
      }
    }
  }
}

resource "aws_sagemaker_app" "this" {
  count      = data.aws_caller_identity.this.id != "000000000000" && var.aws_sagemaker_enabled ? 1 : 0
  domain_id  = one(aws_sagemaker_domain.this.*.id)
  space_name = one(aws_sagemaker_space.this.*.space_name)
  app_name   = format("%s-sagemaker-%s", var.aws_project, local.app_id)
  app_type   = "JupyterLab"

  resource_spec {
    instance_type = "ml.t3.medium"
  }
}

resource "aws_glue_job" "this" {
  for_each          = data.aws_caller_identity.this.id != "000000000000" && var.aws_sagemaker_enabled ? local.job_names : {}
  name              = format("%s-%s-%s", var.aws_project, each.value.name, local.app_id)
  role_arn          = one(aws_iam_role.glue.*.arn)
  glue_version      = each.value.glue_version
  worker_type       = "G.1X"
  number_of_workers = 2
  max_retries       = 0
  timeout           = 300

  command {
    name            = "glueetl"
    script_location = format("s3://%s", aws_s3_object.this[each.key].id)
    python_version  = each.value.python_version
  }

  default_arguments = {
    "--datalake-formats"                 = "iceberg"
    "--enable-continuous-cloudwatch-log" = "true"
    "--enable-continuous-log-filter"     = "true"
    "--enable-metrics"                   = ""
    "--job-bookmark-option"              = "job-bookmark-disable"
    "--job-language"                     = each.value.runtime
    "--additional-python-modules"        = each.value.modules
    "--TempDir"                          = format("s3://%s/spark/_temp/", one(aws_s3_bucket.this.*.id))
    "--BRONZE_LAYER"                     = format("s3://%s/spark/bronze/", one(aws_s3_bucket.this.*.id))
    "--SILVER_LAYER"                     = format("s3://%s/spark/silver/", one(aws_s3_bucket.this.*.id))
    "--GOLD_LAYER"                       = format("s3://%s/spark/gold/", one(aws_s3_bucket.this.*.id))
  }

  tags = local.app_tags
}

resource "aws_s3_object" "this" {
  for_each = data.aws_caller_identity.this.id != "000000000000" && var.aws_sagemaker_enabled ? local.job_names : {}
  bucket   = one(aws_s3_bucket.this.*.id)
  key      = format("spark/_scripts/%s/%s", each.value.name, each.value.file)
  source   = format("%s/%s", each.value.path, each.value.file)
  etag     = filemd5(format("%s/%s", each.value.path, each.value.file))
  tags     = local.app_tags
}
