# CLAUDE.md

> **2026-10-13 文章版本历史本地验收，未部署**：发布即版本——发布确证 PUBLISHED 时把正文固化进公开区 `content/versions`（只追加、内容寻址、无删除路径），草稿区 content/log 一字不动。访客：文章页版本标签（`articleHistoryLabel`：无版本不出链接／单版本「版本」／≥2 版「已更新 N 次」，不带日期）→ `/posts/:slug/history` → `/posts/:slug/v/:n`（canonical 指向当前版、含永久保留承诺）；后台：/content/:slug「历史」tab（列表/查看/对比/回退开草稿）。发布批准新增变更说明必填。契约与纪律单点：shared `article-version.ts`。29 篇已补票 v1。证据见 docs/evidence/ARTICLE-VERSION-HISTORY-2026-10-13.md。

> **2026-10-12 运营记录合并为单页活动流，未部署**：站主嫌五个 tab 点来点去，按"站主要干什么"重排——`/records` 不再是 运行记录/访客对话/更新提醒/更新复盘/运行监控 五个 tab，而是**一条时间线**：顶部四个计数卡（未完成事项 / 降级回答 / 失败回答 / 发布未确证——**全部复用 `/ops/overview` 的 7 天口径，零新统计**），下面按类型 chips 筛选（全部/访客/提醒/复盘/运行/后台操作）。四条纪律由 shared `activity.ts` 单点定义：①事实时间排序不漂移（提醒待办用 `ACTIVITY_TODO_TS` 占位置顶）；②**读取时投影不落第二真相源**（每条事件带 provenance 回指 run/会话/事项/复盘/AdminRequestLog，删了源流里就没有）；③归并分页如实降级（每源取最近 30 条、时间游标 `before`，深处稀疏不均，界面明说翻深建议按类型筛）；④参数非法一律 400。新增 `GET /ops/activity` 与 `GET /ops/activity/counts` 两个只读端点（管理鉴权内）。**运行监控搬到概览页底部折叠块**（进程内诊断与业务时间线不是一类），详情页 `/records/runs/:id`、`/records/conversations/:id` 保留，旧 tab 链接参数语义映射（`?tab=visitors→?kind=visitor`，runtime 不映射、清参回全部，不设重定向表）。**实踩一坑**：react-router v7 的 `setSearchParams` 在本仓库环境（jsdom 与活体浏览器双复现）不落 history，且组件里两个 setter 双写互相覆盖——统一为单入口 `navigate(replace)` 一次写全量 kind+before。生产未部署。

> **2026-10-12 后台日志前端下线，未部署**：站主要求去掉「后台日志」标签页（/records?tab=admin-log）——该 tab、面板组件与组件测试已删除；旧链接按既有口径回落到「运行记录」并清掉参数（不设兼容重定向表）。**后端不动**：AdminRequestLogMiddleware、AdminRequestLog 表与 GET /ops/admin-log 全部保留，**fail-closed 语义不变**（日志写不进去仍 503 拒绝执行后台操作）——它首先是正确性机制，不是显示功能。人工操作的可见性改由「运行监控 → 只看人工操作」提供：进程内、重启清零，**不再有可分页的持久历史界面**（此代价为站主知情后的选择）。

> **2026-10-12 运行监控与后台日志的分工（补）**：两者数据层不重复，界面层此前看不出区别。后台日志 = **人工操作审计**（持久、可分页、fail-closed：写不进去就不执行后台操作），运行监控 = **进程内实时诊断**（重启清零、含自动轮询与公开请求、fail-open）。本轮补齐两块面板的定位文案，并给运行监控加「只看人工操作（流水）」筛选——自动请求的判据抽成唯一一份 `apps/api/src/auth/admin-background-request.ts`，后台日志中间件与运行监控中间件共用它；筛选在服务端生效，前端不做本地回退。生产未部署。

> **2026-10-12 本地运行监控台，未部署**：运营记录新增「运行监控」tab（请求指标 + 请求流水 + 运行日志流），形态抄自本机面板控制台 `#logs`。请求指标接的是 `request-id.middleware.ts` 早就在产的结构化行，并修正路径口径（原先 `req.url` 带 query，现改路由模板）；运行日志由 `app.useLogger` 的 tee 收进进程内环形缓冲（800 行、单行 2KB 截断、溢出计数）。`packages/shared/src/runtime-monitor.ts` 是频道归类、报错判定、比率显示的**唯一来源**；筛选一律在服务端（前端不回退）；分母为 0 显示「—」。本能力 **fail-open**（采集坏了业务照跑），与后台日志的 **fail-closed** 相反。只读、不落库、不引外部监控栈、不新增主工作面；新增 `GET /ops/runtime/{metrics,requests,logs}` 管理只读端点，不进公网白名单。已知盲区：API 启动失败/进程崩溃时看不到，终端仍是唯一现场。生产未部署。

