provider "aws" {
  default_tags {
    tags = {
      application = "coding-workshop"
      contact     = "github.com/eistrati"
      environment = terraform.workspace
    }
  }

  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_region_validation      = true
}

terraform {
  backend "s3" {
    bucket = "coding-workshop-us-east-1-abcd1234"
    key    = "terraform/terraform.tfstate"
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    external = {
      source  = "hashicorp/external"
      version = "~> 2.0"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.0"
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 3.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }

  required_version = ">= 1.11.0"
}
