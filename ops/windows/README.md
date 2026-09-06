# Windows 单机运行基线

## 结论

这台 2 核 2GB Windows Server 先采用**单进程、单库、双表面**：公开 LM Wiki 继续由 Vercel 托管；腾讯云只运行一个 Nest 进程和一个 Caddy 进程；私有 Admin 只经 SSH 隧道访问。

```text
访客 → www.iwalk.pro (Vercel 静态 Wiki)
                └─ /api/* → Caddy 公共路由白名单 → Nest :8788 → SQLite

站主 → SSH 隧道 → Caddy 127.0.0.1:8790 → Admin 静态文件
                                      └─ /api/* → Nest :8788 → 同一 SQLite
```

业务真相仍只有一套：`Clue → Seed → Execution → Evidence`。公开入口负责产生线索，私有工作台负责推进、交付与检验。后续 Agent 运行时接入同一过程，不另建第二套任务系统。

## 为什么不是 Docker / 本机 PostgreSQL / 微服务

Windows 与宝塔当前已占用大部分 2GB 内存。第一阶段禁止在本机增加 Docker、Redis、本机 PostgreSQL或多份 Nest 进程。SQLite 对当前单实例、低并发、小生产足够；达到迁移条件后，再把数据库适配器切到托管 PostgreSQL，Nest 契约不变。

迁移到 PostgreSQL 的触发条件满足任一即可：

- 需要两个以上 API/Worker 进程并发写；
- SQLite 写锁开始形成可观测等待；
- 需要数据库级高可用或时间点恢复；
- 过程数据量或备份恢复时间超出单机可控范围。

## 网络边界

- Nest 默认只监听 `127.0.0.1:8788`，不能从公网直连。
- Caddy 公网面只转发 `health`、`intake`、点赞、内容反馈、搜索缺口和只读 support。
- `/clues`、`/seeds`、`/executions`、`/metrics`、`/admin/content` 以及写 support 不进入公网路由。
- Admin 静态站只监听 `127.0.0.1:8790`。
- **第二道防线（凭据）**：
  - Nest 对白名单之外的所有路由要求管理凭据（`apps/api/src/auth/admin-token.middleware.ts`），凭据来自 `apps/api/.env` 的 `WALKER_ADMIN_TOKEN`；白名单在 `app.module.ts` 中逐条对齐 Caddyfile，两侧需同步修改。生产环境未配置该 token 时 API 拒绝启动。
  - Caddy Admin 面启用 basic auth（块形式，user/hash 经环境变量 `WALKER_ADMIN_USER` / `WALKER_ADMIN_HASH` 注入），由 `run-caddy.ps1` 从 `C:\Walker\data\admin-basic-auth.txt`（格式 `user:password`，明文仅存服务器 data 目录，不进 Git）实时派生 bcrypt 哈希。**密码必须与 `WALKER_ADMIN_TOKEN` 一致**。浏览器首次访问会弹一次密码框，Basic 头随后被 Caddy 转发给 Nest，由 Nest 校验密码部分等于 token。

脚本/curl 调用管理接口时带 `x-admin-token` 头即可：

```bash
curl -H "x-admin-token: <WALKER_ADMIN_TOKEN>" http://127.0.0.1:8790/api/clues
```

私有工作台连接（主路径走 Tailscale 虚拟内网，与 VPN / 出口 IP 无关）：

```bash
ssh -N -L 5174:127.0.0.1:8790 walker-tencent
```

然后访问 `http://127.0.0.1:5174`（首次会要求输入 `admin-basic-auth.txt` 中的凭据）。

- `walker-tencent`（`100.115.242.59`）走 Tailscale；服务器端已加 `--unattended`，无用户会话也常驻。两端设备须登录同一 Tailscale 账号。
- `walker-tencent-public`（`43.163.4.104`）为公网备用路径，仅当腾讯云防火墙 22 端口白名单含当前出口 IP 时可用。

## 构建与运行

