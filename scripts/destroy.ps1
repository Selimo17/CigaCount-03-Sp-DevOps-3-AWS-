<#
.SYNOPSIS
    Destroys the AWS environment of CigaCount.

.DESCRIPTION
    Destroys the main stack (application, network, monitoring, images).
    With -IncludeBootstrap, also destroys the Terraform state bucket.

.EXAMPLE
    .\scripts\destroy.ps1
    .\scripts\destroy.ps1 -IncludeBootstrap -AutoApprove
#>
[CmdletBinding()]
param(
    [switch]$IncludeBootstrap,
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

Write-Host '==> Destroying the main stack' -ForegroundColor Cyan
Invoke-Terraform $infraDir @('init', '-input=false', '-reconfigure', '-backend-config=backend.hcl')
Invoke-Terraform $infraDir (@('destroy', '-input=false') + $approveArgs)

if ($IncludeBootstrap) {
    Write-Host '==> Destroying the Terraform state bucket' -ForegroundColor Cyan
    Invoke-Terraform $bootstrapDir @('init', '-input=false')
    Invoke-Terraform $bootstrapDir (@('destroy', '-input=false') + $approveArgs)
}

Write-Host 'Environment destroyed.' -ForegroundColor Green
