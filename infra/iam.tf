resource "aws_iam_role" "glue" {
  count = data.aws_caller_identity.this.id != "000000000000" && var.aws_sagemaker_enabled ? 1 : 0
  name  = format("%s-glue-%s", var.aws_project, local.app_id)
  path  = "/"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = data.aws_service_principal.glue.name
      }
    }]
  })

  tags = local.app_tags
}

resource "aws_iam_role_policy" "glue" {
  count = data.aws_caller_identity.this.id != "000000000000" && var.aws_sagemaker_enabled ? 1 : 0
  role  = one(aws_iam_role.glue.*.name)
  name  = format("%s-glue-%s", var.aws_project, local.app_id)
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["s3:GetObject", "s3:PutObject"]
        Resource = [
          one(aws_s3_bucket.this.*.arn),
          format("%s/*", one(aws_s3_bucket.this.*.arn))
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "glue" {
  count      = data.aws_caller_identity.this.id != "000000000000" && var.aws_sagemaker_enabled ? length(local.glue_iam_arns) : 0
  role       = one(aws_iam_role.glue.*.name)
  policy_arn = element(local.glue_iam_arns, count.index)
}