运行时目录固定分层：`C:\Walker\app` 是 Git 工作树，`C:\Walker\data` 是持久数据，`C:\Walker\bin` 是运行工具。更新或替换 app 时不得覆盖 data。服务器上安装 Node、pnpm、Git、Caddy 后：

```powershell
Set-Location C:\Walker\app
pnpm install --frozen-lockfile
pnpm build:shared
pnpm db:generate
pnpm db:push
pnpm build:api
pnpm build:admin
```

`apps\api\.env` 不进 Git，首期至少包含：

```dotenv
WALKER_DB_PROVIDER=sqlite
DATABASE_URL=file:C:/Walker/data/walker.db
HOST=127.0.0.1
PORT=8788
NODE_ENV=production
AI_ENABLED=false
```

### 站内助手 runtime（AI 开启前执行一次）

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\Walker\app\ops\windows\install-dsh.ps1
```

脚本安装 `@deepseek-ai/dsh@0.1.2-alpha.3` 到 `C:\Walker\bin`、初始化助手专用 `%USERPROFILE%\.dsh-assistant`（deepseek + read-only）并预热 sdk profile。之后在 `apps\api\.env` 追加：

```dotenv
AI_ENABLED=true
WALKER_DSH_RUNTIME_BIN=C:/Walker/bin/node_modules/@deepseek-ai/dsh/lib/bin.js
ASSISTANT_DSH_HOME=C:/Users/<用户名>/.dsh-assistant
ASSISTANT_DAILY_LIMIT=200
```

凭据 `%USERPROFILE%\.dsh-assistant\.credentials.yaml` 人工放置（DeepSeek key，不经 git）。Nest 会以只读沙箱子进程形态拉起 runtime；内存预算实测约 224MB 常驻。

### 卡口 nextStep / 工作站配方 runtime（DshAgentRunner）

2026-09-06 起卡口 nextStep 与工作站配方统一走 `DshAgentRunner`（与站内助手/洞察周报同一 dsh 运行时家族，per-run 实例、跑完即关）。安全边界不变：经 node + args 直启（无 shell），调用方文本走 JSON-RPC stdin，永不进命令行。内存注记：2C2G 并发 dsh 实例 ≤2（工作站配方互斥已保 1 + 助手常驻 1）。

历史注记：此前卡口/配方绑定 CodexAgentRunner（`codex exec`），但生产从未安装 codex、一直规则兜底；该实现与 `CODEX_CLI_PATH` 配置项已于 2026-09-06 随 dsh 统一决策移除。

前台运行验证：

```powershell
powershell -NoProfile -File C:\Walker\app\ops\windows\run-api.ps1
powershell -NoProfile -File C:\Walker\app\ops\windows\run-caddy.ps1 -PublicApiHost api.example.com
```

在配置开机任务前，必须先验证：

```powershell
curl.exe http://127.0.0.1:8788/health
curl.exe http://127.0.0.1:8790/api/health
```

验证通过后，以管理员 PowerShell 注册并立即启动开机任务：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\Walker\app\ops\windows\install-tasks.ps1
```

默认公共入口仍只绑定本机测试地址 `http://127.0.0.1:8080`。准备好 API 域名与 HTTPS 后，重新执行并显式传入正式域名：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\Walker\app\ops\windows\install-tasks.ps1 -PublicApiHost api.example.com
```

## 部署验证清单（每次部署后逐项核对）

重启 WalkerApi / WalkerGateway 之后，health 200 不等于新版在服务。按序执行：

```powershell
# 1) 版本标识：部署时在 apps\api\.env 写 WALKER_BUILD_VERSION=<git short SHA>，
#    health 必须回出同一个值，才算「跑的确实是这次构建」
curl.exe -sS https://api.iwalk.pro/health
#    期望 {"ok":true,"db":true,"aiEnabled":true,"version":"<本次 SHA>"}

# 2) 8788 归属（schtasks /End 可能杀不掉僵尸旧进程，见 AGENTS.md 坑清单）
netstat -ano | findstr :8788

# 3) 443 归属（网关）
netstat -ano | findstr ":443"

