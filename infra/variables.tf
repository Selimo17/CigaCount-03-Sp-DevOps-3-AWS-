# ---------- General ----------

variable "aws_region" {
  description = "AWS region where the application is deployed."
  type        = string
  default     = "eu-west-3"
}

variable "project_name" {
  description = "Project name, used as a prefix for every resource name."
  type        = string
  default     = "cigacount"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,20}$", var.project_name))
    error_message = "Use 3 to 21 lowercase letters, digits or dashes."
  }
}

variable "environment" {
  description = "Environment name (used in tags)."
  type        = string
  default     = "production"
}

# ---------- Network ----------

variable "vpc_cidr" {
  description = "CIDR block of the VPC."
  type        = string
  default     = "10.0.0.0/16"
}

variable "enable_nat_gateway" {
  description = <<-EOT
    Run the tasks in private subnets behind a NAT gateway (recommended for
    production, about 35 USD/month). When false, tasks run in public subnets
    with a public IP but only accept traffic from the load balancer.
  EOT
  type        = bool
  default     = false
}

variable "certificate_arn" {
  description = "Optional ACM certificate ARN. When set, HTTPS is enabled and HTTP redirects to HTTPS."
  type        = string
  default     = null
}

# ---------- Application ----------

variable "container_port" {
  description = "Port the application listens on inside the container."
  type        = number
  default     = 3000
}

variable "image_tag" {
  description = <<-EOT
    Image tag used by the task definition created by Terraform. Later
    versions are deployed by the CI/CD pipeline, which registers new
    revisions of the task definition with the image of each commit.
  EOT
  type        = string
  default     = "initial"
}

variable "task_cpu" {
  description = "Fargate task CPU units (256 = 0.25 vCPU)."
  type        = number
  default     = 256
}

variable "task_memory" {
  description = "Fargate task memory in MiB."
  type        = number
  default     = 512
}

variable "desired_count" {
  description = "Number of tasks started when the service is created."
  type        = number
  default     = 1
}

variable "min_capacity" {
  description = "Minimum number of tasks kept by auto scaling."
  type        = number
  default     = 1
}

variable "max_capacity" {
  description = "Maximum number of tasks reachable by auto scaling."
  type        = number
  default     = 3
}

variable "log_retention_days" {
  description = "Retention of the application logs in CloudWatch Logs."
  type        = number
  default     = 14
}

variable "container_insights" {
  description = "ECS Container Insights mode: disabled, enabled or enhanced (paid metrics)."
  type        = string
  default     = "disabled"
}

# ---------- CI/CD ----------

variable "github_repository" {
  description = "GitHub repository allowed to deploy, as owner/name (case-sensitive)."
  type        = string

  validation {
    condition     = can(regex("^[^/]+/[^/]+$", var.github_repository))
    error_message = "Use the owner/name format, e.g. octocat/my-repo."
  }
}

variable "github_owner_id" {
  description = <<-EOT
    Numeric ID of the GitHub repository owner. GitHub OIDC tokens may identify
    the repository as "owner@owner_id/name@repository_id": pinning the IDs
    prevents a renamed or recreated account/repository from deploying.
    When null, any ID is accepted for this owner name.
  EOT
  type        = number
  default     = null
}

variable "github_repository_id" {
  description = "Numeric ID of the GitHub repository (see github_owner_id). When null, any ID is accepted."
  type        = number
  default     = null
}

variable "github_branch" {
  description = "Only workflows running on this branch can assume the deployment role."
  type        = string
  default     = "main"
}

variable "create_github_oidc_provider" {
  description = "Create the GitHub OIDC provider. Set to false if it already exists in the AWS account."
  type        = bool
  default     = true
}

# ---------- Monitoring ----------

variable "alert_email" {
  description = "E-mail address receiving the alarms and budget alerts (a confirmation e-mail is sent)."
  type        = string
  default     = null
}

variable "monthly_budget_usd" {
  description = "Monthly AWS budget in USD. An alert is sent at 80 % (actual) and 100 % (forecast)."
  type        = number
  default     = 30
}
