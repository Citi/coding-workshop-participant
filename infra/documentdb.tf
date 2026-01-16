resource "aws_docdb_subnet_group" "this" {
  count      = data.aws_caller_identity.this.id != "000000000000" ? 1 : 0
  name       = format("%s-subnet-group-%s", var.aws_project, local.app_id)
  subnet_ids = slice(data.aws_subnets.this.ids, 0, 3)

  tags = {
    awsApplication = local.app_arn
    identifier     = local.app_id
  }
}

resource "aws_docdb_cluster" "this" {
  count                           = data.aws_caller_identity.this.id != "000000000000" ? 1 : 0
  cluster_identifier              = format("%s-%s", var.aws_project, local.app_id)
  engine                          = "docdb"
  engine_version                  = "5.0.0"
  master_username                 = "superadmin"
  master_password                 = random_password.this.result
  backup_retention_period         = 7
  preferred_backup_window         = "07:00-09:00"
  skip_final_snapshot             = true
  storage_encrypted               = true
  db_subnet_group_name            = element(aws_docdb_subnet_group.this.*.name, count.index)
  vpc_security_group_ids          = [aws_security_group.this.id]
  enabled_cloudwatch_logs_exports = ["audit", "profiler"]

  serverless_v2_scaling_configuration {
    min_capacity = 0.5
    max_capacity = 2.0
  }

  tags = {
    awsApplication = local.app_arn
    identifier     = local.app_id
  }
}

resource "aws_docdb_cluster_instance" "this" {
  count                      = data.aws_caller_identity.this.id != "000000000000" ? 1 : 0
  cluster_identifier         = element(aws_docdb_cluster.this.*.id, count.index)
  engine                     = "docdb"
  identifier                 = format("%s-%s", var.aws_project, local.app_id)
  instance_class             = "db.serverless"
  auto_minor_version_upgrade = true

  tags = {
    awsApplication = local.app_arn
    identifier     = local.app_id
  }
}

resource "aws_secretsmanager_secret" "data" {
  count                   = data.aws_caller_identity.this.id != "000000000000" ? 1 : 0
  name                    = format("%s-data-%s", var.aws_project, local.app_id)
  recovery_window_in_days = 0

  tags = {
    awsApplication = local.app_arn
    identifier     = local.app_id
  }
}

resource "aws_secretsmanager_secret_version" "data" {
  count     = data.aws_caller_identity.this.id != "000000000000" ? 1 : 0
  secret_id = element(aws_secretsmanager_secret.data.*.id, count.index)
  secret_string = jsonencode({
    username = element(aws_docdb_cluster.this.*.master_username, count.index)
    password = element(aws_docdb_cluster.this.*.master_password, count.index)
    host     = element(aws_docdb_cluster.this.*.endpoint, count.index)
    port     = element(aws_docdb_cluster.this.*.port, count.index)
  })
}
