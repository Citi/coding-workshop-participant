resource "aws_docdb_subnet_group" "this" {
  count      = data.aws_caller_identity.this.id != "000000000000" && var.aws_docdb_enabled ? 1 : 0
  name       = format("%s-docdb-subnet-group-%s", var.aws_project, local.app_id)
  subnet_ids = local.public_subnet_ids

  tags = local.app_tags
}

resource "aws_docdb_cluster" "this" {
  count                           = data.aws_caller_identity.this.id != "000000000000" && var.aws_docdb_enabled ? 1 : 0
  cluster_identifier              = format("%s-docdb-%s", var.aws_project, local.app_id)
  engine                          = "docdb"
  engine_version                  = "5.0.0"
  master_username                 = "superadmin"
  master_password                 = random_pet.this.id
  backup_retention_period         = 7
  preferred_backup_window         = "07:00-09:00"
  skip_final_snapshot             = true
  storage_encrypted               = true
  db_subnet_group_name            = element(aws_docdb_subnet_group.this.*.name, count.index)
  vpc_security_group_ids          = data.aws_security_groups.this.ids
  enabled_cloudwatch_logs_exports = ["audit", "profiler"]

  serverless_v2_scaling_configuration {
    max_capacity = 4.0
    min_capacity = 0.5
  }

  tags = local.app_tags
}

resource "aws_docdb_cluster_instance" "this" {
  count                      = data.aws_caller_identity.this.id != "000000000000" && var.aws_docdb_enabled ? 1 : 0
  cluster_identifier         = element(aws_docdb_cluster.this.*.id, count.index)
  engine                     = element(aws_docdb_cluster.this.*.engine, count.index)
  identifier                 = format("%s-docdb-%s", var.aws_project, local.app_id)
  instance_class             = "db.serverless"
  auto_minor_version_upgrade = true

  tags = local.app_tags
}
