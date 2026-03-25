resource "aws_db_subnet_group" "this" {
  count      = data.aws_caller_identity.this.id != "000000000000" ? 1 : 0
  name       = format("%s-rds-subnet-group-%s", var.aws_project, local.app_id)
  subnet_ids = local.public_subnet_ids

  tags = local.app_tags
}

resource "aws_rds_cluster" "this" {
  count                           = data.aws_caller_identity.this.id != "000000000000" ? 1 : 0
  cluster_identifier              = format("%s-rds-%s", var.aws_project, local.app_id)
  engine                          = "aurora-postgresql"
  engine_mode                     = "provisioned"
  engine_version                  = "17.7"
  master_username                 = "superadmin"
  master_password                 = random_pet.this.id
  database_name                   = replace(var.aws_project, "-", "")
  backup_retention_period         = 7
  preferred_backup_window         = "07:00-09:00"
  skip_final_snapshot             = true
  storage_encrypted               = true
  db_subnet_group_name            = element(aws_docdb_subnet_group.this.*.name, count.index)
  vpc_security_group_ids          = data.aws_security_groups.this.ids
  enabled_cloudwatch_logs_exports = ["postgresql"]

  serverlessv2_scaling_configuration {
    max_capacity = 4.0
    min_capacity = 0.0
  }

  tags = local.app_tags
}

resource "aws_rds_cluster_instance" "this" {
  count                      = data.aws_caller_identity.this.id != "000000000000" ? 1 : 0
  cluster_identifier         = element(aws_rds_cluster.this.*.id, count.index)
  engine                     = element(aws_rds_cluster.this.*.engine, count.index)
  engine_version             = element(aws_rds_cluster.this.*.engine_version, count.index)
  identifier                 = format("%s-rds-%s", var.aws_project, local.app_id)
  instance_class             = "db.serverless"
  auto_minor_version_upgrade = true

  tags = local.app_tags
}

# resource "aws_secretsmanager_secret" "rds" {
#   count                   = data.aws_caller_identity.this.id != "000000000000" ? 1 : 0
#   name                    = format("%s-rds-%s", var.aws_project, local.app_id)
#   recovery_window_in_days = 0

#   tags = local.app_tags
# }

# resource "aws_secretsmanager_secret_version" "rds" {
#   count     = data.aws_caller_identity.this.id != "000000000000" ? 1 : 0
#   secret_id = element(aws_secretsmanager_secret.rds.*.id, count.index)
#   secret_string = jsonencode({
#     username = element(aws_rds_cluster.this.*.master_username, count.index)
#     password = element(aws_rds_cluster.this.*.master_password, count.index)
#     host     = element(aws_rds_cluster.this.*.endpoint, count.index)
#     port     = element(aws_rds_cluster.this.*.port, count.index)
#     dbname   = element(aws_rds_cluster.this.*.database_name, count.index)
#   })
# }
