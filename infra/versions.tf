terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # Remote state in S3 with native locking (use_lockfile). The bucket is
  # created by the bootstrap stack; its settings are provided at init time:
  #   terraform init -backend-config=backend.hcl
  backend "s3" {}
}
