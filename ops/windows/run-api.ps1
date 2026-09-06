param(
  [string]$Root = "C:\Walker\app"
)

# NOTE: keep this file pure ASCII (Windows PowerShell 5 ANSI parsing pitfall).

# PS 5.1 pitfall: 'Stop' treats native stderr as terminating errors and would
# kill the log pipeline below; preconditions are checked explicitly instead.
$ErrorActionPreference = "Continue"
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

# Persist process output (stdout + stderr) to C:\Walker\logs\api.log so
# degradation reasons and Nest logs survive the scheduled-task session.
$boxRoot = Split-Path $Root -Parent
$logDir = Join-Path $boxRoot "logs"
if (-not (Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir | Out-Null
}
$log = Join-Path $logDir "api.log"
$stamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
Add-Content -Path $log -Encoding UTF8 -Value "==== api start $stamp build=$env:WALKER_BUILD_VERSION ===="

& $node.Source "--env-file=$envFile" $entry 2>&1 | ForEach-Object {
  Add-Content -Path $log -Encoding UTF8 -Value $_.ToString()
}
$code = $LASTEXITCODE
Add-Content -Path $log -Encoding UTF8 -Value "==== api exit $code at $((Get-Date).ToString('yyyy-MM-dd HH:mm:ss')) ===="
exit $code
