param(
  [string]$Root = "C:\Walker\app"
)

$ErrorActionPreference = "Stop"
$envFile = Join-Path $Root "apps\api\.env"
$entry = Join-Path $Root "apps\api\dist\main.js"

if (-not (Test-Path $envFile)) {
  throw "Missing API environment file: $envFile"
}
if (-not (Test-Path $entry)) {
  throw "Missing compiled API entry: $entry"
}

$node = Get-Command node -ErrorAction Stop
Set-Location $Root
& $node.Source "--env-file=$envFile" $entry
exit $LASTEXITCODE
