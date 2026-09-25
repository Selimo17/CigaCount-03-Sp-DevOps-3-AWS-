variable "aws_region" {
  description = "AWS region where the Terraform state bucket is created."
  type        = string
  default     = "eu-west-3"
}

variable "project_name" {
  description = "Project name used as a prefix for resource names."
  type        = string
  default     = "cigacount"
}

variable "force_destroy" {
  description = "Allow 'terraform destroy' to delete the bucket even if it still contains state versions."
  type        = bool
  default     = true
}
