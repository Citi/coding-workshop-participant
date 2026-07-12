resource "aws_glue_job" "this" {
  for_each          = data.aws_caller_identity.this.id != "000000000000" && var.aws_eks_enabled ? local.job_names : {}
  name              = format("%s-%s-%s", var.aws_project, each.value.name, local.app_id)
  glue_version      = each.value.glue_version
  worker_type       = "G.1X"
  number_of_workers = 2
  max_retries       = 0
  timeout           = 300
  role_arn          = local.glue_role_arn

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
  for_each = data.aws_caller_identity.this.id != "000000000000" && var.aws_eks_enabled ? local.job_names : {}
  bucket   = one(aws_s3_bucket.this.*.id)
  key      = format("spark/_scripts/%s/%s", each.value.name, each.value.file)
  source   = format("%s/%s", each.value.path, each.value.file)
  etag     = filemd5(format("%s/%s", each.value.path, each.value.file))
  tags     = local.app_tags
}
