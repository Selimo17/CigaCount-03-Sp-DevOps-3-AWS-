output "app_url" {
  description = "Public URL of the application."
  value       = "${local.https_enabled ? "https" : "http"}://${aws_lb.main.dns_name}"
}

output "ecr_repository_url" {
  description = "URL of the ECR repository."
  value       = aws_ecr_repository.app.repository_url
}

output "github_actions_role_arn" {
  description = "IAM role assumed by GitHub Actions: set it as the AWS_ROLE_ARN repository variable."
  value       = aws_iam_role.github_deploy.arn
}

output "ecs_cluster_name" {
  description = "Name of the ECS cluster."
  value       = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  description = "Name of the ECS service."
  value       = aws_ecs_service.app.name
}

output "log_group_name" {
  description = "CloudWatch log group of the application."
  value       = aws_cloudwatch_log_group.app.name
}

output "dashboard_url" {
  description = "CloudWatch dashboard of the application."
  value       = "https://${var.aws_region}.console.aws.amazon.com/cloudwatch/home?region=${var.aws_region}#dashboards/dashboard/${aws_cloudwatch_dashboard.main.dashboard_name}"
}
