<#
.SYNOPSIS
    Creates (or updates) the whole AWS environment of CigaCount with Terraform.

.DESCRIPTION
    1. Bootstrap stack: S3 bucket holding the Terraform state (local state).
    2. Generates infra/backend.hcl from the bootstrap outputs.
    3. Main stack: network, load balancer, ECR, ECS Fargate, IAM, monitoring.
    4. If the GitHub CLI (gh) is installed and authenticated, sets the
       repository variables used by the pipeline and starts the first deployment.

.PARAMETER AutoApprove
    Skips the interactive Terraform confirmations.

.EXAMPLE
    .\scripts\deploy.ps1
#>
[CmdletBinding()]
param(
    [switch]$AutoApprove
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$bootstrapDir = Join-Path $root 'infra/bootstrap'
$infraDir = Join-Path $root 'infra'
$approveArgs = @()
if ($AutoApprove) { $approveArgs = @('-auto-approve') }

function Invoke-Terraform {
    param([string]$Directory, [string[]]$Arguments)
    & terraform "-chdir=$Directory" @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "terraform $($Arguments -join ' ') failed in $Directory"
    }
}

foreach ($tool in @('terraform', 'aws')) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        throw "$tool is not installed or not in the PATH (see README, prerequisites)."
    }
}

Write-Host '==> Checking AWS credentials' -ForegroundColor Cyan
& aws sts get-caller-identity --output table
if ($LASTEXITCODE -ne 0) { throw 'AWS credentials are not configured: run "aws configure" first.' }

$tfvars = Join-Path $infraDir 'terraform.tfvars'
if (-not (Test-Path $tfvars)) {
    throw "Missing $tfvars. Copy infra/terraform.tfvars.example to infra/terraform.tfvars and edit it."
}

Write-Host '==> 1/3 Bootstrap stack (Terraform state bucket)' -ForegroundColor Cyan
Invoke-Terraform $bootstrapDir @('init', '-input=false')
Invoke-Terraform $bootstrapDir (@('apply', '-input=false') + $approveArgs)

Write-Host '==> 2/3 Generating infra/backend.hcl' -ForegroundColor Cyan
$backendConfig = & terraform "-chdir=$bootstrapDir" output -raw backend_config
if ($LASTEXITCODE -ne 0) { throw 'Unable to read the bootstrap outputs.' }
Set-Content -Path (Join-Path $infraDir 'backend.hcl') -Value $backendConfig -Encoding ascii

Write-Host '==> 3/3 Main stack (application infrastructure)' -ForegroundColor Cyan
Invoke-Terraform $infraDir @('init', '-input=false', '-reconfigure', '-backend-config=backend.hcl')
Invoke-Terraform $infraDir (@('apply', '-input=false') + $approveArgs)

$roleArn = & terraform "-chdir=$infraDir" output -raw github_actions_role_arn
$appUrl = & terraform "-chdir=$infraDir" output -raw app_url
$region = (Select-String -Path $tfvars -Pattern '^\s*aws_region\s*=\s*"([^"]+)"').Matches.Groups[1].Value
if (-not $region) { $region = 'eu-west-3' }
$repository = (Select-String -Path $tfvars -Pattern '^\s*github_repository\s*=\s*"([^"]+)"').Matches.Groups[1].Value

if (Get-Command gh -ErrorAction SilentlyContinue) {
    Write-Host '==> Configuring GitHub repository variables with gh' -ForegroundColor Cyan
    & gh variable set AWS_ROLE_ARN --body $roleArn --repo $repository
    & gh variable set AWS_REGION --body $region --repo $repository
    & gh variable set APP_URL --body $appUrl --repo $repository
    Write-Host '==> Starting the first deployment (workflow "Deploy" on main)' -ForegroundColor Cyan
    & gh workflow run deploy.yml --ref main --repo $repository
} else {
    Write-Host ''
    Write-Host 'GitHub CLI not found. In GitHub > Settings > Secrets and variables > Actions > Variables, create:' -ForegroundColor Yellow
    Write-Host "  AWS_ROLE_ARN = $roleArn"
    Write-Host "  AWS_REGION   = $region"
    Write-Host "  APP_URL      = $appUrl"
    Write-Host 'Then run the "Deploy" workflow (Actions tab > Deploy > Run workflow) or push to main.' -ForegroundColor Yellow
}

Write-Host ''
Write-Host "Application URL (available after the first pipeline run): $appUrl" -ForegroundColor Green
