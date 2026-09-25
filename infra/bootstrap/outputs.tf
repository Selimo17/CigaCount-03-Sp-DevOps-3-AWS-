output "state_bucket_name" {
  description = "Name of the S3 bucket that stores the Terraform state of the main stack."
  value       = aws_s3_bucket.terraform_state.bucket
}

output "backend_config" {
  description = "Content to paste into infra/backend.hcl."
  value       = <<-EOT
    bucket       = "${aws_s3_bucket.terraform_state.bucket}"
    key          = "${var.project_name}/terraform.tfstate"
    region       = "${var.aws_region}"
    encrypt      = true
    use_lockfile = true
  EOT
}
