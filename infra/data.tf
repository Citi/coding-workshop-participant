data "aws_region" "this" {}
data "aws_partition" "this" {}
data "aws_caller_identity" "this" {}

data "aws_vpcs" "this" {
  filter {
    name   = "vpc-id"
    values = [try(trimspace(var.aws_vpc_id), "") != "" ? trimspace(var.aws_vpc_id) : "*"]
  }
}

data "aws_vpc" "this" {
  id      = try(element(data.aws_vpcs.this.ids, 0), null)
  default = try(element(data.aws_vpcs.this.ids, 0), null) != null ? false : true
}

data "aws_availability_zones" "this" {
  filter {
    name   = "zone-type"
    values = ["availability-zone"]
  }
  filter {
    name   = "state"
    values = ["available"]
  }
}

data "aws_subnets" "this" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.this.id]
  }
  filter {
    name   = "availability-zone-id"
    values = data.aws_availability_zones.this.zone_ids
  }
}

data "aws_route_tables" "this" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.this.id]
  }
}

data "aws_route_table" "this" {
  for_each       = toset(data.aws_route_tables.this.ids)
  route_table_id = each.value
}

data "aws_security_groups" "this" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.this.id]
  }
  filter {
    name   = "group-name"
    values = [format("*%s*", local.app_id)]
  }
}

data "aws_service_principal" "cloudfront" {
  service_name = "cloudfront"
  region       = data.aws_region.this.region
}

data "aws_servicecatalogappregistry_application" "this" {
  count  = data.aws_caller_identity.this.id != "000000000000" && try(var.aws_app_code, null) != null ? 1 : 0
  id     = format("%s-%s", var.aws_project, var.aws_app_code)
  region = data.aws_region.this.region
}