> **2026-10-12 本地 Agent 直调与访客助手修复，未部署**：三处根因一起收敛。①**授权可用性只有一份判据**：shared 新增 `grantDenial`（权限：身份/来源/动作/范围/撤销/到期）与 `grantUsable`（权限 + 剩余额度），`/ops/agents/:id/grants` 读视图补齐四个计数器，token 在运行成功时终态记账进 `usageCharged`；`AuthorizationService.selectUsable` 是后端唯一"挑一条能跑的授权"入口，试跑面板与 `/agents/:id/try` 都改用它。**执行准入仍只看 `grantDenial`**，额度由 `reserve` 的原子 UPDATE 把关（不许读侧重复拒绝，否则"额度已用完，已改为规则处理"会被换成笼统 403）。②**等待与取结果只有一份实现**：`AgentExecutionService.awaitTerminal/savedText` 跟随运行自己的 `deadline`，发布测试与直调复用；`/agents/:id/try` 不再固定等 2 秒把空事件当 201 成功——无可用授权 409 `grant-required`、运行未成功 5xx 带 `state`/`stopReason`、成功零文本 502 `agent-run-empty`。③**访客助手到预算上限时交付已生成的正文**并标 `partial`，不再把半成品换成"当前 AI 未启用"的规则文案；首轮上下文改为"全量目录 + 相关正文"（shared `packFirstTurnContext`），不再整库倾泻 3.4 万字。删除假功能面：`compare`/`run-file`/`log-files`/`agents/:id/runs`，`RUN_KINDS` 去掉 `compare`。生产未部署。

> **2026-09-29 本地后台日志与 Agent 默认模型**：运营记录新增后台日志，记录人工触发管理 API 的路由模板、方法、状态和耗时；自动轮询不计作人工操作；独立 `AdminRequestLog` 表，26 条迁移。Agent 未指定提供方时，修订旧模型占位不再覆盖系统当前默认；清除 Agent 专属配置可恢复继承。只在本地验收，生产未部署。

> **2026-09-29 本地修复**：`conversation.convert` 与 Action 同事务且审计请求键唯一，SQLite 迁移为 25 条；执行 `pnpm db:migrate` 前会拒绝已有的非空重复审计键。管理端不确定结果只允许原样同键重试，明确放弃才换键；首页小影的收起焦点及隐藏历史回答已修正。当前仅本地，进度见根 `to-do.md`。

> **2026-09-28 首页小影本地接入**：`home-xiaoying/site-public` 走后台部署的小影 Agent；本地真实 runtime 探针已通过，开发库部署已启用。旧模型会话在 API 重启后用核验快照开新会话，避免固定回答覆盖；交互事件与 ACK 已补边界。`apps/api/.env` 的探针路径和 0MB 内存覆盖仅供本机演示，生产仍使用 512MB 默认门槛且未部署。证据见 [本地验收](docs/evidence/LOCAL-HOME-XIAOYING-2026-09-28.md)。

> **2026-09-28 本地 UI 约定，未部署**：访客旧称“卡／逛”仅在界面与现行文档改为“提问／文章”，`/tools`、`/posts`、intake/内容管道不改；首页保留原卡片并让 Dora 头像卡居中。内容列表的 `stage=live` 是 Git 干净口径，线上已发布须有最近一次确证记录。进度见根 `to-do.md`。

> **2026-09-27 发布链修正**：本地修复审查发现的七项发布/编辑边界，最新执行入口为 `POST /admin/content/release` 携带 `{slug, releaseId}`；预检同时返回文件 hash 和公开投影 hash。手工内容发布与 API 共用 `WALKER_CONTENT_LOCK_PATH`，不明推送结果保留 `UNKNOWN` 待核对。生产尚未部署，进度与验证证据见根 `to-do.md`。

