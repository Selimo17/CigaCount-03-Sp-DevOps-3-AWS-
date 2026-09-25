terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # This small stack creates the remote state bucket used by the main stack,
  # so its own state is kept locally (chicken-and-egg problem).
}
