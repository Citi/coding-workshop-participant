locals {
  app_id = try(trimspace(var.aws_app_code), "") != "" ? trimspace(var.aws_app_code) : random_id.this.hex
  app_tags = merge(
    try(one(data.aws_servicecatalogappregistry_application.this.*.application_tag), {}),
    { participant = local.app_id, event = random_id.this.hex }
  )
  public_route_table_ids = [
    for rt in data.aws_route_table.this :
    rt.id if length([for route in rt.routes : route if startswith(route.gateway_id, "igw-")]) > 0
  ]
  public_subnet_ids = sort(distinct(flatten([
    for rt_id in local.public_route_table_ids : [
      for assoc in data.aws_route_table.this[rt_id].associations :
      assoc.subnet_id if assoc.subnet_id != ""
    ]
  ])))
  private_subnet_ids = sort(tolist(setsubtract(data.aws_subnets.this.ids, local.public_subnet_ids)))
  backend_dirs_java = [
    for file in fileset(format("%s/../backend", path.module), "*/pom.xml") :
    dirname(file) if !startswith(dirname(file), "_") && !startswith(dirname(file), ".")
  ]
  backend_dirs_nodejs = [
    for file in fileset(format("%s/../backend", path.module), "*/package.json") :
    dirname(file) if !startswith(dirname(file), "_") && !startswith(dirname(file), ".")
  ]
  backend_dirs_python = [
    for file in fileset(format("%s/../backend", path.module), "*/requirements.txt") :
    dirname(file) if !startswith(dirname(file), "_") && !startswith(dirname(file), ".")
  ]
  backend_names_java = {
    for name in local.backend_dirs_java : name => {
      name    = name
      arch    = "x86_64"
      runtime = "java25"
      handler = "com.example.Handler::handleRequest"
      path    = abspath(format("%s/../backend/%s/target", path.module, name))
      mvn_cmd = [
        format("cd %s", abspath(format("%s/../backend/%s", path.module, name))),
        "mvn clean package -DskipTests",
        format("find ./target ! -name '%s*.jar' -delete", name),
      ]
    }
  }
  backend_names_nodejs = {
    for name in local.backend_dirs_nodejs : name => {
      name             = name
      arch             = "x86_64"
      runtime          = "nodejs24.x"
      handler          = "index.handler"
      path             = abspath(format("%s/../backend/%s", path.module, name))
      patterns         = ["node_modules/.+"]
      npm_requirements = true
    }
  }
  backend_names_python = {
    for name in local.backend_dirs_python : name => {
      name             = name
      arch             = "x86_64"
      runtime          = "python3.13"
      handler          = "function.handler"
      path             = abspath(format("%s/../backend/%s", path.module, name))
      patterns         = ["!__pycache__/.*", "!\\..*"]
      pip_requirements = true
    }
  }
  data_dirs_python = [
    for file in fileset(format("%s/../data", path.module), "*/requirements.txt") :
    dirname(file) if !startswith(dirname(file), "_") && !startswith(dirname(file), ".")
  ]
  data_dirs_java = [
    for file in fileset(format("%s/../data", path.module), "*/pom.xml") :
    dirname(file) if !startswith(dirname(file), "_") && !startswith(dirname(file), ".")
  ]
  data_names_python = {
    for name in local.data_dirs_python : name => {
      name           = name
      runtime        = "python"
      glue_version   = "5.0"
      python_version = "3"
      path           = abspath(format("%s/../data/%s", path.module, name))
      file           = "job.py"
      modules        = join(",", compact(split("\n", file(abspath(format("%s/../data/%s/requirements.txt", path.module, name))))))
    }
  }
  data_names_java = {
    for name in local.data_dirs_java : name => {
      name         = name
      runtime      = "scala"
      glue_version = "5.0"
      path         = abspath(format("%s/../data/%s", path.module, name))
      file         = "Job.java"
    }
  }
  job_names      = merge(local.data_names_python, local.data_names_java)
  function_names = merge(local.backend_names_java, local.backend_names_nodejs, local.backend_names_python)
  function_origins = [
    for name, func in local.function_names : {
      name        = func.name
      origin_id   = format("lambda-%s", func.name)
      domain_name = replace(replace(module.lambda[name].lambda_function_url, "https://", ""), "/", "")
    }
  ]
  origin_id = format("%s-s3-origin-%s", var.aws_project, local.app_id)
  env_vars = {
    APP_ID        = local.app_id
    APP_NAME      = format("%s-%s", var.aws_project, local.app_id)
    APP_ROLE      = format("arn:%s:iam::%s:role/%s-assume-%s-%s", data.aws_partition.this.partition, data.aws_caller_identity.this.account_id, var.aws_project, data.aws_region.this.region, local.app_id)
    APP_REGION    = data.aws_region.this.region
    IS_LOCAL      = data.aws_caller_identity.this.id == "000000000000" ? "true" : "false"
    POSTGRES_HOST = data.aws_caller_identity.this.id == "000000000000" ? coalesce(try(trimspace(var.aws_postgres_host), ""), "172.17.0.1") : try(one(aws_rds_cluster.this.*.endpoint), "")
    POSTGRES_PORT = data.aws_caller_identity.this.id == "000000000000" ? "5432" : try(one(aws_rds_cluster.this.*.port), "")
    POSTGRES_NAME = data.aws_caller_identity.this.id == "000000000000" ? "postgres" : try(one(aws_rds_cluster.this.*.database_name), "")
    POSTGRES_USER = data.aws_caller_identity.this.id == "000000000000" ? "postgres" : try(one(aws_rds_cluster.this.*.master_username), "")
    POSTGRES_PASS = data.aws_caller_identity.this.id == "000000000000" ? "postgres123" : try(one(aws_rds_cluster.this.*.master_password), "")
    MONGO_HOST    = data.aws_caller_identity.this.id == "000000000000" ? coalesce(try(trimspace(var.aws_mongo_host), ""), "172.17.0.1") : try(one(aws_docdb_cluster.this.*.endpoint), "")
    MONGO_PORT    = data.aws_caller_identity.this.id == "000000000000" ? "27017" : try(one(aws_docdb_cluster.this.*.port), "")
    MONGO_NAME    = data.aws_caller_identity.this.id == "000000000000" ? "mongo" : try(one(aws_docdb_cluster.this.*.database_name), "")
    MONGO_USER    = data.aws_caller_identity.this.id == "000000000000" ? "" : try(one(aws_docdb_cluster.this.*.master_username), "")
    MONGO_PASS    = data.aws_caller_identity.this.id == "000000000000" ? "" : try(one(aws_docdb_cluster.this.*.master_password), "")
  }
  lambda_iam_arns = [
    format("arn:%s:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole", data.aws_partition.this.partition),
  ]
  glue_iam_arns = [
    format("arn:%s:iam::aws:policy/service-role/AWSGlueServiceRole", data.aws_partition.this.partition),
  ]
}
