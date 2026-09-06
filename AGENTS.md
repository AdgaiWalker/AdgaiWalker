# AGENTS.md

本文件是本仓库内 Agent 的项目级常驻指令。开始工作前，先阅读本文件，并同时遵守根目录 `CLAUDE.md` 中的工程约定。

## 文档阅读顺序

1. 根 `PLAN.md`（主执行计划：北极星 · 宪法 · 主线排期 · 冻结条款）→ 2. 根 `CLAUDE.md`（栈 / 命令 / 部署须知）→ 3. `docs/README.md`（文档地图与权威级）→ 4. 按改动区域读 `docs/PRODUCT.md`（产品红线）、`docs/api/README.md`（API 契约）、`docs/STATUS.md`（生产状态）。
改站内助手必须先读 `docs/PRD-SITE-ASSISTANT.md` + `docs/TODO-SITE-ASSISTANT.md`。`docs/archive/` 是退役方案，禁止当现行契约。

## 仓库结构与验证门禁

- monorepo：`apps/web`（访客静态站）/ `apps/admin`（站主工作台）/ `apps/api`（Nest）/ `packages/shared`（纯函数与契约，双端共用）/ `scripts/`（构建与预渲染）/ `content/log`（内容唯一真相源）/ `ops/windows`（盒子部署物料）。
- `apps/api` 是六边形分层：`ports/`（Symbol 接口）→ `adapters/`（实现）→ 用例 service → `kernel.module.ts` 统一接线。新增能力先定 port 再写 adapter。
- `apps/web` 运行时只读 `apps/web/src/generated/content.json`，禁止在 web 里做 fs / 直连内容目录。
- 改动后验证链：`pnpm typecheck` → `pnpm test:shared && pnpm test:api && pnpm test:web` → 改了 web 再 `pnpm build:web && pnpm verify:geo`（GEO 是构建门禁）→ 改了内容先 `pnpm check:content-fields`。
- 测试库隔离：`apps/api` 的 vitest 把 `DATABASE_URL` 强制改写到独立 `walker.test.db`（globalSetup 每次删库重建 schema；显式设 `API_TEST_DB_URL` 可指定 PG），测试绝不写开发库。真实 kernel 接线的集成测用 `Test.createTestingModule` + `KernelModule`（假 runner/临时目录用 `overrideProvider`/env 覆盖，见 `promote.kernel.integration.test.ts`、`workstation.chain.integration.test.ts`）。
- 改生产拓扑 / 部署流程 / 产品行为后，**必须回写文档**（AGENTS.md / PRD / TODO / STATUS / api/README 对应处），保持文档与生产一致。

## 生产拓扑（2026-09-03 切流后）

- 访客：`www.iwalk.pro`（Vercel 静态，push main 自动发）→ `/api/*` 反代 → `api.iwalk.pro`（盒子上 Caddy + Let's Encrypt）→ Nest `127.0.0.1:8788` → SQLite / DeepSeek Harness。
- **公网白名单双侧同步**：放行新公开路由必须同时改 `apps/api/src/app.module.ts`（exclude 表）和 `ops/windows/Caddyfile`，漏一侧即 401/404。管理路由另有 `WALKER_ADMIN_TOKEN` + Caddy basic auth 双防线。
- **管理凭据体系**：Basic 密码必须等于 `WALKER_ADMIN_TOKEN`（Nest 中间件校验）。改密码 = 同步改服务器 `apps/api/.env` 的 `WALKER_ADMIN_TOKEN` + `C:\Walker\data\admin-basic-auth.txt`（格式 `user:password`，明文仅存 data 目录）→ 重启 WalkerApi 和 WalkerGateway。脚本调管理接口带 `x-admin-token` 头。凭据管理后台（`/credentials` 页）用 AES-256-GCM 落库，主密钥 `WALKER_CREDENTIAL_MASTER_KEY` 只存服务器 `.env`，**密钥数据永不进 Git**。
- 盒子（腾讯云轻量，Windows Server 2C2G，新加坡）运行目录 `C:\Walker`：`app`（Git 工作树）/ `data`（持久数据，**不得覆盖**）/ `bin`（node/pnpm/git/caddy/dsh）/ `logs`。

## 盒子部署与运维坑（实测教训）

