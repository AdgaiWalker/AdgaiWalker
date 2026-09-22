# AGENTS.md

> **2026-09-22 框架优先与数据库决定**：新后台先执行根 `to-do.md` 的 F01–F18，再按依赖细化能力；该文件是此次重构唯一原子进度源，旧 EXEC-PLAN/TODO 不继承完成状态。本地开发、测试与现有生产统一 SQLite 独立文件，不使用 PostgreSQL、不维护双库；下文旧 PG 测试选项不适用于新开发。F01–F18 与 R01–R20、R22、R23 已本地验收，下一项仍是 R21；详见 `docs/ADMIN-FRAMEWORK-ACCEPTANCE.md` 与 `to-do.md`，未部署。

> **2026-09-22 新后台设计入口**：此次重构以 `docs/PRD-AGENT-OPERATIONS.md`、`docs/RESEARCH-AGENT-OPS-OPEN-SOURCE.md`、`docs/TECH-DESIGN-AGENT-OPERATIONS.md` 为配套设计，顺序见根 PLAN 新后台章节，拓扑见 ARCHITECTURE 新目标图。其中 F 框架已落地，其余业务设计仍待实施；下文旧后台路径和旧技术方案不得当作新重构需求。新增 Agent 写能力开放前必须封闭既有写入旁路。

> **2026-09-21 后台重构状态（优先于下文旧界面说明）**：站主要求清空管理界面。`apps/admin` 仅保留空白开发/构建入口与 API 代理；计划、内容、复盘、设置、旧路由及管理 UI 均已退役。API、数据库、文章与共享规则保留，生产未部署此变更。旧后台页面图与验收记录仅作历史参考，不作为新重构需求。资产清单见 [后台重构前资产清单](docs/ADMIN-REBUILD-INVENTORY.md)。


本文件是本仓库内 Agent 的项目级常驻指令。开始工作前，先阅读本文件，并同时遵守根目录 `CLAUDE.md` 中的工程约定。

> **2026-09-22 框架实现状态**：新 admin 默认 `/overview`，四面 `/overview`、`/content`、`/agents`、`/records`，低频 `/settings`；路径唯一来源 `apps/admin/src/shared/routes.ts`。下文旧 `/plan` 页面图仅为历史。框架仅读取内容、角色和历史 AgentRun；新执行/部署/编辑/发布均未接入。测试库仅接受绝对 SQLite `.test.db` 文件并重建，不再支持下文旧 PG 选项。

## 文档阅读顺序

1. 根 `PLAN.md`（主执行计划：北极星 · 宪法 · 主线排期 · 冻结条款）→ 2. 根 `CLAUDE.md`（栈 / 命令 / 部署须知）→ 3. `docs/README.md`（文档地图）+ `docs/ARCHITECTURE.md`（架构图面：当前态/最终/飞轮）→ 4. 按改动区域读 `docs/PRODUCT.md`（产品红线）、`docs/api/README.md`（API 契约）、`docs/STATUS.md`（生产状态）。
改站内助手必须先读 `docs/PRD-SITE-ASSISTANT.md`。执行实录与决策日志在 `docs/archive/TODO-SITE-ASSISTANT.md`（已完成，禁止当待办队列）。`docs/archive/` 是退役方案，禁止当现行契约。

## 仓库结构与验证门禁

