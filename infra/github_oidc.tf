# ---------------------------------------------------------------------------
# GitHub Actions -> AWS authentication with OpenID Connect.
#
# No AWS access key is stored anywhere: each workflow run receives a signed
# token from GitHub and exchanges it for temporary credentials (1 hour max).
# Only workflows of the configured repository AND branch can assume the role.
# ---------------------------------------------------------------------------

resource "aws_iam_openid_connect_provider" "github" {
  count = var.create_github_oidc_provider ? 1 : 0

  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

data "aws_iam_openid_connect_provider" "github" {
  count = var.create_github_oidc_provider ? 0 : 1

  url = "https://token.actions.githubusercontent.com"
}

locals {
  github_oidc_provider_arn = (
    var.create_github_oidc_provider
    ? aws_iam_openid_connect_provider.github[0].arn
    : data.aws_iam_openid_connect_provider.github[0].arn
  )

  github_owner           = split("/", var.github_repository)[0]
  github_repository_name = split("/", var.github_repository)[1]
  github_subject_suffix  = "ref:refs/heads/${var.github_branch}"

  # Subjects allowed to assume the deployment role. GitHub issues either the
  # classic format "repo:owner/name:..." or the format with immutable IDs
  # "repo:owner@owner_id/name@repository_id:...".
  github_subjects = [
    "repo:${var.github_repository}:${local.github_subject_suffix}",
    format(
      "repo:%s@%s/%s@%s:%s",
      local.github_owner,
      var.github_owner_id != null ? tostring(var.github_owner_id) : "*",
      local.github_repository_name,
      var.github_repository_id != null ? tostring(var.github_repository_id) : "*",
      local.github_subject_suffix,
    ),
  ]
}

data "aws_iam_policy_document" "github_assume_role" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [local.github_oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    # StringLike: "*" only appears in place of an ID that was not pinned.
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = local.github_subjects
    }
  }
}

resource "aws_iam_role" "github_deploy" {
  name                 = "${local.name}-github-deploy"
  description          = "Assumed by GitHub Actions to publish images and deploy ${local.name}"
  assume_role_policy   = data.aws_iam_policy_document.github_assume_role.json
  max_session_duration = 3600
}

# The pipeline can only: push to this repository, register a task definition
# and update this service. It cannot modify the infrastructure.
data "aws_iam_policy_document" "github_deploy" {
  statement {
    sid       = "EcrAuthentication"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"] # this action does not support resource-level permissions
  }

  statement {
    sid = "PushApplicationImage"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:CompleteLayerUpload",
      "ecr:DescribeImageScanFindings",
      "ecr:DescribeImages",
      "ecr:GetDownloadUrlForLayer",
      "ecr:InitiateLayerUpload",
      "ecr:PutImage",
      "ecr:UploadLayerPart",
    ]
    resources = [aws_ecr_repository.app.arn]
  }

  statement {
    sid = "ManageTaskDefinitions"
    actions = [
      "ecs:DescribeTaskDefinition",
      "ecs:RegisterTaskDefinition",
    ]
    resources = ["*"] # these actions do not support resource-level permissions
  }

  # The task definition is registered with its tags (copied from the previous
  # revision): tagging is only allowed while registering this family.
  statement {
    sid       = "TagNewTaskDefinitions"
    actions   = ["ecs:TagResource"]
    resources = ["arn:aws:ecs:${var.aws_region}:${local.account_id}:task-definition/${aws_ecs_task_definition.app.family}:*"]

    condition {
      test     = "StringEquals"
      variable = "ecs:CreateAction"
      values   = ["RegisterTaskDefinition"]
    }
  }

  statement {
    sid = "DeployService"
    actions = [
      "ecs:DescribeServices",
      "ecs:UpdateService",
    ]
    resources = [aws_ecs_service.app.arn]
  }

  statement {
    sid       = "PassExecutionRoleToEcsOnly"
    actions   = ["iam:PassRole"]
    resources = [aws_iam_role.task_execution.arn]

    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "github_deploy" {
  name   = "push-image-and-deploy-service"
  role   = aws_iam_role.github_deploy.id
  policy = data.aws_iam_policy_document.github_deploy.json
}