- 部署流：SSH 进盒子（**优先 `ssh walker-tencent`，走 Tailscale 主路径**，与出口 IP/防火墙无关；`walker-tencent-public` 仅应急）→ `cd C:\Walker\app && pnpm check:content-dirty && git pull origin main` → lockfile 变了再 `pnpm install --frozen-lockfile` → `pnpm build:shared` → `pnpm build:api`（admin 改了再 build:admin）→ 更新 `apps\api\.env` 的 `WALKER_BUILD_VERSION=<git rev-parse --short HEAD>` → `schtasks /End + /Run /TN WalkerApi`（网关是 `WalkerGateway`）→ 按 `ops/windows/README.md`「部署验证清单」四步核对（health 回显 version/8788 归属/443/路由隔离）。
- **SSH 会熔断**：短连接多次后出现 `Connection closed by ... port 22`（两个成因：开 VPN 后出口 IP 不在防火墙白名单 → 走 Tailscale 主路径即解；构建打满 2G 内存把 sshd 僵死 → 控制台重启实例）。带外替代：腾讯云控制台 → 实例 → 「执行命令」（TAT，不走 22 端口），可远程 git pull + 构建 + 重启，实测 23 秒跑完全套。
- 2C2G 内存紧张：**构建（tsc/vite）可能把 sshd 打僵死**（TCP 可连但无 banner）→ 控制台重启实例可解；避免在 API 服务运行时跑重构建。
- PowerShell 脚本含中文必须带 **UTF-8 BOM**，否则 Windows PowerShell 按 ANSI 解析报错。给服务器写的 `.ps1` 一律 **纯 ASCII 注释**最稳。
- PowerShell 5 下 `$ErrorActionPreference='Stop'` 会把原生命令（pnpm/node）的 stderr 输出当终止错误杀掉脚本：要么 `'Continue'` + 检查 `$LASTEXITCODE`，要么把输出 `| Out-Null`。
- Caddy `basic_auth` 只支持**块形式**（行内参数会把第一个参数误读为哈希算法名）；Caddyfile 的 `{$VAR}` 占位符展开不跨 token，"user hash" 必须拆成两个环境变量。
- **Windows 保留文件名**（`nul`、`con` 等）在 Mac 上能提交、服务器上无法检出（`error: invalid path`）——提交前别把这类文件加进 Git。
- OpenSSH（Windows）会话断开会杀死该会话的整棵子进程树：需要存活的远程进程用 `Start-Process` 脱离或 schtasks 注册后 `Start-ScheduledTask`。
- **拉代码前必须先跑 `pnpm check:content-dirty`**：Admin 保存的文章直接写 `content/log`（Git 管内），`git reset --hard origin/main` 会连带丢掉未提交/未推送的内容修改。脚本发现内容脏即 exit 1——先 `pnpm content:publish --push` 发布或备份到 data 目录；仅代码树脏（content/ 干净）时才允许 `git reset --hard origin/main`。内容提交只走 `pnpm content:publish`（pathspec 限定 + 无关暂存检测，不会夹带代码）。
- **重启 API 后必须核 8788 归属**：`schtasks /End` 可能杀不掉占端口的僵尸旧进程（任务实例引用丢失），新实例起失败时 8788 仍是旧 dist 在跑（症状：新功能 404 或行为像旧版，如秒回规则兜底）。核法：`netstat -ano | findstr :8788` 对比 PID，变了才算换血；没变就 `taskkill /PID <旧PID> /F` 再 `/Run`。
- **重启网关后必须核 443**：`netstat -ano | findstr ":443"`。WalkerGateway 任务参数可能被重置回 8080 测试模式（install-tasks.ps1 重注册漏 `-PublicApiHost api.iwalk.pro` 即复现）→ 用正式域名重跑注册脚本；老 caddy 占端口时 `schtasks /End` 杀不掉（实例引用丢失）→ 直接 `taskkill /PID <pid> /F` 再 `/Run`；起进程必须走计划任务（`/Run`），SSH 里 `Start-Process` 起的会随会话被杀（先 `/End` 清僵尸实例再 `/Run`）。网关重启后首个 AI 请求可能因 harness 冷启动超 15s 走规则兜底——自愈行为，非故障。
- DeepSeek Harness（dsh）安全机制：**拒绝从 .env 文件继承 `DSH_*` 启动变量**——生产用 `WALKER_DSH_RUNTIME_BIN` / `ASSISTANT_DSH_HOME`（见 `ops/windows/README.md`），且子进程 cwd 必须是不含 .env 的中立目录。
- SSH 不通时**先确认走的是 Tailscale 主路径**（`ssh walker-tencent` 即是，2026-09-03 实测直连 155ms 稳定）；只有公网备用路径 `walker-tencent-public` 才需要按防火墙白名单更新来源 IP（家宽 IP 会轮换）。

