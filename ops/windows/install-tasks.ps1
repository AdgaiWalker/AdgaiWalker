param(
  [string]$Root = "C:\Walker\app",
  [string]$PublicApiHost = "http://127.0.0.1:8080"
)

$ErrorActionPreference = "Stop"

$apiScript = Join-Path $Root "ops\windows\run-api.ps1"
$caddyScript = Join-Path $Root "ops\windows\run-caddy.ps1"

if (-not (Test-Path $apiScript)) {
  throw "Missing API run script: $apiScript"
}
if (-not (Test-Path $caddyScript)) {
  throw "Missing Caddy run script: $caddyScript"
}

$settings = New-ScheduledTaskSettingsSet `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew `
  -StartWhenAvailable
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal `
  -UserId "SYSTEM" `
  -LogonType ServiceAccount `
  -RunLevel Highest

$apiAction = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$apiScript`""
Register-ScheduledTask `
  -TaskName "WalkerApi" `
  -Action $apiAction `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Force | Out-Null

$caddyAction = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$caddyScript`" -PublicApiHost `"$PublicApiHost`""
Register-ScheduledTask `
  -TaskName "WalkerGateway" `
  -Action $caddyAction `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Force | Out-Null

Start-ScheduledTask -TaskName "WalkerApi"
Start-ScheduledTask -TaskName "WalkerGateway"
Start-Sleep -Seconds 6

$apiHealth = Invoke-RestMethod "http://127.0.0.1:8788/health"

# Admin 面有 basic auth，健康检查需带凭据（与 run-caddy.ps1 同一凭据文件）。
$adminAuthFile = "C:\Walker\data\admin-basic-auth.txt"
$pair = (Get-Content $adminAuthFile -Raw).Trim()
$basic = "Basic " + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($pair))
$adminHealth = Invoke-RestMethod "http://127.0.0.1:8790/api/health" -Headers @{ Authorization = $basic }

Write-Output ("API_HEALTH=" + ($apiHealth | ConvertTo-Json -Compress))
Write-Output ("ADMIN_HEALTH=" + ($adminHealth | ConvertTo-Json -Compress))

Get-ScheduledTask -TaskName "WalkerApi", "WalkerGateway" |
  Select-Object TaskName, State |
  Format-Table -AutoSize |
  Out-String |
  Write-Output