- monorepo：`apps/web`（访客静态站）/ `apps/admin`（站主工作台，**默认首页=计划 `/plan`**；工作面：计划 / 内容 / 复盘；底部设置：Agent / 观测 / 结构）/ `apps/api`（Nest）/ `apps/agent`（判断代理 · Cordis 组合 + MCP stdio，读 content.json，aiUsePolicy fail-closed）/ `packages/shared`（纯函数与契约，多端共用）/ `scripts/`（构建与预渲染）/ `content/log`（内容唯一真相源）/ `ops/windows`（盒子部署物料）。
- **管理端页面地图**：计划 `/plan`（含下一动作）；内容面分栏 `/content/ledger` 与 `/content/detail/:slug`；复盘 `/review`；底部设置 `/settings`（三组：Agent / 观测 / 结构）。题苗 `/seeds`、执行 `/executions` 仅深链，不进侧栏。旧 `/` `/today` `/pipeline` `/workstation`→计划；`/content`→台账；`/insights` `/clues` `/assistant` `/metrics`→复盘；`/agents` `/data` `/ai-gateway` `/graph` `/architecture`→设置对应项。走 `LEGACY_REDIRECTS`（`apps/admin/src/shared/routes.ts`）。跳转禁止硬编码路径。
- 改内容运营后台先读根 `PRD.md` / `TECH-DESIGN.md` / `EXEC-PLAN.md`。
- **构建产物双份**：`apps/web/src/generated/` 下有 `content.json`（内容投影）与 `graph.json`（知识图谱：节点 + 边 + 度数）。图谱由 `content:gen` 与 content.json 一并产出，web 打包它、API 用同一个 shared 纯函数从 content.json 现算、agent 复用同一函数——**建图规则只有一份**（`packages/shared/src/graph.ts`），禁止各处自己写抽边逻辑。
- 主计划与图面：`PLAN.md`（排期/冻结条款/宪法）与 `docs/ARCHITECTURE.md`（当前态/最终架构/飞轮）是拓扑与排期权威，改动须回写。
- `apps/api` 是六边形分层：`ports/`（Symbol 接口）→ `adapters/`（实现）→ 用例 service → `kernel.module.ts` 统一接线。新增能力先定 port 再写 adapter。
- `apps/web` 运行时只读 `apps/web/src/generated/content.json`，禁止在 web 里做 fs / 直连内容目录。
- 改动后验证链：`pnpm typecheck` → `pnpm test:shared && pnpm test:api && pnpm test:web && pnpm test:agent` → 改了 web 再 `pnpm build:web && pnpm verify:geo`（GEO 是构建门禁）→ 改了内容先 `pnpm check:content-fields`。
- 测试库隔离：`apps/api` 的 vitest 把 `DATABASE_URL` 强制改写到独立 `walker.test.db`（globalSetup 每次删库重建 schema；显式设 `API_TEST_DB_URL` 可指定 PG），测试绝不写开发库。真实 kernel 接线的集成测用 `Test.createTestingModule` + `KernelModule`（假 runner/临时目录用 `overrideProvider`/env 覆盖，见 `promote.kernel.integration.test.ts`、`workstation.chain.integration.test.ts`）。
- 改生产拓扑 / 部署流程 / 产品行为后，**必须回写文档**（AGENTS.md / PRD / TODO / STATUS / api/README 对应处），保持文档与生产一致。
- SQLite 迁移只走绝对 `file:` 路径。新库 `pnpm db:migrate`，已有库先备份、再 `pnpm db:baseline`；`dev:api` 不再隐式改 schema。旧 PG schema/迁移仅在 `apps/api/prisma/legacy-postgresql/` 供历史查阅。

## 生产拓扑（2026-09-03 切流后）

- 访客：`www.iwalk.pro`（Vercel 静态，push main 自动发）→ `/api/*` 反代 → `api.iwalk.pro`（盒子上 Caddy + Let's Encrypt）→ Nest `127.0.0.1:8788` → SQLite / DeepSeek Harness。
- **公网白名单双侧同步**：放行新公开路由必须同时改 `apps/api/src/app.module.ts`（exclude 表）和 `ops/windows/Caddyfile`，漏一侧即 401/404。管理路由另有 `WALKER_ADMIN_TOKEN` + Caddy basic auth 双防线。
- **管理凭据体系**：Basic 密码必须等于 `WALKER_ADMIN_TOKEN`（Nest 中间件校验）。改密码 = 同步改服务器 `apps/api/.env` 的 `WALKER_ADMIN_TOKEN` + `C:\Walker\data\admin-basic-auth.txt`（格式 `user:password`，明文仅存 data 目录）→ 重启 WalkerApi 和 WalkerGateway。脚本调管理接口带 `x-admin-token` 头。模型提供方与智能体工坊（`/agents` 页）API 密钥用 AES-256-GCM 落库，主密钥 `WALKER_CREDENTIAL_MASTER_KEY` 只存服务器 `.env`，**密钥数据永不进 Git**。
- 盒子（腾讯云轻量，Windows Server 2C2G，新加坡）运行目录 `C:\Walker`：`app`（Git 工作树）/ `data`（持久数据，**不得覆盖**）/ `bin`（node/pnpm/git/caddy/dsh）/ `logs`。

