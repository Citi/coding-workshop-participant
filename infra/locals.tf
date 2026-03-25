locals {
  app_id   = try(trimspace(var.aws_app_code), "") != "" ? trimspace(var.aws_app_code) : random_id.this.hex
  app_tags = merge(
    try(element(data.aws_servicecatalogappregistry_application.this.*.application_tag, 0), {}),
    { participant = local.app_id, event = random_id.this.hex }
  )
  public_route_table_ids = [
    for rt in data.aws_route_table.this : rt.id
    if length([for route in rt.routes : route if startswith(route.gateway_id, "igw-")]) > 0
  ]
  public_subnet_ids = sort(distinct(flatten([
    for rt_id in local.public_route_table_ids : [
      for assoc in data.aws_route_table.this[rt_id].associations : assoc.subnet_id if assoc.subnet_id != ""
    ]
  ])))
  private_subnet_ids = sort(tolist(setsubtract(data.aws_subnets.this.ids, local.public_subnet_ids)))
  origin_id          = format("%s-s3-origin-%s", var.aws_project, local.app_id)
  function_dirs = [
    for file in fileset("${path.module}/../backend", "*/function.py") :
    dirname(file) if !startswith(dirname(file), "_") && !startswith(dirname(file), ".")
  ]
  function_names = {
    for name in local.function_dirs : name => { name = name, path = format("../backend/%s", name) }
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
    APP_ROLE      = format("arn:%s:iam::%s:role/%s-assume-%s", data.aws_partition.this.partition, data.aws_caller_identity.this.account_id, var.aws_project, local.app_id)
    IS_LOCAL      = data.aws_caller_identity.this.id == "000000000000" ? "true" : "false"
    MONGO_HOST    = data.aws_caller_identity.this.id == "000000000000" ? coalesce(try(trimspace(var.aws_mongo_host), ""), "host.docker.internal") : element(aws_docdb_cluster.this.*.endpoint, 0)
    MONGO_PORT    = data.aws_caller_identity.this.id == "000000000000" ? "27017" : element(aws_docdb_cluster.this.*.port, 0)
    MONGO_USER    = data.aws_caller_identity.this.id == "000000000000" ? "mongo" : element(aws_docdb_cluster.this.*.master_username, 0)
    MONGO_PASS    = data.aws_caller_identity.this.id == "000000000000" ? "mongo123!" : element(aws_docdb_cluster.this.*.master_password, 0)
    POSTGRES_HOST = data.aws_caller_identity.this.id == "000000000000" ? "localhost" : element(aws_rds_cluster.this.*.endpoint, 0)
    POSTGRES_PORT = data.aws_caller_identity.this.id == "000000000000" ? "5432" : element(aws_rds_cluster.this.*.port, 0)
    POSTGRES_NAME = data.aws_caller_identity.this.id == "000000000000" ? "postgres" : element(aws_rds_cluster.this.*.database_name, 0)
    POSTGRES_USER = data.aws_caller_identity.this.id == "000000000000" ? "postgres" : element(aws_rds_cluster.this.*.master_username, 0)
    POSTGRES_PASS = data.aws_caller_identity.this.id == "000000000000" ? "postgres123!" : element(aws_rds_cluster.this.*.master_password, 0)
  }
  iam_arns = [
    format("arn:%s:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole", data.aws_partition.this.partition),
  ]
}
