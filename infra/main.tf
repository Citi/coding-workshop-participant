resource "random_id" "this" {
  byte_length = 4

  keepers = {
    seed_input = try(var.aws_app_code, terraform.workspace)
  }
}

resource "random_pet" "this" {
  length    = 3
  separator = "-"

  keepers = {
    seed_input = try(var.aws_app_code, terraform.workspace)
  }
}

# Signing key for the API's JWTs (256 bits). Generated once per environment and kept in
# Terraform state, so tokens stay valid across deployments.
resource "random_id" "jwt_secret" {
  byte_length = 32
}
