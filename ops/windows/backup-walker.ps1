param(
  [Parameter(Mandatory = $true)][string]$Destination,
  [string]$Root = "C:\Walker\app"
)

$ErrorActionPreference = "Continue"
$destinationPath = [System.IO.Path]::GetFullPath($Destination)
if (-not [System.IO.Path]::IsPathRooted($Destination)) {
  throw "Destination must be an absolute path"
}
$boxRoot = Split-Path ([System.IO.Path]::GetFullPath($Root)) -Parent
$boxRootPrefix = $boxRoot.TrimEnd('\') + "\"
if ($destinationPath.Equals($boxRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
    $destinationPath.StartsWith($boxRootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Backups must be stored outside the Walker installation tree"
}

$apiTask = Get-ScheduledTask -TaskName "WalkerApi" -ErrorAction Stop
$gatewayTask = Get-ScheduledTask -TaskName "WalkerGateway" -ErrorAction Stop
$restartApi = $apiTask.State -eq "Running"
$restartGateway = $gatewayTask.State -eq "Running"

$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
New-Item -ItemType Directory -Path $destinationPath -Force | Out-Null
$databasePath = Join-Path $destinationPath "walker-$stamp.db"
$manifestPath = Join-Path $destinationPath "deletion-manifest-$stamp.json"

$backupError = $null
try {
  Stop-ScheduledTask -TaskName "WalkerGateway" -ErrorAction SilentlyContinue
  Stop-ScheduledTask -TaskName "WalkerApi" -ErrorAction SilentlyContinue
  $gatewayListeners = netstat -ano -p tcp | Select-String ":443\s+.*LISTENING"
  if ($gatewayListeners) { throw "Port 443 is still listening; backup is paused" }
  $listeners = netstat -ano -p tcp | Select-String ":8788\s+.*LISTENING"
  if ($listeners) { throw "Port 8788 is still listening; backup is paused" }

  Set-Location $Root
  & pnpm --filter @walker/api log:maintenance -- snapshot $databasePath $manifestPath
  if ($LASTEXITCODE -ne 0) {
    throw "SQLite snapshot failed with exit code $LASTEXITCODE"
  }
} catch {
  $backupError = $_.Exception.Message
} finally {
  $apiReady = $false
  if ($restartApi) {
    Start-ScheduledTask -TaskName "WalkerApi"
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
      try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:8788/health" -TimeoutSec 2
        if ($health.ok -eq $true -and $health.db -eq $true) { $apiReady = $true; break }
      } catch { }
      Start-Sleep -Seconds 2
    }
  }
  if ($restartGateway -and (-not $restartApi -or $apiReady)) {
    Start-ScheduledTask -TaskName "WalkerGateway"
  }
}

if ($backupError) {
  if ($restartApi -and -not $apiReady) { throw "$backupError; WalkerApi did not return healthy" }
  throw $backupError
}
if ($restartApi -and -not $apiReady) { throw "Backup succeeded but WalkerApi did not return healthy" }
Write-Output "DATABASE_BACKUP=$databasePath"
Write-Output "RECOVERY_MANIFEST=$manifestPath"
Write-Output "BACKUP_METADATA=$databasePath.manifest.json"