# 4) 路由隔离：公开路由 404/401 边界（匿名管理面必须 404）
curl.exe -sS -o NUL -w "%{http_code}" https://www.iwalk.pro/api/clues
#    期望 401 或 404；/api/health 期望 200
```

web 与 API 是两条独立发布链：Vercel（push main 自动发）与盒子（git pull + build + schtasks）。两条都要核，缺一不可声称「新版已上线」。

## 周期运维

**dsh 会话缓存清理（每月一次，默认 90 天保留）**——会话目录是运行时缓存，权威问答记录在 SQLite 的 AssistantRun 表，删除后下一问自动重建会话：

```powershell
# 干跑（默认，只统计不删）
powershell -NoProfile -ExecutionPolicy Bypass -File C:\Walker\app\ops\windows\prune-dsh-sessions.ps1
# 确认后执行删除
powershell -NoProfile -ExecutionPolicy Bypass -File C:\Walker\app\ops\windows\prune-dsh-sessions.ps1 -Execute
```

可选注册为每月计划任务（管理员 PowerShell）：

```powershell
schtasks /Create /TN WalkerDshPrune /SC MONTHLY /TR "powershell -NoProfile -ExecutionPolicy Bypass -File C:\Walker\app\ops\windows\prune-dsh-sessions.ps1 -Execute" /ST 04:00
```

会话遥测已在代码层默认关闭（`DSH_TELEMETRY_DISABLED=1`，访客问答不经 OTLP 出网）；探针期重开需设 `DSH_TELEMETRY_ENABLED_OVERRIDE` 并重启 WalkerApi。

## 备份与恢复（对象清单 + 演练记录）

**恢复对象（缺一即不可完整重建）：**

| 对象 | 位置 | 说明 |
|---|---|---|
| 过程数据 | `C:\Walker\data\walker.db`（SQLite） | 线索/题苗/执行/会话/作品/发布/凭据密文 |
| 加密主密钥 | 服务器 `apps\api\.env` 的 `WALKER_CREDENTIAL_MASTER_KEY` | **只在 .env，丢失则凭据密文永久不可解** |
| 运行配置 | `apps\api\.env`（token、DSH 路径、预算等） | 与 Git 之外 |
| 原稿与阶段产物 | `C:\Walker\app\var\works\`（或 WORK_ROOT_DIR 指向处） | 人工初稿原文、阶段 Artifact、发布准备包 |
| 未发布内容 | `content\log\` 下未 commit 的修改 | 部署前先 `pnpm check:content-dirty` 保护 |
| 助手 runtime | `%USERPROFILE%\.dsh-assistant`（含 .credentials.yaml） | DeepSeek key 人工放置 |
| dsh 会话缓存 | `%USERPROFILE%\.dsh-assistant\sessions\**\*.jsonl.zstd` | **运行时缓存，不属恢复对象**；prune 脚本按 90 天清理（见「周期运维」） |
| 管理凭据 | `C:\Walker\data\admin-basic-auth.txt` | 明文仅存 data 目录 |

**备份方式（最低基线）：** 定期把 `C:\Walker\data` 整目录 + `.env` + `var\works` + `.dsh-assistant\.credentials.yaml` 复制到盒子外（对象存储 / 本机另一块盘）；SQLite 备份用 `sqlite3 walker.db ".backup 'walker-backup.db'"`（在线一致快照）。

**恢复演练记录（如实填写；没演练过就不算具备恢复能力）：**

| 日期 | 恢复到 | 结果 | 备注 |
|---|---|---|---|
| — | — | **尚未演练** | 首次演练后在此登记（异机重放 .env + data + var\works → 起服务 → health/登录/助手各核一项） |

## 尚未切流（历史）

2026-09-03 已完成切流（详见 `docs/STATUS.md`）。以下为切流前的门槛原文，留作核对口径：只有在 API 域名、HTTPS、公共路由白名单、SQLite 备份和 intake 冒烟全部通过后，才修改 `vercel.json` 增加 `/api/:path*` 反代。
