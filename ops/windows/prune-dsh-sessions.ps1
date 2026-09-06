# prune-dsh-sessions.ps1
# Delete dsh assistant session directories older than a retention window.
# Sessions live under $env:USERPROFILE\.dsh-assistant\sessions (one dir per
# session, containing session.jsonl.zstd). They are runtime caches: the
# authoritative Q&A record is the AssistantRun table in SQLite, so old
# session dirs can be removed safely. Next question just creates a new one.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File prune-dsh-sessions.ps1            # dry run (-WhatIf style, default)
#   powershell -NoProfile -ExecutionPolicy Bypass -File prune-dsh-sessions.ps1 -Execute   # actually delete
#   powershell -NoProfile -ExecutionPolicy Bypass -File prune-dsh-sessions.ps1 -Days 90 -Execute
param(
  [int]$Days = 90,
  [switch]$Execute
)

$ErrorActionPreference = 'Continue'
$root = Join-Path $env:USERPROFILE '.dsh-assistant\sessions'
if (-not (Test-Path $root)) {
  Write-Output "[prune] sessions root not found: $root (nothing to do)"
  exit 0
}

$cutoff = (Get-Date).AddDays(-$Days)
$dirs = Get-ChildItem -Path $root -Recurse -Directory -Filter 'session-*' |
  Where-Object { $_.LastWriteTime -lt $cutoff }

if ($dirs.Count -eq 0) {
  Write-Output "[prune] no session dirs older than $Days days under $root"
  exit 0
}

$bytes = 0
foreach ($d in $dirs) { $bytes += (Get-ChildItem $d.FullName -Recurse -File | Measure-Object -Sum Length).Sum }
$mb = [math]::Round($bytes / 1MB, 1)

if (-not $Execute) {
  Write-Output "[prune] DRY RUN: would delete $($dirs.Count) session dir(s), freeing ${mb} MB"
  $dirs | Select-Object -First 10 | ForEach-Object { Write-Output "  dry: $($_.FullName)" }
  Write-Output "[prune] re-run with -Execute to delete"
  exit 0
}

$deleted = 0
foreach ($d in $dirs) {
  try {
    Remove-Item -LiteralPath $d.FullName -Recurse -Force
    $deleted++
  } catch {
    Write-Output "[prune] FAILED: $($d.FullName) : $($_.Exception.Message)"
  }
}
Write-Output "[prune] deleted $deleted/$($dirs.Count) session dir(s), freed about ${mb} MB"
