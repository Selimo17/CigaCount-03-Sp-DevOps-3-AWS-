# Offline tests of the main stack: the AWS provider is mocked, so these
# "apply" runs create nothing and
# run in CI without any AWS credential ("terraform test").

mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = {
      account_id = "123456789012"
    }
  }

  mock_data "aws_availability_zones" {
    defaults = {
      names = ["eu-west-3a", "eu-west-3b", "eu-west-3c"]
    }
  }

  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{}"
    }
  }

  # The provider validates ARNs: mocked resources need realistic values.
  mock_resource "aws_sns_topic" {
    defaults = {
      arn = "arn:aws:sns:eu-west-3:123456789012:cigacount-alerts"
    }
  }

  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::123456789012:role/cigacount-role"
    }
  }

  mock_resource "aws_iam_openid_connect_provider" {
    defaults = {
      arn = "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"
    }
  }

  mock_resource "aws_ecr_repository" {
    defaults = {
      arn            = "arn:aws:ecr:eu-west-3:123456789012:repository/cigacount"
      repository_url = "123456789012.dkr.ecr.eu-west-3.amazonaws.com/cigacount"
    }
  }

  mock_resource "aws_cloudwatch_log_group" {
    defaults = {
      arn = "arn:aws:logs:eu-west-3:123456789012:log-group:/ecs/cigacount"
    }
  }

  mock_resource "aws_lb" {
    defaults = {
      arn        = "arn:aws:elasticloadbalancing:eu-west-3:123456789012:loadbalancer/app/cigacount-alb/0123456789abcdef"
      arn_suffix = "app/cigacount-alb/0123456789abcdef"
      dns_name   = "cigacount-alb-123456789.eu-west-3.elb.amazonaws.com"
    }
  }

  mock_resource "aws_lb_target_group" {
    defaults = {
      arn        = "arn:aws:elasticloadbalancing:eu-west-3:123456789012:targetgroup/cigacount-tg/0123456789abcdef"
      arn_suffix = "targetgroup/cigacount-tg/0123456789abcdef"
    }
  }

  mock_resource "aws_ecs_cluster" {
    defaults = {
      arn = "arn:aws:ecs:eu-west-3:123456789012:cluster/cigacount-cluster"
      id  = "arn:aws:ecs:eu-west-3:123456789012:cluster/cigacount-cluster"
    }
  }

  mock_resource "aws_ecs_task_definition" {
    defaults = {
      arn = "arn:aws:ecs:eu-west-3:123456789012:task-definition/cigacount:1"
    }
  }

  mock_resource "aws_ecs_service" {
    defaults = {
      arn = "arn:aws:ecs:eu-west-3:123456789012:service/cigacount-cluster/cigacount-service"
    }
  }
}

variables {
  github_repository = "example-owner/example-repo"
}

run "default_configuration_is_cheap_and_public" {
  command = apply

  assert {
    condition     = length(aws_subnet.public) == 2
    error_message = "Two public subnets in two availability zones are expected."
  }

  assert {
    condition     = length(aws_nat_gateway.main) == 0 && length(aws_subnet.private) == 0
    error_message = "No NAT gateway nor private subnet should be created by default."
  }

  assert {
    condition     = aws_ecs_service.app.network_configuration[0].assign_public_ip == true
    error_message = "Without NAT gateway, tasks need a public IP to reach ECR."
  }

  assert {
    condition     = aws_lb_listener.http.default_action[0].type == "forward"
    error_message = "Without certificate, the HTTP listener must forward to the application."
  }

  assert {
    condition     = length(aws_lb_listener.https) == 0
    error_message = "No HTTPS listener without certificate."
  }
}

run "tasks_are_hardened" {
  command = apply

  assert {
    condition     = aws_ecr_repository.app.image_tag_mutability == "IMMUTABLE"
    error_message = "Image tags must be immutable."
  }

  assert {
    condition     = jsondecode(aws_ecs_task_definition.app.container_definitions)[0].readonlyRootFilesystem == true
    error_message = "The container file system must be read-only."
  }

  assert {
    condition     = jsondecode(aws_ecs_task_definition.app.container_definitions)[0].user == "1000:1000"
    error_message = "The container must not run as root."
  }

  assert {
    condition     = aws_ecs_task_definition.app.task_role_arn == null
    error_message = "The application needs no AWS permission: no task role."
  }

  assert {
    condition     = aws_ecs_service.app.deployment_circuit_breaker[0].rollback == true
    error_message = "Failed deployments must be rolled back automatically."
  }
}

run "production_options" {
  command = apply

  variables {
    enable_nat_gateway = true
    certificate_arn    = "arn:aws:acm:eu-west-3:123456789012:certificate/example"
    alert_email        = "ops@example.com"
  }

  assert {
    condition     = length(aws_subnet.private) == 2 && length(aws_nat_gateway.main) == 1
    error_message = "Private subnets and a NAT gateway are expected."
  }

  assert {
    condition     = aws_ecs_service.app.network_configuration[0].assign_public_ip == false
    error_message = "Tasks in private subnets must not have a public IP."
  }

  assert {
    condition     = aws_lb_listener.http.default_action[0].type == "redirect"
    error_message = "HTTP must redirect to HTTPS when a certificate is provided."
  }

  assert {
    condition     = length(aws_lb_listener.https) == 1
    error_message = "An HTTPS listener is expected."
  }

  assert {
    condition     = length(aws_sns_topic_subscription.alerts_email) == 1 && length(aws_budgets_budget.monthly) == 1
    error_message = "Alarm e-mails and the budget must be configured when an e-mail is given."
  }
}
