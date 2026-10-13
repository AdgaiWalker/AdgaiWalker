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
# 新空库才执行 db:migrate；当前生产旧库先按下方「生产库迁移路径」备份并重建搬迁
pnpm db:migrate
pnpm build:api
pnpm build:admin
```

> **跑 `db:generate` / `build:api` 前必须先停 API**（2026-09-14 实测）：运行中的 node 进程锁着 Prisma 引擎 DLL，generate 会以 `EPERM: rename ... query_engine-windows.dll.node` 失败；`schtasks /End` 之后还要确认 8788 真的释放（僵尸旧进程占着就 `taskkill /PID <pid> /F`），否则新实例起不来、表象仍是旧 dist 在服务。

`apps\api\.env` 不进 Git，首期至少包含：

```dotenv
WALKER_DB_PROVIDER=sqlite
DATABASE_URL=file:C:/Walker/data/walker.db
HOST=127.0.0.1
PORT=8788
NODE_ENV=production
AI_ENABLED=false
WALKER_PUBLIC_ORIGINS=www.iwalk.pro
WALKER_CONTENT_LOCK_PATH=C:/Walker/data/content-publish.lock
```

API 与手工 `pnpm content:publish --push` 共用此持久锁。手工脚本只读取 `apps/api/.env` 中的锁路径；API 派发的脚本接续同一次锁，不自行释放。进程树退出未证实时锁保持占用。过期死锁恢复使用同目录 `.recovery` 互斥文件；若恢复进程崩溃留下它，先核对所有发布进程确已退出及远端发布事实，再人工清理锁和恢复文件，不能仅凭超时删除。

`WALKER_PUBLIC_ORIGINS` 是精确 host 白名单（逗号分隔、不带 scheme），用于 API 前有可信反向代理时核验浏览器写请求的 Origin。所有 POST/PUT/PATCH/DELETE 都经过 `SameOriginMiddleware`；Origin/Referer 缺失只放行服务器脚本调用，浏览器管理页需同源。Nest 未启用宽泛 CORS。

V23 公共位置启用前还要求 R21 runtime 隔离探针完整通过；站主须把本机产生的脱敏报告放到 API 可读的受限路径并配置 `WALKER_RUNTIME_PROBE_REPORT`，不得转存模型凭据。缺少报告、无有效回答或未确认子进程退出时，Admin 会列出 blocker，服务端拒绝启用；不得用手工 `canEnable` 字段绕过。

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

## 部署包与执行顺序（G06）

**版本固定（唯一真相源，禁止在文档/脚本里各写一份）：**

| 项 | 值 | 真相源 |
|---|---|---|
| 代码版本 | `git rev-parse --short HEAD` → 写入 `WALKER_BUILD_VERSION` | Git 工作树 |
| SDK / runtime | `0.1.5-rc.3`（dsh 家族 23 个包同版本） | `apps/api/package.json` |
| Node | 22+ | 盒子 `C:\Walker\bin` |
| 目标迁移 | 26 个，最新 `20260929130000_admin_request_log`；生产尚未应用 | `apps/api/prisma/migrations` |
| 构建产物 | `build:shared` → `build:api`（+`build:admin`） | 本仓库脚本 |

`install-dsh.ps1` **不硬编码** SDK 版本，而是从 `apps/api/package.json` 派生——adapter 要求 SDK 与 dsh 同版本，写死在两处必然漂移（实测曾钉 `0.1.2-alpha.3` 而代码已到 `0.1.5-rc.3`，会导致运行时起不来）。

**生产库迁移路径（2026-09-27 实测确定）：**

生产库既无 `_prisma_migrations` 迁移历史、**也不等于基线快照**（缺 `SkillRun`；`AgentRun` 少 `providerId`/`promptSnapshot`/`temperature`），因此：

- `pnpm db:baseline` **会被拒绝**（`schema 与迁移历史不一致`）——不要在生产上试；
- `prisma db push` **不可用**（需要 `--accept-data-loss`，仓库策略禁止）；
- **正确路径**：停服 → 备份 → 用重建脚本新建干净库并搬迁真实数据 → 指向新库 → 构建 → 重启。

```powershell
# 1) 备份（会停 443/8788，见 backup-walker.ps1）
powershell -NoProfile -File C:\Walker\app\ops\windows\backup-walker.ps1 -Destination D:\walker-backups

# 2) 新建干净库并搬迁真实数据（绝不覆盖已存在文件；旧库保留为回退副本）
pnpm rebuild:legacy-db --from C:/Walker/data/walker.db --to C:/Walker/data/walker-v2.db --confirm

