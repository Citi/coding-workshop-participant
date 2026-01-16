locals {
  app_id    = try(trimspace(var.aws_app_code), "") != "" ? trimspace(var.aws_app_code) : random_id.this.hex
  app_arn   = try(element(data.aws_servicecatalogappregistry_application.this.*.arn, 0), null)
  origin_id = format("s3-origin-%s-%s", var.aws_project, local.app_id)
  function_dirs = [
    for file in fileset("${path.module}/../backend", "*/function.py") :
    dirname(file) if !startswith(dirname(file), "_") && !startswith(dirname(file), ".")
  ]
  function_names = {
    for name in local.function_dirs : name => {
      name = name
      path = format("../backend/%s", name)
    }
  }
  lambda_origins = [
    for name, func in local.function_names : {
      name        = func.name
      origin_id   = format("lambda-%s", func.name)
      domain_name = replace(replace(module.lambda[name].lambda_function_url, "https://", ""), "/", "")
    }
  ]
  env_vars = {
    APP_ID        = local.app_id
    APP_NAME      = format("%s-%s", var.aws_project, local.app_id)
    APP_ROLE      = format("arn:%s:iam::%s:role/%s-%s", data.aws_partition.this.partition, data.aws_caller_identity.this.account_id, var.aws_project, local.app_id)
    DB_HOST       = data.aws_caller_identity.this.id == "000000000000" ? coalesce(try(trimspace(var.aws_db_host), ""), "host.docker.internal") : try(element(aws_docdb_cluster.this.*.endpoint, 0), "")
    DB_PORT       = "27017"
    DB_NAME       = format("workshop-%s", local.app_id)
    DB_USERNAME   = data.aws_caller_identity.this.id == "000000000000" ? "" : "superadmin"
    DB_PASSWORD   = data.aws_caller_identity.this.id == "000000000000" ? "" : ""
    DB_SECRET_ARN = data.aws_caller_identity.this.id == "000000000000" ? "" : try(element(aws_secretsmanager_secret.data.*.arn, 0), "")
    IS_LOCAL      = data.aws_caller_identity.this.id == "000000000000" ? "true" : "false"
  }
  iam_arns = [
    format("arn:%s:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole", data.aws_partition.this.partition),
  ]
  ingress_rules = [{
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = "0.0.0.0/0"
    }, {
    from_port = 0
    to_port   = 0
    protocol  = "-1"
    self      = true
  }]
  egress_rules = [{
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = "0.0.0.0/0"
    }, {
    from_port   = 27017
    to_port     = 27017
    protocol    = "tcp"
    cidr_blocks = "0.0.0.0/0"
    }, {
    from_port = 0
    to_port   = 0
    protocol  = "-1"
    self      = true
  }]
}
