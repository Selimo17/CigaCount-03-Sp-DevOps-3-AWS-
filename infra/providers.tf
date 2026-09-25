provider "aws" {
  region = var.aws_region

  # Every resource is tagged: useful for cost allocation and inventory.
  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
      Repository  = var.github_repository
    }
  }
}

data "aws_caller_identity" "current" {}

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  name       = var.project_name
  account_id = data.aws_caller_identity.current.account_id

  # Two availability zones: required by the load balancer and for resilience.
  azs = slice(data.aws_availability_zones.available.names, 0, 2)

  container_name = var.project_name
  https_enabled  = var.certificate_arn != null
}