## 站内助手 / AI / 工作站红线（改相关代码前必读）

- **AI 可关**：`AI_ENABLED≠true` 时一切 AI 功能走规则兜底，回答仍非空；任何降级（超时/坏输出/预算触顶）都路由到规则版，`aiUsedFlag` 如实标注。
- **aiUsePolicy fail-closed**：模型输出经 `parseAssistantOutput` / `parseAiNextStepOutput` 校验，引用 slug 必须 ⊆ citable 集合；citations/参数来自网关与索引，不信任模型原文。
- **公开输入永不进命令行**：子进程一律经 node + args 直启（无 shell），调用方数据（访客 prompt、配方 prompt）只走数据通道（dsh 为 JSON-RPC stdin），永不成为命令行参数（见 `ops/windows/README.md`）。
- **流式只出裁剪文本**：text-delta 经 shared `extractStreamedAnswer` 裁剪后才出网关，原始模型 JSON（含 citations）不外发；终值校验后由 `done` 事件整体覆盖；助手会话归属 fail-closed（未知/他人/规则会话一律开新会话）。
- **工作站诚实语义**：网站发布保存 = `PREPARED` ≠ 已发布（上线走 `pnpm content:publish --push`，`verifyWebsite` 过线上校验才 `PUBLISHED`）；取消 CANCELLED 是稳定终态，迟到结果不得覆盖（`setStatusUnless`）；同 work 运行互斥；审批绑定服务端审阅包 candidate.hash；发布 frontmatter 与构建门禁共用 shared `PUBLISHED_POST_REQUIRED_FIELDS`，缺字段写盘前即拒，不放宽门禁迁就生成物。
- **禁止 AI 自动主选**：问题池转题苗、线索 promote 永远人工点击；主选必带完整 brief（选题五问）。
- Nest DI：接口 token 注入必须显式 `@Inject(TOKEN)`，构造函数裸接口参数在 provider 化后会炸（已踩过）。
- 诚实原则：失败如实报错，不假装成功（全站产品气质，见 `docs/PRODUCT.md`）。

## 腾讯云服务器连接

服务器已接入 Tailscale（tailnet `AdgaiWalker@github`，服务器节点名 `walker-server`，虚拟 IP `100.115.242.59`；Mac 是 `happymacbook-pro`）。**主路径走虚拟内网，与 VPN / 出口 IP 无关**：

```bash
ssh walker-tencent            # 100.115.242.59（Tailscale，永远可用）
ssh walker-tencent-public     # 43.163.4.104（公网备用，仅当防火墙白名单含当前出口 IP）
```

非交互验证：

```bash
ssh -o BatchMode=yes -o ConnectTimeout=15 walker-tencent "whoami && hostname"
```

- 主路径不通时先查两端 Tailscale 是否在线：`/Applications/Tailscale.app/Contents/MacOS/Tailscale status`（Mac）/ `tailscale status`（服务器）。服务器端已加 `--unattended`，无用户会话也常驻。
- 公网备用路径被拒（`Connection closed ... port 22`）通常是 VPN 改变了出口 IP：`curl -fsS https://api.ipify.org` 查当前 IP → 腾讯云防火墙把 TCP 22 来源更新为 `<IP>/32`。**优先修 Tailscale 路径，别依赖这条**。
- 服务器端重启 Tailscale 入网用 Auth Key（管理后台 Settings → Keys 生成，单次使用）+ `--unattended`；不带 `--unattended` 会在无用户会话时自动掉线。
- 连接参数和私钥位置由本机 SSH 配置管理，不要在仓库中复制 IP、用户名、密钥内容或基础设施细节。
- 不得读取、输出、提交、上传或转发私钥内容。
- 连接失败时不要直接重装系统、重置密码或创建新密钥。
- 未经用户明确授权，不得重装系统、重置密码、删除服务器数据或替换 SSH 密钥。