## 盒子部署与运维坑（实测教训）

- 部署流：SSH 进盒子（**优先 `ssh walker-tencent`，走 Tailscale 主路径**，与出口 IP/防火墙无关；`walker-tencent-public` 仅应急）→ `cd C:\Walker\app && pnpm check:content-dirty && git pull origin main` → lockfile 变了再 `pnpm install --frozen-lockfile` → `pnpm build:shared` → `pnpm build:api`（admin 改了再 build:admin）→ 更新 `apps\api\.env` 的 `WALKER_BUILD_VERSION=<git rev-parse --short HEAD>` → `schtasks /End + /Run /TN WalkerApi`（网关是 `WalkerGateway`）→ 按 `ops/windows/README.md`「部署验证清单」四步核对（health 回显 version/8788 归属/443/路由隔离）。
- **停服才能换 Prisma 引擎（2026-09-14 实测）**：API 运行时跑 `pnpm db:generate` 必失败——`EPERM: operation not permitted, rename ... query_engine-windows.dll.node`（运行中的 node 锁着引擎 DLL；`db:push` 走同一路径也会连带失败）。部署顺序因此固定为：`schtasks /End /TN WalkerApi` → **核 8788 是否真释放**（僵尸旧进程占着先 `taskkill /PID <pid> /F`）→ `pnpm db:generate` / `build:api` / `build:admin` → 写 `WALKER_BUILD_VERSION` → `schtasks /Run /TN WalkerApi` → 部署验证清单四步。另注：远程默认 shell 是 **cmd**（不是 PowerShell），多层引号易被吞，复杂脚本用 `powershell -EncodedCommand <base64-UTF16LE>` 传。
- **SSH 会熔断**：短连接多次后出现 `Connection closed by ... port 22`（两个成因：开 VPN 后出口 IP 不在防火墙白名单 → 走 Tailscale 主路径即解；构建打满 2G 内存把 sshd 僵死 → 控制台重启实例）。带外替代：腾讯云控制台 → 实例 → 「执行命令」（TAT，不走 22 端口），可远程 git pull + 构建 + 重启，实测 23 秒跑完全套。
- 2C2G 内存紧张：**构建（tsc/vite）可能把 sshd 打僵死**（TCP 可连但无 banner）→ 控制台重启实例可解；避免在 API 服务运行时跑重构建。
- PowerShell 脚本含中文必须带 **UTF-8 BOM**，否则 Windows PowerShell 按 ANSI 解析报错。给服务器写的 `.ps1` 一律 **纯 ASCII 注释**最稳。
- PowerShell 5 下 `$ErrorActionPreference='Stop'` 会把原生命令（pnpm/node）的 stderr 输出当终止错误杀掉脚本：要么 `'Continue'` + 检查 `$LASTEXITCODE`，要么把输出 `| Out-Null`。
- Caddy `basic_auth` 只支持**块形式**（行内参数会把第一个参数误读为哈希算法名）；Caddyfile 的 `{$VAR}` 占位符展开不跨 token，"user hash" 必须拆成两个环境变量。
- **Windows 保留文件名**（`nul`、`con` 等）在 Mac 上能提交、服务器上无法检出（`error: invalid path`）——提交前别把这类文件加进 Git。
- OpenSSH（Windows）会话断开会杀死该会话的整棵子进程树：需要存活的远程进程用 `Start-Process` 脱离或 schtasks 注册后 `Start-ScheduledTask`。
- **拉代码前必须先跑 `pnpm check:content-dirty`**：Admin 保存的文章直接写 `content/log`（Git 管内），`git reset --hard origin/main` 会连带丢掉未提交/未推送的内容修改。脚本发现内容脏即 exit 1——先 `pnpm content:publish --push` 发布或备份到 data 目录；仅代码树脏（content/ 干净）时才允许 `git reset --hard origin/main`。内容提交只走 `pnpm content:publish`（pathspec 限定 + 无关暂存检测，不会夹带代码）。
- **重启 API 后必须核 8788 归属**：`schtasks /End` 可能杀不掉占端口的僵尸旧进程（任务实例引用丢失），新实例起失败时 8788 仍是旧 dist 在跑（症状：新功能 404 或行为像旧版，如秒回规则兜底）。核法：`netstat -ano | findstr :8788` 对比 PID，变了才算换血；没变就 `taskkill /PID <旧PID> /F` 再 `/Run`。**End/Run 序列被中断会留下半重启状态（health 版本与实际 dist 不一致的窗口）**——2026-09-06 实测造成助手假性降级，重启后自愈。
- **改 `.env` 用 `Set-Content -Encoding UTF8`**：PS5 默认编码会重写整文件；跑 `run-api.ps1` 的进程输出（含 AI 降级原因）落 `C:\Walker\logs\api.log`——排查 AI 兜底/异常第一现场。
- **dsh 短调用（≤60s 预算，即卡口 nextStep）用常驻实例、长调用（工作站配方）独立实例**：超时/取消**不丢**常驻实例（会话超时不污染 runtime，只有传输故障才重建）；重启后首个 AI 请求可能冷启动超 15s 走规则兜底——自愈非故障，第二问即恢复。
- **给 prompt 追加输出合同前先确认调用方没自带合同**：双合同冲突实测把生成从 7s 拖到 45s+，15s 预算必超（2026-09-06 A/B 探针）。
- **重启网关后必须核 443**：`netstat -ano | findstr ":443"`。WalkerGateway 任务参数可能被重置回 8080 测试模式（install-tasks.ps1 重注册漏 `-PublicApiHost api.iwalk.pro` 即复现）→ 用正式域名重跑注册脚本；老 caddy 占端口时 `schtasks /End` 杀不掉（实例引用丢失）→ 直接 `taskkill /PID <pid> /F` 再 `/Run`；起进程必须走计划任务（`/Run`），SSH 里 `Start-Process` 起的会随会话被杀（先 `/End` 清僵尸实例再 `/Run`）。网关重启后首个 AI 请求可能因 harness 冷启动超 15s 走规则兜底——自愈行为，非故障。
- DeepSeek Harness（dsh）安全机制：**拒绝从 .env 文件继承 `DSH_*` 启动变量**——生产用 `WALKER_DSH_RUNTIME_BIN` / `ASSISTANT_DSH_HOME`（见 `ops/windows/README.md`），且子进程 cwd 必须是不含 .env 的中立目录。
- SSH 不通时**先确认走的是 Tailscale 主路径**（`ssh walker-tencent` 即是，2026-09-03 实测直连 155ms 稳定）；只有公网备用路径 `walker-tencent-public` 才需要按防火墙白名单更新来源 IP（家宽 IP 会轮换）。

