resource "aws_vpc_endpoint" "secretsmanager" {
  count               = data.aws_caller_identity.this.id != "000000000000" ? tonumber(var.aws_vpce_secretsmanager) : 0
  service_name        = format("com.amazonaws.%s.secretsmanager", data.aws_region.this.id)
  private_dns_enabled = true
  vpc_endpoint_type   = "Interface"
  vpc_id              = data.aws_vpc.this.id
  security_group_ids  = [aws_security_group.this.id]
  subnet_ids          = [element(data.aws_subnets.this.ids, 0)]

  tags = {
    awsApplication = local.app_arn
    identifier     = local.app_id
    Name           = format("%s-secretsmanager-%s", var.aws_project, local.app_id)
  }
}

resource "aws_vpc_endpoint" "sts" {
  count               = data.aws_caller_identity.this.id != "000000000000" ? tonumber(var.aws_vpce_sts) : 0
  service_name        = format("com.amazonaws.%s.sts", data.aws_region.this.id)
  private_dns_enabled = true
  vpc_endpoint_type   = "Interface"
  vpc_id              = data.aws_vpc.this.id
  security_group_ids  = [aws_security_group.this.id]
  subnet_ids          = [element(data.aws_subnets.this.ids, 0)]

  tags = {
    awsApplication = local.app_arn
    identifier     = local.app_id
    Name           = format("%s-sts-%s", var.aws_project, local.app_id)
  }
}
