module "lambda" {
  for_each = local.function_names
  source   = "terraform-aws-modules/lambda/aws"
  version  = "~> 7.0"

  function_name   = format("%s-%s-%s", var.aws_project, each.value.name, local.app_id)
  package_type    = "Zip"
  architectures   = ["x86_64"]
  handler         = "function.handler"
  runtime         = "python3.11"
  memory_size     = 128
  timeout         = 300
  tracing_mode    = "PassThrough"
  build_in_docker = false
  store_on_s3     = data.aws_caller_identity.this.id != "000000000000"
  s3_bucket       = data.aws_caller_identity.this.id != "000000000000" ? var.aws_bucket : null
  s3_prefix       = data.aws_caller_identity.this.id != "000000000000" ? format("lambda/%s/%s/", local.app_id, each.value.name) : null

  source_path = [{
    path             = each.value.path
    pip_requirements = true
    patterns         = ["!__pycache__/.*", "!\\..*"]
  }]

  vpc_security_group_ids = data.aws_security_groups.this.ids
  vpc_subnet_ids         = local.public_subnet_ids
  attach_network_policy  = true

  create_package     = true
  create_role        = true
  role_name          = format("%s-%s-%s", var.aws_project, each.value.name, local.app_id)
  role_path          = "/service-role/"
  policy_path        = "/service-role/"
  attach_policies    = true
  number_of_policies = length(local.iam_arns)
  policies           = local.iam_arns
  attach_policy_json = true
  policy_json        = templatefile("${path.module}/policy.tftpl", { app_id = local.app_id, app_name = var.aws_project })

  attach_cloudwatch_logs_policy     = true
  attach_dead_letter_policy         = true
  ephemeral_storage_size            = 512
  cloudwatch_logs_retention_in_days = 7
  cloudwatch_logs_skip_destroy      = false
  use_existing_cloudwatch_log_group = false
  create_lambda_function_url        = true
  authorization_type                = "NONE"
  dead_letter_target_arn            = aws_sqs_queue.this[each.key].arn

  cors = {
    allow_credentials = false
    allow_headers     = ["*"]
    allow_methods     = ["*"]
    allow_origins     = ["*"]
    expose_headers    = []
    max_age           = 0
  }

  environment_variables = {
    for key, value in local.env_vars :
    key => trimspace(value) if try(trimspace(value), "") != ""
  }

  tags = local.app_tags
}

resource "aws_sqs_queue" "this" {
  for_each                = local.function_names
  name                    = format("%s-%s-dlq-%s", var.aws_project, each.value.name, local.app_id)
  sqs_managed_sse_enabled = true

  tags = local.app_tags
}

resource "null_resource" "hot_reload" {
  for_each = data.aws_caller_identity.this.id == "000000000000" ? local.function_names : {}

  triggers = {
    source_code_hash = module.lambda[each.key].lambda_function_source_code_hash
  }

  provisioner "local-exec" {
    command = <<-EOT
      AWS_REGION=us-east-1 \
      AWS_ENDPOINT_URL=http://localhost:4566 \
      AWS_ACCESS_KEY_ID=test \
      AWS_SECRET_ACCESS_KEY=test \
      aws lambda update-function-code \
        --function-name ${module.lambda[each.key].lambda_function_name} \
        --s3-bucket hot-reload \
        --s3-key ${abspath(path.module)}/${each.value.path}
    EOT
  }

  depends_on = [module.lambda]
}
