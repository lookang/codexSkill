param(
    [Parameter(Mandatory = $true)]
    [string]$Destination,
    [switch]$Build
)

$ErrorActionPreference = 'Stop'
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$skillRoot = Split-Path -Parent $scriptRoot
$starterRoot = Join-Path $skillRoot 'assets\famath-starter'
$destinationPath = [System.IO.Path]::GetFullPath($Destination)

if (-not (Test-Path -LiteralPath $starterRoot)) {
    throw "Bundled FAMath starter is missing: $starterRoot"
}

if (Test-Path -LiteralPath $destinationPath) {
    $existing = @(Get-ChildItem -LiteralPath $destinationPath -Force)
    if ($existing.Count -gt 0) {
        throw "Destination must be new or empty; refusing to overwrite existing content: $destinationPath"
    }
} else {
    [System.IO.Directory]::CreateDirectory($destinationPath) | Out-Null
}

Get-ChildItem -LiteralPath $starterRoot -Force | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $destinationPath -Recurse
}

Write-Output "Copied the canonical FAMath starter to: $destinationPath"

if ($Build) {
    $buildScript = Join-Path $destinationPath '_source\build.ps1'
    & $buildScript
    if (-not $?) { throw "FAMath build failed: $buildScript" }

    $validator = Join-Path $destinationPath '_source\validate.py'
    $python = Get-Command python -ErrorAction SilentlyContinue
    if ($python) {
        & $python.Source $validator
    } else {
        $py = Get-Command py -ErrorAction SilentlyContinue
        if (-not $py) { throw 'Python is required for validation but neither python nor py was found.' }
        & $py.Source -3 $validator
    }
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