## 站内助手 / AI / 工作站红线（改相关代码前必读）

- **AI 可关**：`AI_ENABLED≠true` 时一切 AI 功能走规则兜底，回答仍非空；任何降级（超时/坏输出/预算触顶）都路由到规则版，`aiUsedFlag` 如实标注。
- **aiUsePolicy fail-closed**：模型输出经 `parseAssistantOutput` / `parseAiNextStepOutput` 校验，引用 slug 必须 ⊆ citable 集合；citations/参数来自网关与索引，不信任模型原文。
- **公开输入永不进命令行**：子进程一律经 node + args 直启（无 shell），调用方数据（访客 prompt、配方 prompt）只走数据通道（dsh 为 JSON-RPC stdin），永不成为命令行参数（见 `ops/windows/README.md`）。
- **流式只出裁剪文本**：text-delta 经 shared `extractStreamedAnswer` 裁剪后才出网关，原始模型 JSON（含 citations）不外发；终值校验后由 `done` 事件整体覆盖；助手会话归属 fail-closed（未知/他人/规则会话一律开新会话）。
- **工作站诚实语义**：网站发布保存 = `PREPARED` ≠ 已发布（上线走 `pnpm content:publish --push`，`verifyWebsite` 过线上校验才 `PUBLISHED`）；取消 CANCELLED 是稳定终态，迟到结果不得覆盖（`setStatusUnless`）；同 work 运行互斥；审批绑定服务端审阅包 candidate.hash；发布 frontmatter 与构建门禁共用 shared `PUBLISHED_POST_REQUIRED_FIELDS`，缺字段写盘前即拒，不放宽门禁迁就生成物。
- **图谱只画正文内链**：知识图谱的边 = 正文 `[[wikilink]]` / 库内 markdown 链接，零模型推断（`related` / `series` 刻意不画——那是策展层，不是链接结构）。
- **图谱引擎按 Obsidian 应用源码重写，禁止凭手感改**：规格与证据链在 `apps/web/src/components/graph/obsidian/constants.ts` 顶部（含已核出的二手资料错误），面板文案的唯一来源是 `obsidian/labels.ts`（逐字取自应用 `i18n/zh.txt`，带行号，**不自译**）。真值层级：**应用 `obsidian.asar` > 原始 worker `sim-original.js` > 帮助文档**。已核对的事项：力参数引擎值 `0.1/1000/1/250`（面板斥力是 UI 10，写入时**立方**）、节点半径 `clamp(3√(无向度数+1), 8, 30)`、`vx *= 0.6`、`textAlpha = clamp(log2(scale)+1-阈值,0,1)`、缩放夹取 `[1/128, 8]`、`showTags` 默认**关**、配色是**按类型语义化**（11 个 CSS 变量，不是单一色）、小节名是**筛选/颜色组/外观/力度**。**帮助文档与实现冲突时以实现为准；CSS 只能证明「有这些类」，不能证明「UI 长这样」——别据样式表推断交互（v1.2 就这么错过一次）**。
- **代码结构图谱（PRD-CODE-GRAPH）的四条硬约束**：① 抽取实现只有一份 `scripts/lib/code-extract.ts`（`code:gen` 与 `verify:architecture` 共用），**不要在别处另写一遍解析**；② 产物分两份 —— `codegraph.json` 是公开面（只有节点与边），`codegraph-health.json` 是内部面（体检明细），**任何体检字段都不许写进公开产物**（那份会被 web 静态引入）；③ 门禁**只报机器自证的四条硬伤**（环 / 坏引用 / 从入口不可达 / packages 反向依赖 apps），**禁止新增人工规则文件**（那会重述 `docs/ARCHITECTURE.md`，成为第二个真相源）；④ 生长动画**总时长优先**（427 节点曾按 30ms 错峰拖到 13 秒，现按总预算反推，见 `obsidian/renderer.ts` 的 `revealStaggerFor`）。新增 MCP 工具须同时登记 `TelemetryTool` 联合类型，否则 typecheck 不过。
- **图谱 fail-closed**：MCP `neighbors` 对 `citable=false` 的邻居只回「存在性与位置」，**不回摘要**；`readable=false` 的文章连索引都不进，其被链接目标表现为幽灵节点。访客面图只含公开条目。
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
