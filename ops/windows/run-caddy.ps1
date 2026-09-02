param(
  [Parameter(Mandatory = $true)]
  [string]$PublicApiHost,
  [string]$Root = "C:\Walker\app",
  [string]$Caddy = "C:\Walker\bin\caddy.exe",
  [string]$AdminAuthFile = "C:\Walker\data\admin-basic-auth.txt"
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

# 管理 basic auth（第二道防线）。凭据文件格式 user:password（明文，仅存服务器 data 目录，不进 Git）。
if (-not (Test-Path $AdminAuthFile)) {
  throw "Missing admin basic-auth file: $AdminAuthFile (format: user:password)"
}
$pair = (Get-Content $AdminAuthFile -Raw).Trim()
$sep = $pair.IndexOf(':')
if ($sep -lt 1) {
  throw "Invalid admin basic-auth file format: expected user:password"
}
$user = $pair.Substring(0, $sep)
$password = $pair.Substring($sep + 1)
$hash = (& $Caddy hash-password --plaintext $password).Trim()
if ($hash -notmatch '^\$2') {
  throw "caddy hash-password returned unexpected output"
}
# 两个独立变量：Caddyfile 的 {$VAR} 展开不跨 token，"user hash" 合成一个变量会被误读。
$env:WALKER_ADMIN_USER = $user
$env:WALKER_ADMIN_HASH = $hash

$env:WALKER_PUBLIC_API_HOST = $PublicApiHost
$env:WALKER_ADMIN_DIST = $adminDist
Set-Location $Root
& $Caddy run --config $config --adapter caddyfile
exit $LASTEXITCODE
