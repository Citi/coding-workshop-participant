resource "random_id" "this" {
  byte_length = 4

  keepers = {
    seed_input = try(var.aws_app_code, terraform.workspace)
  }
}

resource "random_password" "this" {
  length      = 16
  upper       = true
  lower       = true
  numeric     = true
  special     = true
  min_upper   = 1
  min_lower   = 1
  min_numeric = 1
  min_special = 1
}