> **2026-09-25 当前开发约定**：新后台执行根 [to-do.md](to-do.md)。F01–F18、R01–R33、V01–V24 与 C01–C24 已本地验收（C 系列完成），O01–O10 已验收（O 系列完成），G01–G06 已完成，当前下一项 G07；框架见 [验收报告](docs/evidence/ADMIN-FRAMEWORK-ACCEPTANCE.md)，V16–V24 日志/删除/恢复/回看/导出/路由/readiness/闭环及 C01–C24 证据见对应验收报告。C02 持久模型、C03 文件 CAS、C04 apply/reconcile 恢复、C05 人工保存鉴权/CAS/audit、C06 文章编辑/差异/预览与未保存冲突保护、C07 独立候选文件仓储、C08 后台生成内容候选、C09 精确审批与一次性消费、C10 候选差异与审批 UI 面板、C11 内容写入旁路清点与封闭、C12 发布范围预检与清单生成、C13 全工作区发布锁与清单复检、C14 发布阶段推进与幂等脚本调用、C15 网页构建版本证明写入、C16 线上版本核验器、C17 问答快照自动切换、C18 结果不明发布核对、C19 发布脚本进程树终止核验、C20 发布清单与版本状态界面、C21 旧工作站发布接入同一出口、C22 对齐项目与小店内容边界、C23 验证审批撤销和并发写入边界、C24 完整内容更新闭环、O01 提醒发生记录与复盘数据、O02 到期扫描与恢复补检、O03 提醒完成/延后/忽略、O04 事项与提醒箱界面、O05 访客问题转更新事项、O06 可追溯的运营统计、O07 关键数据概览与状态刷新、O08 内容更新复盘、O09 复盘建议显式转下一事项、O10 真实运营回路验收、G01 旧数据导入与兼容读演练、G02 完整失败恢复演练、G03 目标机器资源和并发验收、G04 仓库规定回归链、G05 PRD 验收逐条签收、G06 可恢复部署包已接通（修复发布源 hash 与线上版本证明的命名空间错配；修复迟到补写永久残留缺陷；新增内存余量门禁 resourceHeadroom；修复 install-dsh.ps1 的 SDK 版本漂移并新增 pnpm verify:deploy 门禁；A01–A28 共 28 项 0 未过，其中 A02/A04/A10/A16 的真实成分待 G08）；新发布链已本地验收、生产未部署。当前 API 未配置运行探针报告，公共位置 readiness 保持 blocked。本地开发、测试、现有生产统一 SQLite 独立文件，不接入 PostgreSQL、不维护双库。新空库使用 `db:migrate`；旧库先备份，只有 schema 与基线完全一致才可 `db:baseline`。当前生产旧库不符合基线，按 `ops/windows/README.md` 的 G07 重建搬迁；命令均要求绝对 `file:` 路径。新后台尚未部署生产。

> **2026-09-21 后台重构状态（优先于下文旧界面说明）**：站主要求清空管理界面。`apps/admin` 仅保留空白开发/构建入口与 API 代理；计划、内容、复盘、设置、旧路由及管理 UI 均已退役。API、数据库、文章与共享规则保留，生产未部署此变更。旧后台页面图与验收记录仅作历史参考，不作为新重构需求。资产清单见 [后台重构前资产清单](docs/evidence/ADMIN-REBUILD-INVENTORY.md)。


This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 技术栈（唯一）

- **pnpm monorepo**：`apps/web` · `apps/admin` · `apps/api` · `packages/shared`
- **前端**：React + Vite + TypeScript（**无 Astro**）
- **后端**：NestJS + Prisma + **SQLite**（本地开发、隔离测试和现有生产分别使用独立文件；不使用 PostgreSQL）
- **内容真相源**：`content/log/**/*.{md,mdx}` → `pnpm content:gen` → `apps/web/src/generated/content.json`（**进 Git 才上 Vercel**；Admin 保存≠自动 push）

## 常用命令

```bash
pnpm install

# 内容生成（改 content/log 后或切换分支后必跑）
pnpm content:gen

# 库 + 三端（本地 SQLite 默认）
# 首次：将 apps/api/.env.example 复制为 apps/api/.env，填写绝对 file: SQLite 路径
pnpm db:generate && pnpm db:migrate  # 仅新空库；旧库先按 schema 与迁移历史选择路径
pnpm dev:api    # :8788；不隐式更改 schema
pnpm dev:web    # :5173（自动先 content:gen）
pnpm dev:admin  # :5174

# 内容上线 → GitHub → Vercel
pnpm content:publish --push

# 类型检查（内部先 build:shared）
pnpm typecheck

# 测试（test:api 内部先 build:shared）
pnpm test:shared && pnpm test:api && pnpm test:web

# 验收（需三端已起）
pnpm accept

# 数据库（当前 SQLite；只对明确指定的独立库操作）
pnpm db:generate
pnpm db:baseline  # 仅备份后且 schema 与基线完全一致的旧库；当前生产旧库不适用
pnpm db:migrate   # 新空库或已建立迁移历史的库

# 维护
pnpm check:content-fields   # 校验所有 MD frontmatter
pnpm verify:stage1           # Stage1 迁移校验
```

