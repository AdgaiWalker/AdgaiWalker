# 站内助手 runtime 安装（一次性；对应 docs/TODO-SITE-ASSISTANT.md T3.2/T3.3）
# 前置：Node 22+ 与 npm 已装；盒子以 C:\Walker\bin 为运行工具目录。
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File C:\Walker\app\ops\windows\install-dsh.ps1
$ErrorActionPreference = "Stop"

$binDir = "C:\Walker\bin"
$dshBin = Join-Path $binDir "node_modules\@deepseek-ai\dsh\lib\bin.js"

New-Item -ItemType Directory -Force -Path $binDir | Out-Null
Set-Location $binDir
if (-not (Test-Path $dshBin)) {
  npm i --no-audit --no-fund "@deepseek-ai/dsh@0.1.2-alpha.3"
  if ($LASTEXITCODE -ne 0) { throw "npm install @deepseek-ai/dsh failed" }
}

# 助手专用 DSH_HOME：deepseek 默认模型 + 只读权限（与任何开发者配置隔离）
$dshHome = Join-Path $env:USERPROFILE ".dsh-assistant"
New-Item -ItemType Directory -Force -Path $dshHome | Out-Null
@'
agent-default-model:
  provider: deepseek-official
  model: deepseek-v4-flash
permission:
  defaultPreset: read-only
'@ | Set-Content -Encoding utf8 (Join-Path $dshHome "settings.yaml")

if (-not (Test-Path (Join-Path $dshHome ".credentials.yaml"))) {
  Write-Warning "请人工放置 $dshHome\.credentials.yaml（DeepSeek key，不经 git 与本脚本）"
}

# 预热 sdk profile（0.1.2 支持首用自动初始化；--help 不起会话）
$env:DSH_HOME = $dshHome
$env:DSH_PERMISSION_MODE = "read-only"
node $dshBin --profile sdk --help | Out-Null
if ($LASTEXITCODE -ne 0) { throw "dsh sdk profile 预热失败" }

Write-Host "dsh runtime 就绪。"
Write-Host "DSH_RUNTIME_BIN=$dshBin"
Write-Host "ASSISTANT_DSH_HOME=$dshHome"
Write-Host "把以上两行加入 apps\api\.env，并设 AI_ENABLED=true 后重启 API。"
