param(
  [Parameter(Mandatory = $true)]
  [string]$PublicApiHost,
  [string]$Root = "C:\Walker\app",
  [string]$Caddy = "C:\Walker\bin\caddy.exe"
)

$ErrorActionPreference = "Stop"
$config = Join-Path $Root "ops\windows\Caddyfile"
$adminDist = Join-Path $Root "apps\admin\dist"

if (-not (Test-Path $Caddy)) {
  throw "Missing Caddy executable: $Caddy"
}
if (-not (Test-Path $config)) {
  throw "Missing Caddyfile: $config"
}
if (-not (Test-Path $adminDist)) {
  throw "Missing Admin build: $adminDist"
}

$env:WALKER_PUBLIC_API_HOST = $PublicApiHost
$env:WALKER_ADMIN_DIST = $adminDist
Set-Location $Root
& $Caddy run --config $config --adapter caddyfile
exit $LASTEXITCODE