## 内容管道（构建与运行时的核心）

```
content/log/**/*.{md,mdx}  →  scripts/generate-content.ts  →  apps/web/src/generated/content.json
```

- `content/log` 是内容**唯一真相源**；该 JSON 是 WebApp 的只读内容模型（文章、元数据、「逛」所需的一切）
- `dev:web` 和 `build:web` 自动运行 `content:gen`
- 如果你在未重启 `dev:web` 的情况下手动编辑 `content/log`，需运行 `pnpm content:gen` 使更改生效

## 构建依赖顺序

`build:shared` 是隐式前置条件——`packages/shared` 必须先编译，`apps/api` 和 `apps/web` 才能使用它：

- `pnpm typecheck` — 内部先运行 `build:shared`
- `pnpm test:api` — 内部先运行 `build:shared`
- 修改 `packages/shared` 后，运行 `pnpm build:shared` 使更改对其他包可见

## 领域词汇（SSOT）

同一概念只用一个词；不同概念禁止同名。全文见 [`docs/PRODUCT.md`](docs/PRODUCT.md)。

| 术语 | 含义 | 出现位置 |
|------|------|----------|
| **提问** | "带着问题来" — `/tools` 入口，接收问题 | `dualEntry.ask`、`ToolsPage`、`IntakeApplication` |
| **文章** | 阅读公开内容的 `/posts` 总览与详情 | `dualEntry.browse`、`PostsPage` |
| **线索** (Clue) | 用户提交的原始问题 | `ClueApplication`、`/clues` 端点、`CluesPage` |
| **题苗** (Seed) | 从线索升级而来的潜在主题 | `SeedApplication`、`/seeds`、`SeedsPage` |
| **执行** (Execution) | 有效交付——可追踪的工作单元 | `ExecutionApplication`、`/executions` |
| **主选** | 将一条线索选为题苗的主线索 | `POST /seeds/:id/promote` |
| **两问** | 严重性 + 自身兴趣——选题门控 | `POST /seeds/:id/two-questions` |
| **闭环** | 可计数的完成指标 | `MetricsApplication`、`/metrics` |
| **交付** | 完成执行卡的工作产出 | `POST /executions/:id/deliver` |
| **检验** | 审查交付物；可计数判定 | `POST /executions/:id/review` |
| **池** | 线索状态（待处理 / 进行中 / 已关闭等） | `PATCH /clues/:id/pool` |
| **nextStep** | 下次该做什么——由规则或 AI 生成 | `NextStepStrategy`、intake 响应 |

**禁止在页面中硬编码路径字符串**（如 `'/tools'`、`'/posts'`）——始终从 `dualEntry` 或 `WEB_ROUTES` / `ADMIN_ROUTES` 读取。

## 前端分层（必读）

**Component ≠ 只有 UI/UX。** 按责任分层；展开见 [`docs/ENGINEERING.md`](docs/ENGINEERING.md)。

| 层 | 做什么 |
|----|--------|
| **配置** | dual-entry / nav 等产品语义 SSOT |
| **规则** | shared 纯函数、消毒、错误码与限流数字 |
| **门面** | `public-api`（Web）/ Refine 数据层（Admin），无 className |
| **页** | 路由任务编排，调门面、组块 |
| **块/壳** | 可复用 UI+UX；壳只布局 |

禁止：块里写领域规则；页复制第二套校验；规则 import React；壳办 intake/主选业务。

## 禁止

- 重新引入 Astro / `.astro` 组件 / `@astrojs/*`
- 在 React 正文里保留对 `.astro` 的 import（生成脚本会剥离）
- 把旧 WorkItem 巨石后台、Match 双轨当默认路径

## Admin 鉴权

**2026-09-22 本地约定**：站主要求本地工作台暂不设置密码。隔离联调显式使用空 `WALKER_ADMIN_TOKEN`，API仅监听 `127.0.0.1`，页面打开/刷新直接进入；需要验证鉴权时由测试设置临时凭据。生产凭据要求仍按下文执行。

