# ---------------------------------------------------------------------------
# ECS on Fargate: serverless containers, no EC2 instance to manage.
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/${local.name}"
  retention_in_days = var.log_retention_days
}

resource "aws_ecs_cluster" "main" {
  name = "${local.name}-cluster"

  setting {
    name  = "containerInsights"
    value = var.container_insights
  }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
  }
}

resource "aws_ecs_task_definition" "app" {
  family                   = local.name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = aws_iam_role.task_execution.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([
    {
      name      = local.container_name
      image     = "${aws_ecr_repository.app.repository_url}:${var.image_tag}"
      essential = true

      # Values are written exactly as ECS returns them (hostPort, empty lists)
      # so that Terraform does not detect a false difference on every plan
      # and replace the task definition for nothing.
      portMappings = [
        {
          name          = "http"
          containerPort = var.container_port
          hostPort      = var.container_port
          protocol      = "tcp"
        }
      ]
      mountPoints    = []
      volumesFrom    = []
      systemControls = []

      environment = [
        { name = "PORT", value = tostring(var.container_port) },
        { name = "LOG_LEVEL", value = "info" },
      ]

      # Hardening: non-root user, read-only file system, no Linux capability.
      user                   = "1000:1000"
      readonlyRootFilesystem = true
      linuxParameters = {
        capabilities       = { add = [], drop = ["ALL"] }
        initProcessEnabled = true
      }

      healthCheck = {
        command     = ["CMD", "node", "src/healthcheck.js"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 10
      }

      # stdout/stderr are shipped to CloudWatch Logs.
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.app.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "app"
        }
      }

      stopTimeout = 30
    }
  ])
}

resource "aws_ecs_service" "app" {
  name            = "${local.name}-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  # Rolling update: new tasks must be healthy before old ones are stopped.
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  health_check_grace_period_seconds  = 30

  # A deployment whose tasks keep failing is stopped and rolled back.
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = local.task_subnet_ids
    security_groups  = [aws_security_group.tasks.id]
    assign_public_ip = local.task_assign_public_ip
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = local.container_name
    container_port   = var.container_port
  }

  enable_ecs_managed_tags = true
  propagate_tags          = "SERVICE"

  # The CI/CD pipeline deploys new task definition revisions and auto scaling
  # changes the number of tasks: Terraform must not revert them.
  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }

  depends_on = [aws_lb_listener.http]
}

# ---------- Auto scaling on CPU usage ----------

resource "aws_appautoscaling_target" "app" {
  service_namespace  = "ecs"
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.app.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = var.min_capacity
  max_capacity       = var.max_capacity
}

resource "aws_appautoscaling_policy" "cpu" {
  name               = "${local.name}-cpu-target-tracking"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.app.service_namespace
  resource_id        = aws_appautoscaling_target.app.resource_id
  scalable_dimension = aws_appautoscaling_target.app.scalable_dimension

  target_tracking_scaling_policy_configuration {
    target_value       = 60
    scale_in_cooldown  = 300
    scale_out_cooldown = 60

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}