# 3) 改 apps\api\.env 的 DATABASE_URL 指向新库，然后构建重启
```

脚本先按目标库外键依赖排序（父表先于子表），再逐表按列交集搬迁并核对行数；最后用 `prisma migrate diff` 证明新库与迁移目标零差异。目标 schema 已删除的表会如实列出待确认，切换数据库前还应执行 SQLite `integrity_check` 与 `foreign_key_check`。

**发版前机器门禁：**

```bash
pnpm verify:deploy          # K0：核对版本/迁移/能力默认值/白名单/回退说明
pnpm verify:deploy --drill  # 追加 K6：隔离库上跑迁移 → 备份 → 回退往返
```

门禁失败即拒绝发版——不靠人肉检查表。

**停服与释放引擎顺序（不可调换，2026-09-14 实测）：**

```powershell
schtasks /End /TN WalkerApi
netstat -ano | findstr :8788      # 必须确认真释放；僵尸进程 taskkill /PID <pid> /F
pnpm db:generate                  # 运行中会 EPERM：node 锁着 query_engine-windows.dll.node
pnpm build:api                    # admin 有变更再加 build:admin
# 写 WALKER_BUILD_VERSION=<git short SHA> 到 apps\api\.env
schtasks /Run /TN WalkerApi
```

**能力关闭默认值（首期一律从关闭状态上线）：**

| 能力 | 默认 | 开启方式 |
|---|---|---|
| AI（模型问答/试跑） | `AI_ENABLED=false` → 规则兜底 | 显式改 `.env` 并重启 |
| 公共位置（访客问答） | 每个位置独立关闭 | Admin 就绪门全绿后逐位置启用 |
| 内容发布 | 保存只到 `PREPARED` | 走发布链 + 线上核验 |
| 小店交易 / 外部实时追踪 / 自动多 Agent 接力 / 持续全权委托 | **首期未接入** | 见 §9 暂缓清单，不得显示为可用 |

**执行顺序（含 manifest 基线）：**

1. 停服 → 备份（见下）→ 释放引擎 → 构建 → 写版本 → 起服；
2. 跑 `pnpm verify:deploy --drill` 与部署验证清单四步；
3. **先建立 manifest 基线**：`pnpm snapshot:import`（V03）导入可信 `public-manifest.json`，确认集合 hash 与条目数；
4. **再**逐位置启用新公共问答（V23 就绪门 + G03 内存余量门全绿）；
5. 最后才开 `AI_ENABLED`。

顺序理由：问答索引只认已核验快照；基线没落地就启用公共位置，等于让访客问答跑在未核验内容上。

**备份与删除清单（`C:\Walker\data` 为持久目录，任何更新都不得覆盖）：**

- **必须备份**：`data\walker.db`（业务真相）、`data\admin-basic-auth.txt`（管理凭据）、`data\public-snapshots\`（已核验公开快照）、`data\runs\`（运行诊断，可弃但建议留）；
- **可以删除**：`logs\`（按需轮转）、`.dsh-assistant` 会话缓存（有 `prune-dsh-sessions.ps1`，权威记录在 SQLite）；
- **绝不删除**：`data\walker.db`、`data\admin-basic-auth.txt`、任何迁移已应用的库；
- 备份用 `backup-walker.ps1`（SQLite 原生 `VACUUM INTO` 快照，不是文件拷贝——文件拷贝会拿到撕裂页）。

**回退说明（不靠旧无授权写路径）：**

回退**优先关闭能力，而不是回滚代码去恢复旧行为**：

1. 先关新位置与新调用（Admin 逐位置禁用），再关 `AI_ENABLED`；
2. 保留人工运营与已验证公开快照，访客侧仍有规则回答；
3. **禁止**通过回退到旧的无版本/无权限写路径恢复服务——那会绕开 CAS、审批与审计，等于把已封闭的写入旁路重新打开；
4. 前端回退**不删除**新增数据；数据库回退须与当前代码兼容并保留新增记录（迁移是扩展式的，可向前兼容读取）；
5. 恢复用 `restore-walker.ps1`：先清理删除清单再开放，未完成恢复前服务保持 503（`restore-reconciliation-pending`），不开放不可信状态。

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
| 过程数据 | `C:\Walker\data\walker.db`（SQLite） | 线索/题苗/执行/会话/作品/发布/Agent修订 |
| 删除事实 | `C:\Walker\control\deletion-manifest.json` | 只含 tombstone ID、Conversation ID 和请求时间；V18 删除完成前先持久化，数据库恢复用它防复活 |
| 运行配置 | `apps\api\.env`（token、DSH 路径、预算等） | 与 Git 之外 |
| 原稿与阶段产物 | `C:\Walker\app\var\works\`（或 WORK_ROOT_DIR 指向处） | 人工初稿原文、阶段 Artifact、发布准备包 |
| 未发布内容 | `content\log\` 下未 commit 的修改 | 部署前先 `pnpm check:content-dirty` 保护 |
| 助手 runtime | `%USERPROFILE%\.dsh-assistant`（含 .credentials.yaml） | DeepSeek key 人工放置 |
| dsh 会话缓存 | `%USERPROFILE%\.dsh-assistant\sessions\**\*.jsonl.zstd` | **运行时缓存，不属恢复对象**；prune 脚本按 90 天清理（见「周期运维」） |
| 管理凭据 | `C:\Walker\data\admin-basic-auth.txt` | 明文仅存 data 目录 |
| 恢复门标记 | `C:\Walker\control\restore.pending` | 文件存在时 API 在完成删除/到期清理前不监听；失败保持标记且 Caddy 不启动 |

**备份方式：** 用 `backup-walker.ps1` 创建 SQLite `VACUUM INTO` 一致快照、删除清单副本及哈希/过期元数据。脚本会短暂停止 WalkerApi 和 Gateway，完成后先核 API 健康再恢复 Gateway。备份输出目录必须在 `C:\Walker` 之外，推荐独立设备或受控对象存储。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\Walker\app\ops\windows\backup-walker.ps1 -Destination D:\WalkerBackups
```

