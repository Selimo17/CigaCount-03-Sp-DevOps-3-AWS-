# ---------------------------------------------------------------------------
# Private container registry.
# ---------------------------------------------------------------------------

resource "aws_ecr_repository" "app" {
  name = local.name

  # A tag always points to the same image: deployments are traceable to a commit.
  image_tag_mutability = "IMMUTABLE"

  # Lets "terraform destroy" remove the repository even if it contains images.
  force_delete = true

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }
}

# Only the most recent images are kept to limit storage costs.
resource "aws_ecr_lifecycle_policy" "app" {
  repository = aws_ecr_repository.app.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep the 15 most recent images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 15
        }
        action = { type = "expire" }
      }
    ]
  })
}
