param(
  [Parameter(Mandatory = $true)][string]$BackupDatabasePath,
  [Parameter(Mandatory = $true)][string]$LatestDeletionManifestPath,
  [string]$TargetDatabasePath = "C:\Walker\data\walker.db",
  [string]$Root = "C:\Walker\app",
  [string]$RestoreGatePath
)

# Keep this file ASCII-only for Windows PowerShell 5.
$ErrorActionPreference = "Continue"

function Assert-CommandSuccess([string]$Name) {
  if ($LASTEXITCODE -ne 0) {
    throw "$Name failed with exit code $LASTEXITCODE"
  }
}

function Assert-PortReleased([int]$Port) {
  $listeners = netstat -ano -p tcp | Select-String (":$Port\s+.*LISTENING")
  if ($listeners) {
    throw "Port $Port is still listening; restore is paused and the pending marker remains"
  }
}

$backupPath = [System.IO.Path]::GetFullPath($BackupDatabasePath)
$latestManifest = [System.IO.Path]::GetFullPath($LatestDeletionManifestPath)
$targetPath = [System.IO.Path]::GetFullPath($TargetDatabasePath)
if (-not [System.IO.Path]::IsPathRooted($BackupDatabasePath) -or
    -not [System.IO.Path]::IsPathRooted($LatestDeletionManifestPath) -or
    -not [System.IO.Path]::IsPathRooted($TargetDatabasePath)) {
  throw "All database and manifest paths must be absolute"
}

$metadataPath = "${backupPath}.manifest.json"
if (-not (Test-Path -LiteralPath $backupPath -PathType Leaf) -or
    -not (Test-Path -LiteralPath $metadataPath -PathType Leaf) -or
    -not (Test-Path -LiteralPath $latestManifest -PathType Leaf)) {
  throw "Backup database, backup metadata, and latest deletion manifest are all required"
}

$metadata = Get-Content -LiteralPath $metadataPath -Raw | ConvertFrom-Json
if ($metadata.version -ne 1 -or $metadata.databaseFile -ne (Split-Path $backupPath -Leaf)) {
  throw "Backup metadata does not match the selected SQLite file"
}
if ([DateTime]::Parse($metadata.expiresAt).ToUniversalTime() -le (Get-Date).ToUniversalTime()) {
  throw "This SQLite backup has expired; backups are restorable for 30 days"
}
if ((Get-FileHash -LiteralPath $backupPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $metadata.databaseSha256.ToLowerInvariant()) {
  throw "SQLite backup hash does not match its metadata"
}

$packagedManifest = Join-Path (Split-Path $backupPath -Parent) $metadata.deletionManifestFile
if (-not (Test-Path -LiteralPath $packagedManifest -PathType Leaf) -or
    (Get-FileHash -LiteralPath $packagedManifest -Algorithm SHA256).Hash.ToLowerInvariant() -ne $metadata.deletionManifestSha256.ToLowerInvariant()) {
  throw "The backup's deletion-manifest copy is missing or corrupt"
}

$boxRoot = Split-Path ([System.IO.Path]::GetFullPath($Root)) -Parent
$controlDir = Join-Path $boxRoot "control"
$dataDir = Split-Path $targetPath -Parent
$pendingFile = if ([string]::IsNullOrWhiteSpace($RestoreGatePath)) { Join-Path $controlDir "restore.pending" } else { [System.IO.Path]::GetFullPath($RestoreGatePath) }
$rollbackDir = Join-Path $controlDir "restore-rollback"
$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
$stagedDatabasePath = Join-Path $dataDir "walker.restore-$stamp.db"
$rollbackDatabasePath = Join-Path $rollbackDir "walker-$stamp.db"
$rollbackManifestPath = Join-Path $rollbackDir "deletion-manifest-$stamp.json"
$pendingCreated = $false

Set-Location $Root
Get-ScheduledTask -TaskName "WalkerApi" -ErrorAction Stop | Out-Null
Get-ScheduledTask -TaskName "WalkerGateway" -ErrorAction Stop | Out-Null
New-Item -ItemType Directory -Path $controlDir -Force | Out-Null
New-Item -ItemType Directory -Path (Split-Path $pendingFile -Parent) -Force | Out-Null
New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
New-Item -ItemType Directory -Path $rollbackDir -Force | Out-Null

try {
  Set-Content -LiteralPath $pendingFile -Value "restore started $stamp" -Encoding ASCII
  $pendingCreated = $true

  Stop-ScheduledTask -TaskName "WalkerGateway" -ErrorAction SilentlyContinue
  Stop-ScheduledTask -TaskName "WalkerApi" -ErrorAction SilentlyContinue
  Assert-PortReleased 443
  Assert-PortReleased 8788

  & pnpm --filter @walker/api log:maintenance -- merge $latestManifest
  Assert-CommandSuccess "Deletion manifest merge"

  if (Test-Path -LiteralPath $targetPath -PathType Leaf) {
    & pnpm --filter @walker/api log:maintenance -- snapshot $rollbackDatabasePath $rollbackManifestPath
    Assert-CommandSuccess "Pre-restore SQLite snapshot"
  }

  Copy-Item -LiteralPath $backupPath -Destination $stagedDatabasePath -ErrorAction Stop
  $previousDatabaseUrl = $env:DATABASE_URL
  try {
    $env:DATABASE_URL = "file:" + $stagedDatabasePath.Replace("\", "/")
    & pnpm db:migrate
    Assert-CommandSuccess "Restored database migrations"
    & pnpm --filter @walker/api log:maintenance -- verify-db $stagedDatabasePath
    Assert-CommandSuccess "Restored database integrity check"
  } finally {
    if ($null -eq $previousDatabaseUrl) {
      Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
    } else {
      $env:DATABASE_URL = $previousDatabaseUrl
    }
  }

  if (Test-Path -LiteralPath $targetPath -PathType Leaf) {
    Remove-Item -LiteralPath $targetPath -Force -ErrorAction Stop
  }
  foreach ($suffix in @("-wal", "-shm", "-journal")) {
    Remove-Item -LiteralPath ($targetPath + $suffix) -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath ($stagedDatabasePath + $suffix) -Force -ErrorAction SilentlyContinue
  }
  Move-Item -LiteralPath $stagedDatabasePath -Destination $targetPath -ErrorAction Stop

  Start-ScheduledTask -TaskName "WalkerApi"
  $ready = $false
  for ($attempt = 0; $attempt -lt 45; $attempt++) {
    try {
      $health = Invoke-RestMethod -Uri "http://127.0.0.1:8788/health" -TimeoutSec 2
      if ($health.ok -eq $true -and $health.db -eq $true -and -not (Test-Path -LiteralPath $pendingFile)) {
        $ready = $true
        break
      }
    } catch {
      # The API stays unavailable until manifest and retention reconciliation succeeds.
    }
    Start-Sleep -Seconds 2
  }
  if (-not $ready) {
    throw "API did not become ready after restore reconciliation"
  }

  Start-ScheduledTask -TaskName "WalkerGateway"
  Write-Output "RESTORE_OK database=$targetPath backup=$backupPath"
  Write-Output "ROLLBACK_COPY=$rollbackDatabasePath"
} catch {
  if ($pendingCreated) {
    Set-Content -LiteralPath $pendingFile -Value "restore failed $stamp" -Encoding ASCII
  }
  Stop-ScheduledTask -TaskName "WalkerGateway" -ErrorAction SilentlyContinue
  Stop-ScheduledTask -TaskName "WalkerApi" -ErrorAction SilentlyContinue
  throw
}