全量 SQLite 备份的恢复期限为 **30 天**；`.db.manifest.json` 记录生成/到期时间和数据库/清单 SHA-256，恢复脚本会拒绝过期或哈希不符的文件。对象存储生命周期应设为同样的 30 天。删除清单不设到期时间，清单内无正文，仅保存墓碑 ID/会话 opaque ID/请求时间；有独立可用存储时，可在 `.env` 设置 `WALKER_DELETION_MANIFEST_REPLICA_PATH`。配置的副本不可写时，删除任务阻塞在清理前，修复存储后重试。

**恢复方式：** 必须提供备份配套元数据和**最新**删除清单。备份随附清单只证明该快照当时记录了什么；删除发生在快照后时，应从盒外取得更新后的 `deletion-manifest.json`。脚本先立恢复门、停 API/Gateway、迁移并校验临时数据库，再替换正式库；API 启动时重放清单并完成墓碑/到期清理，成功后才移除门标记、开放本机 API，最后恢复 Gateway。任何错误都会保持门标记、停止两个任务，不跳过清理。当前没有自动对象存储同步：全机故障恢复必须从盒外取得不早于最近成功删除的清单；仅持有旧备份配套清单时不得开放 API。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\Walker\app\ops\windows\restore-walker.ps1 `
  -BackupDatabasePath D:\WalkerBackups\walker-20260925-010000.db `
  -LatestDeletionManifestPath D:\WalkerRecovery\deletion-manifest.json
```

自定义 `WALKER_RESTORE_GATE_FILE` 时，运行 restore 脚本也须传入相同的 `-RestoreGatePath`。临时回滚快照存放在 `C:\Walker\control\restore-rollback`，也带 30 天到期元数据；用它恢复时仍必须提供最新删除清单。

**恢复演练记录（如实填写；没演练过就不算具备恢复能力）：**

| 日期 | 恢复到 | 结果 | 备注 |
|---|---|---|---|
| 2026-09-25 | 临时 SQLite 数据库 | **本地 K6 已验证** | `VACUUM INTO` 生成含正文旧快照，再应用快照之后的删除清单；真实 Prisma SQLite 清理后无消息/Conversation，墓碑与无正文审计保留。未在 Windows、异机、Caddy 或生产执行整套 PowerShell 恢复。 |
| — | 生产/异机 | **尚未演练** | Windows 任务停止、磁盘切换、凭据恢复、Caddy/外网和操作人员清单交接仍需 G07/G08 现场验证。 |

## 尚未切流（历史）

2026-09-03 已完成切流（详见 `docs/STATUS.md`）。以下为切流前的门槛原文，留作核对口径：只有在 API 域名、HTTPS、公共路由白名单、SQLite 备份和 intake 冒烟全部通过后，才修改 `vercel.json` 增加 `/api/:path*` 反代。
