param(
  [string]$AppRoot = "C:\Walker\app",
  [string]$ContentRepo = "C:\Walker\data\content-repo",
  [string]$RemoteUrl = ""
)

# NOTE: keep this file pure ASCII (Windows PowerShell 5.1 ANSI parsing pitfall).
# Purpose: initialize an isolated sparse-checkout Git clone (content/ only)
# under C:\Walker\data\content-repo so admin content sync/publish never touches
# the live code checkout at C:\Walker\app.

$ErrorActionPreference = "Stop"

if (-not $RemoteUrl) {
  $RemoteUrl = (git -C $AppRoot config --get remote.origin.url).Trim()
}
if (-not $RemoteUrl) {
  throw "Could not resolve remote.origin.url from $AppRoot; pass -RemoteUrl explicitly."
}

$sshCmd = (git -C $AppRoot config --get core.sshCommand 2>$null)
if ($sshCmd) { $sshCmd = $sshCmd.Trim() }

if (-not (Test-Path (Join-Path $ContentRepo ".git"))) {
  $parent = Split-Path $ContentRepo -Parent
  if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
  Write-Output "Cloning sparse content repo into $ContentRepo ..."
  if ($sshCmd) {
    git -c "core.sshCommand=$sshCmd" clone --no-checkout $RemoteUrl $ContentRepo
    git -C $ContentRepo config core.sshCommand $sshCmd
  } else {
    git clone --no-checkout $RemoteUrl $ContentRepo
  }
  git -C $ContentRepo sparse-checkout init --no-cone
  git -C $ContentRepo sparse-checkout set /content/
  git -C $ContentRepo config core.autocrlf false
  git -C $ContentRepo config core.eol lf
  git -C $ContentRepo config user.name "Walker Publisher"
  git -C $ContentRepo config user.email "walker@iwalk.pro"
  git -C $ContentRepo checkout main
} else {
  Write-Output "Content repo already exists at $ContentRepo; enforcing LF and sparse config..."
  if ($sshCmd) {
    git -C $ContentRepo config core.sshCommand $sshCmd
  }
  git -C $ContentRepo sparse-checkout set --no-cone /content/
  git -C $ContentRepo config core.autocrlf false
  git -C $ContentRepo config core.eol lf
  git -C $ContentRepo fetch origin main
}

Write-Output ""
Write-Output "Content repo ready: $ContentRepo"
Write-Output "Update C:\Walker\app\apps\api\.env (remove legacy CONTENT_LOG_DIR and restart WalkerApi):"
Write-Output "  WALKER_CONTENT_REPO_DIR=$($ContentRepo -replace '\\', '/')"
Write-Output "  WALKER_GITHUB_WEBHOOK_SECRET=<your-random-hmac-secret>"