**生产已启用双层管理凭据**（2026-09-03 切流后）：Nest `AdminTokenMiddleware` 校验 Basic 密码 = `WALKER_ADMIN_TOKEN`（生产缺该 env 直接拒启）；公网另有 Caddy basic auth 双防线。公开白名单见 `apps/api/src/app.module.ts`（与 `ops/windows/Caddyfile` 双侧同步，漏一侧即 401/404）；所有变更方法统一经过 Origin/Referer 校验，精确来源 host 由 `WALKER_PUBLIC_ORIGINS` 提供；边界由 `apps/api/src/public-route-boundary.test.ts` 防漂移。脚本调管理接口带 `x-admin-token` 头。凭据体系与改密流程见 `AGENTS.md`「生产拓扑」。

## 功能开发清单

添加任何功能时，按顺序确认：

1. **配置？** — 新 path / 文案 / 导航项 → `dual-entry` / `nav`
2. **规则？** — 新校验 / 纯计算 → `packages/shared`
3. **门面？** — 新 HTTP 调用 → `public-api`（Web）/ Refine 数据层（Admin），并同步 `docs/api/README.md`
4. **页 + 块？** — UI 编排：页调门面 + 组合块；UI 块仅 `props + onXxx`，能测补测

## 产品与文档（只这几份）

访客入口：提问（`/tools`）/ 文章（`/posts`）。

| 文件 | 用途 |
|------|------|
| [`docs/PRODUCT.md`](docs/PRODUCT.md) | 产品权威 |
| [`docs/ENGINEERING.md`](docs/ENGINEERING.md) | 工程 + 部署 + 切流就绪 |
| [`docs/STATUS.md`](docs/STATUS.md) | 生产状态时钟 |
| [`docs/api/README.md`](docs/api/README.md) | Nest API 契约 |
| [`docs/README.md`](docs/README.md) | 索引 |

历史 PRD/Goal/切流长文 → `docs/archive/`（**不**当现行权威）。

## 部署与发版（对话默认须知）

**发版链路（已接好，勿重复问「要不要 link」）：**

| 项 | 事实 |
|----|------|
| GitHub | `https://github.com/AdgaiWalker/AdgaiWalker` · 分支 **`main`** |
| Vercel 项目 | **`adgai-walker`**（账号/团队 `praxiswalker-6245`） |
| 生产域名 | **https://www.iwalk.pro**（`iwalk.pro` → www） |
| 触发方式 | **`git push origin main` → Vercel 自动 Production 部署** |
| 构建 | 根 `vercel.json`：`pnpm build:web` → `apps/web/dist`（含字段门禁、语义预渲染、sitemap、RSS/JSON Feed、llms、GEO 校验、pagefind） |

```text
改代码 → commit → push main → Vercel 构建 web → 发布 www.iwalk.pro
```

**旧切流前生产快照（历史；当前部署事实见 docs/STATUS.md）：**

- **有**：web 静态 SPA、深链 rewrite（`/tools` 等 200 壳）、文章预渲染、rss/llms/pagefind  
- **无**：公网 Nest、生产 PG、同源 `/api/*` 反代 destination  
- 因此公网 **intake / 点赞写 / Admin 写** 仍不可用；本地 `dev:api` + PG 可全绿  
- `GET /api/health` 生产 **404**；裸 `/health` 可能被 SPA 吞成 HTML——**不是** Nest health  

**腾讯云首期运行边界（2C2G Windows）：** 单 Nest + SQLite + Caddy；Nest/Admin 仅监听回环，公网 Caddy 只放公开 API 白名单，Admin 经 `ssh walker-tencent` 隧道访问。禁止在当前机器堆 Docker、Redis、本机 PostgreSQL 或多份 Nest。运行手册见 `ops/windows/README.md`。

**`vercel.json` 规则：**

- 首页、内容枢纽、文章与已知客户端壳由构建期静态 HTML 承载  
- 旧兼容路径走 `redirects` 301；仅无静态文件的客户端子路径才 rewrite 到对应壳，禁止 rewrite 到首页  
- 未知路径与 `/api/*` 不进 SPA fallback，保持真实 404，避免 soft-404 和 API 落到 HTML  
- 上 Nest 后须在 rewrites **最前**加：`/api/:path*` → `https://<真实-API-主机>/:path*`（Nest 无全局 `/api` 前缀）  
- 旧中文 slug → 英文 slug 的 301 在 `redirects`  

**本地默认：** SQLite 的 `file:` 数据源；开发库、测试库和框架联调库使用不同文件，不将数据库文件提交 Git。新开发不配置 PostgreSQL。

**探针：** `pnpm exec tsx scripts/probe-production.ts`
