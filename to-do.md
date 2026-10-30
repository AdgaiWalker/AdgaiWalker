# Agent 运营后台：原子执行清单

> **2026-10-12 运营记录合并为单页活动流，未部署**：站主嫌五个 tab 点来点去，按"站主要干什么"重排——`/records` 不再是 运行记录/访客对话/更新提醒/更新复盘/运行监控 五个 tab，而是**一条时间线**：顶部四个计数卡（未完成事项 / 降级回答 / 失败回答 / 发布未确证——**全部复用 `/ops/overview` 的 7 天口径，零新统计**），下面按类型 chips 筛选（全部/访客/提醒/复盘/运行/后台操作）。四条纪律由 shared `activity.ts` 单点定义：①事实时间排序不漂移（提醒待办用 `ACTIVITY_TODO_TS` 占位置顶）；②**读取时投影不落第二真相源**（每条事件带 provenance 回指 run/会话/事项/复盘/AdminRequestLog，删了源流里就没有）；③归并分页如实降级（每源取最近 30 条、时间游标 `before`，深处稀疏不均，界面明说翻深建议按类型筛）；④参数非法一律 400。新增 `GET /ops/activity` 与 `GET /ops/activity/counts` 两个只读端点（管理鉴权内）。**运行监控搬到概览页底部折叠块**（进程内诊断与业务时间线不是一类），详情页 `/records/runs/:id`、`/records/conversations/:id` 保留，旧 tab 链接参数语义映射（`?tab=visitors→?kind=visitor`，runtime 不映射、清参回全部，不设重定向表）。**实踩一坑**：react-router v7 的 `setSearchParams` 在本仓库环境（jsdom 与活体浏览器双复现）不落 history，且组件里两个 setter 双写互相覆盖——统一为单入口 `navigate(replace)` 一次写全量 kind+before。生产未部署。

> **2026-10-12 后台日志前端下线，未部署**：站主要求去掉「后台日志」标签页（/records?tab=admin-log）——该 tab、面板组件与组件测试已删除；旧链接按既有口径回落到「运行记录」并清掉参数（不设兼容重定向表）。**后端不动**：AdminRequestLogMiddleware、AdminRequestLog 表与 GET /ops/admin-log 全部保留，**fail-closed 语义不变**（日志写不进去仍 503 拒绝执行后台操作）——它首先是正确性机制，不是显示功能。人工操作的可见性改由「运行监控 → 只看人工操作」提供：进程内、重启清零，**不再有可分页的持久历史界面**（此代价为站主知情后的选择）。

> **2026-10-12 运行监控与后台日志的分工（补）**：两者数据层不重复，界面层此前看不出区别。后台日志 = **人工操作审计**（持久、可分页、fail-closed：写不进去就不执行后台操作），运行监控 = **进程内实时诊断**（重启清零、含自动轮询与公开请求、fail-open）。本轮补齐两块面板的定位文案，并给运行监控加「只看人工操作（流水）」筛选——自动请求的判据抽成唯一一份 `apps/api/src/auth/admin-background-request.ts`，后台日志中间件与运行监控中间件共用它；筛选在服务端生效，前端不做本地回退。生产未部署。

> **2026-10-12 本地运行监控台，不占 G07/G08 完成状态**：运营记录新增「运行监控」tab，复用本机面板 `WorkBuddy2API` 控制台 `#logs` 的两块形态（请求指标 + 运行日志）。请求指标从 `request-id.middleware.ts` 早已在产的结构化行接出（顺带修正口径：路径改写路由模板，不再记录带 query 的原始 URL）；运行日志由 `app.useLogger` 的 tee 采集进进程内环形缓冲（800 行、单行 2KB 截断、溢出计数）。三条纪律由 shared `runtime-monitor.ts` 单点定义：频道与报错判定只有一份、筛选一律在服务端（前端不做本地回退）、分母为 0 不出比率。采集全程 fail-open（与后台日志「写不进去就拒绝执行」的 fail-closed 相反），只读、不落库、不引外部监控栈、不新增主工作面。生产未部署。

> **2026-09-29 本地补项（不占 G07 完成状态）**：新增可分页的后台管理请求日志，业务审计继续由 `AuditRecord` 持有；每个人工触发的管理 API 请求先写进行中记录，完成后补状态与耗时；自动轮询跳过，日志不可写则后台操作不执行。Agent 未显式配置时继承系统当前默认模型。开发库已备份并应用第 26 条迁移，生产未部署。目标与验收见 [记录](docs/evidence/GOAL-2026-09-29-ADMIN-LOG-DEFAULT-MODEL.md)。

> **2026-09-29 本地审查修复（不占 G07 完成状态）**：O05 转事项改为 Action/审计同事务、审计请求键唯一，管理端结果不明冻结原请求并显式核对；会话详情与首页小影修正状态、历史占位和焦点边界。第 25 条迁移已在本地开发库与隔离部署演练通过，生产未部署。证据见 [本地修复验收](docs/evidence/LOCAL-CONVERSATION-XIAOYING-FIX-2026-09-29.md)。

> **2026-09-29 长会话性能后续项**：本地浏览器以真实 9 轮及隔离 100 轮/1000 文本事件测量详情页；大样本可渲染，但出现一次 173ms 主线程长任务。本轮不改读取或展示，数据与局限见 [性能测量](docs/evidence/LOCAL-CONVERSATION-PERFORMANCE-2026-09-29.md)。若真实使用出现同规模长会话，再单列分段加载任务；不计入 G07/G08 完成状态。

> **2026-09-28 首页小影本地补项（不计 G07/G08 完成）**：保留原卡片布局，气泡移到影鳐上方；后台模型部署到 `home-xiaoying/site-public`。开发库真实模型问答与文章引用已在浏览器验证，并修复旧 SDK session 冲突、事件 404、ACK 409 与失败轮旧答。门禁和局限见 [本地验收](docs/evidence/LOCAL-HOME-XIAOYING-2026-09-28.md)，生产未部署。

> **2026-09-28 本地 UX 修订（不占 G07 完成状态）**：访客界面仅把“卡／逛”改称“提问／文章”并重排原首页四卡，Dora 卡居中；后台修正版本事实、能力提示、内容分组与发布阻断呈现。四端回归、admin/web 构建及 GEO 已通过，证据见 [本地体验修订验收](docs/evidence/LOCAL-UX-REFRESH-2026-09-28.md)。未部署，G07/G08 门槛不变。

版本：v1.57 · 2026-09-27 · 状态：**F01–F18、R01–R33、V01–V24、C01–C24、O01–O10、G01–G06 及 G06.R 审查修复已通过本地验收**；**下一项：G07**（部署基础服务与静态版本证明）——**已完成只读侦察，实际部署阻塞待站主授权**（见 G07 条目与 §10）。生产未部署；公共模型通道与 G08 实际生产启用仍待验证。

共 **108 项**：F 框架 18 项、R Agent 基础 24 项、V 访客与日志 24 项、C 内容闭环 24 项、O 运营 10 项、G 发布收尾 8 项。首批仅 F01–F18。

目标：**先让站主拥有能启动、能导航、能读取真实资产的后台框架，再逐步打开 Agent、访客服务和内容运营闭环。** 首批框架实现与验证见 [本地验收报告](docs/evidence/ADMIN-FRAMEWORK-ACCEPTANCE.md)。后续业务能力仍按下列依赖实施。

依据：[PRD](docs/specs/PRD-AGENT-OPERATIONS.md)、[技术方案](docs/specs/TECH-DESIGN-AGENT-OPERATIONS.md)、[开源调研](docs/specs/RESEARCH-AGENT-OPS-OPEN-SOURCE.md)。主优先级在 [PLAN](PLAN.md)，本文件是此次重构的**唯一原子任务进度源**。旧 `docs/archive/EXEC-PLAN.md`、历史 TODO 的完成勾选不能搬到这里。

## 1. 优先级与第一次交付

| 优先级 | 批次 | 可交付结果 | 不等待什么 |
|---|---|---|---|
| P0 | F：框架 | 新后台四个主入口、鉴权、统一请求、真实内容/Agent/历史记录只读链路、可构建可浏览 | 不等 SQLite 新模型、完整 Harness 治理、访客入口或发布重构 |
| P1 | R：Agent 基础 | 创建修订、后台真实试跑、记录、额度、停止/恢复和权限基础 | 不等公开部署、多 Agent 协作或完整运营报表 |
| P2 | V：访客服务 | 文章位置绑定、只读问答、多 Agent 显式切换、会话/交互采集、后台日志治理 | 不等自动改稿或内容发布；收集真实访客数据前完成本批隐私/删除门槛 |
| P2 | C：内容闭环 | 人工编辑、候选差异、单次批准、受控发布、网页与索引核验 | 人工编辑子集可提前到 R 后；不得为了提早上线跳过发布范围/核验 |
| P2 | O：运营闭环 | 到期提醒、问题转事项、一次更新复盘、真实统计 | 提醒可在 R 后先做；关联访客与发布的部分等待 V/C |
| P3 | G：发布收尾 | 迁移演练、全量回归、资源核验、分步部署与回退记录 | 不等远期功能；这是上线门槛，不是可忽略的低优先级 |
| 暂缓 | §9 停车场 | 自动接力、持续自主内容委托、小店交易、外部监控等 | 真实闭环暴露需求后再排期 |

**第一次交付只完成 F01–F18。** 验收演示：启动 API/admin → 进入概览 → 读取真实内容列表 → 打开真实文章 → 查看现有 Agent → 查看已有运行记录；刷新、断网、401、空库均有真实状态。尚未接通的“运行/部署/发布”按钮不伪造成功。

默认执行顺序：F → R → V → C → O → G。按任务依赖可提前做 C 的人工编辑和 O 的提醒；这是工作可交错，不要求启动多个 agent。真实模型探针失败只阻止对应模型能力上线，不阻止本地框架、只读页面和人工内容工作的推进。

## 2. 执行约定与自主决策

1. 每项只解决一个主要行为，包含落点、前置、完成证据。`[ ]` 未完成；`[x]` 仅在验收满足后勾选，并追加证据路径/命令结果/提交号。进行中、阻塞原因写 §10，不能以写了代码代替验收。
2. 默认由同一实现者执行。先选前置已完成的最高优先级任务；某项预计超过半个工作日仍无法形成独立结果，拆成 `原ID.a/b` 并更新依赖，不无限扩展原任务。此为任务粒度上限，不是交付工期承诺。
3. 路径带“新”是计划新增，其他路径须先核代码再编辑。复用现有 port/adapter 优先；不为了框架预建所有空 service、所有数据库表或通用工作流引擎。
4. 当前工作区已有大量修改/删除/未跟踪资产。禁止 reset/clean/stash 掩盖它们，禁止恢复旧 admin；提交只含本任务明确修改的文件，内容提交遵守现有独立发布规则。
5. React/Vite/TypeScript 尽量与 web 对齐；不顺手升级整个 monorepo。Refine 有阻塞性兼容问题则保留同一数据接口改薄 React 页面，assistant-ui 阻塞则暂复用现有对话组件。记录失败证据和取舍后继续，不为库升级牺牲业务边界。
   数据库按站主最新决定统一 SQLite：本地开发、隔离测试和现有生产分别使用独立文件，不使用 PostgreSQL，不做双数据库兼容或 schema 同步。历史 PG 物料不参与新开发；其清理不阻塞框架。
6. P0 只用真实只读 API。测试夹具只能出现在测试或显式开发探针中；无后端能力就显示未接入，禁止在产品页展示模拟经营数据。
7. SDK 和 runtime 保持同版本；不靠旧文档中的 ACP/升级建议绕过现有 SDK 限制。默认全局一个模型槽；并发扩容留停车场。权限失败不降级放行，模型失败可规则兜底。
8. 新公开位置默认关闭；内容 Agent 写入默认关闭。开发进度不等于开放能力，V24/C24/G08 是各自的显式验收节点。
9. 重构只落实单次提醒、L2 内容批准和公开显式切换。外部实时追踪按“不在首期”处理，遇到未规定字段采用最小可用设计并更新技术方案，不再重复向站主询问。

### 2.1 任务中的验证代码

| 代码 | 实际执行与边界 |
|---|---|
| K0 | 文档/合同核对：链接、唯一任务 ID、依赖无环、API 字段与实际代码一致；不跑无关应用测试 |
| K1 | 本批变更后的必经回归：`pnpm typecheck` → `pnpm test:shared` → `pnpm test:api` → `pnpm test:web` → `pnpm test:agent`；API/admin 有变更分别执行 `pnpm build:api` / `pnpm build:admin` |
| K2 | 针对任务行为的最小单元/集成测试；API 用隔离测试库与 KernelModule 真接线，可替换外部 runner。不要给纯样式和静态导航写镜像测试 |
| K3 | 浏览器实际验收：正常路径、刷新/返回、错误/空态；记录访问地址与结果。F16 完成后 admin 行为测试可用 `pnpm --filter @walker/admin test` |
| K4 | web 变更额外执行 `pnpm build:web` → `pnpm verify:geo`；内容 fixture/字段变更先 `pnpm check:content-fields`。涉及架构抽取再运行 `pnpm verify:architecture` |
| K5 | 真实 SDK 探针：记录版本、脱敏请求、进程退出证据、延迟/RSS；不输出密钥、不写站主正本。失败保存原因，不能用 mock 通过顶替 |
| K6 | 迁移/删除/发布恢复演练：只用明确的临时库/工作树和非敏感测试内容，模拟各中断点；生产核验留 G07/G08 |

说明：根 `dev:api` 现在只启动 API，不隐式改 schema。新空库先运行 `pnpm db:migrate`，已有 SQLite 库在备份后运行 `pnpm db:baseline`；两者均要求绝对 `file:` 路径。F16 已建立 admin test script，可运行 `pnpm --filter @walker/admin test`。

任务内跑 K2/K3，阶段边界跑 K1；同一代码版本的已通过结果可复用。不是每改一行都重复全套。基线失败须注明原有失败与本次引入失败，不能把未通过的门禁勾成完成。

## 3. P0 / F：先搭建可运行框架

- [x] **F01 固定开发基线和隔离数据入口**
  - 前置：无。落点：本文件 §10、`apps/api` 测试配置、项目现有启动命令。
  - 动作：记录 dirty 文件范围、Node/pnpm/SDK 版本和既有失败；建立不含真实访客内容的框架联调库及测试内容路径说明。
  - 验收：K0；启动命令显式指向隔离数据，无真实内容写入，无用户改动丢失；记录现有环境阻塞而非伪造全绿。

- [x] **F02 恢复 React 管理端构建入口**
  - 前置：F01。落点：`apps/admin/package.json`、`index.html`、`tsconfig.json`、`vite.config.ts`、新 `src/main.tsx`、`pnpm-lock.yaml`。
  - 动作：补 React/DOM 类型及 Vite 必需插件，将空 main.ts 迁成 React mount；保留 5174 与 `/api` 代理。
  - 验收：K3；dev 与 `pnpm build:admin` 成功，HTML 指向正确入口；现有 web 依赖不被意外升级。

- [x] **F03 建立新路由唯一入口**
  - 前置：F02。落点：新 `apps/admin/src/app/router.tsx`、`src/shared/routes.ts`。
  - 动作：注册 `/overview`、`/content`、`/agents`、`/records`、`/settings` 与详情路由，`/` 跳概览；未知路由给 404。
  - 验收：K3；深链刷新、返回/前进正常，页面跳转引用 routes；不恢复旧九页与旧重定向大全。

- [x] **F04 建立四面布局与基础视觉规则**
  - 前置：F03。落点：新 `apps/admin/src/app/AdminShell.tsx`、`src/styles/tokens.css`、基础状态组件。
  - 动作：实现概览/内容/Agent/运营记录主导航、底部设置、页标题与内容容器；复用现有站点风格，统一表格/表单/状态样式。
  - 验收：K3；桌面/窄屏可操作，键盘可达，主导航不堆技术设置；不另起一轮设计系统工程。

- [x] **F05 建立单一 HTTP 客户端**
  - 前置：F02。落点：新 `apps/admin/src/api/http.ts`。
  - 动作：统一代理前缀、JSON/非 JSON 响应、超时、AbortSignal、requestId 与 `{code,message}` 错误解析。
  - 验收：K2；200、401、409、503、代理返回 HTML、请求取消均保留真实语义，不把错误转换为空数组成功。

- [x] **F06 接入现有管理鉴权**
  - 前置：F05。落点：新 admin authProvider、鉴权失败页面；参考现有 AdminToken 中间件。
  - 动作：生产复用 Basic/管理鉴权；开发如需 token 仅当前内存持有；未鉴权进入明确提示，清除鉴权后清空私有查询缓存。
  - 验收：K2/K3；无凭据不能读取管理数据，401 不无限重试，构建物/localStorage/URL 不出现 token；不新增账号注册系统。

- [x] **F07 定义框架读模型与能力合同**
  - 前置：F01。落点：新 `packages/shared/src/agent-ops.ts`、`packages/shared/src/index.ts`、`docs/api/README.md`。
  - 动作：定义概览/内容/Agent/记录的最小列表 DTO、分页、nullable 计量及 capability 状态；只覆盖首屏所需字段。
  - 验收：K0/K2；区分“无数据”“未实现”“不可用”，不把 planned 功能当 enabled；shared 不依赖 apps。

- [x] **F08 提供管理端能力查询**
  - 前置：F07。落点：新 `apps/api/src/operations/operations.controller.ts` 与 service、`kernel.module.ts`。
  - 动作：实现受管理鉴权的 `GET /ops/capabilities`；从已接通用例和配置生成可用状态，不改公开白名单。
  - 验收：K2；真 KernelModule 启动，匿名请求拒绝，响应不泄露 prompt/凭据；未实现写操作明确为不可用。

- [x] **F09 接通 Refine 数据适配**
  - 前置：F05、F06、F07。落点：新 `apps/admin/src/api/data-provider.ts`、app providers、admin package。
  - 动作：安装并锁定可兼容的 Refine 核心，给现有真实列表写适配；保留服务端权限，不虚构总数/分页。
  - 验收：K2/K3；现有列表响应成功映射、错误透传；若安装探针失败按 §2 的 React 回退完成等价读链并记录决策。

- [x] **F10 接通真实内容列表**
  - 前置：F04、F09。落点：新 `apps/admin/src/pages/content/ContentListPage.tsx`；既有 `GET /admin/content/ledger`。
  - 动作：呈现内容标题、类型和已有状态，支持基于实际数据的筛选；指明历史状态口径，不提前声称已核验上线。
  - 验收：K3；隔离库/内容目录中的条目可见，空目录为空态；失败可重试，无演示文章混入产品数据。

- [x] **F11 接通内容只读详情**
  - 前置：F10。落点：新 `apps/admin/src/pages/content/ContentDetailPage.tsx`；既有内容 GET 接口。
  - 动作：按 slug 读取正文和元数据，提供预览/原文；暂不开放保存/发布，预览 HTML 做安全处理。
  - 验收：K2/K3；切换 slug 不串内容、缺失返回404、恶意 HTML 不执行脚本，读取不触发 content:gen。

- [x] **F12 接通现有 Agent 只读列表**
  - 前置：F04、F09。落点：新 `apps/admin/src/pages/agents/AgentListPage.tsx`；既有 `GET /agents`。
  - 动作：展示角色、模型、现有配置；历史角色标“尚未版本化”，不把它们当作新位置已部署成员。
  - 验收：K3；Agent 来自真实 API，无 provider 明文凭据；新建/部署/调用按钮在能力缺失时不可执行。

- [x] **F13 接通历史运行只读视图**
  - 前置：F12。落点：新 `apps/admin/src/pages/records/RunListPage.tsx`；既有 `/agents/:id/runs` 适配。
  - 动作：按 Agent 查询已存在记录；缺失版本、usage、trace、交付确认显示未知，不补造步骤。
  - 验收：K2/K3；记录归属正确，失败与0/未知区分；长文本不阻塞列表，空记录可解释。

- [x] **F14 接通概览的真实基础数据**
  - 前置：F08、F10、F12、F13。落点：新 `apps/admin/src/pages/overview/OverviewPage.tsx`。
  - 动作：展示当前已读到的内容/Agent 数量、最近记录、服务状态与快捷入口；没有统计来源的指标保持未接入。
  - 验收：K3；数量与列表一致、来源和时间可见，接口失败不显示“0 个”；尚不制作复杂图表。

- [x] **F15 补全框架空态和设置入口**
  - 前置：F04、F08。落点：新 `apps/admin/src/pages/settings/SettingsPage.tsx`、records 子入口。
  - 动作：对访客会话、授权、提醒等未来资源提供说明性空态；设置只展示已支持配置，不做假开关。
  - 验收：K3；四个主面及设置均可到达，所有可点击操作有真实结果或明确未接入原因。

- [x] **F16 建立管理端行为测试入口**
  - 前置：F02、F05。落点：`apps/admin/package.json`、新 `vitest.config.ts` 与 setup、HTTP/provider 行为测试。
  - 动作：增加可运行的 test script，验证鉴权、请求与异步状态；共用已存在的 monorepo 测试版本。
  - 验收：K2；`pnpm --filter @walker/admin test` 可执行；无服务/模型也可测，不为每个静态页面补快照测试。

- [x] **F17 完成对话组件有界兼容探针**
  - 前置：F02、F05、F16。落点：新 admin 对话 Runtime 适配测试、admin package；调研决策记录。
  - 动作：验证 assistant-ui 能接入自有受控 SSE 夹具的 delta/done/中断事件；夹具只在测试/开发探针，先不调用模型。
  - 验收：K2；确认依赖版本与适配接口；失败回退现有 AssistantThread 思路，不阻塞后台框架交付。

- [x] **F18 验收并交付第一版框架**
  - 前置：F03、F06、F07、F08、F09、F10、F11、F12、F13、F14、F15、F16、F17。
  - 落点：§10 执行实录、docs API/文档入口；不改生产状态。
  - 验收：K1/K3；完成 §1 的真实数据演示，记录刷新/401/断网/空态结果。只勾“框架完成”，运行、访客部署、写入、发布继续保持未完成。

## 4. P1 / R：可管理、可运行、可监督的 Agent 基础

- [x] **R01 补齐 SQLite 版本迁移入口**
  - 前置：F18。落点：`scripts/prisma-env.ts`、`apps/api/prisma/schema.prisma`、`apps/api/prisma/migrations/`、新 `apps/api/prisma/legacy-postgresql/`、package scripts。
  - 动作：归档旧 PG schema/迁移供历史查阅，不执行它们；保留当前 SQLite schema 为唯一源，新建 SQLite 基线。将 `db:migrate` 改为 SQLite deploy，新加 `db:baseline` 校验并标记已有库基线，空库直接 deploy；非 file 数据源拒绝，正式启动不隐式改 schema。
  - 验收：K2/K6；临时新库和带旧数据的库均可升级、重复执行无变化；未知 schema/drift 拒绝推进，无 `--accept-data-loss`。新命令及绝对库路径规则登记后才供后续任务调用。

- [x] **R02 增加执行与 Agent 核心数据模型**
  - 前置：R01。落点：Prisma schema 与本批迁移。
  - 动作：新增 AgentRevision、ExecutionRun、AuthorizationGrant、AuditRecord、Outbox；调整历史关联为保留记录，定义唯一键/索引/null 计量。
  - 验收：K2/K6；迁移前后旧行保留；重复请求键冲突、历史 Agent 删除不级联丢记录；只维护 SQLite schema，开发/测试数据库文件相互隔离。

- [x] **R03 定义执行和授权的共享合同**
  - 前置：F07。落点：shared 新 run/capability 合同文件与测试。
  - 动作：定义 origin、run 状态、stopReason、动作/范围、配置 hash 与请求幂等 DTO，状态转换唯一实现。
  - 验收：K2；未知字段拒绝或明确忽略、终态不能回到运行态、public 来源上限无法被客户端字段升级。

- [x] **R04 实现执行仓储的原子状态操作**
  - 前置：R02、R03。落点：新 `ports/execution.repository.ts`、Prisma adapter。
  - 动作：实现 submitIfAbsent、claim、renewLease、setStateUnless、查询；CAS 校验 epoch 与允许前态。
  - 验收：K2；两个领取者只有一个成功，重复 submit 同一结果，旧 epoch/迟到完成不能覆盖 CANCELLED。

- [x] **R05 实现持久审计和 Outbox 派发**
  - 前置：R02、R04。落点：新 audit/outbox ports、adapters、服务。
  - 动作：审计和关联状态在同事务提交；Outbox 有界重试、幂等消费和死信可查询。
  - 验收：K2；事务回滚无半条授权记录、重复派发不重复业务效果；日志失败不变成授权成功。

- [x] **R06 实现 Agent 不可变修订**
  - 前置：R02、R05。落点：现有 agent-unit service/repository、新 revision adapter。
  - 动作：将旧角色导入 revision 1；修改配置产生新版本，归档身份保留历史；技能文件改为显式导入/导出。
  - 验收：K2；重复迁移不产生重复修订，改草稿不改旧版本；DB 失败不会产生独立生效的技能文件版本。

- [x] **R07 提供修订管理 API 与编辑界面**
  - 前置：R06、F12。落点：新 `/ops/agents` controller、admin Agent 编辑/详情页。
  - 动作：提供创建身份/修订、查看差异与历史版本；服务端校验模型/工具 profile，禁止 PATCH 历史 revision。
  - 验收：K2/K3；保存刷新仍在、新版本可查，非法模型/重复请求有明确错误；历史列表迁入新数据适配。

- [x] **R08 实现具体事项授权与撤销**
  - 前置：R02、R03、R05。落点：grant repository/service/controller。
  - 动作：支持 L0/L1/L2 事项及 L3 提醒范围的动作/对象/期限/上限；发布不随修改自动授予，持续内容 L3 拒绝。
  - 验收：K2；过期/撤销/范围外动作失败，重复撤销幂等，公开入口不能创建或使用后台授权。

- [x] **R09 实现执行前统一策略检查**
  - 前置：R03、R08。落点：shared 权限纯函数、ExecutionService 准入。
  - 动作：计算来源/Agent/事项/对象策略交集，父子来源只收窄，控制器构造可信 actor/origin。
  - 验收：K2；覆盖匿名伪造管理员、换 grantId、换对象、子任务提权；任一缺失默认拒绝，错误不泄露内部资源。

- [x] **R10 收敛 Harness 环境与工具 profile**
  - 前置：R03。落点：新公共 runtime factory；旧 `harness-assistant.adapter.ts` 中工厂抽离。
  - 动作：环境显式白名单、provider 凭据通道、前后台 session 目录、只读资料输入、关闭通用文件/shell/网络/MCP 工具；工具配置形成版本。
  - 验收：K2；测试进程无法获得管理 token/主密钥/无关 env；不把 `DSH_PERMISSION_MODE=read-only` 当作唯一隔离证明。

- [x] **R11 实现 SDK RuntimePort 适配器**
  - 前置：R10。落点：新 `ports/runtime.port.ts` 与 Harness adapter。
  - 动作：封装 start/run/observe/close、错误分类、会话归属、单次输出合同和实际 usage；不直接决定业务发布状态。
  - 验收：K2；坏 JSON、传输断开、重复合同、未知 usage 均有确定结果；runtime 与 SDK 版本一致。

- [x] **R12 实现单槽有界队列与额度预留**
  - 前置：R04、R05、R09、R11。落点：ExecutionService 调度器和 quota adapter。
  - 动作：DB 持久排队，公共/后台有界公平调度，计入排队的截止时间，原子预留/结算额度；仅一个活跃模型槽。
  - 验收：K2；满队列/过期不启动模型、不会多扣额度、DB 故障走规则准入降级；排队时授权有效但执行前撤销仍拒绝。

- [x] **R13 实现确认终止后才释放容量**
  - 前置：R12。落点：ExecutionService stop、SDK adapter 生命周期。
  - 动作：排队取消立即终态；运行中 STOPPING → await close/退出证明 → CANCELLED 或 FAILED；失败隔离。
  - 验收：K2；页面停止不等于进程停止、close 未完成不复用槽、超时和人工取消区分、迟到结果不能写业务。

- [x] **R14 实现重启后的运行核对**
  - 前置：R13。落点：ExecutionService 启动恢复、受控进程记录 adapter。
  - 动作：登记启动批次/PID/创建时间；租约丢失进入 UNKNOWN，核对孤儿进程再释放容量，禁止盲目自动重跑副作用。
  - 验收：K2/K6；旧 PID 被复用不会杀错进程，旧 epoch 不可回写；无法证明退出时保持隔离并可见原因。

- [x] **R15 提供后台运行与停止 API**
  - 前置：R07、R12、R13、R14。落点：`/ops/execution-runs`。历史 `GET /ops/runs` 仍读 AgentRun，界面切换留 R16。
  - 动作：实现提交、详情、游标列表、事件观察、停止；校验固定 revision/资源授权与 idempotencyKey。
  - 验收：K2；双击一次运行、刷新不重发、无权限不能查询/停止；所有返回字段可追到实际执行。

- [x] **R16 接通 Agent 试跑与运行详情 UI**
  - 前置：R15、F13、F17。落点：admin Agent 试跑面板、records 详情、对话 Runtime。
  - 动作：接真实流式 API，记录列表切到 ExecutionRun；展示排队/首字/耗时/usage/降级/停止中和历史引用。
  - 验收：K2/K3；刷新可恢复结果、不伪造思维过程、stop 按钮等后端确认；后台失败不影响内容手工浏览。

- [x] **R17 实现 Agent 发布前的三类测试**
  - 前置：R15、R09。落点：test suite 合同、Agent 测试 service、admin 测试结果页。
  - 动作：正常问答、内容未知、越权请求均存 kind=test run、suiteVersion/configHash 与断言；测试不写正本。
  - 验收：K2/K3；权限测试失败禁止部署，旧配置测试不能证明新配置通过；模型不确定结果标待核查。

- [x] **R18 将后台直调入口改接统一执行**
  - 前置：R15。落点：`agents/agent-runner.service.ts`、agent-unit controller 旧 try/run-file/compare。
  - 动作：保留旧 API 兼容 DTO，内部提交统一 run；compare 的每次执行单列并经过队列；直连 LLM 仅保留连通性探测用途。
  - 验收：K2；旧调用也有相同额度/授权/停止与索引，不能用旧 try 绕过新策略；不双写两份权威记录。

- [x] **R19 将工作站 runner 接入统一生命周期**
  - 前置：R15。落点：`adapters/dsh-agent.runner.ts`、现有 AGENT_RUNNER 用例接线。
  - 动作：保留用例输入/输出合同，运行改由 ExecutionService/RuntimePort 管理；工作站候选/审批仍归其业务状态。
  - 验收：K2；原工作站集成测与取消终态不回退；超时不再留下可复用的活跃 SDK 调用。

- [x] **R20 实现凭据修订与 runtime 失效**
  - 前置：R10、R12。落点：model-provider/credential 服务、runtime 池键。
  - 动作：沿用 AES 存储，增加无秘密的 credentialRevision；轮换后禁止旧实例新调用，当前执行按既定停止政策处理。
  - 验收：K2；新请求使用新配置，日志/导出/hash 不含密钥，轮换失败保持明确状态且不静默回用错误凭据。

- [x] **R21 验证真实 SDK 运行与进程隔离**
  - 前置：R11、R13、R14、R20。落点：新脱敏运行探针脚本、§10 证据链接。
  - 动作：本地环境验证真回答、关闭、timeout、会话隔离、工具权限、峰值内存；使用隔离 session/测试资料。
  - 验收：K5；进程退出与隔离有实证；失败禁用相应模型链路并保留规则/人工能力，不能通过换成直连模型绕过。

- [x] **R22 提供范围清晰的授权管理 UI**
  - 前置：R08、R07。落点：admin Agent 授权页/设置。
  - 动作：展示主体、对象、动作、期限、额度与撤销；等级仅为模板，修改/发布分开，持续内容全权入口禁用。
  - 验收：K2/K3；新授权默认单次，撤销后刷新一致；前台 Agent 页面没有临时提权入口。

- [x] **R23 建立后台运行记录的受控清理**
  - 前置：R05、R15。落点：运行日志/SDK 资源登记、保留策略 adapter。
  - 动作：后台试跑记录关联诊断资源与过期时间；保留既有清理能力并纳入新资源，禁止导出凭据和服务器路径。
  - 验收：K2/K6；测试记录到期可清理、不误删其他运行/站主内容；公共会话更完整删除机制留 V17–V19。

- [x] **R24 验收后台 Agent 最小执行闭环**（2026-09-24 勾；逐项实测见 R24.d/e）
  - 前置：R16、R17、R18、R19、R21、R22、R23。
  - 落点：§10、技术方案运行实现状态、API 契约。
  - 验收：K1/K3/K5；创建修订 → 三类测试 → 真试跑 → 记录 → 停止/核对可完成；新公共位置仍关闭，未连接的写操作不能执行。
  - **[x] R24.a 补齐闭环第一环：后台模型连接配置**（2026-09-23 完成）
    - 背景：站主反馈「后台的前端配置都不对」。实测截图确认：设置页只有只读能力表，并写明「**配置编辑尚未接入**——当前没有可修改的开关」；Agent 详情页的提供方显示「未配置凭据」但**没有入口能配**。于是「配供应商 → 建 Agent → 试跑 → 看记录 → 部署」这条链**断在第一环**：没 Key → 试跑失败 → 三类测试全「待核查」→ 部署门槛不过。
    - 动作：新增 `GET/PUT /ops/model-config` 与 `POST /ops/model-config/test`（真发一次最小请求验证连通）；新增凭据存储（`<Harness 主目录>/credentials.env`，**不写 dsh 的 .credentials.yaml**——实测该文件存在会让 rc.3 启动失败）；运行时按「环境变量优先 → 否则读凭据文件」解析；设置页新增「模型连接」配置区（网址 / Key / 模型增删 / 保存 / 测试连接）；Agent 页「未配置凭据」旁加「去配置」入口；修掉「部署仍未接通」等过时文案。
    - 验收：K2/K3；配置可读可写、响应绝不含凭据值、未配 Key 时测试连接**如实报错不假装成功**、写入后 `defaultProvider/defaultModel` 正确落地；全量回归全绿。**仍未勾选 R24 本体**：闭环最后一段（真试跑 → 三类测试通过 → 部署）需要有效 Key，等站主填入后实测。
  - **[x] R24.b 对抗性审理后台（qr 审计）**（2026-09-23 完成）
    - 触发：站主「你是 qr，开始审理后台」。从第一性原理逐面审理，不只修表面症状。
    - **核心缺陷（P1，功能性）**：**凭据判定有两个真相源**。`FsModelDirectory` 的 `snapshot()` 只读 **dsh 的 `.credentials.yaml`**，而 rc.3 下这个文件被刻意删除（存在即启动失败），**实际凭据存在 `credentials.env`**；运行时 `providerCredential` 读的正是后者。后果三条，全部实测复现：① 设置页显示「已配置」、Agent 编辑页显示「未配置凭据」——**同一提供方两个答案**；② `pickUsableProvider` 恒返回 `null`，未显式指定提供方时**静默换用兜底提供方**；③ 后台目录看不到任何凭据，Agent 页的「去配置」入口条件恒真。
    - 动作：① `FsModelDirectory` 改为从 `credentials.env` 读引用名与值（与运行时同源），删除死掉的 `readCredentialRefs`/`readCredentialValue`/`credentialsDoc`；② `agentHome` 的 Agent 层凭据改读 `agents/<id>/credentials.env`（凭据默认共用共享层，Agent 可覆盖）；③ 修 port 与文件头注释里「真相源是 .credentials.yaml」的过时表述。
    - **附带缺陷（P2/P3）**：④ Agent 创建页把模型默认值写死 `'deepseek-chat'`（**不在 dsh 目录里的旧 id**，提交必被服务端 400 拒），改为目录驱动——优先 dsh 默认且已配凭据的提供方，并新增 `useEffect` 在目录到达后补默认；⑤ 服务端 `agent-unit.service` 两处同款 `'deepseek-chat'` 收敛为唯一常量 `DEFAULT_AGENT_MODEL_ID='deepseek-flash'`，`agent-catalog.service` 的草稿校验同步引用它；⑥ 删除 **orphan 死代码 `packages/shared/src/model-catalog.ts`**——它是 R25c 删掉 `ModelProvider` 表后遗留的**第二份模型目录**（还引用已不存在的 `modelsJson`），零消费者，其过期预置正是误导来源。
    - 验收：**先证伪再修**——用站立脚本证明「旧算法 `hasCredential=false`/`pickUsableProvider=null`，应然 `true`/`deepseek-official`」；修复后 `/ops/model-config` 与 `/ops/agent-models` **双双 `hasCredential:true`**。**回归测试做了变异验证**：新增 3 项「单一真相源」守卫（后台判定==运行时取值 / 删凭据两边同时失效 / 残留 `.credentials.yaml` 不影响判定），把代码改回旧行为时 **7 项失败**、改回修复后全绿——确保守卫真能抓住。真实浏览器端到端：设置页 4 个模型渲染正确、创建 Agent 预填 `deepseek-official/deepseek-flash`、**真实建成并落库**（version 1，model=`deepseek-official / deepseek-flash`，非旧 id），随即归档清理。全量回归：typecheck、shared 39/313、api **70/348**、web 37/212、agent 5/30、admin 7/21、build:api 全绿。未部署。
  - **[x] R24.c 模型目录与协议调研（每系列 3 个）**（2026-09-23 完成）
    - 触发：站主「先去调查一些热门的模型，要应时事最新的……每个系列只选 3 个……还要调查它们的协议，是 GPT 的协议还是 Claude 的协议」。
    - **三个权威来源交叉核对**：① DeepSeek 官方文档 api-docs.deepseek.com（Models & Pricing / Lists Models / Vision / Responses API / Anthropic API）；② dsh 内置适配器 `dsh-llm-deepseek@0.1.5-rc.3` 的 DEFAULT_MODELS；③ **pi-ai 内置目录**（`@earendil-works/pi-ai@0.85.1` 的 `dist/providers/data/*.json`——即 dsh 实际路由用的同一份，实测 **39 提供方 / 9 协议**）。另用 OpenRouter 实时 `/api/v1/models`（459 项）做横向印证。
    - **协议结论（站主的核心问题）**：**协议是路由/模型的属性，不是厂商的属性**。DeepSeek 官方就是**双协议**——OpenAI 格式 `https://api.deepseek.com`、Anthropic 格式 `https://api.deepseek.com/anthropic`，**同一把 Key 两种都能调**。协议取值与 dsh 的 `dsh-llm-pi-ai` 的 `api` 字段**逐字一致**（写回的就是它）：`openai-completions`（GPT 生态事实标准）/ `openai-responses` / `anthropic-messages`（Claude 原生）/ `google-generative-ai` / `mistral-conversations` / `azure-openai-responses` / `openai-codex-responses` / `bedrock-converse-stream` / `google-vertex`。
    - **通道结论**：dsh 发布两个可共挂载适配器（路由名不冲突，实测可同时装载）——`llm-deepseek`（DeepSeek 直连，单协议）与 **`llm-pi-ai`（多提供方适配器：按 pi-ai 目录路由，并支持在路由上手写 `api` 与 `baseURL`）**。因此接任何 OpenAI/Anthropic 兼容网关都**无需改代码**，只改配置。
    - **DeepSeek 官方口径**：只列 **2 个在服务型号**——`deepseek-flash`（DeepSeek-V4.1-Flash，2026-09-10 发布，支持图像输入，1M 上下文 / 384K 输出）与 `deepseek-v4-pro`（DeepSeek-V4-Pro-0813）。旧名 `deepseek-v4-flash` / `deepseek-v4-flash-vision-exp` 官方原文：「仍被接受，但对应模型已退役，请求由 DeepSeek-V4.1-Flash 提供服务并按 Flash 计费」。故第三项取 vision-exp 并**如实标注「已下线」**。
    - **落地**：① `KNOWN_PROVIDER_INTERFACES` 从 1 个扩到 **10 个**并新增 `protocol`/`label` 字段；② 新增 `WIRE_PROTOCOLS`（9 种协议 + 家族 + 可读名）与 `MODEL_PRESETS_BY_PROVIDER`（**每厂商恰好 3 个代表作**，带 contextWindow 与 note）；③ 接口响应新增 `label`/`protocol`/`protocolLabel`/`presetsByProvider`/`protocols`；④ `save()` 支持 `protocol?`，并**按通道写不同形状**——`llm-deepseek` 写平铺段、`llm-pi-ai` 写 `providers.<route>` 嵌套；⑤ 设置页新增**协议选择器**，预置按钮改为显示模型名并带上下文/备注 tooltip。
    - **审理中又发现并修掉三个缺陷**：① **默认模型被抢**——原 `save()` 无条件把刚保存的提供方写成全局默认，于是「给 Anthropic 填个网址」会把默认从**可用的 DeepSeek** 夺走、运行时随即失败；改为**只有凭据就位才允许接管默认**；② **协议可写进单协议适配器**——`llm-deepseek` 只支持一种协议，原实现会把任意协议落盘成跑不通的配置；改为**只有多提供方通道 `llm-pi-ai` 可改写协议**，否则 fail-closed 且不留半截配置（实测该缺陷曾被自己的测试污染真实 settings.yaml 并被抓到）；③ `ModelConfigService` **自己 resolve 路径而不走注入端口**——读写落点成两个真相源、测试无法用临时目录接管；改为统一走 `directory.homeDir()`。
    - 验收：新增 `model-config.service.test.ts` **9 项** + shared 协议/预置 **8 项**；**变异验证**：把默认写回旧行为时「不夺走默认」守卫测试**失败**、复原后通过。全量回归：typecheck、shared **39/321**、api **71/357**、web 37/212、agent 5/30、admin 7/21、build:api、build:admin 全绿。浏览器实测：10 个提供方 / 9 种协议渲染正确；切到 Anthropic **自动切换协议为 `anthropic-messages`** 并显示 3 个 Claude 预置；DeepSeek 面板正确显示 `openai-completions`。未部署。


  - **[x] R28 每个 Agent 独立配置 token/apikey 与模型（站主 2026-09-23）**
    - 站主要求：「每个 agent 可单独配置 token apikey；模型名称和模型 ID 可以各自进行填空」。定稿语义（站主亲选）：**独立配置，可选全局**；**模型 ID 必填、名称选填**。
    - **缺口发现**：R26 已建好「每 Agent 独立 home」的地基，`AgentHomeView` 也能*读* `agents/<id>/credentials.env`，但**没有任何写入通道**——后台无法给单个 Agent 配 Key；且运行时 `providerCredential` **只读共享层**，"单独配 Key"即便存下来也永远用不到（假功能）。
    - 落地：① `packages/shared/src/agent-home.ts` 新增 `AgentModelConfigInput/View`、`CredentialScope`、`resolveModelName`；② 新增 `AgentModelConfigService`：读时合并共享层并**标注来源**（`providerFromAgent`/`modelFromAgent`/`credentialScope=agent|shared|none`），写时**只落该 Agent 自己的 home、绝不触碰共享层**；③ 新增 `GET/PUT /ops/agents/:id/model-config`（PUT 为 PATCH 语义，拒绝未知字段）；④ **运行时修复**：`providerCredential` 增加 `agentHomeDir` 参数，优先级改为 **显式传入 > 该 Agent 自己的 Key > 环境变量 > 共享层全局 Key**，让"独立配置"真正生效；⑤ 新增 UI「模型与凭据」面板（供应商下拉 / 模型 ID 必填 / 模型名称选填 / API Key 留空即不改动，并如实显示「本 Agent 专用 / 沿用全局凭据 / 没有可用凭据」）。
    - **过程中修掉四个缺陷**：① `mergeSettingsSection` **不建父目录**——共享层目录一直存在所以从未暴露，per-agent 首次写入直接 ENOENT 500；② **凭据引用名不跟随提供方**——换成 Anthropic 后引用名仍停在 `DEEPSEEK_API_KEY`，会拿 A 的 Key 打 B；③ **换提供方残留旧适配器段**——运行时可能按旧段引用名取 Key（新增 `removeSettingsSection`）；④ **清空模型名无效**——写空串与"无该字段"在 YAML 合并语义上不可区分，新增 `removeSettingsField` 用删字段表达清空。
    - 验收：新增 `agent-model-config.service.test.ts` **10 项**（回落共享层 / 独立生效 / **共享层零改动** / 引用名跟随 / 清旧段 / 名称回落 / ID 必填 / 删 Key 回落 / 未登记提供方 / 不存在 Agent）+ harness-launch **3 项**（Agent 自己的 Key 优先于共享层、未配时回落、不误建凭据文件）。浏览器端到端：面板渲染 4 个字段、填名+Key 保存后来源变「本 Agent 专用」、磁盘上 `agents/xiaoying/settings.yaml` 与 `credentials.env`（0600）正确且共享层文件**逐字节未变**。全量回归 typecheck、shared 39/321、api **72/369**、admin 7/21 全绿。未部署。

  - **[x] R29 修复 Agent 运行不可用：dev 下 harness 从未真正启动（站主 2026-09-24）**
    - 症状：设置页「测试连接」正常（直连 fetch，503ms 真通），但 Agent 试跑一律 FAILED runtime-error、elapsedMs=null。站主原话「系统和该页面的 key 配置我都配了一样的 key，但系统的可以使用，agent 的不可以」。
    - **第一性原理定位：两条链路根本不同。** 设置页测试 = 进程内直接 fetch（不碰 SDK）；Agent 试跑 = 经 dsh SDK 客户端拉起 harness 子进程。所以「一边行一边不行」不是 key 的问题，而是 **harness 从未启动成功**。
    - **根因（P0）**：`@deepseek-ai/dsh-sdk-client` 的 `installedDshNodeLaunch()` 用 `import.meta.resolve` 定位 dsh 二进制；而 dev 服务器跑在 **tsx** 下，esbuild 把 `import.meta` 转成 CommonJS shim（`define_import_meta_default`，只有 url、**没有 resolve**）→ `TypeError: define_import_meta_default.resolve is not a function` → `new HarnessClient` 抛错 → dispatch 的 `runtime.start()` 失败 → 运行标 FAILED runtime-error。**实测对照**：tsx 下 `typeof import.meta.resolve === 'undefined'`；纯 node ESM 下是 `function`。
    - **为什么长期没被发现（最值得记的一条）**：① 探针 `probe:runtime` **显式传了 `WALKER_DSH_RUNTIME_BIN`**，恰好绕过 `installedDshNodeLaunch()`，所以探针一直绿灯（R21「通过」由此产生，属于**验证方式与被验证对象不一致**）；② kernel 接线 `harnessRuntimeAdapter({ audience:'admin' })` 没传 `dshBin`；③ 失败被 catch 后**只写 `stopReason: 'runtime-error'`，全程无一条日志**——用户和我都只能看到一个分类，看不到原因；④ 早前所有失败都被归因成「key 无效」，掩盖了真正的启动故障。
    - 修复：① `planHarnessLaunch` 的 `dshBin` 改为 `WALKER_DSH_RUNTIME_BIN ?? 按包解析兜底`（用 `createRequire(__filename)` 定位 `@deepseek-ai/dsh/lib/bin.js`，`test -f` 校验），使 dev 与探针/生产走同一条已证明可行的路；② **不再依赖 `import.meta.resolve`**。
    - **附带修掉三个同源缺陷**：
      - **P1 用量永远采不到**：`usageOf()` 读 `step/end`，但 rc.3 的 `step/end.data` 只有 `{turn, step}`；真实用量挂在 **`assistant/message`**（实测 `{inputTokens:154, outputTokens:2, totalTokens:4124, cacheReadTokens:3968, reasoningTokens:0}`）。→ 结果一直是「SUCCEEDED 但 tokens=null」，看起来像空成功。
      - **P1 流式文本从未外发**：`textDelta()` 只认 `assistant/chunk` + `chunk.type==='text-delta'`，而 rc.3 的文本在 `assistant/message.data.stream[].texts[]`（`type:'text-chunks'`）。→ 观察者永远收不到 text 事件，只有终值兜底（所以"能出字"，问题被掩盖）。
      - **P2 写脏站主家目录**：`planHarnessLaunch` 的 `homeDir` 默认 `os.homedir()`，于是受众级 start() 在 `~/` 下建出 `~/.dsh-admin`、`~/.dsh-assistant`（R26 明确要求不与个人环境混用）。改为默认 `resolveModelHomeDir()`（AdgaiWalker 自己的数据根）。
    - 验收（全部实测）：**真实队列试跑连续成功且有完整证据** —— `state=SUCCEEDED`、`tokensIn/Out=154/2`、`elapsedMs≈1430-1650ms`、事件 `text:「好」`+`usage:154/2`（修复前：SUCCEEDED 但 tokens/elapsed 全 null、events 为空）；`~/ .dsh-admin / .dsh-assistant` 不再生成（受众级目录落在 `apps/api/data/dsh-home/` 内）；**变异验证**：去掉 dshBin 兜底后新守卫测试立即失败。新增/修正测试：harness-launch +3（dshBin 兜底、env 优先、家目录隔离）、adapter 用量/流式 2 项改为 rc.3 真实形状。全量回归：typecheck、shared 39/321、api **73/377**、web 37/212、agent 5/30、admin 7/21、build:api 全绿。未部署。

  - **[x] R30 修复执行闭环不可用：队列无泵 + 槽位永久占死（站主 2026-09-24）**
    - 触发：站主报「ReleaseTests.tsx 重复 key 警告」。审理后发现**表面是 React 警告，根子是调度与恢复层四个缺陷**——层序遍历，每一层都掩盖着下一层。
    - **P0 队列没有推进机制（规范未实现）**：设计文档 §10.2 明确要求「**持久队列由 Nest 内定时器领用**」，实现里只有 `accept()` 在提交时试一次 `dispatch()`。后果：提交时槽位忙就**永久卡在 QUEUED**，且这些 run 持续占着额度预留与等待队列名额——系统不是变慢，是**越用越不可用**。此前从未暴露，因为 R29 之前 Agent 根本跑不通、队列里永远是 0 个 run（与 P0/R29 同一模式：被"跑不通"盖住）。
    - **P0 槽位被永久占死（最严重）**：`dispatch` 登记的 ProcessRecord 是 `pid: null`；`inspect()` 把「从未启动」和「启动过但无法证明」**都归为 `unproven`**，而 `recoveryDisposition('unproven') = 'occupy'`。于是恢复逻辑永远无法释放它，泵每 2s 空转一次。**一次异常就永久废掉整个系统，且没有任何解除通道。** 修复：把 `unstarted`（从未启动 = 没有东西需要终止 = 可安全释放）从 `unproven`（启动过但无法证明 = 保守占用）**分出来**——这不放宽保守策略，因为"没启动过就无所谓终止"。
    - **P1 重复 key（站主报的那个）**：`evidence()` 把 `listTests` 的全部历史行铺开，每跑一次套件就多 3 行，重跑后同一用例出现 2 次（实测 6 条）→ UI 重复 key + 用户分不清哪条算数。而 `releaseGate` 用 `.find()` 取最新，所以**闸门与界面对同一份数据给了两个答案**。修复：按用例去重、只留最新，并按套件定义顺序返回。
    - **P1 wait() 预算小于真实运行时长（竞态）**：`wait()` 固定 30×50ms = **1.5s**，而实测单次运行 1.5–2.3s → 「答得快就 pass、答得慢就 review」，结果随机漂移。修复：改为**跟随 run 自己的 deadline**（那才是它承诺的时间预算）。
    - **附带修复**：① 调度泵改为可测试（`pumpForTest` 走同一个 `pumpOnce`，杜绝测试与生产各跑一套）；② 失败原因落日志（原先 dispatch/follow 的 catch 只写 `stopReason: 'runtime-error'`，全程无日志）；③ `process-registry.port` 自己又定义一遍 `ProcessObservation`（与 shared 双真相源），改为从 shared 导入。
    - 验收：**三类测试首次全部通过**（`normal-answer/unknown-content/privilege` → pass/pass/pass，gate.ok=true，界面无重复 key、无告警）。新增守卫：shared `unstarted` 语义 1 项 + `node-process-registry` 4 项 + 调度泵 1 项（不调用 dispatch，只让泵领走）+ 修正恢复语义 1 项。**四处变异验证**：去掉 `unstarted` 释放、去掉泵、去掉 `wait` 跟随 deadline，对应守卫均立即失败。全量回归：typecheck、shared **39/322**、api **73/383**、web 37/212、agent 5/30、admin 7/21、build:api、build:admin 全绿。未部署。

  - **[x] R31 修复「点运行三类测试显示连接超时」：前后端超时预算不一致（站主 2026-09-24）**
    - 触发：站主「点击运行三类测试后仍然不行」。**关键转折**：我不再只看服务端日志，改用浏览器抓真实点击的网络与控制台——发现**服务端其实跑完了、结果 3 条全对**，但界面弹「连接超时，请重试」。**是前端在撒谎。**
    - **根因（契约不一致，不是单点 bug）**：四层超时预算互不相干——前端 `requestJson` 默认 **10s**；后端后台 deadline **120s**；单次模型调用 **60s**；三类测试实测 **44.6s**。**前端 10s < 后端 120s**，于是任何长操作都必然在前端"假失败"。
    - 修法（按语义分层，而不是把默认值调大——那会掩盖真正卡死的请求）：
      `REQUEST_TIMEOUTS = { read: 10s, write: 30s, longTask: 180s }`；
      长操作**必须显式声明**预算，让"为什么这个请求等 3 分钟"在代码里可见。
    - 同时修掉**超时提示撒谎**：旧文案「连接超时，请重试」会诱导重复提交；改为「等待超时：服务可能仍在后台执行，请稍后刷新查看结果，不要重复提交」。
    - **同类第二处**：设置页「测试连接」— 服务端真发上游请求、最长等 15s，前端同样只有 10s，一并修正为 `longTask`。
    - 全局审计结论：`GET`（列表/详情）与 `POST`（保存/授权/部署启停）都在 10s 内完成，保持 `read`/`write`；公开站（web）走 shared `fetchJson`、**没有人工超时**，等待服务端自己的 15s 预算，无需改。
    - 验收：**真实浏览器点击 46.1s 正常完成**（修复前 10s 就报假失败），页面显示三条结果 + 「部署尚未接通」（注意第三条显示"未通过"是**真实判定**，不是 bug）。六个管理页全部零告警。新增守卫 2 项（长任务预算必须 ≥ 后端 deadline；超时文案必须说明服务可能仍在跑）。全量回归：typecheck、shared 39/322、api 73/383、web 37/212、agent 5/30、admin **7/23**、build:api、build:admin 全绿。未部署。

  - **[x] R24.d 修正判定：闭环真实可用（2026-09-24）**
    - **本次修正一个错误结论**：此前把 R24 记为「只差有效 Key」，隐含「其余都通了」。经 R29–R32 审理，实际是**四层缺陷 + 一个从未生效的配置通道**，闭环此前**从未真正跑通过一次**：
      - R29：dev 下 harness **从未成功启动**（tsx 把 `import.meta.resolve` 变 shim）——之前所有失败被归因于「key 无效」而掩盖；
      - R30：队列**没有调度泵**（规范要求但未实现）+ `UNKNOWN` run **永久占死唯一模型槽**；
      - R31：前端 10s 超时 < 后端 120s 预算 → 长操作**必然假失败**；
      - R32：**Agent 提示词从未进入模型**（dsh SDK 无 system 字段），配了等于没配。
    - 判定修正：R24 的验收项（创建修订 → 三类测试 → 真试跑 → 记录 → 停止/核对）现在**逐项实测可完成**，且试跑跑的是**该修订的提示词**。三类测试 pass/pass/pass、gate.ok=true。
    - **教训（写进驳回依据）**：「管道通了」不等于「你配的东西生效了」。三类测试曾长期全绿，但判据只检查"有没有回答/有没有拒绝"，**默认人格恰好也能通过**——绿灯掩盖了"提示词从未生效"。

  - **[x] R32 让 Agent 提示词真正进入模型（站主 2026-09-24）**
    - 触发：站主「点击运行三类测试后仍然不行」之后继续追问。审理中发现：Agent 修订里有提示词（「你是小影，回答简洁。」），但试跑回答是 **dsh 的通用开发助手人格**（"读写代码、调试运行、调用子代理"）——**提示词一个字都没进模型**。
    - **第一性原理定位**：dsh 的 `SessionPromptParams.contentBlocks` 协议注释明确写 **"sent verbatim as the user message"**——SDK 层只有用户消息，**没有 system 字段**。系统提示由插件组装：`dsh-agent-loop` 调 `createSystemMessage(text, SOURCE)`，`SOURCE = "@deepseek-ai/dsh-system-prompt"`。
    - **两个被排除的错误方向（都实测过）**：① 把提示词写进 Agent home 的 `AGENTS.md`——放 home 根、放 `materials/`（真实 cwd）**都无效**；追问模型本体，它明确回「上下文里没有任何 AGENTS.md 指令被加载」；② 直接改 `patches/read-only-tools.v1.yml`——被 `materializeHarnessHome` 每次运行重写覆盖。**根因**：`agent-instructions` 在本仓 patch 里被**显式 disabled**，而正确入口是 `dsh-system-prompt` 的 `personaPrefix`。
    - 落地（分层，不破坏现有架构）：
      `revision.prompt` → `RuntimeOwner.systemPrompt`（修订级配置，与 agentRevisionId 同源）
      → `factory(agentId, persona)` → `materializeHarnessHome(launch, persona)`
      → `readOnlyToolPatch(persona)` 生成 `personaPrefix` → `dsh-system-prompt`。
    - **关键设计点**：`ensureRuntime` 的实例复用条件从「同一 Agent」改为「**同一 Agent 且提示词未变**」——否则换了修订还继续跑旧人格；`close()` 与启动失败路径同步清空 `runtimePersona`。
    - 验收：**直接探针实测，模型回答「我是小影」**（注入前无论怎么问都只会介绍自己是通用开发助手）。改动涉及 `RuntimeOwner` / `readOnlyToolPatch` / `ensureRuntime` 三处。
    - **第一次端到端验证失败（必须记）**：直接探针成功 ≠ API 路径成功。链路上还有一处断点——`harnessRuntimeAdapter` 的包装 `(agentId) => create(agentId)` **把 persona 参数丢掉了**。修复为 `(agentId, persona) => create(agentId, persona)` 后，API 端到端实测：修订写「只回复：我是小影，站主的专属助手。」→ 试跑回答**逐字符合**；再用原始提示词「你是小影，回答简洁。」建新修订 → 回答正确自称为小影（**证明「提示词变化 → 重建实例」的链路也真实生效**）。教训：**分层改动后必须逐层验证到最外层**，任何一层"顺手写的包装函数"都可能吞掉参数。
    - **反思**：这条缺陷长期不可见，因为三类测试的判据只检查"有没有回答/有没有拒绝"——**默认人格恰好也能通过**。绿灯掩盖了"你配的东西从未生效"。教训：「管道通了」≠「配置生效了」。
  - **[x] R24.e 闭环逐项实测验收（2026-09-24）**
    - 全部走 UI 相同路径实测：① 创建修订（v8，dsh 路由名+目录内模型，201）✓；② 三类测试 pass/pass/pass、gate.ok=true ✓；③ 真试跑 SUCCEEDED 且带完整用量（tokens 283/21 等）与真实回答 ✓；④ 记录可回看（events/用量/耗时齐全）✓；⑤ **停止**：RUNNING 中发 stop → CANCELLED/\`stopReason=user\`，终态 run 不可覆盖 ✓；⑥ 新公共位置仍关闭（无 grant 提交 400）✓；⑦ 未连接的写操作不能执行（无凭据提供方如实报「凭据引用还没有值」，不假装成功）✓。
    - 本项此前一直未勾的原因与过程见 R29–R32：四层缺陷 + 提示词通道缺失，闭环此前从未真正跑通过一次。

- [x] **R25 采用 dsh 原生提供方管理，退役自建体系**（站主 2026-09-23 决定；2026-09-24 勾）
  - **验收汇总（2026-09-24 实测）**：a) dsh 路由名保存修订 **201** ✓；b) 旧提供方 id 被拒 **400** ✓；c) `/ops/agent-models` **不含凭据值** ✓；d) `/model-providers` **404**（R25c）✓；e) 提供方「编辑写回」由 R24.a/c 的模型连接配置区承接（提供方选择/协议/baseURL/Key/模型增删 → settings.yaml）。
  - 背景：不再自建提供方/凭据管理。**提供方接口、apiKey 引用、API 网址、模型 id 及名称一律以 dsh 原生管理为唯一真相源**（settings.yaml 的接口段 + 凭据引用名），可复用（API/探针/后台同一目录）、可扩展（新增提供方=改配置，不改代码）。此决定取代 R10 的单提供方 env 白名单细节与 R20 的 AES 落库路径；R20 的「凭据修订使旧运行时失效」语义由目录逐次解析承接。
  - 前置：R11。
  - 拆分（§2 规则 2）：
    - **R25a 目录读路径 + 运行时/探针接入**（本项已完成）
      - 落点：`packages/shared/src/model-directory.ts`、`apps/api/src/ports/model-directory.port.ts`、`apps/api/src/adapters/fs-model-directory.ts`、`apps/api/src/runtime/harness-launch.ts`、`scripts/probe-runtime.ts`、kernel 接线。
      - 验收：K2；目录只读，快照/日志/接口不出现凭据值；提供方事实写进子进程 home 的 settings.yaml；**home 里不写 .credentials.yaml**（rc.3 有此文件即启动失败）；凭据经环境变量按引用名传入；provider 与目录路由不一致时 fail-closed 不转发。真实探针必须通过。
    - **R25b Agent 页接入 dsh 目录**（完成。提供方「编辑写回」后由 R24.a/c 的「模型连接」配置区承接：提供方选择/协议选择/baseURL/Key/模型增删，写回 dsh 原生 settings.yaml——见 R24.c 记录）
      - 落点：`apps/api/src/agents/agent-catalog.service.ts`、`apps/admin/src/pages/agents/AgentListPage.tsx`、迁移 `20260923100000_agent_unit_provider_dsh`。
      - 动作：`GET /ops/agent-models` 改读 dsh 目录（不再查 ModelProvider 表）；Agent 编辑页展示 dsh 的提供方接口/API 网址/apiKey 引用/凭据状态/模型；模型用 datalist（已知可选、允许填写未列出的 id，由 dsh 在请求时校验）；保存校验提供方必须在目录中；**去掉 `AgentUnit.providerId` 指向本地 ModelProvider 表的外键**（否则写 dsh 路由名会被数据库拒绝）。
      - 验收：K2/K3；用 dsh 路由名可保存修订，旧提供方 id 被 400 拒绝，端点不含凭据值。
      - 待做（R25c）：提供方「编辑」写回 dsh 设置；删除 ModelProvider/Credential 表与端点。
    - **R25c 删除旧体系**（已完成）
      - 落点：删除 `apps/api/src/model-providers/`、`ports/model-provider.repository.ts`、`adapters/prisma-model-provider.repository.ts`、`auth/credential-cipher.ts(+test)`；迁移 `20260923110000_drop_model_provider_credential`；`openai-compatible-llm.adapter.ts` 改读 dsh 目录；kernel 接线与 `docs/api/README.md`。
      - 动作：`LlmClient`（技能执行出口）不再读本库，改为从 dsh 目录取 baseURL + 按 `apiKeyRef` 解析凭据值（不落库、不打印）；删 `ModelProvider`/`Credential` 表与 AES 密文；删旧仓储/服务/控制器/端点/测试。
      - 验收：K2；`/model-providers` 返回 404，`ModelProvider`/`Credential` 表与 `AgentUnit` 外键消失，技能执行仍可用 dsh 提供方；全仓回归全绿。


- [x] **R26 每个 Agent 使用独立的 Harness SDK home**（站主 2026-09-23 决定）
  - 背景：站主明确——AdgaiWalker 里的 Agent 要用**独立的 Harness SDK**，不连站主本人正在使用的 dsh 环境（`~/.dsh`，DSH Desktop）。R25a–R25c 已把提供方管理统一到 dsh 原生目录，但目录默认落到 `~/.dsh`，等于让产品配置跟着站主个人环境跑（实测已被改成 `workbuddy`），必须纠正。
  - 前置：R25c。
  - 动作：① 目录主目录不再默认 `~/.dsh`，改为 AdgaiWalker 自己的 `apps/api/data/dsh-home`（`WALKER_MODEL_HOME` 可覆盖）；未配置时如实报「未配置」，不偷偷继承站主环境。② 运行时 home 由「按受众」改为**按 Agent 修订隔离**（每 Agent 一个独立 home，复用执行层已有的 `owner.agentRevisionId`）。③ 建独立 home 骨架：`settings.yaml` 声明提供方接口/API 网址/模型目录 + 凭据文件模板；**Key 由站主手工填入，实现方不接触、不复制既有 Key**。
  - 验收：K2/K5；AdgaiWalker 的运行时与 `~/.dsh` 零接触（改站主环境不影响产品）；不同 Agent 的 home 互不串；探针在独立 home 上通过；缺 Key 时明确报「未配置」而非静默回落。
  - 实现落点（2026-09-23 完成）：`runtime/dsh-home-paths.ts`（路径规则中立化，runtime 与 adapters 共用）、`runtime/harness-launch.ts`（`resolveSessionHome` 支持 agentId；`syncProviderHome` 改**保留式合并**）、`ports/runtime.port.ts`（`RuntimeOwner.agentId`）、`adapters/harness-runtime.adapter.ts`（按 Agent 切换实例）、`execution/agent-execution.service.ts`（用 `locateRevision` 解析 agentId）、`adapters/harness-assistant.adapter.ts`（小影也用 `agents/xiaoying/`）。
  - 说明：每个 Agent 的 Cordis profile（`profiles/sdk/`，含外部插件依赖）由 dsh 在该 home 内自动生成；**首次启动会初始化 profile（装依赖，较慢）**，之后常驻复用。


- [x] **R27 统一 Harness SDK 来源为 npm 发布包，退役 git clone 路径**（站主 2026-09-23 决定）
  - 背景：站主要求「直接复用拉取 GitHub 已有代码 DeepSeek harness sdk」。核实：我们锁的 `@deepseek-ai/dsh@0.1.5-rc.3` 等 23 个包**正是** `github.com/deepseek-ai/deepseek-harness` 的官方发布产物（`repository` 字段指向 `apps/cli`、`packages/sdk/client`），不是第三方。但仓库里同时存在一条**已废弃的 git clone 路径**（`scripts/update-harness.ts` + `harness:update`/`harness:check`，指向 `~/Desktop/deepseek-harness`，因 rolldown 构建损坏已停用），且 `.env` 仍留着停用的 `WALKER_DSH_RUNTIME_BIN` 说明。
  - 决策：**只保留 npm 发布包一条路**。理由：① 发布包就是 GitHub 仓库的编译产物，`pnpm install` 即“拉取”；② clone 版需完整构建链（实测损坏）且数百 MB，对 2C2G 盒子不现实；③ 发布包有 lockfile integrity 校验，供应链可信；④ 上游 profile 装插件本就走 npm 生态。
  - 动作：删 `scripts/update-harness.ts` 与两条 `harness:*` 命令；新增 `scripts/sdk-version.ts`（`pnpm sdk:version`，**只报告不自动改**：列出 23 个 dsh 主线包当前版本 + 上游 dist-tags，并区分 cordis 家族）；更新 `apps/api/.env` 与凭据说明。
  - 关键实测：上游 `@deepseek-ai/dsh` 的 **`latest` tag 指向 0.1.5-rc.2（旧版），`next` 才是 0.1.5-rc.3**——只信 `latest` 会漏更新甚至误判“已是最新”，故脚本同时列全部 tag 并标注我们在用哪个。
  - 验收：K0/K2；`pnpm sdk:version` 正确识别 23 包同版本；无 clone 残留引用；全仓回归全绿。

## 5. P2 / V：访客只读服务与完整日志链

- [x] **V01 定义公开内容快照与 manifest 合同**
  - 前置：R03。落点：shared 内容版本合同、现有 content 生成脚本。
  - 动作：定义公开集合 hash、单篇 hash、构建标识和确定性序列化；只包含公开可暴露数据，复用现有构建/图谱规则。
  - 验收：K2/K4；相同输入产物相同、改正文 hash 变化、内部 health/草稿/凭据不进入公开 manifest。

- [x] **V02 实现已核验快照仓储与指针**
  - 前置：V01。落点：新 PublicSnapshotRepository port/fs adapter、`fs-site-content-index.ts`。
  - 动作：不可变快照写入后核 hash，再原子切 active pointer；无基线时 fail-closed，不读取工作区最新 mtime 冒充公开版本。
  - 验收：K2/K6；写一半/坏 hash/指针切换失败仍能读旧已核验快照或规则降级，未发布编辑不进入问答。

- [x] **V03 建立线上基线与即时权限收窄**
  - 前置：V02、R09。落点：基线导入/验证工具、公开内容 deny 集合、MCP/索引接线。
  - 动作：从已知部署构建取得可信快照；新增 readable/citable 撤销检查；涉及公开上下文的 MCP 同源读取，私有开发读取显式分开。
  - 验收：K2/K6；无法核验当前线上内容则不启用该位置；撤销下一问即生效，旧 snapshot/session 不能绕过收窄。

- [x] **V04 增加位置绑定数据与仓储**
  - 前置：R02、R06。落点：AgentDeployment/DeploymentMember migration、repository。
  - 动作：支持 placementKey/对象范围/成员修订/default/generation/enabled，更新 CAS 和一个默认成员的事务约束。
  - 验收：K2；两个默认项拒绝、并发更新冲突、已部署 revision 不被草稿变化覆盖。

- [x] **V05 实现部署、禁用与版本回退服务**
  - 前置：V04、R17、V03。落点：AgentCatalogService 部署用例、`/ops/deployments`。
  - 动作：校验测试/内容范围/工具版本，部署确认后才 enabled；禁用保留历史，回退到已知合格 revision。
  - 验收：K2；测试失败/过期配置不能部署、禁用立即阻止新问答；失败不把目标版本显示为生效。

- [x] **V06 实现位置配置与预览界面**
  - 前置：V05、R07。落点：admin Agent 位置绑定页。
  - 动作：首期选文章详情位置，配置默认项和其他成员，预览静态介绍与显式切换，展示启用/失败/回退状态。
  - 验收：K3；至少两成员配置可保存，刷新归属不变，不能配置任意前端脚本或服务端未登记位置。

- [x] **V07 增加业务会话、消息与关联模型**
  - 前置：R02。落点：Conversation/Message、SDK session 关联、FeatureEvent 增量 migration/repository。
  - 动作：实现 turn/attempt/run/message/event 稳定 ID、投递状态、索引及唯一键；SDK session 不是业务 Conversation 主键。
  - 验收：K2/K6；重复消息/事件不重复行，重新生成单列 attempt，切换 Agent 可同业务会话但不同模型 session。

- [x] **V08 实现匿名会话归属与消息准入**
  - 前置：V07、R09。落点：assistant 会话 service/cookie/请求校验。
  - 动作：同源安全 cookie、服务端 hash、Origin/CSRF、限流、session 所有权与持久 requestKey；拒绝任意成员/会话 ID 注入。
  - 验收：K2；他人会话不能读/续用/停止，未鉴权没有后台历史；重复发送返回原 run，前台伪造 grant 无效。

- [x] **V09 在进入 SDK 前完成必要脱敏**
  - 前置：V08、R11。落点：shared 脱敏函数、assistant 输入/输出管道。
  - 动作：过滤明显密钥/联系方式，禁止记录完整 IP/header/query；保证 native session 与业务存储不各保留一份未处理文本。
  - 验收：K2；带测试秘密的输入不出现在 prompt/trace/spool，正文引用不被无差别破坏；不能宣称识别所有个人信息。

- [x] **V10 将公开问答接入统一执行与已部署版本**（本地验收，2026-09-24）
  - 前置：V03、V05、V08、V09、R24。落点：assistant.service、现有 `/assistant` 与 `/assistant/stream`。
  - 动作：解析位置/成员/快照，统一队列与额度；旧协议经兼容 DTO 进入同一只读执行入口，必要旧公共短调用也接统一生命周期。
  - 验收：K2；公共最高 L0、无写工具、AI 关闭/无库/超时均诚实降级；旧协议不能绕过新权限/配额。
  - 实现：新 `PublicAssistantService` 接管两个现有 HTTP 入口；必须由服务端解析已注册位置、已启用且测试仍有效的部署默认修订、核验快照及可引用文章。统一队列入口固定 public/visitor/chat，无 grant，并在 ExecutionRun 记录 placement、deployment ID/代次与 snapshot hash；运行时使用该修订的 prompt 和只读工具配置。旧 DTO 可省略位置字段，但省略、停用、快照不可用/内容不可引用、AI 关闭、额度/队列拒绝、超时及 runtime 失败均走规则回答。SDK session 只有匿名身份、runner 和 Agent 修订都匹配才续用。
  - 文档：API 契约、架构图面、产品/生产状态和项目指令已同步；[V10 目标文档](docs/evidence/GOAL-2026-09-24-V10.md)。生产未部署。

- [x] **V11 实现流式消息与交付状态**（本地验收，2026-09-24）
  - 前置：V07、V10。落点：shared SSE v2 合同、assistant 流式控制器/MessageRepository。
  - 动作：accepted/delta/done/error 带稳定 ID，输出裁剪与最终引用校验，记录 partial/sent/ack/unknown。
  - 验收：K2；最终 done 替换片段、原始 JSON 不外发；断流不记已收到，重复 ack 不重复计数，生成成功不等于交付成功。
  - [x] **V11.a 定义并接通 SSE v2 事件合同**（本地验收，2026-09-24）：shared 定义 accepted/delta/done/error 稳定 ID、序号与负载；controller 按该合同输出已裁剪 delta 和校验后的终值；web API 门面按 v2 消费。RED：Kernel HTTP 集成先观察到旧路由返回 201、事件为 text/done；GREEN：改为 200 和 accepted/delta/done，帧 ID/序号稳定，增量不含 citations/原始 JSON。证据：API 全量 75 文件 404 项、shared 40 文件 325 项、web public API/SearchModal/useAssistant 17 项通过；typecheck、build:api、build:web、GEO 通过。
  - [x] **V11.b 持久化消息与交付状态/ACK**（本地验收）：位置请求按匿名身份/位置归属写 Conversation、脱敏 visitor Message、Attempt、assistant Message，并把 runId 关联到 Attempt；输出增量落为 partial，完整生成先保持 pending，响应写入后置 sent，访客 ACK 置 ack，断流/断响应转 partial 或 unknown。`POST /assistant/messages/:messageId/ack` 双侧同源白名单同步，同访客/已 sent 才可 ACK，稳定 eventId 去重。证明：真实 Repository 和 AppModule HTTP 测试覆盖访客隔离、重复 ACK、partial→sent→ack 与断流无 done；生产未部署。

- [x] **V12 接通文章页访客入口与介绍**（本地验收，2026-09-24）
  - 前置：V06、V11、F17。落点：web `PostDetailPage.tsx`、AssistantPanel/Thread、useAssistant 适配。
  - 动作：接真实位置 manifest 与消息流，轻量可关闭介绍、示例问题和采集说明；清楚区分已部署成员与 AI 当前开关；不因页面浏览自动调用模型。
  - 验收：K2/K3/K4；介绍关闭本会话不重现、阅读不被遮挡；AI 无法使用时仍有可读页面与规则提示。
  - 证据：`ArticleAssistantPanel.test.tsx` 验证 manifest 只读、介绍关闭、示例携带当前文章 slug 并 ACK；API manifest/部署门禁集成测通过。K3 浏览器实测文章正文可正常阅读、面板位于正文后无浮层，AI 关闭且部署不可用时示例问题得到规则答复；最终 typecheck、web/API/web 构建和 GEO 通过。使用 Lucide 图标，无 Emoji。生产未部署。

- [x] **V13 实现多 Agent 切换与历史恢复**（本地验收，2026-09-24）
  - 前置：V12、V08。落点：useAssistant、同访客历史 GET、会话分支映射。
  - 动作：显示实际成员/修订；只接受当前公开 manifest 的成员 key 和部署代次；同一 Conversation 下按 Agent 修订恢复独立 SDK session；刷新从同访客业务 Message 恢复；旧修订撤出公开部署后隐藏其回答正文。
  - 验收：K2/K3；两次追问再切换仍可回看原消息，不串他人/后台/旧权限内容；新旧页面版本冲突有更新提示。
  - 证据：[V13 目标和验收](docs/evidence/GOAL-2026-09-24-V13.md)。RED：新历史 GET 首先返回 404，manifest 缺少成员安全投影；GREEN：公开成员选择、匿名历史恢复、旧修订隐藏与代次冲突提示通过定向 API/web 测试。完整 typecheck/API/shared/web/agent、API/web 构建与 GEO 验收通过；生产未部署。

- [x] **V14 实现访客的真实停止入口**（本地验收，2026-09-25）
  - 前置：V11、R13、V08。落点：公共 conversation/run stop controller、web stop UI。
  - 动作：文章页停止按钮将当前 assistant Message ID 发给服务端；服务端从本人的 Conversation/Attempt 解析 run 并调用统一停止，客户端不提交 runId。网络断开只影响交付观察，不会取消执行。
  - 验收：K2/K3；猜 ID 不能停别人/后台任务，STOPPING 直到确认，迟到 done 不把已取消改回成功。
  - 证据：[V14 目标和验收](docs/evidence/GOAL-2026-09-25-V14.md)。RED：HTTP 集成先观察停止路由 404；GREEN：公共 run 同访客停止成 CANCELLED，跨访客和绑定后台 run 返回 404；排队取消立即结束，运行中等待 close 退出证明，UNKNOWN 不标已停止，迟到结果写入仍被拒绝。文章 UI 轮询 PENDING，只有确认 CANCELLED 才显示已停止，并从历史恢复停止前片段；断 SSE controller 测试确认执行服务未收到 abort signal。生产未部署。

- [x] **V15 实现 AI 部件交互事件采集**（本地验收，2026-09-25）
  - 前置：V07、V12、V13。落点：shared 事件白名单、`/assistant/events`、web 事件适配。
  - 动作：schemaVersion 1 事件只采文章助手的展示/介绍关闭/面板开合/发送/追问/成员切换/引用点击/回答反馈；服务端按匿名 cookie 推导会话，校验公开成员、业务消息和引用，拒绝任意 URL/自由属性；`receivedAt` 由数据库生成。
  - 验收：K2；重复 eventId 不重复计数、非法属性丢弃或拒绝、任意 URL/全站点击不入库；客户端时间不充当服务端事实。
  - 证据：[V15 目标和验收](docs/evidence/GOAL-2026-09-25-V15.md)。RED：shared 事件模块缺失、HTTP `/assistant/events` 为 404。GREEN：事件 schema/幂等 API 集成/面板组件测试通过；完整测试、typecheck、API/web 构建与 GEO 验收通过。生产未部署。

- [x] **V16 实现日志故障补写与健康缺口**（本地验收，2026-09-25）
  - 前置：V07、V09、R05。落点：受控 spool adapter、采集健康查询。
  - 动作：配置 20MiB/24h 上限、稳定 eventId 幂等补写、超限丢弃/告警；生成后保存失败仍可返回回答。
  - 验收：K2/K6；断库/满盘/重复补写不挂回答或重复计数；精确丢失数无法知道时显示未知，关键副作用审计仍失败关闭。
  - 证据：[V16 目标和验收](docs/evidence/GOAL-2026-09-25-V16.md)。RED：spool/recorder 文件缺失；保存挂起测试超时；存储异常曾吞掉部署代次冲突。GREEN：SQLite 同目录原子文件队列、250ms 数据库写入/回答持久化等待边界、稳定 eventId 回放、启动/30秒定批次重放、管理员健康 API。覆盖队列上限、TTL、无法创建目录、重复事件、问答保存挂起、部署授权错误保留及审计回滚。API 78 文件/428 项、shared 41/327、web 39/226、agent 5/30；typecheck、API build 通过。物理满盘未实际制造；用不可创建 spool 目录和超限场景验证丢弃与未知缺口。生产未部署。

- [x] **V17 实现日志资源登记与到期策略**（本地验收，2026-09-25）
  - 前置：V07、V16、R23。落点：DeletionTombstone/资源登记 migration、日志策略服务。
  - 动作：登记 Message、FeatureEvent、AssistantRun、ExecutionRun/Event、native session、trace、spool；资源类型支持 native fork 与未来 export。明细默认 90 天、不可回连聚合默认 365 天，期限分别可缩短。
  - 验收：K2；一条会话可枚举所有正文副本；保留期缩短后到期可选出，路径不由客户端任意传入。
  - 证据：[V17 目标、实体模型与验收](docs/evidence/GOAL-2026-09-25-V17.md)。RED：资源服务测试先因实现模块缺失而无法加载；首轮迁移 diff 发现 LogRetentionPolicy 的 `id` 默认值不一致，已修正 migration。GREEN：新增资源/tombstone/保留策略 SQLite migration（回填既有行）、事务内资源登记、当前策略即时计算 expiresAt、同源管理策略 API、会话资源枚举与到期选择。公共助手端到端覆盖 message/event/AssistantRun，Repository 集成覆盖 native session 和公开执行 run/event；trace writer 写文件前登记逻辑 key。API 82 文件/439 项、shared 41/327、web 39/226、agent 5/30；typecheck、build:api、迁移重复部署和 schema diff 全绿。无 native fork / 对话导出写入点，表/接口已提供其注册类型，待对应能力接入。未部署。

- [x] **V18 实现可重试删除及防复活**（本地验收，2026-09-25）
  - 前置：V17、V14。落点：删除 service、鉴权 DELETE/任务状态接口。
  - 动作：先 tombstone/阻止新增写入，停止关联执行，再分步清正文/索引/副本；重启后继续未完成阶段。
  - 验收：K2/K6；删除中断可恢复、spool 不复活消息、其他会话不受影响，留删除审计不留被删正文。
  - 证据：[V18 目标、边界与验收](docs/evidence/GOAL-2026-09-25-V18.md)。管理端 DELETE 先原子写 tombstone+无正文审计，再停止公开 run；清理会话消息、FeatureEvent、AssistantRun、ExecutionRun/Event、SDK session/fork、trace 与 spool。删除失败进入 blocked 并保留 tombstone，重复 DELETE 人工重试；启动和每 30 秒恢复 pending/stopping/deleting。公共读写、执行/事件登记及 spool 回放均识别墓碑，native session/fork 由运行通知在 stop 阶段登记。API 87 文件/455 项、shared 41/327、web 39/226、agent 5/30；`pnpm typecheck` 与 `pnpm build:api` 通过。HTTP/SQLite 集成确认审计无正文、其他会话不变、已删会话不能重建。未部署。

- [x] **V19 将删除规则接入备份恢复**（本地验收，2026-09-25）
  - 前置：V18。落点：`ops/windows` 恢复/清理脚本与说明。
  - 动作：持久保存可在恢复后应用的删除清单；恢复过程先重放 tombstone/到期清理后才开放 API，定义并执行备份到期策略。
  - 验收：K6；从含已删消息的旧备份恢复仍不公开该消息；失败保持服务未就绪而不是绕过清理。
  - 证据：[V19 删除清单与备份恢复验收](docs/evidence/GOAL-2026-09-25-V19.md)。V18 删除在清理前原子替换无正文清单；配置盒外副本时，副本写失败将任务置 blocked、不删正文。`backup-walker.ps1` 停服后用 SQLite `VACUUM INTO`、完整性/外键校验、清单副本、SHA-256 和30天到期元数据生成快照；`restore-walker.ps1` 拒绝过期/哈希不符，要求最新删除清单，迁移并检查临时库后才替换。API main 在 listener 前重放清单、恢复删除和清理到期资源；失败留 `restore.pending`，接口503且Gateway不启动。真实旧 SQLite 文件集成先做快照、再删源正文、以旧副本恢复并清理，正文/Conversation 均不存在，墓碑 completed、恢复审计无正文。全量 API 95 文件/469项，shared 41/327、web39/226、agent5/30；typecheck、build:api 全绿。未在目标服务器执行恢复脚本；盒外同步与云生命周期尚未配置，生产未部署。

- [x] **V20 实现会话日志查询与后台回看**（本地验收，2026-09-25）
  - 前置：V11、V15、V17、F13。落点：`/ops/conversations`、admin records 会话列表/详情。
  - 动作：内容/位置/Agent/日期/状态/关键词过滤、50/100 游标分页；串联输入、对外回答、引用、版本和运行。
  - 验收：K2/K3；筛选找得到指定问题、unknown 与0区分、已删内容不再返回；公共 Agent 无全局检索权限。
  - 证据：[V20 会话查询与后台回看验收](docs/evidence/GOAL-2026-09-25-V20.md)。新增管理只读 `GET /ops/conversations` / `:id`；筛选在服务端按内容、登记位置、Agent、日期、run state 和问题/回答关键词执行，固定 50/100 limit+稳定 opaque cursor，Tombstone 与动态 90 天 detail cutoff 同时过滤。详情串联 Message、引用、Attempt/Agent 修订、public Run/Event 和交互 FeatureEvent；token 保持 nullable，0 与未知分开。Public route/Agent 没有该全局读取能力，Ops capability 仅在 query health 可用时显示 conversations=available。Records 访客标签支持筛选列表、继续分页、逐轮查看；列表只显示最近问题摘要，回答正文仅在详情显示。API 98 文件/481 项、shared 41/327、web39/226、agent5/30、admin8/26；typecheck、build:api、build:admin、migration integration 通过。Ego browser 按 K3 完成列表→组合筛选→详情，桌面与390px viewport核验；数据来自隔离 test.db、AI关闭，未部署。

- [x] **V21 实现受控导出与下载**（本地验收，2026-09-25）
  - 前置：V20、V18、R05。落点：`/ops/exports` service/controller、admin 导出入口。
  - 动作：锁定筛选/cutoff 异步导出 CSV/JSON，上限 10,000 行，脱敏/CSV 公式转义、鉴权下载/短期失效和审计。
  - 验收：K2/K6；导出范围等于查询快照、失效下载拒绝、会话删除会清本机相关导出；不声称可撤回外部下载副本。
  - 证据：[V21 受控导出与数据模型审计](docs/evidence/GOAL-2026-09-25-V21.md)。RED：CSV 格式器、完整筛选快照查询、Prisma 导出仓储、受控文件存储、服务和鉴权下载缺失；另验证未知筛选字段不能静默扩大范围。GREEN：`POST /ops/exports` 冻结服务端筛选、90天明细 cutoff、快照时间与会话 ID 集；超 10,000 条返回 422，不截断。未知顶层或筛选字段返回400。单队列异步生成 CSV 汇总/JSON 逐轮明细，所有字符串复用 shared redaction，CSV 全字段处理公式前缀。`GET /ops/exports/:id` 显示固定字段/范围/行数及 15 分钟有效期；`GET .../download` 需管理鉴权，到期/删除返回 410。文件在私有 `data/exports` 根下按 opaque job ID 命名，以临时文件+rename 发布；创建/下载授权/失败/过期/撤销均有无正文审计。每条会话资源登记到 V17；删除任一入选会话先清文件并撤销整份本机导出；普通日志保留清理跳过 export，使用 15 分钟独立 TTL。全量 API 103 文件/491 项、shared 41/327、web 39/226、agent 5/30、admin 8/28；typecheck、API/admin build、verify:docs 全绿。真实 SQLite HTTP 集成覆盖快照之后新增会话排除、CSV 公式、JSON 邮箱脱敏、鉴权、15分钟到期和删除后文件清除；未验证 10,000 行真实大文件与生产盘故障。未部署。

- [x] **V22 同步公共路由白名单与安全边界**（本地验收，2026-09-25）
  - 前置：V08、V11、V14、V15、V18、V20、V21。落点：`app.module.ts`、`ops/windows/Caddyfile`、API 契约。
  - 动作：只放行位置/问答/同访客消息/事件/停止必需路由及方法，`/ops`/导出/删除管理面不公开；核对 CORS/Origin/CSRF。
  - 验收：K2/K6；匿名或错误方法访问管理数据均拒绝，双侧路由一致，普通浏览器前台不能触发内容写入。
  - 证据：[V22 公共路由白名单与 CSRF 边界](docs/evidence/GOAL-2026-09-25-V22.md)。RED：Nest/Caddy 对照测试发现两侧额外公开 `GET /support`；全局同源测试发现仅既有路由显式配 Origin，新增管理写路由会漏；Web/Admin Vite 代理都把 Host 改写成 API 域，导致浏览器合法 Origin 可能被误拒。GREEN：移除未被 Web 调用的公共 `GET /support`（赞赏页为构建期 JSON）；`public-route-boundary.test.ts` 固定 13 条必要方法/路径并逐项对照 Nest exclude 与 Caddy matcher；SameOriginMiddleware 改为所有 POST/PUT/PATCH/DELETE 全局校验，管理写入也不再依赖逐路由登记；Web/Admin Vite 代理保留浏览器 Host；`WALKER_PUBLIC_ORIGINS` 只接受精确 host，生产示例配置 `www.iwalk.pro`。Nest 未启用宽泛 CORS，跨站预检无 ACAO。HTTP 集成覆盖恶意 Origin 事件/内容写 403 且无事件落库、无凭据的 `/ops/exports` 错方法及 `/admin/content` 写入 401；Caddy 未命中回 404。完整 Caddy 可执行文件不在本机，仅做 Caddyfile matcher 与 Nest 白名单静态对照，未部署/未执行生产端到端。

- [x] **V23 实现公共位置启用前检查**（本地验收，2026-09-25）
  - 前置：V03、V05、V10、V18、V19、V22、R21。
  - 落点：部署 readiness/capability 服务、admin 启用提示。
  - 动作：把已核验快照、权限测试、运行隔离、日志保留/删除、白名单状态作为启用条件；缺失列明原因。
  - 验收：K2；任何门槛缺失不能启用真实访客采集/模型服务，不以单一布尔开关绕过 readiness。
  - 证据：[V23 公共位置启用前检查](docs/evidence/GOAL-2026-09-25-V23.md)。管理端逐项核对核验快照、全体只读成员/最新权限测试、真实 SDK 运行隔离探针、日志保留、删除/恢复、Nest/Caddy 源白名单一致性；服务端启用及启用中的回退与公开模型解析重新计算 gates，缺门槛时 manifest 不可用。Admin 显示 blocker 并 fail-closed 禁用启用操作，伪造 `canEnable`/`force` 不能绕过。当前本地 API 未配置探针报告，readiness 按报告缺失保持 blocked；不触发真实模型请求、不部署。

- [x] **V24 验收首个文章位置及日志闭环**（本地验收，2026-09-25）
  - 前置：V12、V13、V14、V15、V16、V19、V20、V21、V23。
  - 落点：§10、PRD 对应验收证据。
  - 验收：K1/K3/K4/K6；两轮问答 → 切换 Agent → 后台回看 → 导出 → 删除/恢复验证；覆盖 A04–A10、A18–A19、A21–A27。真实生产启用由 G08 核验。
  - 证据：[V24 首个文章位置与日志闭环](docs/evidence/GOAL-2026-09-25-V24.md)。Kernel 集成用隔离 SQLite、两位真实修订与可控 Runtime fixture 完成快照/全员权限测试→位置启用→两轮不同成员问答→同访客历史恢复→member-switch 事件→Records 筛选/详情→JSON 导出→删除及导出撤销；将删除前数据库快照恢复到另一临时库后重放 manifest，消息与会话再次清除。断言公开运行 `origin=public` 且无 grant、引用限于快照、非本人访客历史为空。浏览器访问本地 `dorazoom` 文章页，在 AI 关闭时验证两轮规则回答、刷新与返回恢复；Admin Records 过滤到该对话、展开两轮详情并看到 JSON 导出进入可下载状态。全量验证命令与浏览器限制见证据；未调用真实模型或部署。

## 6. P2 / C：内容写入与发布闭环

- [x] **C01 定义候选、审批与发布合同**（本地验收，2026-09-25）
  - 前置：R03、V01。落点：shared ContentChange/ContentRelease/approval 合同。
  - 动作：固定 action/target/baseHash/candidateHash/grantRevision，区分编辑、网页、问答版本及 release 阶段。
  - 验收：K2；保存状态无法直接转 PUBLISHED，换候选/动作/目标版本必须失效审批。
  - 证据：[C01 内容候选、审批与发布合同](docs/evidence/GOAL-2026-09-25-C01.md)。shared 新增 ContentChange/ContentApproval/ContentRelease/ContentVersionSnapshot；审批规范绑定 action、target、baseHash、candidateHash、grantId/revision，并拒绝未知字段；候选 APPLIED 与网页 PUBLISHED 分属不同状态，发布必须经过 VERIFYING 且线上 hash 与批准 hash 相等。working/published/indexed hash 与问答索引同步状态分别表达。没有新增 SQLite 表或 API 写入口，留 C02/C05/C09/C14 实施。旧 Submission/Publication 不做语义合并。

- [x] **C02 增加候选与发布持久模型**（本地验收，2026-09-25）
  - 前置：R02、C01。落点：ContentChange/ContentRelease migration 与 repository。
  - 动作：新增 `ContentChange`/`ContentRelease` SQLite 表与 Prisma Kernel 仓储。候选持久化动作/target、opaque 候选引用、来源 run、应用前后 hash、批准 ID/binding hash/grantId/revision/批准者时间和唯一请求键；release 持久化已核验网页 baseHash、候选 sourceHash、发布批准快照、manifest 引用/hash、commit、网页核验 hash/时间、独立 assistant index 状态及唯一请求键。批准留在所属父记录，`APPROVED` 状态即消费依据；working/web/index 三版本仍独立投影。旧 `Submission`/`Publication` 保留原模型与表，不接新语义。
  - 验收：K2/K6；重启后候选/批准/release 可读取，相同请求键回放不新增记录；不同事实复用键返回冲突；发布只能从已应用且 hash/target 一致的候选建立，旧 Submission/Publication 数据不重置。没有开放 HTTP 写入口、候选文件写入、Git 或生产发布。
  - 证据：[C02 候选与发布持久模型](docs/evidence/GOAL-2026-09-25-C02.md)。迁移 `20260925160000_content_change_release`；Kernel 集成覆盖创建幂等/冲突、批准绑定及不可替换、重启读回、release 与候选 hash 绑定/索引状态分离。迁移验收保留旧 Submission/Publication 行。

- [x] **C03 实现内容对象锁与 CAS 文件保存**（本地验收，2026-09-25）
  - 前置：C01。落点：`ports/content-file.repository.ts`、`fs-content-file.repository.ts`。
  - 动作：详情回传正文 SHA-256；保存必须带 expectedHash，`null` 只表示目标不存在时创建。按目录+slug 的进程内对象锁覆盖读取、核 hash、临时写入、刷新与替换；唯一同目录临时文件写完并 sync 后 rename；拒绝路径穿越、不支持 slug、md/mdx 重复目标。
  - 验收：K2/K6；两个仓储实例同版本并发只有一个写入成功，过期 hash 和重复 create 拒绝；临时文件写入失败或 rename 替换失败时原文仍完整可读、临时文件清理；详情 hash 与正文 SHA-256 一致。
  - 证据：[C03 文件锁与 CAS 保存](docs/evidence/GOAL-2026-09-25-C03.md)。现有保存 API 现要求 `expectedHash`，新建传 `null`；工作站旧写入调用先取当前 hash 再保存。锁只在 API 进程内生效，不替代 C04 的持久意图/崩溃恢复，也不协调手工 Git 写入。

- [x] **C04 实现内容写入日志与崩溃恢复**（本地验收，2026-09-25）
  - 前置：C02、C03、R05。落点：ContentMutationService apply/reconcile。
  - 动作：写前在单个 SQLite 事务将候选置为 APPLYING 并持久化 before/after hash intent audit；文件 CAS 是独立副作用；完成后另一个 SQLite 事务根据实际 hash 写 APPLIED/appliedHash/result audit。重启后调用 `reconcile` 按当前磁盘 hash 分流：候选 hash 只补数据库、base hash 重试同一已批准内容、其他值进入 CONFLICT 且保留外部正文。候选原文由内部调用方提供并校验 candidateHash；C07 接入 opaque candidateRef 读取。本项不加启动期自动扫描。
  - 验收：K2/K6；意图后崩溃可续做，文件已替换而 DB 回写前崩溃可补记且不重复写，外部版本冲突不覆盖；SQLite intent 与审计提交失败整体回滚，不伪造文件/DB 跨资源原子事务。
  - 证据：[C04 apply/reconcile 与崩溃恢复](docs/evidence/GOAL-2026-09-25-C04.md)。无 schema migration；不增加候选 HTTP API，不将旧人工保存路径误报为已接入 ContentMutationService。

- [x] **C05 将人工保存改接受控出口**（本地验收，2026-09-25）
  - 前置：C04、R09。落点：content-admin service/controller。
  - 动作：现有 AdminToken 路由把人工保存委托给 `ContentMutationService.saveManual`；固定站主 actor，不接受客户端自报身份。先审计 intent，再按 expectedHash CAS 写文件，后审计结果；保留失败/冲突 outcome；移除保存后 `content:gen`，人工保存不依赖 ContentChange/模型批准。
  - 验收：K2；匿名 PUT 401、缺 expectedHash 失败、stale hash 409 且正文不变；合法人工保存写入 before/after audit、不创建候选/审批、不刷新公共快照。
  - 证据：[C05 人工保存受控出口](docs/evidence/GOAL-2026-09-25-C05.md)。AppModule HTTP 集成覆盖 401、冲突、合法保存、审计序列和 generated content 快照不变；服务单测在 `CONTENT_GEN_ON_SAVE=true` 下仍不触发 spawn。

- [x] **C06 接通文章编辑、差异与预览**（本地验收，2026-09-25）
  - 前置：C05、F11。落点：admin ContentDetail 编辑面板。
  - 动作：编辑器保留 baseHash、未保存状态、预览与冲突差异；保存后更新真实编辑版本。
  - 验收：K2/K3；刷新/切换对象有未保存保护，冲突不自动覆盖，保存后不显示已上线；此节点可提前交付人工编辑。
  - 证据：[C06 文章编辑、差异与预览](docs/evidence/GOAL-2026-09-25-C06.md)。共享行差异 `computeTextDiff` 经纯函数 TDD 覆盖；Admin 详情页支持编辑草稿、未保存标识、实时 Markdown 预览与本地差异；离开触发确认保护；保存经 `expectedHash` 受控出口，保存后明确提示未发布；409 冲突时不覆盖本地修改，拉取最新远程版本提供冲突比对与站主决策。

- [x] **C07 实现独立候选文件仓储**（本地验收，2026-09-25）
  - 前置：C02。落点：现有 stage-artifact 工具/新 candidate port 与受控文件 adapter。
  - 动作：按 candidateId/hash 保存不可变结果，路径由服务端生成；不强制单篇改稿先建完整作品流水线。
  - 验收：K2；重复保存相同 hash 可复用，读取核验 hash；候选无法通过路径参数覆盖 content/log。
  - 证据：[C07 独立候选文件仓储](docs/evidence/GOAL-2026-09-25-C07.md)。定义 `CandidateFileRepositoryPort` 与 `FsCandidateFileRepository`，路径由服务端在受控目录下生成；相同 hash 幂等复用，不同 hash 冲突拒绝；读取严格核验正文 SHA-256；严防路径穿越且不覆盖 `content/log`；接入 KernelModule 并打通 `ContentMutationService` 对 `candidateRef` 的读取应用。

- [x] **C08 实现后台生成内容候选**（本地验收，2026-09-25）
  - 前置：C07、R15、R09。落点：ContentMutationService propose、`/ops/content-changes`。
  - 动作：固定输入正文版本和 L1 授权，调用 Agent 后保存候选与来源 run，不修改正本。
  - 验收：K2；模型成功/失败均有 run，坏输出不成为可批准候选，原文 hash 始终不变。
  - 证据：[C08 后台生成内容候选](docs/evidence/GOAL-2026-09-25-C08.md)。实现 `ContentMutationService.propose` 与 `/ops/content-changes` 控制器；固定输入基线 `baseHash`；校验 R09 L1 `content:propose` 授权；调用 Agent 记录 `ExecutionRun`；成功后保存不可变候选文件并创建 `PROPOSED` 状态 `ContentChange`；坏输出（无 frontmatter、无变更）与失败运行均被拦截且正本 hash 始终不变。

- [x] **C09 实现精确审批与一次性消费**（本地验收，2026-09-25）
  - 前置：C08、R08、R05。落点：approve/apply 用例。
  - 动作：批准候选/动作/原文/授权修订，执行前复检并原子消费审批；撤销与派发排序。
  - 验收：K2；重复批准/执行不重复写入，候选变更/原文冲突/授权到期拒绝；修改授权不自动含发布。
  - 证据：[C09 精确审批与一次性消费](docs/evidence/GOAL-2026-09-25-C09.md)。在 `ContentMutationService` 实现 `approve` 与 `apply` 前复检；`approve` 校验 R08 L2 授权与当前正本无冲突，绑定动作、正文版本与 grantRevision 并记审计；`apply` 执行前复核授权有效性、撤销状态、授权修订与原文冲突，在单个事务中通过 `beginApply` 原子消费审批并记 intent 审计；文件 CAS 写入后确认 `APPLIED` 终态；重复批准与重复执行均幂等；修改授权绝不自动包含发布；`/ops/content-changes/:id/approve` 与 `/apply` HTTP 端点通过集成验证。

- [x] **C10 接通候选差异与审批 UI**（本地验收，2026-09-25）
  - 前置：C09、C06。落点：admin ContentChange 审阅面板。
  - 动作：显示原文/候选差异、动作/范围、授权与失效原因；批准保存和批准发布分别操作。
  - 验收：K3；能看清将修改什么、重复点击结果幂等，后台禁用持续自主内容授权入口。
  - 证据：[C10 候选差异与审批 UI](docs/evidence/GOAL-2026-09-25-C10.md)。在 admin 实现 `ContentChangeReviewPanel` 并挂载于文章详情页；调用 `computeTextDiff` 显示原文与候选行级彩色差异；显示动作 `apply-candidate`、目标范围与基线/候选 hash；诊断展示审批信息与基线冲突失效原因；批准保存与应用工作区分别操作且点击幂等；批准发布独立分离且标注需单独审批；后台彻底禁用持续自主内容授权入口。

- [x] **C11 清点并封闭内容写入旁路**（本地验收，2026-09-25）
  - 前置：C05、C09、R19。落点：旧 content/workflow/file 写入口、对应 ports 接线、API 契约。
  - 动作：搜索所有正本写入/状态写入/发布触发调用，列出清单；把 AI 可达写入收敛到同一用例，保留合法人工流程。
  - 验收：K2；旧 HTTP/工作站/工具不绕过授权与 CAS，公开来源攻击不能修改正文/元数据/项目状态；清单无未处理可达项。
  - 证据：[C11 清点并封闭内容写入旁路](docs/evidence/GOAL-2026-09-25-C11.md)。清点全仓所有正本写入、状态变更与发布触发点并列出清单；将旧工作站 `PublicationService.publishWebsite` 的直接写入封闭，改为委托 `ContentMutationService.saveManual`，经由 expectedHash CAS 并记录完整意图与完成审计；全仓仅 `ContentMutationService` 一处调用底层正本文件写；集成测试覆盖公开来源攻击、伪造管理员提权（A07 & A08 拦截）、陈旧 expectedHash 冲突保护与全套 401 门禁；清单无未处理可达项。

- [x] **C12 实现实际发布范围预检**（本地验收，2026-09-25）
  - 前置：C02、C03、V01。落点：content-release preflight、git-status adapter。
  - 动作：读取真实 dirty/staged 路径并生成 manifest；单篇发布遇其他文章/support-config 变化拒绝，保留“不夹带代码”检查。
  - 验收：K2/K6；A 发布时 B 也脏返回 scope-conflict；清单可见、hash 稳定，不能只检查 A 的 frontmatter。
  - 证据：[C12 实际发布范围预检](docs/evidence/GOAL-2026-09-25-C12.md)。在 `GitStatusPort` 与 `NodeGitStatusRepository` 实现 `workspaceSnapshot`，单次 O(1) 捕获全仓 dirty/staged 路径；在 `ContentReleaseService.preflight` 注入 Git 状态，遇其他文章脏、support-config 脏或代码脏时返回 `scopeConflict`，并在 `release` 触发时抛出 409 `scope-conflict` 拒绝夹带发布；无冲突时生成包含 `targetHash` 与 `manifestHash` 的结构化稳定清单。

- [x] **C13 实现全工作区发布锁和清单复检**（本地验收，2026-09-25）
  - 前置：C12、C03。落点：共享内容锁协议、`scripts/content-publish.ts`、content-release service。
  - 动作：脚本与应用共用锁；构建/提交前复检允许路径和目标 hash，预检后额外变化使批准失效。
  - 验收：K2/K6；并行保存/发布无混入，锁外变化可检测；超时或崩溃锁有可核验恢复机制，不永久锁死。
  - 证据：[C13 全工作区发布锁和清单复检](docs/evidence/GOAL-2026-09-25-C13.md)。在 `@walker/shared` 实现跨进程 `content-lock` 协议，在 API 实现 `ContentLockPort` / `FsContentLock` 并在 `scripts/content-publish.ts` 接入共用锁；发布持有锁时，`ContentMutationService` 拦截一切正本保存与候选应用（409 `content-locked`），防止并行混入；发布执行前复检清单 `manifestHash` 与目标文章哈希，锁外额外变动使原批准立即失效并终止发布；超时或进程崩溃具有检测 PID 存活与 TTL 的可核验恢复机制，不永久锁死。

- [x] **C14 实现发布阶段与幂等脚本调用**（本地验收，2026-09-25）
  - 前置：C13、R05。落点：ContentReleaseService、pnpm-content-release runner。
  - 动作：记录 PREPARED/COMMITTING/PUSHED/VERIFYING 阶段和 commit；固定命令受控参数，stdout 结构化、stderr 脱敏有界。
  - 验收：K2/K6；退出码0不等于 PUBLISHED，重复请求复用 release；公开文本不进入命令行，失败保留已完成阶段。
  - 证据：[C14 发布阶段与幂等脚本调用](docs/evidence/GOAL-2026-09-25-C14.md)。在 `ContentReleaseRepositoryPort` 与 `PrismaContentReleaseRepository` 实现 `updateStage` 与 `findLatestForTarget`；`ContentReleaseService` 完整管理发布阶段推进（`PREPARED` -> `COMMITTING` -> `PUSHED` -> `VERIFYING`），退出码 0 绝不标记为 `PUBLISHED`，读取并持久化 Git commit；在途重复请求幂等复用；失败记录 `errorCode` 并保留历史阶段与已记录事实；固定常量命令行参数无文本注入。

- [x] **C15 将版本证明写入网页构建**（本地验收，2026-09-25）
  - 前置：V01、C14。落点：`scripts/build-web.ts`、预渲染/manifest 生成、文章 HTML。
  - 动作：本次构建生成公开 manifest 与单篇内容 hash 标记，关联 Git/build 标识，不泄露内部诊断。
  - 验收：K2/K4；构建产物与当前批准内容 hash 一致，同标题改正文能区分版本；公开图谱规则不分叉。
  - 证据：[C15 网页构建版本证明](docs/evidence/GOAL-2026-09-25-C15.md)。在 `scripts/generate-content.ts` 为 `public-manifest.json` 关联 `gitCommit` 与 `buildId`，单篇内容 hash 严格基于内容数据生成；在 `scripts/prerender-web.ts` 将 `content-hash`、`build-id`、`git-commit` 作为 meta 标签与 `data-content-hash` 写入每篇预渲染文章 HTML；同标题改动正文产生不同哈希有效区分版本；图谱生成保持规则一致不分叉；无内部诊断泄露。

- [x] **C16 实现线上版本核验器**（本地验收，2026-09-25）
  - 前置：C15。落点：website-deployment-verifier port/adapter、release service。
  - 动作：核验线上 manifest 和目标文章 hash、缓存旧响应处理、超时/重试边界；不只匹配标题或页面200。
  - 验收：K2/K6；旧网页、同标题旧正文、失败部署均不能记 PUBLISHED；只有目标 hash 确认才完成网页阶段。
  - 证据：[C16 线上版本核验器](docs/evidence/GOAL-2026-09-25-C16.md)。`WebsiteDeploymentVerifierPort` 契约扩展为 `VerifyWebsiteDeploymentInput`/`VerifyWebsiteDeploymentResult`（旧 `{ title }` 调用保持兼容）；`HttpWebsiteDeploymentVerifier` 从文章 HTML 的 `content-hash` 与线上 `public-manifest.json` 双重取证，配音缓存头与破缓存参数、超时与重试边界；`ContentReleaseService.verify` 仅当 `verifiedHash === sourceHash` 才把 `VERIFYING` 推进为 `PUBLISHED` 并记录 `verifiedHash`/`verifiedAt`，旧网页/同标题旧正文/失败部署/缺 hash 证据一律保持 `VERIFYING`，重复核验幂等，非 `VERIFYING` 状态抛 409；暴露 `POST /admin/content/release/:id/verify`。顺带修复既有测试的跨天时间炸弹（`prisma-conversation-query` 用默认 `now()` 落在固定日期窗口外）。

- [x] **C17 接通发布后问答快照切换**（本地验收，2026-09-25）
  - 前置：C16、V02。落点：ContentReleaseService 与 PublicSnapshotRepository。
  - 动作：上线核验后导入该次构建快照并切指针；网页成功和问答索引成功分别记录，版本不匹配时问答降级。
  - 验收：K2/K6；网页已上线但索引写失败显示同步失败，旧快照可用；不能复制当前工作区最新草稿充当已发布快照。
  - 证据：[C17 接通发布后问答快照切换](docs/evidence/GOAL-2026-09-25-C17.md)。`ContentReleaseRepositoryPort` 增加 `updateIndexState`，Prisma 持久层实现 `assistantIndexState`（`PENDING` -> `SYNCING` -> `SYNCED` / `FAILED`）与 `publishedSnapshotId` 物理隔离存储；`KernelModule` 绑定 `PUBLIC_SNAPSHOT_REPOSITORY` 并供 `FsSiteContentIndex` 注入复用；`ContentReleaseService.verify` 网页确证通过后向已部署站点抓取 `public-manifest.json`，经由 `verifyPublicSnapshot` 校验自洽性与目标版本后原子切换公开索引指针；若快照拉取/核验失败，记录 `assistantIndexState: 'FAILED'`，网页阶段保持 `PUBLISHED`，旧快照完全不受破坏且继续对外可用，杜绝草稿外溢与全量成功假象；实现 `getVersionSnapshot(slug)` 与 `GET /admin/content/release/:slug/version` 端点，独立呈现 `workingHash`、`publishedHash`、`indexedHash` 三者真相。

- [x] **C18 实现结果不明的发布核对**（本地验收，2026-09-25）
  - 前置：C14、C16、C17。落点：release reconcile、Git/远端核验 adapter。
  - 动作：对 push 响应丢失、服务重启、Vercel 长时间未生效，根据 commit/线上 hash 继续核验，不自动重复提交。
  - 验收：K2/K6；未知转为事实状态，已推送不会制造第二次内容提交；无法核验时保留 UNKNOWN 和下一检查动作。
  - 证据：[C18 结果不明的发布核对](docs/evidence/GOAL-2026-09-25-C18.md)。`@walker/shared` 更新 `CONTENT_RELEASE_TRANSITIONS`，允许 `UNKNOWN` 状态在事实核对时合法流转到 `VERIFYING`、`FAILED` 或携带验证凭证时转为 `PUBLISHED`；`GitStatusPort` 增加 `hasCommit`，使用 `git cat-file -e` 进行 O(1) 提交对象检测；`ContentReleaseService.reconcile` 实现断点核对：线上确证优先（若线上已确认目标 hash，直接转为 `PUBLISHED` 并同步快照，绝不二次提交）；若已推送（有 commit 事实）但线上未生效，转为 `VERIFYING`，`nextAction: 'wait-deployment'`，严防重复提交；若在 `COMMITTING` 中断且工作区未提交，安全置为 `FAILED`（`commit-interrupted`）；若状态不可用，保留 `UNKNOWN` 并指示人工核查（`check-git-remote`）；暴露 `POST /admin/content/release/:id/reconcile`。

- [x] **C19 实现发布脚本的进程树终止核验**（本地验收，2026-09-25）
  - 前置：C14、R14。落点：pnpm runner、受控进程工具。
  - 动作：记录脚本树归属，终止构建时确认子进程；push 已派发只能请求停止后核对实际效果。
  - 验收：K5/K6；终止不留下活跃构建占资源，不杀其他程序；不能将可能已上线的操作标为“取消且未发布”。
  - 证据：[C19 发布脚本的进程树终止核验](docs/evidence/GOAL-2026-09-25-C19.md)。编写受控进程工具 `apps/api/src/common/process-tree.ts`，递归检索进程后代 PID，跨平台树杀（POSIX 进程组 / Windows `taskkill /T /F`，超时升级 `SIGKILL`）并轮询核验确认子进程已全灭退出；`PnpmContentReleaseRunner` 记录脚本树归属，支持 `signal` 与 `onSpawn` 并在超时与取消时触发树杀与核验，保持 `fn.length === 0` 杜绝命令文本注入；`ContentReleaseService.cancel` 实现受控取消：在 `PREPARED`/`COMMITTING` 阶段安全终止进程树并置为 `FAILED`（`cancelled-before-commit`），而在 `PUSHED`/`VERIFYING` 阶段请求停止时**绝不误标取消未发布**，而是调用 `reconcile` 确证实际效果；暴露 `POST /admin/content/release/:id/cancel`。

- [x] **C20 接通发布清单和版本状态界面**
  - 前置：C10、C12、C17、C18。落点：admin 内容发布面板、release 详情。
  - 动作：展示实际范围/阻塞路径、独立发布批准、编辑/网页/问答版本及失败阶段；5秒可见轮询，15秒标陈旧。
  - 验收：K2/K3；审批与真实 manifest 对应，重复点击不重复发布；刷新可恢复阶段，错误可解释但不假设回滚成功。
  - 证据：[C20 接通发布清单和版本状态界面](docs/evidence/GOAL-2026-09-25-C20.md)。创建 `apps/admin/src/pages/content/ContentReleasePanel.tsx` 并接入 `ContentDetailPage.tsx`（新增「发布管理」标签页）；展示编辑正本/网页发布/问答索引三版本状态及同步差异徽章；接入 5 秒可见轮询与 15 秒数据标陈旧警告；预检成功时展示稳定清单 manifest（targetSlug, targetHash, headCommit, manifestHash, 生成时间及文件项表格），预检阻塞时展示 scopeConflict 阻塞路径与缺失必需字段；提供独立发布批准表单与动作，绑定 L2 授权；触发发布上线时进行状态锁与防重复点击保护；接通 release 阶段状态机（PREPARED → COMMITTING → PUSHED → VERIFYING → PUBLISHED/FAILED/UNKNOWN）与独立问答快照状态；失败/未知状态展示错误码解释并提供核对（reconcile）、重新核验（verify）、受控取消（cancel）操作，声明不假定回滚成功；支持刷新页面恢复阶段；后端新增 `POST /admin/content/release/prepare`、`GET /admin/content/release/target/:slug/latest` 与 `GET /admin/content/release/record/:id`；通过全部前端单元测试与 KernelModule 集成测试。

- [x] **C21 将旧工作站发布接入同一出口**
  - 前置：C17、C18、C11。落点：workflow/publication service 与既有 Publication 关联。
  - 动作：保留候选 hash 审批和作品状态，发布动作引用 ContentRelease；旧端点仅适配，不另起 git/核验链。
  - 验收：K2；旧完整作品链通过，PREPARED 仍不等于 PUBLISHED，旧接口也拒绝范围外内容提交。
  - 证据：[C21 将旧工作站发布接入同一出口](docs/evidence/GOAL-2026-09-25-C21.md)。更新 `apps/api/src/workflow/publication.service.ts`，在构造函数可选注入 `ContentReleaseService`；保留候选 hash 审批（`approvedArtifactHash !== artifactHash` 拦截）与作品状态推进（`APPROVED` → `PARTIALLY_PUBLISHED`/`COMPLETED`）；在 `publishWebsite` 写盘前与保存后均执行预检，若存在未提交代码或范围外脏文章等范围冲突，拒绝发布并抛出 `scope-conflict` 错误；发布动作通过 `prepareRelease` 引用 `ContentRelease` 并持久化 `publishApproval`，作品发布状态诚实记录为 `PREPARED`（仍不等于 `PUBLISHED`）；在 `verifyWebsite` 中优先通过 `ContentReleaseService` 的统一线上核验与问答快照同步出口核验，若 `ContentRelease` 为 `PUBLISHED` 或通过核验则更新 `Publication` 状态为 `PUBLISHED`，旧端点仅作为适配层，不另起独立的 git 或核验链；通过全部工作站测试与新增的 KernelModule 集成测试。

- [x] **C22 对齐项目与小店的内容边界**
  - 前置：C06、C11。落点：admin 内容类型筛选/字段表单、shared 已有内容模型。
  - 动作：项目使用现有类型和字段进入受控保存；小店仅展示已存在内容或未接入空态，不建订单/库存模型。
  - 验收：K2/K3；项目字段按实际模型校验、前台 AI 不能改进度；小店未接通功能不显示可执行交易按钮。
  - 证据：[C22 对齐项目与小店的内容边界](docs/evidence/GOAL-2026-09-25-C22.md)。在 `packages/shared/src/content-ledger.ts` 扩展 `CONTENT_GROUPS` 包含 `shop` 分组，新增 `ProjectMetadata`、`ProjectStatus`、`validateProjectMetadata` 与 `SHOP_BOUNDARY_NOTICE`；在 `apps/admin/src/pages/content/ContentListPage.tsx` 与 `labels.ts` 接入小店类型筛选，筛选项目时展示受控管理说明，筛选小店时展示小店边界声明与未接入空态；在 `apps/admin/src/pages/content/ContentDetailPage.tsx` 增加项目信息边界卡片与小店交易边界卡片（明确标注未接入并禁用非可执行交易按钮，杜绝虚构交易）；在 `apps/api/src/content-admin/content-admin.service.ts` 增加项目元数据合法性校验，正本保存严格经由 CAS 与受审计 mutation 出口；确认前台公开位置无内容写入路由，前台 AI 无法修改项目状态与进度；通过新增与全量前后台测试。

- [x] **C23 验证审批撤销和并发写入边界**
  - 前置：C09、C11、C18、C19、C21。落点：内容/发布 Kernel 集成故障测试。
  - 动作：在候选变更、撤销/派发竞争、CAS、文件/DB 中断、Git 已生效响应丢失各边界注入失败。
  - 验收：K2/K6；只发生被批准的一次效果、迟到结果不写入；对已提交的不可逆动作如实记录而不承诺自动回滚。
  - 证据：[C23 验证审批撤销和并发写入边界](docs/evidence/GOAL-2026-09-25-C23.md)。创建 `apps/api/src/content-mutation/content-concurrency-fault.kernel.integration.test.ts`，注入并验证 5 项关键并发与故障边界：1) 候选变更被篡改导致与审批 bindingHash 不符时，apply 拒绝执行，正本逐字节不变；2) 审批后若授权被撤销或修订版本提升，apply 复检立即拦截，排队任务绝不执行副作用写入；3) CAS 并发保存竞争：携带同一旧 expectedHash 的并发保存请求严格保证一成一败，冲突方捕获 content-version-conflict 且无静默覆盖；4) 发布锁排他保护：全工作区发布锁激活期间，正本修改（saveManual/apply）均被 409 content-locked 拦截，工作区冻结，第二并发发布同样被拒；5) Git 已生效后响应丢失/不可逆取消：系统拒绝误标取消未发布，如实返回事实状态，对不可逆阶段不承诺自动回滚；通过全部前后台门禁测试。

- [x] **C24 验收完整内容更新闭环**
  - 前置：C20、C22、C23。
  - 落点：§10、API/技术方案实现状态。
  - 验收：K1/K3/K4/K6；人工编辑 → Agent 候选 → 差异审批 → 保存 → 发布清单 → 网页核验 → 问答同步可演练；覆盖 A02–A03、A07–A08、A11–A13、A16–A17、A19–A20。
  - 证据：[C24 验收完整内容更新闭环](docs/evidence/GOAL-2026-09-25-C24.md)。新增 `apps/api/src/content-lifecycle.closed-loop.kernel.integration.test.ts`：用隔离 SQLite 与临时目录串行跑完人工编辑 → 候选生成 → 差异审批与一次性消费 → 受控保存 → 范围预检与稳定清单 → 独立发布批准 → 阶段推进（COMMITTING/PUSHED/VERIFYING）→ 线上核验 → 问答快照同步，并核验三版本事实终态。**过程中发现并修复 P0 真实缺陷**：`ContentRelease.sourceHash` 存的是正本文件字节 SHA-256，而线上证据（文章 HTML `content-hash` 与 `public-manifest.json` 条目 hash）是公开投影哈希，二者命名空间不同，导致生产环境线上核验与快照同步**永远不可能通过**（此前被 C17 直接构造 release 夹具掩盖）。修复：在 `packages/shared/src/public-snapshot.ts` 提供唯一映射 `toPublicSnapshotSource`/`publicItemHash`/`normalizeLegacyBody`，`prepareRelease` 的 `sourceHash`/`baseHash` 改用公开投影身份，文件版本由 `changeId → change.appliedHash` 追溯（无需新增列或迁移）；同时删除 `scripts/generate-content.ts` 中重复的 MDX 降级实现（约 50 行）改调共享实现，消除两处各写一份映射的漂移源。**变异验证**：把 `sourceHash` 改回文件 hash 立即失败，复原后通过。**等价性实测**：去重后重跑 `content:gen`，buildId/collectionHash/28 条 item hash/条目数逐一相同。新增投影一致性守卫（含对真实仓库内容逐篇核对构建 manifest）。全量门禁通过：typecheck、shared 45/347、api 127/607、web 40/227、agent 5/30、admin 14/51、build:api/admin/web、verify:geo、check:content-fields；C24 范围 17 文件 65 项连续 3 次全绿。未调用真实模型、未部署。

## 7. P2 / O：提醒、规划与复盘

- [x] **O01 增加提醒发生记录与复盘数据**
  - 前置：R02。落点：Action 增量、ReminderOccurrence、ReviewEntry migration/repository。
  - 动作：复用 Action，不新建通用任务中心；规定时区/单次到期/去重键，复盘保存行为、观察窗口、下一次尝试。
  - 验收：K2/K6；旧 Action 保留，重复 occurrence 受唯一键约束，日期转 UTC 可还原站点时区。
  - 证据：[O01 提醒发生记录与复盘数据](docs/evidence/GOAL-2026-09-26-O01.md)。shared 新增 `packages/shared/src/reminder.ts` 作为**唯一时间规则**：`DEFAULT_SITE_TIMEZONE=Asia/Shanghai`、`resolveActionDue`（日期 → 站点当日 00:00 → UTC，用 Intl 换算含跨夏令时校正）、`utcToZonedDate`（反向还原）、`reminderOccurrenceKey`（`actionId@dueAt@timezone`，**刻意不含扫描时间**）、`normalizeReviewWindow` 与结果/证据词表。持久层：`Action` 增量 `dueAt`/`timezone`（可空，旧行不反推）+ 索引；新表 `ReminderOccurrence`（`dedupeKey` 唯一索引、outcome/reason/resolvedAt）与 `ReviewEntry`（关联已核验 releaseId、行为/窗口/下一次尝试、evidenceState 默认 UNKNOWN、requestKey 唯一），迁移 `20260926100000_reminder_review`；两个 Prisma 仓储（撞唯一键返回既有记录，幂等）。用例与接口：`ReminderService` + `ReminderController`（`POST /ops/reminders/resolve-due`、`GET /ops/actions/:id/occurrences`、`POST|GET /ops/reviews`、`GET /ops/reviews/:id`，默认管理鉴权未进公开白名单）；`ActionService` 创建与改期经共享规则推导并**原子重算** `dueAt`（O03 延后不触发旧提醒的前提）。**开发中由测试暴露并修正一处语义**：未排期时不再返回默认时区（没有瞬时就没有「生成它的时区」）。验证：shared 10 项（含 UTC↔站点日期双向还原、三时区差异、America/New_York 夏令时边界）；Kernel 8 项（连续三次扫描仅 1 条发生记录、改期后旧到期再扫仍不新增、复盘 requestKey 幂等、旧 Action 行为保留）；K6 新库 22 条迁移全应用且 7 个新索引就位，旧表形状行经迁移后逐字段保留、新列为 NULL、重复 dedupeKey 被唯一约束拒绝；全量 typecheck、shared 46/357、api 128/615、web 40/227、agent 5/30、admin 14/51、build:api、public-route-boundary 通过。未调用真实模型、未部署。

- [x] **O02 实现到期扫描与恢复补检**
  - 前置：O01、R05。落点：OperationsService 定时扫描。
  - 动作：每5分钟扫到期未完成事项、启动即补扫；日期型按 Asia/Shanghai 当日00:00，发生记录与提醒创建同事务。
  - 验收：K2；跨日/重复扫描/进程重启不丢不重复，不调用模型、不发外部通知；已有提醒无需新建 Agent 进程。
  - 证据：[O02 到期扫描与恢复补检](docs/evidence/GOAL-2026-09-26-O02.md)。新增 `apps/api/src/reminder/reminder-scan.service.ts`，沿用仓库既有调度约定：`REMINDER_SCAN_INTERVAL_MS = 5*60*1000`（每 5 分钟）；`scanOnce(now)` 为唯一扫描入口（生产定时器、启动补检与测试**同一方法**）；`startScheduler()` 幂等且 `unref` 不拖住退出；单批 200 条、至多 20 轮限流；`scanning` 防重入；**恢复门挂起或库不可写时 fail-closed 不扫描**；结果如实计数 `{scannedAt, created, deduped, skipped}`（已存在只计 deduped，跳过不算成功）。`main.ts` 在恢复门清除后先补检再起调度器。去重不靠应用层判断：O01 的 `dedupeKey` 唯一索引才是保证，扫描只负责「反复敲门」。验证 10 项 Kernel 集成：只领取到期未完成事项（未到期/已完成均 0）；**连续三轮扫描恒 1 条**且如实计 deduped；**跨日补扫 + 重建整套模块（模拟进程重启、同一库）仍 1 条不丢不重复**；延后后旧到期再扫不触发、新到期才产生第二条；并发三路仅 1 条；计时器重复启动不叠加/可干净停止；**不调模型不发外部通知**（`fetch` 零调用 + `ExecutionRun` 行数一字未增）；恢复门 fail-closed 计数全 0、清除后恢复。全量 typecheck、shared 46/357、api **130/628**、web 40/227、agent 5/30、admin 14/51、build:api、verify:docs 通过；`src/reminder/` 21 项连续 3 次全绿。未调用真实模型、未部署。

- [x] **O03 实现提醒完成、延后与忽略**
  - 前置：O02。落点：现有 Action service/controller。
  - 动作：状态变更审计、plannedDate/下次发生时间原子更新，忽略可记录原因；请求键去重。
  - 验收：K2；连续延后不触发旧到期提醒，重复完成无额外副作用；未实现重复规则明确拒绝。
  - 证据：[O03 提醒完成、延后与忽略](docs/evidence/GOAL-2026-09-26-O03.md)。三种处置语义：`complete`（事项转 DONE、completedAt 落值、**dueAt 清空**，完成项不再被扫描领取）、`snooze`（`plannedDate/dueAt/timezone` **原子重算**，旧到期随改期失效 —— 这是「连续延后不触发旧提醒」的前提）、`ignore`（撤下这次到期、可带原因，但事项**仍保持 OPEN**）。**原子性为核心设计**：新增专用端口 `reminder-disposition.port.ts` + Prisma 适配器，让「发生记录结果 + Action 更新 + 审计」**同一事务提交**（既有 `OperationsJournalPort` 事务视图不含 Action/occurrence，塞不进去）；任一步失败整体回滚，杜绝「提醒已标记处理、事项仍指旧到期」的半截状态。**幂等与拒绝**：以审计行（targetType+action+requestId）为幂等依据，不额外建表，重放返回 `replayed: true` 且不写第二行；`repeat` 非 none 在**三处入口**（处置 / POST /actions / PATCH /actions/:id）一律返回 **501**，字段预留但首期只做单次，绝不静默丢弃或降级；`listDispositions` 按 action 过滤（auditRecord 是通用表）。验证 9 项 Kernel：完成/延后/忽略语义；**重复完成无额外副作用**（重放同 id、审计与记录恒 1 条）；**连续延后两轮扫描不触发旧到期、新到期才产生第二条**；带 repeat 抛错而 none 通过（处置与创建/更新入口都覆盖）；参数校验；**事务故障注入后四类事实一起回滚且失败请求键未被消费**；不调模型不发通知（fetch 零调用 + ExecutionRun 不增）。3 项 HTTP：匿名 401、完成 201 + 重放 true + 历史 1 条、延后/忽略生效、repeat 501。全量 typecheck、shared 46/357、api **132/640**、web 40/227、agent 5/30、admin 14/51、build:api、verify:docs、public-route-boundary 通过；`src/reminder/` 33 项连续 3 次全绿。未调用真实模型、未部署。

- [x] **O04 接通事项与提醒箱界面**
  - 前置：O03、F14。落点：admin 概览下一动作、内容详情提醒入口。
  - 动作：站主可为内容设置某日提醒，在后台完成/延后/忽略；不增第五个主工作面。
  - 验收：K3；创建后到期可见，刷新/重复点击状态稳定；提醒系统在 AI 关闭时仍工作。
  - 证据：[O04 接通事项与提醒箱界面](docs/evidence/GOAL-2026-09-27-O04.md)。**服务端算到期、前端只展示**：shared 新增提醒箱读模型（`REMINDER_DUE_STATES`、`ReminderInboxItem/ReminderInbox`、`classifyReminderDue`、`countReminderItems`），新增 `GET /ops/reminders/inbox`（只取 OPEN 事项，逐条带到期状态与最近发生记录结果）。**分类必须用站点本地日期**——用 UTC 日期会让站点 00:00–08:00 的「今天到期」错判成「已到期」；**计数不计已忽略项**。前端 `ReminderInboxPanel` 内嵌**概览页**与**内容详情「提醒」标签**（**不新增第五个主工作面**）；`ContentReminderPanel` 支持为某篇文章设置某日提醒（复用既有 Action，`entityType=CONTENT`）。**重复点击稳定**：每个处置按钮自带稳定 requestKey，重复点击复用同一键，服务端幂等回放，界面如实提示「此前已生效（重复点击未产生第二次副作用）」，不谎称又执行一次；延后按**本地日期 +7 天**计算，不用 UTC 运算（否则东八区少算一天）。验证：组件 9 项（四类徽章/时区今天/内嵌过滤/**同键复用**/幂等提示/延后日期/忽略/失败如实/空态）；shared 13 项（含**跨日边界**：站点 00:00 对应 UTC 前一日 16:00，断言必须用本地日期；计数忽略已忽略项）；API 集成新增**AI 关闭时提醒全链仍工作**；**K3 真实浏览器核验**（headless Chromium + CDP，隔离库 + 真实 content/log）：概览显示「已到期 1」与创建后的提醒、UTC 瞬时、三按钮齐全、内容详情「提醒」标签与表单可见、**实际点击「完成」得到「已标记完成」反馈、刷新后条目消失且计数归 0、控制台 0 错误**。全量 typecheck、shared 46/360、api 132/641、web 40/227、agent 5/30、admin 15/60、build:admin、verify:docs 通过；核验用服务与临时库已停止清理、端口已释放。未调用真实模型、未部署。

- [x] **O05 实现访客问题转更新事项**
  - 前置：O01、V20、V18。落点：conversation→Action 用例、records 详情按钮。
  - 动作：显式操作保存必要摘要及消息引用，按请求键去重；不复制完整访客会话或修改原内容。
  - 验收：K2/K3；可从事项追到保留期内证据，删除/过期显示证据不可用；转事项不授予 AI 内容写权限。
  - 证据：[O05 访客问题转更新事项](docs/evidence/GOAL-2026-09-27-O05.md)。**证据是软引用、不是外键**：新增 `Action.evidenceRef`（可空 JSON，迁移 `20260927100000_action_evidence_ref`）存 `{conversationId, messageIds, capturedAt}`。加外键只有两条错路——级联删除（访客删会话连带删掉站主建的事项）或 `Restrict`（阻止访客行使删除权），故用软引用让事项保留并如实标注证据不可用；`messageIds` 只保留该会话内**真实存在**的消息 id，伪造 id 丢弃。**三条红线**：显式操作（无任何自动建任务路径）；不复制会话（只存站主确认的摘要，默认不引用助手回答，正文只在会话表）；不授予 AI 写权限（只写 Action，测试直接断言 `AuthorizationGrant` 与 `ContentChange` 计数不变）。保留期口径**复用既有 `ConversationQueryService.detail`**（records 同一入口），不另写过期判断；删除判定用既有 `DeletionTombstone`。新增 `GET /ops/conversations/:id/action-preview`（零写入，摘要复用 shared `summarizeVisitorQuestion`）、`POST .../action`（`requestKey` 幂等）、`GET /ops/actions/:id/evidence`（`deleted`/`expired`/`missing`，不可用时 messages 为空且不假装可见）；排期复用 `resolveDue` 共享时间规则。界面：对话详情挂 `ConversationActionPanel`，成功即换新 requestKey。**发现并修复真实缺陷**：新测试在共享测试库建了 `DeletionTombstone` 未清理，污染了 `log-maintenance.cli`（SQLite 快照）与 `conversation-deletion.restore`（恢复核对）两个测试——此前记录的「批量顺序敏感」疑点由此解释并消除，不是既有测试不稳定。验证 11 项 Kernel（零写预览、幂等、删除后 deleted 且事项仍在、过期后 expired 不回填旧正文、伪造 id 丢弃、权限不变、排期规则）；K6 全新库 23 条迁移全应用、旧行 `evidenceRef` 为 NULL 不反推；全量 typecheck、shared 46/360、api **133/652 连续三次全绿**、web 40/227、agent 5/30、admin 15/60、build:api、build:admin、verify:docs、boundary 通过。**K3 如实标注**：未重跑 O04 的浏览器点击核验，前端仅挂面板+钩子且由既有 admin 测试覆盖。未调用真实模型、未部署。

- [x] **O06 实现可追溯的运营统计**
  - 前置：V20、V15、O03。落点：OperationsService 聚合、`/ops/overview`。
  - 动作：按唯一消息/运行/事件计数，分开成功/降级/交付确认/未知；提供统计窗口、来源与缺失覆盖率。
  - 验收：K2；重复事件/重新生成不抬高提问数，缺 usage 不计0，不制造没有分母的留存率/转化率。
  - 证据：[O06 可追溯的运营统计](docs/evidence/GOAL-2026-09-27-O06.md)。**口径只有一份**：新增 `packages/shared/src/ops-stats.ts`，把三条诚实纪律写成纯函数（服务端只取数组装，不在 SQL 里另写判定）：`countAsks`（提问数 = **唯一访客消息 id 基数**，`regenerationAttempts=Σmax(0,attempt-1)`）、`countAnswers`（成功/降级/**失败**/未知四类互斥 + 交付确认独立）、`summarizeUsage`（只累加**明确记录**的用量；全缺 → null + coverage；明确记 0 仍是 0）、`rateOrNull`（分母≤0 → null）、`resolveStatsWindow`。**开发中修正一处粉饰**：初版忽略 `state`，让 `FAILED` 被算进「降级但可用」；改为先判状态——`FAILED`/`CANCELLED`→failed，`UNKNOWN`/缺 `aiUsedFlag`→unknown，只有 `SUCCEEDED` 且 AI 实际产出未降级才算 succeeded。新增 `GET /ops/overview?window=24h|7d|30d`（缺省 7d，**非法窗口回落默认不报错**），返回 `provenance`（窗口 + 逐条口径来源 + 缺失覆盖）、asks、answers、usage、reminders、content。验证：shared 12 项（重复 id 去重、**重生成只增重生成数**、四类合计=运行总数、全缺失→null 且 coverage=0、零运行→coverage=null、明确 0 仍是 0、分母 0→null、三窗口精确）；Kernel 9 项（**再补两次重生成后提问/会话/轮次一字不变**、**coverage 严格介于 0 与 1 之间**证明缺失未被当 0 计入、总量恰为 100/50/150、窗口外不计入、来源与缺失声明齐备）；HTTP 实测（匿名 401 / 带 token 200；空库全部 null 不造假；有数据时 `runs=3, runsWithUsage=1, coverage=0.333, tokensIn=300, total=420`、`failed=1, succeeded=0, unknown=2`）。全量 typecheck、shared **47/372**、api **134/661**、web 40/227、agent 5/30、admin 15/60、build:api、build:admin、verify:docs、boundary 通过。**K3 如实标注**：界面侧留待 O07，此项未改前端故未做浏览器核验。未调用真实模型、未部署。

- [x] **O07 接通关键数据概览与状态刷新**
  - 前置：O06、C20、F14。落点：admin OverviewPage/records 筛选联动。
  - 动作：替换框架阶段的基础汇总，增加到期事项、内容三版本状态、访客问题与最近运行；每个数字可下钻。
  - 验收：K3；统计能追到相同筛选明细，5秒刷新/15秒陈旧表现正确；无数据可开始操作，无假趋势图。
  - 证据：[O07 接通关键数据概览与状态刷新](docs/evidence/GOAL-2026-09-27-O07.md)。**关键数据替换基础汇总**：概览页接入 `OpsStatsPanel`（消费 `/ops/overview`），展示访客提问、回答结果（成功/降级/失败/未知）、交付确认（访客已确认收到）、已到期事项、待上线内容与问答索引落后；5 秒可见轮询刷新，页面隐藏时停轮询；超过 15 秒未刷新标记「数据已陈旧（超过 15 秒）」；无数据引导无假图表（不绘制任何虚假趋势图）。**每个数字可下钻且筛选联动**：到期事项下钻至 `/overview?scope=overdue`，`ReminderInboxPanel` 过滤只看逾期项并提供提示与清除按钮；访客提问下钻至 `/records?tab=visitors`，激活访客对话；失败运行下钻至 `/records?tab=visitors&runState=FAILED`；待上线内容下钻至 `/content?stage=ready`，`ContentListPage` 同步 URL `stage` 参数与下拉筛选；运营记录开放 `reminders` 标签接入 `ReminderInboxPanel`。**K3 真实浏览器核验**（Headless Chromium + WebSocket CDP）：概览提问 1/到期 1/送达 1；展开口径声明；确认 DOM 无假趋势图；下钻已到期事项显示对应条目与筛选提示；下钻访客对话显示访客问题；下钻内容阶段绑定 ready；**控制台 0 错误**。组件与页面测试：`OpsStatsPanel` 9 项全绿、`ContentListPage` 4 项全绿、`ReminderInboxPanel` 10 项全绿。全量门禁：typecheck、shared 47/372、api 134/661、web 40/227、agent 5/30、admin 16/71、build:api、build:admin、verify:docs、boundary 全绿；核验服务与临时目录已清理。未调用真实模型、未部署。

- [x] **O08 实现一次内容更新复盘**
  - 前置：O01、C24、O06。落点：ReviewEntry service/controller、admin records 复盘表单。
  - 动作：关联 Action/已核验发布版本，记录做了什么、观察结果、窗口、下一次尝试；允许自由文本，不强制固定方法论。
  - 验收：K2/K3；保存可回看、指标有来源，样本不足可明确写未知；模型建议不能自动变成已验证成效。
  - 证据：[O08 内容更新复盘](docs/evidence/GOAL-2026-09-27-O08.md)。**领域模型与前后端契约**：shared 新增 `ReviewEntryView`，包含 actionId、releaseId（可选）、didWhat（必填）、observed（自由文本）、windowStart/End（日期）、evidenceState（UNKNOWN/INSUFFICIENT/SUFFICIENT，**样本不足如实写未知**）、evidenceNote（指标来源说明）、nextAttempt（下一次尝试）与 requestKey。**服务端校验与红线**：`createReview` 支持校验 `releaseId`——若发布记录存在且 stage 不是 `PUBLISHED`（如 COMMITTING/FAILED），严格拒绝关联（400 `review-release-must-be-published`，杜绝关联未上线草稿）；`listReviews` 支持全局与按事项查询；以 `requestKey` 数据库唯一索引保证幂等；**模型建议不能自动变成已验证成效**——只有人工站主在工作台显式提交才落库。**前端面板**：运营记录新增「更新复盘」标签页（`tab=reviews`），挂载 `ContentReviewPanel`；表单支持录入各维度事实；卡片呈现客观观察、指标说明、证据充分度彩色徽章（充分绿/不足橙/未知灰）与下一次尝试；提供无记录友好空态。**K3 真实浏览器核验**（Headless Chromium + WebSocket CDP）：导航至 `/records?tab=reviews` 激活复盘标签并展示空态；展开表单录入完整复盘事实（关联事项、didWhat、observed、INSUFFICIENT 状态、来源说明、nextAttempt）；提交成功提示「复盘记录已保存，结果真实可查，不预设成效。」；列表正确渲染复盘卡片与徽章；刷新页面验证数据持久化存在；**控制台 0 错误**。Kernel 集成测试 5 项全绿；前端组件测试 4 项全绿。全量门禁：typecheck、shared 47/372、api 135/666、web 40/227、agent 5/30、admin 17/75、build:api、build:admin、verify:docs、boundary 全绿；核验服务与临时目录已清理。未调用真实模型、未部署。

- [x] **O09 实现复盘建议显式转下一事项**
  - 前置：O08、O03。落点：ReviewEntry→Action 用例/按钮。
  - 动作：站主选中下一次尝试才创建 Action，保留复盘引用和幂等键；不自动选题/发布。
  - 验收：K2/K3；重复点击一条事项，新事项可设置提醒，从事项可回溯原复盘。
  - 证据：[O09 复盘建议显式转下一事项](docs/evidence/GOAL-2026-09-27-O09.md)。**领域模型与前后端契约**：`ACTION_ENTITY_TYPES` 加入 `REVIEW`，新 Action 设置 `entityType='REVIEW'` 与 `entityId=review.id`（零 schema 迁移）。**服务端用例**：`convertReviewToAction` 严格校验复盘存在且 nextAttempt 非空；以 `requestKey` 与审计记录保证幂等；支持传入 `plannedDate` 并由 `resolveActionDue` 计算 `dueAt`（UTC 瞬时）与 `timezone`；**不自动选题/发布**（仅显式建 Action，不建 Seed/Release）；新增 `GET /ops/actions/:id/review` 双向回溯原复盘。**前端组件**：`ContentReviewPanel` 在带有 nextAttempt 的卡片下渲染日期输入框与「转为下一事项」按钮，按钮自带独立 requestKey，重复点击服务端幂等回放，界面提示「这次转换此前已生效（重复点击未创建第二条事项）」。**K3 真实浏览器核验**（Headless Chromium + WebSocket CDP）：打开 `/records?tab=reviews`，填入提醒日期 `2026-10-25` 并转换成功；重复点击收到幂等提示；导航至 `/overview` 确认提醒箱中出现该新事项且排期显示为 `2026-10-25`；**控制台 0 错误**。Kernel 集成测试 6 项全绿；前端组件测试 7 项全绿。全量门禁：typecheck、shared 47/372、api 136/672、web 40/227、agent 5/30、admin 17/78、build:api、build:admin、verify:docs、boundary 全绿；核验服务与临时目录已清理。未调用真实模型、未部署。

- [x] **O10 验收一次真实运营回路**
  - 前置：O04、O05、O07、O08、O09、V24、C24。
  - 落点：§10、一条非敏感演练记录或站主选定的真实内容记录。
  - 验收：K1/K3；问题 → 更新事项 → 候选/审批 → 发布核验 → 复盘 → 下一事项全链可追；覆盖 A01、A14–A15、A20、A28，不编造增长结果。
  - 证据：[O10 验收真实运营回路](docs/evidence/GOAL-2026-09-27-O10.md)。**全链路八阶段端到端真实演练**：新增 `operations-lifecycle.closed-loop.kernel.integration.test.ts`，在真实 SQLite 库与核心服务接线下完整串联：1. 真实访客提问（delivery=ack，不改正本）；2. 显式转为更新事项（软引用、带排期 2026-10-01、可追溯保留期内正文）；3. 提醒到期扫描与站主处置（延后至 10-04，完成转 DONE 且清空 dueAt）；4. 正本受控保存、候选生成、审批消费与原子应用（A11/A12/C05/C06）；5. 发布预检、状态机推进（COMMITTING→PUSHED→VERIFYING）、线上核验器确证与问答快照同步（C12/C14/C16/C17）；6. 内容更新复盘（关联事项与 releaseId，来源说明来自 /ops/overview 7d 统计，样本不足如实写 INSUFFICIENT，记录 nextAttempt）；7. 复盘建议显式转下一事项并设置提醒（2026-10-15，从新事项可准确回溯原复盘）；8. 运营统计（/ops/overview 30d）聚合验证真实事实。**覆盖 A01、A14–A15、A20、A28，不编造增长结果**。**K3 浏览器核验覆盖**：继承自 O04/O07/O08/O09 各项 Headless Chromium + WebSocket CDP 端到端核验。全量门禁：typecheck、shared 47/372、api **137/673**、web 40/227、agent 5/30、admin 17/78、build:api、build:admin、verify:docs、boundary 全绿。未调用真实模型、未部署。

## 8. P3 / G：整体验证、迁移与上线

- [x] **G01 完成旧数据导入与兼容读演练**
  - 前置：R24、V24、C24、O10。落点：幂等迁移/导入脚本、旧报表适配。
  - 动作：复制隔离数据演练 Agent/旧 run/会话索引迁移，legacySource/legacyId 去重；无法恢复的修订/确认/用量保持未知。
  - 验收：K6；升级两次行数稳定，旧业务链可读、新记录单一权威写入；不以新表空白为理由删除旧历史。
  - 证据：[G01 旧数据导入与兼容读演练](docs/evidence/GOAL-2026-09-27-G01.md)。**逻辑与装配分离**：新增零装饰器的 `legacy-data-migration.core.ts`（纯迁移逻辑，CLI 与 Nest 共用同一份实现），`LegacyDataMigrationService` 仅做 DI 薄壳，新增 `scripts/migrate-legacy-data.ts` 与 `pnpm legacy:migrate`。**为什么这样分层**：`scripts/tsconfig.json` 未启用 `experimentalDecorators`，脚本 import 带装饰器的 Nest 类会直接报错；把纯逻辑抽出既复用同一实现又无需给脚本加装饰器配置。**溯源去重**：`ExecutionRun` 增加 `legacySource`/`legacyId` 两列 + `(legacySource, legacyId)` 唯一索引（迁移 `20260927110000_execution_run_legacy_source`）。**四条纪律**：幂等（先按键查存再写，第二次增量恒为 0）、溯源去重、诚实未知（`agentRevisionId` 一律 null；用量为 0 记 null 而非 0）、历史保全（旧表只读保留绝不删）。历史 AgentUnit 无修订则生成初始修订（version 1）并写审计；AssistantRun 迁移回写 traceId 并补齐 ConversationLogResource 会话索引。验证 4 项 Kernel：首次迁移（state 映射、agentRevisionId=null、有用量保留 120/60、**无用量为 null 而非 0**、traceId 回写、会话索引补齐）；**升级两次增量全部严格为 0 且三项行数逐一对齐不变**；旧业务链可读（旧表 2 条一行未删、报表适配器 total=2 且明细完整）；新记录单一权威写入（只写 ExecutionRun，旧表行数不增）。**CLI 实测**：隔离库连续两次执行，第二次 `revisionsCreated/agentRunsMigrated/skillRunsMigrated` 全部归零。全量门禁：typecheck、shared 47/372、api **138/677**、web 40/227、agent 5/30、admin 17/78、build:api、build:admin、verify:docs、boundary 全绿。未调用真实模型、未部署。

- [x] **G02 完成完整失败恢复演练**
  - 前置：G01、C23、V19。落点：恢复脚本、可重放集成验收。
  - 动作：合并验证进程孤儿、文件/DB不一致、发布未知、补写与删除竞争、备份恢复；避免各模块恢复顺序互相打架。
  - 验收：K6；恢复前不开放不可信状态，恢复后权限/正文/公开版本/删除事实一致；保留每个失败点结果。
  - 证据：[G02 完整失败恢复演练](docs/evidence/GOAL-2026-09-27-G02.md)。新增 `recovery-order.g02.kernel.integration.test.ts`（6 项）在真实 KernelModule 接线下逐点注入失败：**①恢复未完成**——闸门挂起期间一切请求 503 绝不放出半恢复数据，闸门路径推导恒定单一；**②进程孤儿**——租约不属于当前批次标 UNKNOWN 不伪造终态，活着的孤儿绝不误判为已退出（槽继续占用防双开）；**③发布结果未知**——UNKNOWN ≠ PUBLISHED，线上无证据时 reconcile 后不升级、verifiedHash 保持 null，公开版本快照不被污染；**④补写与删除竞争**——墓碑保持 completed 终态不回退，迟到补写的资源被精确清除；**⑤从旧备份恢复**——删除清单重放把删除事实补回，复活的正文再次被清干净；**⑥恢复顺序不打架**——清单重放 → 删除续跑与 main.ts 启动顺序一致，续跑不重开已完成墓碑。**发现并修复真实缺陷**：`resumePending()` 只查未完成态墓碑，删除完成后旧路径的迟到补写**永久残留**。第一次修复（全局清扫已完成墓碑）被合并验证立即否决——并行测试跨文件互相打架（conversation-export/content-review 相继失败且集合漂移），因为 `finalizeConversation` 连带删 featureEvent/assistantRun/turns/运行，作为补写清扫远超必要范围；**最终修复**改为 `lateWriteResources()` 只取 `registeredAt > completedAt` 的记录，只认"删除完成之后才冒出来的写入"，清扫限定三步删除（文件+数据库正文+资源登记），不重跑整段删除、不回退终态、不触碰会话行。修复后全量 api 139/683 全绿，跨文件干扰消失。全量门禁：typecheck、shared 47/372、api **139/683**、web 40/227、agent 5/30、admin 17/78、build:api、build:admin、verify:docs、boundary 全绿。未调用真实模型、未部署。

- [x] **G03 完成目标机器资源和并发验收**
  - 前置：R21、C19、G02。落点：目标环境探针报告/运行配置。
  - 动作：按默认单模型槽跑公共与后台排队、终止、恢复；验证内存余量、日志/磁盘上限、维护构建流程。
  - 验收：K5；一个活跃模型运行、无孤儿进程、至少512MB目标可用余量或记录不满足并降级/阻止该能力上线；不偷偷扩机器或双槽。
  - 证据：[G03 目标机器资源和并发验收](docs/evidence/GOAL-2026-09-27-G03.md)。新增 `resource-concurrency.g03.kernel.integration.test.ts`（6 项）验证：**单槽纪律**（第一条 RUNNING 后第二条保持 QUEUED、runtime.start 恰好一次、槽释放后下一条才领取、MODEL_SLOT_LIMIT=1 固定）；**公共排队上限**（塞满 PUBLIC_QUEUE_LIMIT 后第 N+1 条如实降级「已满」，不假装排队成功）；**终止语义**（STOPPING→CANCELLED、close 有退出证据、槽立即释放）；**恢复语义**（遗留租约丢失标 isolated→退出被证明 released FAILED+lease-lost）；**资源门禁**；**无孤儿进程**（全部终态后占用槽位 0）。**新增内存余量门禁**：shared `resource-gate.ts`（DEFAULT_MIN_FREE_MEMORY_MB=512、memoryHeadroomOk 纯判定、resolveMinFreeMemoryMb 运维覆盖）+ readiness `resourceHeadroom` 门（真实 os.freemem 不足即 blocked → canEnable=false 阻止上线）+ admin「目标机器内存余量」标签。**设计决策（全量回归否决第一版）**：门禁最初放 dispatchOnce 热路径 → 28 个既有测试失败（开发机测试矩阵内存常态低于 512MB，全部执行被阻断）——暴露验收条款语义是「上线门」而非运行时检查；最终放 readiness + 运维 env（vitest 显式设 0，生产默认 512）。**实测注记**：本机当前 os.freemem 仅 64-100MB，门禁真实环境确实阻断——这是正确性的现场证据；目标盒子实际余量 G07 部署实测。全量门禁：typecheck、shared 48/376、api **140/689**、web 40/227、agent 5/30、admin 17/78、build:api、build:admin、verify:docs、boundary 全绿。未调用真实模型、未部署。

- [x] **G04 完成仓库规定回归链**
  - 前置：G02、G03。
  - 落点：§10 回归实录。
  - 验收：K1/K4 及 admin test；测试库确认隔离。若改动涉及代码抽取/MCP 运行 `pnpm verify:architecture`；结果与具体代码版本绑定，无未解释新失败。
  - 证据：[G04 仓库规定回归链](docs/evidence/GOAL-2026-09-27-G04.md)。**代码版本绑定**：`main` HEAD `8884913`（`88849136e385900f6ca0c506cdce71fae2cc4717`）+ 本批工作树，`content/` 干净。**K1 全绿**：typecheck（5 包）、shared 48/376、api **140/689**、web 40/227、agent 5/30、admin 17/78、build:api、build:admin —— 合计 **1400 项 0 失败**。**K4 附加门全绿**：check:content-fields（29 文件字段齐全）、build:web（vite+预渲染+feeds+pagefind）、verify:geo（27 页/27 MD alternates/sitemap+RSS+JSON Feed+JSON-LD）、**verify:architecture**（无新增结构硬伤，已知债务 4 条）——架构门禁本轮必跑，因 G01–G03 新增源文件改变代码图谱。**测试库隔离双重确证**：① 正向——回归前后开发库 sha256/size/mtime **逐字节完全一致**（`5fd860570558…`/417792/1788865083），1400 项测试确实只写独立 `.test.db`；② 反向——把 `API_TEST_DB_URL` 显式指向开发库时 vitest **启动即失败**（`API_TEST_DB_URL 必须是绝对路径的独立 SQLite .test.db 文件`），fail-closed 无「配错就写开发库」路径（三道守卫：config 强制改写+校验、globalSetup 每轮重建+校验、非 `.test.db` 直接抛错）。**无未解释新失败**：G02 跨文件干扰与 G03 热路径门禁的失败均已在其各自任务内定位并修正，本轮为修正后干净基线。未调用真实模型、未部署。

- [x] **G05 逐条签收 PRD 验收**
  - 前置：G04。落点：本文件 §11 验收映射、证据记录。
  - 动作：逐条执行 A01–A28，引用所属任务证据，记录尚未过项；页面空态不等于该功能已完成。
  - 验收：K3/K6；28项均有可复查结果；生产专属条目待 G08 实测，不能在本项提前声称生产通过。
  - 证据：[G05 逐条签收 PRD 验收](docs/evidence/GOAL-2026-09-27-G05.md)，判定已回写本文件 §11 表（新增「G05 判定」列）。**结果：28 项均有可复查结果，0 项未过** —— **24 项「已过（本地）」**（A01、A03、A05–A09、A11–A15、A17–A28），**4 项「本地已过 / 真实待 G08」**（A02 真实上线并打开页面、A04 真实访客调用绑定版本、A10 真实模型通道可用性、A16 真实线上版本比对）。每项均引用所属任务的证据文档，不照抄任务映射；判定口径明确「已过（本地）= 有可运行测试/证据文档/K3 记录」。**不提前声称生产通过**：当前公共位置 readiness 仍 blocked（缺 `WALKER_RUNTIME_PROBE_REPORT` + G03 新增内存余量门），符合 A20「未接入能力不得显示已可用」；§4 另列 G08 生产实测清单（A02/A04/A10/A16 四项）。依据 G04 干净基线：HEAD `8884913` 上 1400 项 0 失败。未调用真实模型、未部署。

- [x] **G06 准备可恢复的部署包与执行顺序**
  - 前置：G05。落点：`ops/windows/README.md`、部署/迁移脚本与回退说明。
  - 动作：固定代码/SDK/runtime/迁移版本、备份和删除清单、停服释放引擎顺序、能力关闭默认值；安排 manifest 基线构建先于新公共问答启用。
  - 验收：K0/K6；隔离演练部署/回退可执行；现有 content dirty 检查、持久目录不覆盖、公开双白名单均保留；不靠旧无授权写路径回退。
  - 证据：[G06 可恢复部署包与执行顺序](docs/evidence/GOAL-2026-09-27-G06.md)。**发现并修复真实缺陷**：`ops/windows/install-dsh.ps1` 硬编码 `@deepseek-ai/dsh@0.1.2-alpha.3`，而代码已钉 `0.1.5-rc.3`——adapter 要求 SDK 与 runtime 同版本，照旧脚本装机 runtime 直接起不来；改为**从 `apps/api/package.json` 派生**（单一真相源，缺失即抛错），保留 UTF-8 BOM。**新增机器门禁 `pnpm verify:deploy`（K0）15 项**：dsh 家族 23 包版本唯一、安装脚本不硬编码版本、探针与代码版本一致、24 迁移命名唯一有序、migration_lock 存在、能力默认关闭（env 模板+部署文档）、content dirty 脚本+文档要求、备份/恢复脚本存在、data 不覆盖声明、**Nest↔Caddy 双白名单逐方法一致**、回退禁止旧写路径——失败即拒绝发版，不靠人肉检查表。**检查范围自我修正**：初版误把 `cordis*` 插件纳入同版本比对（它们有独立版本线），收窄为 dsh 家族。**K6 隔离演练**（`--drill`，临时库、结束即删）：迁移 24 项全应用 → `VACUUM INTO` 快照 45 表 → 回退后 45 表一致、**未走任何旧写入接口**。**部署文档新增「部署包与执行顺序」**：版本固定表（各标真相源）、停服与释放引擎顺序（不可调换）、能力关闭默认值表（含首期未接入四项）、备份/可删/绝不删三清单、**manifest 基线构建先于公共问答启用**（附理由：索引只认已核验快照）、回退说明（优先关能力而非回滚代码；禁止回退到旧无版本写路径；恢复前保持 503 不开放不可信状态）。全量门禁：typecheck、shared 48/376、api 140/689、web 40/227、agent 5/30、admin 17/78、build:api、verify:docs、verify:architecture 全绿（1400 项 0 失败）。未调用真实模型、未部署（真实部署属 G07）。

- [x] **G06.R 修复代码审查发现的七项发布与编辑边界**（G07 前置补检，本地通过）
  - [x] R1–R2：API/脚本共用持久锁并接续持有权；发布执行必带批准单，复检当前文件/公开 hash 与显式授权，撤销和阶段推进同事务排序。
  - [x] R3–R4：派发后的未知推送保持 `UNKNOWN`；生成图谱进入内容提交范围，含 Git 标识的 manifest 改为构建产物，不留下阻断下一次发布的脏文件。
  - [x] R5–R7：新版本可再次批准；已发布网页版本独立查询；数据路由阻断站内跳转和后退造成的草稿丢失。
  - 验收：[G06.R 修复证据](docs/evidence/GOAL-2026-09-27-REVIEW-FIX.md)。`pnpm typecheck`；shared 48/376、API 141/706、Web 40/227、Agent 5/30、Admin 17/80；`build:api`、`build:admin`、`build:web`（内含 GEO）、`verify:docs`、`verify:deploy` 15/15 均通过。API 测试只使用隔离 `walker.test.db`；Web 构建前后恢复原有生成文件字节。本地修复不等于 G07/G08 生产验收。历史 C13/C14/C18/C19/C20 证据中的旧边界判定由本项修正。

- [ ] **G07 部署基础服务与静态版本证明**
  - 前置：G06。落点：实际部署操作、`docs/STATUS.md`。
  - 动作：依部署流程备份、迁移、构建、重启，先保持新位置/写入关闭；上线带 manifest 的静态版本，建立已核验公开基线。
  - 验收：K5；health版本、8788进程归属、443、路由隔离、静态 manifest/hash 均实测；部分失败维持关闭并按事实恢复，不能覆盖 data。
  - **2026-09-27 侦察与阻塞（未完成，不计通过）**：SSH 主路径初不通（本机 Tailscale 处于 stopped），已恢复 Tailscale 后主路径可用（`walker-server` → `10.3.0.8`）。
    - **只读 K5 实测（对当前生产，全部真实测量）**：① health 版本 `e7493f1` **等于**盒子 git HEAD `e7493f1`（版本回显诚实）；② 8788 归属 PID **3884** 且仅监听 `127.0.0.1`；③ 443 归属 PID **3092**（Caddy）；④ 路由隔离：`/clues`、`/ops/overview`、`/ops/capabilities`、`www/api/clues` 匿名访问**全部 404**；⑤ 盒子资源：可用内存 **~765MB**（满足 G03 的 512MB 阈值）、C 盘余 **28GB**。
    - **⑤ 静态 manifest/hash 未满足**：`apps/web/dist/public-manifest.json` 仅存在于本地构建（28 条目、collectionHash `0c07157…`、gitCommit `8884913`），生产 `/public-manifest.json` 与 `/manifest.json` 均 **404**——「带 manifest 的静态版本」尚未上线。
    - **生产库现状（关键）**：`C:/Walker/data/walker.db` **无 `_prisma_migrations` 表**（历史由 `db push` 建立）；当日仅凭部分表存在而**初步误判**处于基线态；后续对生产副本做完整 schema diff，确认缺 `SkillRun` 且 `AgentRun` 少三列，`db:baseline` **实际拒绝**（见下方「2026-09-27 生产库迁移预演」）。此处保留误判经过，不作为部署指令。
    - **阻塞（需站主授权，未擅自执行）**：部署要求代码已推送到 GitHub，而本地**真实远程 main = `9e738b1`**，本地领先 **2 个未推送提交 + 437 项未提交改动**；其中含**并非本次工作产出的既存改动**（`apps/api/src/runtime/probe-gate.ts` 及其测试、`docs/evidence/runtime-probe.json`、`scripts/probe-runtime.mts→.ts`、`mario/`、`packages/dsh-open-design`）。提交这些并把 main 推送会**同时触发 Vercel 生产 web 自动发布**；随后 `backup-walker.ps1` 会**停止 WalkerGateway(443) 与 WalkerApi(8788)** 造成真实中断，`db:migrate` 会把 23 个迁移应用到**含真实数据的生产库**（不可逆，除非先备份）。
    - **下一步（待授权的最小动作）**：① 由站主确认可提交范围（是否包含既存第三方改动）并授权推送 main；② 授权一次生产停服窗口（备份→baseline→migrate→构建→重启）；③ 部署后补齐 §11 中 A02/A04/A10/A16 的真实成分实测（G08 承接）。
  - **2026-09-27 生产库迁移预演（把生产库副本拉到本地，用新代码 24 个迁移演练——零生产风险）**：
    - **发现 1（会炸掉部署）**：文档流程 `pnpm db:baseline` 在**生产库副本上直接拒绝**：`数据库 schema 与迁移历史不一致（Prisma diff exit 2），拒绝修改数据库`。根因经精确定位：**生产库 schema 比基线迁移更旧**——基线建 `SkillRun` 而生产**没有**该表；基线 `AgentRun` 含 `providerId`/`promptSnapshot`/`temperature` 而生产只有 14 列（缺这 3 列）。即生产库既无迁移历史、也不等于基线快照，**按文档流程部署会在 baseline 步失败**。
    - **发现 2**：备选 `prisma db push`（生产库原本就是这么建的）**被拒绝**——它要求 `--accept-data-loss`（新增 `AssistantRun.anonIdHash+requestKey` 唯一约束），而仓库策略明令禁止该标志。
    - **生产真实数据画像（2026-09-27 更正）**：上轮「有数据的只有 AssistantRun/FeatureEvent」**判断不完整**——那只是抽查了部分表。经本轮**全表扫描**（脚本逐表枚举）实测：生产库有数据的是 **8 张表共 218 行** —— `FeatureEvent` 112、`AssistantRun` 44、`AssistantSession` 38、`AssistantBudget` 8、`Clue` 7、`GuestQuota` 7、`ContentFeedback` 1、`LikeCounter` 1；无数据的遗留表为 `AgentRun`/`AgentUnit`/`Credential`/`ModelProvider`（均 0 行）。整个库仅 384KB。**搬迁必须保全 218 行，不能只搬两张表**。
    - **发现 3（已验证的可行路径）**：备选 C「全新库 + 全量迁移 + 真实数据搬迁」在副本上**端到端跑通**——① 新库应用 24 个迁移；② 搬迁 `AssistantRun` 44→44、`FeatureEvent` 112→112（按列交集显式搬运，**源独有列 0 个，无数据丢失**）；③ `prisma migrate diff --exit-code` 报 **`No difference detected`**（与目标 schema 零差异）；④ 再跑 `db:migrate` 返回 **`No pending migrations to apply`**（迁移历史干净、可重复）。
    - **推荐路径（待授权执行）**：停服 → 备份现库 → 按备选 C 重建生产库并搬迁 44/112 行 → 指向新库 → 构建 → 重启。**不采用** `--accept-data-loss`，也不谎报 baseline。
    - **演练安全性**：全程只操作 `/tmp` 下的副本；开发库 sha256 演练前后均为 `5fd860570558…` **未变**；未对生产做任何写操作。
  - **2026-09-27 迁移脚本交付（把上述路径固化为可复跑工具）**：新增 `scripts/rebuild-legacy-db.ts` + `pnpm rebuild:legacy-db --from <旧库> --to <新库> --confirm`。**五道失败即拒守卫**：缺参数拒绝、相对路径拒绝、缺 `--confirm` 拒绝、源库已有迁移历史拒绝（应走 `db:migrate`）、目标库已存在拒绝（绝不覆盖）。**对生产副本端到端实测**：新库应用 24 迁移 → 全表按列交集搬迁 **218 行 / 8 表**（`FeatureEvent` 112、`AssistantRun` 44、`AssistantSession` 38、`AssistantBudget` 8、`Clue` 7、`GuestQuota` 7、`ContentFeedback` 1、`LikeCounter` 1）→ **无任何源独有列未搬迁** → `migrate diff --exit-code` **零差异**；目标 schema 已删除的 `Credential`/`ModelProvider`（均 0 行）如实列为「未搬迁，请确认可弃」。五道守卫逐条实测均正确拒绝。
  - **2026-09-28 本地启动补验（不计 G07 生产完成）**：开发库无迁移历史且与基线不同，`db:baseline` 按设计拒绝。先用 SQLite 一致备份保留旧库；首次重建暴露按表名字母序复制时 `Execution` 先于父表 `Seed` 的外键失败，修复为按目标库外键依赖排序后再试。新库完成 24 迁移，旧库 11 张非空表 **689 行逐表对齐**，`integrity_check=ok`、`foreign_key_check=0`、迁移 diff 零差异；旧开发库 SHA-256 未变。仅本地 `.env` 指向新库，API 已启动；生产仍待 G07 授权和实测。
  - **2026-09-28 G07 部署前复验（不计生产完成）**：从运行中的生产 SQLite 通过 `VACUUM INTO` 创建独立一致快照，本地与服务器 SHA-256 一致（`f8fd21a86fa84115900f1c44a3b6c536dbb124707c066e0d7bdb6e843e71c278`），服务器临时文件已清理，生产原库未写。快照 `integrity_check=ok`、`foreign_key_check=0`，8 张非空表共 218 行；修复外键复制顺序后的 `rebuild:legacy-db` 在隔离目录应用 24 迁移并搬迁 218 行，共有列值逐行一致，源独有表 `Credential`/`ModelProvider` 均 0 行，目标 `integrity_check=ok`、`foreign_key_check=0`、schema diff 零差异。独立旧库副本恢复后 SHA-256 与备份一致、218 行可读。完整候选边界与待决项见 [G07 文件清单](docs/evidence/G07-CANDIDATE-FILES-2026-09-28.md)；本轮未提交、未推送、未停服或切库。
  - **2026-09-28 G07 候选与门禁补验（不计生产完成）**：[目标与证据](docs/evidence/GOAL-2026-09-28-G07-PREFLIGHT.md)及[535 路径候选清单](docs/evidence/G07-CANDIDATE-FILES-2026-09-28.md)已形成；512 个拟纳入、23 个排除。独立 `dsh-open-design` 排除后，临时六工作区 `pnpm install --frozen-lockfile --ignore-scripts --offline` 通过。K6 原脚本对不存在的 SQLite 文件直接迁移，RED 稳定失败；先预建空库后 GREEN，回归测试通过。最终 typecheck、shared 376、API 706、Web 227、Agent 30、Admin 80、API/Admin/Web 构建、GEO、架构、文档、K0 15/15 与 K6 演练、`git diff --check` 均通过。原开发库 SHA-256 未变。未提交、推送、停服或切换生产库。

- [ ] **G08 分步启用并核验首期系统**
  - 前置：G07、V23、C24、O10。
  - 落点：生产能力配置、`docs/STATUS.md`、API/架构现状和本文件。
  - 动作：依次启用新后台、首个文章位置、单次内容写入/发布；以一次实际请求和内容发布验证线上记录与版本，测试数据依删除政策清理。
  - 验收：K3/K5；A01–A28 的生产相关条目完成实测，问题闭环后才能标“首期完成”；未通过能力单独关闭，保留人工运营/规则回答。

## 9. 明确暂缓，不计入首期完成条件

| 项目 | 推迟原因 | 重启条件 |
|---|---|---|
| 多 Agent 自动路由、接力与投票 | 显式切换足够验证位置与角色价值 | 有真实问题必须跨角色，且能给出成本/效果验收 |
| L3 持续自主修改/发布内容 | 先证明 L2 的精确授权和恢复边界 | 单次闭环稳定，站主明确给出对象、动作、周期和撤销范围 |
| 双模型槽/更多常驻进程 | 2GB资源尚未证明有余量 | 单槽排队数据构成瓶颈，双槽实测通过且值得增加成本 |
| Paperclip/Langfuse/Dify 整栈 | 重叠后端和资源成本超过首期收益 | 现有单体出现无法合理解决的具体缺口 |
| 重复提醒、外部事实自动追踪 | 首期先单次到期和后台事实同步 | 单次提醒被实际使用，出现明确重复或来源监测规则 |
| FTS/向量库/专用搜索服务 | 首期筛选后关键词查找足够 | 查询实测延迟/数据规模触发，索引可跟随删除 |
| 自媒体方法论引擎、全站留存体系 | 尚无稳定方法论及完整访客分母 | 有多次复盘证据，能定义真实业务指标 |
| 小店交易/订单/库存、多站主组织 | 本次对象是内容运营与单站主管理 | 独立产品需求确认后另立 PRD |

## 10. 执行实录与接续规则

当前：**F01–F18、R01–R33、V01–V24、C01–C24、O01–O09 已本地验收（C 系列完成，O 系列进行中）；下一项 O10**。R21 的真实 SDK 探针通过记录见下方历史行；当前 API 未配置 `WALKER_RUNTIME_PROBE_REPORT`，V23 因此继续阻断真实公共位置。V24 用假 Runtime 做集成，不替代真实模型/生产验证；C 系列与 O 系列已全部完成，G 系列已完成旧数据导入、失败恢复、资源并发、回归链、PRD 28 项逐条签收与可恢复部署包（含 SDK 版本漂移修复），进入实际部署阶段；G07 已侦察并阻塞待授权，尚未部署。关键约束：`to-do.md` 是唯一原子进度源；模型失败规则降级、权限失败不放行；不触发部署。

| 日期 | 任务 ID | 状态 | 变更/决策 | 验证与证据 | 下一项 |
|---|---|---|---|---|---|
| 2026-09-22 | 文档 | 已完成 | 按站主要求调整为框架优先；统一 SQLite、取消 PG 接入/双库维护；把 SQLite 迁移工具缺口列 R01；原 B0–B4 被本任务序列替代 | 本次只检查文档 ID/依赖/链接/验收映射，不算应用测试通过 | F01 |
| 2026-09-22 | F01 | 已完成（本地） | 保留194条既有工作区状态；独立SQLite联调库与29篇正本副本；修复空文件建库问题，测试入口只接受绝对 .test.db | [验收报告](docs/evidence/ADMIN-FRAMEWORK-ACCEPTANCE.md)：报告基线/启动方法；原始typecheck缺router失败已记录 | F02 |
| 2026-09-22 | F02 | 已完成（本地） | 接续React19/Vite6入口，锁定现有依赖，保留5174及同源代理 | [验收报告](docs/evidence/ADMIN-FRAMEWORK-ACCEPTANCE.md)：frozen安装、dev、build:admin通过 | F03 |
| 2026-09-22 | F03 | 已完成（本地） | 新路由常量、四面/设置/详情，根路径进概览；无旧路由兼容表 | [验收报告](docs/evidence/ADMIN-FRAMEWORK-ACCEPTANCE.md)：内置浏览器深链刷新、前进后退、404通过 | F04 |
| 2026-09-22 | F04 | 已完成（本地） | 中文四面布局、统一状态与样式，窄屏导航 | [验收报告](docs/evidence/ADMIN-FRAMEWORK-ACCEPTANCE.md)：1440/390/320视口验证；桌面截图见报告 | F05 |
| 2026-09-22 | F05 | 已完成（本地） | 单一HTTP错误/取消/超时/requestId语义，阻断迟到旧会话响应 | [验收报告](docs/evidence/ADMIN-FRAMEWORK-ACCEPTANCE.md)：http.test.ts通过200/401/409/503/HTML/断网/取消测试 | F06 |
| 2026-09-22 | F06 | 已完成（本地） | Refine鉴权、内存凭据、401/锁定清缓存；JSON401不触发原生Basic弹窗 | [验收报告](docs/evidence/ADMIN-FRAMEWORK-ACCEPTANCE.md)：错误凭据、深链重新鉴权、迟到401与Basic核验通过 | F07 |
| 2026-09-22 | F07 | 已完成（本地） | shared最小只读DTO、分页、nullable历史计量、三种能力状态 | [验收报告](docs/evidence/ADMIN-FRAMEWORK-ACCEPTANCE.md)：agent-ops.test.ts、typecheck；API合同回写 | F08 |
| 2026-09-22 | F08 | 已完成（本地） | 管理鉴权下的capabilities，检查真实读用例；新写/运行能力未接入 | [验收报告](docs/evidence/ADMIN-FRAMEWORK-ACCEPTANCE.md)：真实AppModule/Kernel集成鉴权、读故障和无秘密投影通过 | F09 |
| 2026-09-22 | F09 | 已完成（本地） | Refine5.0.12真实dataProvider，分页total不虚构 | [验收报告](docs/evidence/ADMIN-FRAMEWORK-ACCEPTANCE.md)：provider测试及浏览器真实查询通过，无库回退 | F10 |
| 2026-09-22 | F10 | 已完成（本地） | 内容列表使用既有ledger，支持实际类型与标题筛选，诚实标记历史Git状态 | [验收报告](docs/evidence/ADMIN-FRAMEWORK-ACCEPTANCE.md)：29篇副本、5个项目、0匹配、空目录和断网重试通过 | F11 |
| 2026-09-22 | F11 | 已完成（本地） | 原文/元数据与安全Markdown只读预览，详情按需加载 | [验收报告](docs/evidence/ADMIN-FRAMEWORK-ACCEPTANCE.md)：真实文章/项目；安全消毒测试；GET无写入；缺失404集成测 | F12 |
| 2026-09-22 | F12 | 已完成（本地） | 新ops只读角色投影避开旧list自动建默认角色，不展示凭据 | [验收报告](docs/evidence/ADMIN-FRAMEWORK-ACCEPTANCE.md)：真实空库空态；有行数据由Kernel测试核验，未造演示Agent | F13 |
| 2026-09-22 | F13 | 已完成（本地） | 同一AgentRun来源分页/归属/详情，未知用量/版本/交付不补造 | [验收报告](docs/evidence/ADMIN-FRAMEWORK-ACCEPTANCE.md)：真实空态；Kernel测试覆盖成功/失败/归属/分页/输入输出 | F14 |
| 2026-09-22 | F14 | 已完成（本地） | 概览真实数量/来源/时间和快捷入口，失败显示不可用 | [验收报告](docs/evidence/ADMIN-FRAMEWORK-ACCEPTANCE.md)：浏览器29/0/0、断网后不可用、恢复后重新读取通过 | F15 |
| 2026-09-22 | F15 | 已完成（本地） | 设置能力表，访客会话/授权/提醒未接入说明，无假开关 | [验收报告](docs/evidence/ADMIN-FRAMEWORK-ACCEPTANCE.md)：四面及设置实际可达，说明性空态通过 | F16 |
| 2026-09-22 | F16 | 已完成（本地） | 管理端Vitest3.2.7行为测试入口 | [验收报告](docs/evidence/ADMIN-FRAMEWORK-ACCEPTANCE.md)：pnpm --filter @walker/admin test：4文件15项通过 | F17 |
| 2026-09-22 | F17 | 已完成（本地） | assistant-ui0.15.21受控SSE探针，经真实Runtime+Provider验证 | [验收报告](docs/evidence/ADMIN-FRAMEWORK-ACCEPTANCE.md)：拆帧delta/done覆盖、取消、缺done断流通过；无模型调用 | F18 |
| 2026-09-22 | F18 | 已完成（本地） | 首批框架完成；修复既有图谱测试时间不固定的偶发失败；同步设计/架构/API | [验收报告](docs/evidence/ADMIN-FRAMEWORK-ACCEPTANCE.md)：报告K1/K3：746项测试、全仓类型及api/admin构建通过；正本不变、无部署 | R01 |
| 2026-09-22 | R01 | 已完成（本地） | 旧 PG 物料归档；SQLite 22 表基线；绝对路径校验、显式 baseline、幂等 migrate、历史 checksum 与 schema 漂移拒绝；dev 启动无隐式写库 | `apps/api/src/prisma-migration.integration.test.ts` 通过；临时新库重复部署、现有库含原行重复标记、额外列拒绝、非 file 拒绝；生产库未触碰 | R02 |
| 2026-09-22 | R02 | 已完成（本地） | 五张核心表及历史 Restrict；运行范围增量 | [Agent 基础验收](docs/evidence/AGENT-CORE-ACCEPTANCE.md)：760 项测试、类型检查、API/admin 构建通过；R07 浏览器保存/刷新/两版隔离通过；无部署 | R03 |
| 2026-09-22 | R03 | 已完成（本地） | 运行状态、来源、动作、请求合同 | [Agent 基础验收](docs/evidence/AGENT-CORE-ACCEPTANCE.md)：760 项测试、类型检查、API/admin 构建通过；R07 浏览器保存/刷新/两版隔离通过；无部署 | R04 |
| 2026-09-22 | R04 | 已完成（本地） | 幂等提交、原子领取、续租及终态 CAS | [Agent 基础验收](docs/evidence/AGENT-CORE-ACCEPTANCE.md)：760 项测试、类型检查、API/admin 构建通过；R07 浏览器保存/刷新/两版隔离通过；无部署 | R05 |
| 2026-09-22 | R05 | 已完成（本地） | 审计同事务、Outbox 重试/幂等数据库消费/死信 | [Agent 基础验收](docs/evidence/AGENT-CORE-ACCEPTANCE.md)：760 项测试、类型检查、API/admin 构建通过；R07 浏览器保存/刷新/两版隔离通过；无部署 | R06 |
| 2026-09-22 | R06 | 已完成（本地） | 不可变修订、显式历史导入与技能导入导出 | [Agent 基础验收](docs/evidence/AGENT-CORE-ACCEPTANCE.md)：760 项测试、类型检查、API/admin 构建通过；R07 浏览器保存/刷新/两版隔离通过；无部署 | R07 |
| 2026-09-22 | R07 | 已完成（本地） | 修订 API 与创建/编辑/历史比较 UI | [Agent 基础验收](docs/evidence/AGENT-CORE-ACCEPTANCE.md)：760 项测试、类型检查、API/admin 构建通过；R07 浏览器保存/刷新/两版隔离通过；无部署 | R08 |
| 2026-09-22 | R08 | 已完成（本地） | L0–L2 事项与 L3 提醒授权、撤销、原子审计 | [Agent 基础验收](docs/evidence/AGENT-CORE-ACCEPTANCE.md)：760 项测试、类型检查、API/admin 构建通过；R07 浏览器保存/刷新/两版隔离通过；无部署 | R09 |
| 2026-09-22 | R09 | 已完成（本地） | 来源/Agent/事项/对象策略交集，父子持久范围限制 | [Agent 基础验收](docs/evidence/AGENT-CORE-ACCEPTANCE.md)：760 项测试、类型检查、API/admin 构建通过；R07 浏览器保存/刷新/两版隔离通过；无部署 | R10 |
| 2026-09-22 | R10 | 已完成（本地） | 公共 runtime factory。子进程只留启动白名单和 deepseek-official 的 DEEPSEEK_API_KEY；前后台会话目录分开；sdk profile patch 关闭文件/shell/网络工具，不插入 MCP。不用 sdk-minimal（它仍挂持久 shell），也不把 scrubbedParentEnv 的“删凭据后保留其余变量”当作隔离 | `apps/api/src/runtime/harness-launch.test.ts` 9 项通过，含子进程环境探针；`pnpm --filter @walker/api exec tsc -p tsconfig.json --noEmit` 通过。未启动模型，未部署 | R11 |
| 2026-09-22 | R11 | 已完成（本地） | RuntimePort：start/run/observe/close。坏 JSON、两份合同、传输断开、未知用量都有确定结果；会话绑定访客和修订；SDK 与 dsh 版本必须同为 0.1.5-rc.2。不判定发布。尚未接入 ExecutionService | `apps/api/src/adapters/harness-runtime.adapter.test.ts` 10 项通过；API tsc 通过。未启动模型，未部署 | R12 |
| 2026-09-22 | R12 | 已完成（本地） | 排队写在 ExecutionRun。公共等待最多 3、后台最多 10；截止含排队，公共 15 秒、后台 120 秒。全局一个模型槽。连续公共领取达到 `PUBLIC_CLAIM_STREAK_LIMIT`（2）后下一次领取后台。额度在同一 SQLite 事务里预留，start 成功才结算，同一运行不二次扣费；预留失败规则降级。入队后撤销、过期或越出原范围，启动前拒绝。无新公开路由 | 调度测试连续两遍各 7 项通过；`pnpm test:api` 53 文件 272 项通过，退出码 0。未调用真实模型，未部署 | R13 |
| 2026-09-22 | R13 | 已完成（本地） | 排队取消立刻终态，不调用 close。运行中先写 STOPPING，等到 RuntimePort.close 返回退出证明才写 CANCELLED（人工）或 FAILED（截止时间）并释放槽。close 失败或没有证明则 UNKNOWN，槽继续占用。停止中和已取消不能写成成功。无新公开路由 | 调度测试连续两遍各 12 项通过；`pnpm test:api` 53 文件 278 项通过，退出码 0。未调用真实模型，未部署 | R14 |
| 2026-09-22 | R14 | 已完成（本地） | 启动登记批次。租约不属于当前批次或已过期先写 UNKNOWN，不自动重跑。进程身份沿用 Harness `ProcessIdentity`：PID 加启动时间。只有该身份被证明已退出才释放槽；PID 被复用、进程仍在或进程表读失败都继续占用，且不向复用后的 PID 发信号。SDK 0.1.5-rc.2 不暴露子进程 PID，未登记身份保持隔离。无新公开路由 | 调度测试 16 项通过；`pnpm test:api` 连续两遍 54 文件 284 项通过，退出码 0。未调用真实模型，未部署 | R15 |
| 2026-09-22 | R15 | 已完成（本地） | 新执行走 `/ops/execution-runs`，不并入已验收的历史 AgentRun `GET /ops/runs`。提交来源固定为站主，幂等键重复返回同一运行。详情、游标列表和事件只返回实际记录；文本与用量来自 runtime 回调。排队停止不调用 close。匿名 401，其他来源 404。无新公开路由 | `execution-runs.kernel.integration.test.ts` 4 项通过；`pnpm test:api` 55 文件 288 项通过，退出码 0。未调用真实模型，未部署 | R16 |
| 2026-09-22 | R16 | 已完成（本地） | 运营记录和概览改读 ExecutionRun。试跑面板提交真实运行，文本流复用助手 SSE 的 text/done 帧；断流只停止观察。停止按钮等后端返回后才显示终态。刷新读取已保存事件，不重新调用模型。没有引用字段就显示没有记录。无新公开路由 | 管理端 16 项测试通过；临时库浏览器打开运行详情，停止后刷新仍是已取消和实际回答，内容列表仍可浏览。未调用真实模型，未部署 | R17 |
| 2026-09-22 | R17 | 已完成（本地） | 正常问答、内容未知、越权请求写成 kind=test 的运行，保存 suiteVersion、configHash 和断言。权限失败、待核查或配置哈希不一致都不能部署。测试通过也不创建部署，部署本身仍未接通。测试不写正本 | 合同测试与 Kernel 集成测试通过。浏览器打开失败结果页，点击部署后显示不能部署，没有显示已部署。未调用真实模型，未部署 | R18 |
| 2026-09-22 | R18 | 已完成（本地） | 旧 try、run-file、compare 不再直接调用模型，也不再写 AgentRun。每次都提交统一 ExecutionRun；compare 的每个目标单独排队。更换模型或温度的请求拒绝。供应商连通性探测仍留在模型供应商验证，不走这个入口 | `legacy-execution.kernel.integration.test.ts` 通过：无授权 403 且不产生运行，授权后一次 try 一条运行，两次 compare 共三条，AgentRun 不增加。未调用真实模型，未部署 | R19 |
| 2026-09-22 | R19 | 已完成（本地） | 工作站输入/输出合同不变，候选和审批仍由工作站状态管理。短调用超时或取消后必须先关闭当前 SDK 实例，下一次重新建立，不能复用仍在活动的调用。长调用关闭改为等待完成。没有把每个配方阶段再写进 ExecutionRun，避免和工作站状态变成两份权威 | runner 测试 12 项通过；`workstation.chain.integration.test.ts` 通过。未调用真实模型，未部署 | R20 |
| 2026-09-22 | R20 | 已完成（本地） | 凭据仍用 AES 保存。轮换成功才把不含密钥的 credentialRevision 加一，并让旧修订不能再取凭据或接新调用。进行中的调用不在轮换时被另杀，仍走既有停止政策。加密失败不改已保存凭据，也不回退到另一份错误密钥。公开返回和池键不含密钥 | 凭据服务测试与 runtime 池测试通过。未调用真实模型，未部署 | R21 |
| 2026-09-22 | R21 | 未完成（新阻塞） | 探针脚本为 `scripts/probe-runtime.ts`。修复 dsh@0.1.5-rc.2 发布版内部断裂：供应商把 `assertNever` 从 dsh-llm 移到 dsh-util-values 却漏了再导出、`requestImageDimensions` 只有 attachment@0.1.5-rc.2 有但树里固定到 0.1.1-rc.2，且 rc.3 引用了未发布的内部包无法安装。用 pnpm patchedDependencies 打两个只增导出的补丁（`patches/` 已入 lockfile，新机器 pnpm install 自动生效）。修复后 runtime 完整启动：会话建立、消息投递、read-only 文件策略与只读工具 patch 生效、进程正常退出（processExited=true，closeError=null）。真实回答被 DeepSeek 账户余额不足阻断：`模型请求失败：QUOTA / status 402 / Insufficient Balance`。充值后重跑 `pnpm probe:runtime` 即可补齐真实回答证据。失败后模型链路保持关闭，不改走直连模型；规则和人工能力保留。探针空回答时现在如实提取 turn/end 失败原因 | [探针报告](docs/evidence/runtime-probe.json)：local=fail（QUOTA 402），processExited=true。补丁：`patches/@deepseek-ai__dsh-llm@0.1.5-rc.2.patch`、`patches/@deepseek-ai__dsh-attachment@0.1.1-rc.2.patch`。串行 `pnpm test:api` 61 文件 293 项全绿（并行失败为高负载下共享测试库的既有抖动）。未用 mock 顶替，未部署 | R21 |
| 2026-09-22 | R22 | 已完成（本地） | Agent 详情展示主体、对象、动作、期限、次数和用量。新授权默认一次运行。修改和发布按钮分开且未接通，持续内容全权按钮禁用。前台没有临时提权入口 | 授权面板测试通过。浏览器签发后显示次数 1，撤销并刷新后仍是已撤销。未调用真实模型，未部署 | R21 |
| 2026-09-22 | R23 | 已完成（本地） | 后台运行登记诊断文件名和到期时间。清理只删除已到期的后台记录及其诊断文件。未登记的运行和站主正文不删。返回不含凭据和服务器路径。公共会话的完整删除仍留 V17–V19 | `run-retention.service.test.ts` 通过：到期记录和诊断文件删除，另一条运行和正文保留。未调用真实模型，未部署 | R21 |
| 2026-09-22 | V01 | 已完成（本地） | 公开清单只收已发布正文，按 slug 稳定序列化。集合 hash 同时作为构建标识。草稿、密钥和 health 不进入清单。内容生成脚本写出 public-manifest.json，不改既有 content.json | 合同测试通过。`pnpm content:gen` 写出 28 篇公开清单，content.json 未变，清单不含草稿或密钥。未部署 | R21 |
| 2026-09-22 | V02 | 已完成（本地） | 公开快照写入后核 hash，再切换 active 指针。没有基线、半截文件或坏 hash 都读不到新版本。问答索引不再按工作区 mtime 读取 content.json。未发布编辑不会进入已核验快照 | 快照测试通过：坏 hash 不切换指针，损坏文件失败，工作区编辑不进入读取结果。未调用真实模型，未部署 | R21 |
| 2026-09-22 | V03 | 已完成（本地） | 新增 `pnpm snapshot:import`（`scripts/import-public-snapshot.ts`）：只接受 hash 自洽的 public-manifest.json，经 V02 仓储原子发布并回读核对。公开内容撤销集合放快照根 `deny.json`，不改动不可变快照本体；无文件=不撤销，损坏/形状不符=全部撤销（fail-closed）。shared 增加 `verifyPublicSnapshot`/`parsePublicDenyList` 纯函数，API 仓储与 agent 共用一份校验。agent 公开上下文默认改读与 API 同源的已核验快照（`WALKER_PUBLIC_SNAPSHOT_DIR`，无基线拒绝启动），私有开发读取须显式设 `WALKER_CONTENT_JSON`，不应用撤销集合。撤销逐问重读：API 索引每次调用读盘，agent 每个 MCP 查询读盘，旧进程/旧会话不能绕过收窄 | shared 2 文件 5 项新测试；API `fs-site-content-index.test.ts` 4 项；agent `knowledge-snapshot.test.ts` 4 项。串行 `pnpm test:api` 62 文件 297 项、`pnpm test:agent` 5 文件 30 项、`pnpm test:shared` 35 文件 272 项、全仓 typecheck 全绿。K6：`pnpm snapshot:import` 导入真实 manifest（28 条）并激活，索引 24 条可读可引用；写入 deny.json 撤销一篇立即变 23 且目标消失，删除后恢复 24。位置本身仍由后续 V05/V23 门槛控制启用。未调用真实模型，未部署 | V04 |
| 2026-09-22 | V04 | 已完成（本地） | 新增 AgentDeployment/DeploymentMember 两表（迁移 `20260922200000_agent_deployment`）：placementKey/scopeKind/scopeSlug 唯一，generation 默认 1，enabled 默认关。仓储 port + Prisma adapter：保存必须恰一个默认成员（应用层事务约束），更新与启用/禁用都走 generation CAS，deploymentId 幂等键同内容返回同部署、不同内容 409。成员钉住不可变 AgentRevision，新草稿修订不改变已部署引用。shared 增加 DeploymentView DTO。本地旧 walker.db 依既定决定不擅自升级（缺 R02 表属会话前漂移），迁移由部署流程应用 | `prisma-deployment.repository.test.ts` 5 项：两个/零默认拒绝、幂等键冲突、CAS 旧 generation 冲突、启停 CAS、新草稿不覆盖已钉修订、引用缺失修订 404。串行 `pnpm test:api` 64 文件 305 项全绿（含迁移链集成测试覆盖新迁移 SQL）。未调用真实模型，未部署 | V05 |
| 2026-09-22 | V05 | 已完成（本地） | 新 `deployments/` 模块与 `/ops/deployments`：保存草稿（未登记位置/未知字段 400）、启用（每个成员修订须当前 configHash 三类测试全过 + 工具 profile 为当前版本，任一不合格 403 且不变更）、禁用（保留历史成员，resolve 立即 404）、回退（只能切到既有成员且须合格，generation CAS）。位置注册表 `REGISTERED_PLACEMENTS` 首期仅 post-detail。resolve 解析是 V10 公开问答的接入点；capabilities 的 agentDeploy 改真实探测。旧 `POST revisions/:id/deploy` 保留 501 未接通不伪造 | shared `deployment.test.ts` 4 项；`deployment.kernel.integration.test.ts` 全链：草稿→无证据 403→单成员证据仍 403→全员合格启用→解析→禁用 404→回退切默认→非成员 422→旧 generation 409。串行 `pnpm test:api` 65 文件 306 项、shared 36 文件 285 项、全仓 typecheck 全绿。执行侧 preflight/admit 的位置校验留 V10 接线。未调用真实模型，未部署 | V06 |
| 2026-09-22 | V06 | 已完成（本地） | admin 新增 `/agents/deployments` 位置绑定页（Agent 列表页入口）：位置下拉只来自服务端 REGISTERED_PLACEMENTS（首期文章详情），成员按 Agent→版本两级选择，恰一个默认项；保存新建带幂等 deploymentId、编辑只带 generation CAS。列表行展示启用中/未启用 badge、代次、成员与默认项，行内启用/禁用/编辑/回退（选目标成员）。失败原因行内如实显示（如“当前配置还没有通过三类测试”）。静态介绍预览：位置/对象/成员介绍 tab，显式点击切换预览成员，不调用模型 | admin 纯逻辑测试 4 项（请求体构造、CAS、校验、未登记位置）；`pnpm --filter @walker/admin test` 7 文件 21 项、`pnpm build:admin` 通过。K3 浏览器验收（临时迁移库 + 真实 API/admin）：两成员（v1 默认 + v2）经表单保存落库，刷新重新登录后归属不变；启用无证据时 alert 如实显示失败原因且保持未启用；预览 tab 切换到 v2 显示“访客可显式切换到这个成员”。验收后临时库与服务已清理。未调用真实模型，未部署 | V07 |
| 2026-09-22 | V07 | 已完成（本地） | 新增 Conversation/ConversationSdkSession/ConversationTurn/ConversationAttempt/ConversationMessage 五表与 FeatureEvent 增量（eventId 唯一、conversationId、receivedAt 服务端接收时间），迁移 `20260922210000_conversation_message`。turn 唯一键 (conversationId,requestKey)/(conversationId,seq)；attempt 挂 turn、可关联 runId；消息 delivery pending/sent/ack/unknown；SDK session 按 (conversationId,agentRevisionId) 关联，不是业务主键。仓储 port + Prisma adapter 已接 kernel | `prisma-conversation.repository.test.ts` 5 项：重复 requestKey 同一轮次无重复行、重新生成单列 attempt、回答挂 attempt 且 delivery 可推进/可 unknown、切换成员同会话两 SDK session、重复 eventId 单行。串行 `pnpm test:api` 66 文件 311 项全绿（迁移链覆盖新迁移）。未调用真实模型，未部署 | V08 |
| 2026-09-22 | R21 | 未完成（重试仍阻） | 重跑 `pnpm probe:runtime`：从早间 402 QUOTA 变为 401 AUTH「api key ****3aaa is invalid」——本机 DSH 凭据库 refs 里的 DEEPSEEK_API_KEY 已被更换但无效。runtime 侧证据不变：会话建立、只读工具策略生效、进程退出（processExited=true、closeError=null、RSS 记录完整）。需要站主更新有效 DeepSeek key 后再重跑，不改走直连模型 | [探针报告](docs/evidence/runtime-probe.json)：local=fail（401 AUTH），processExited=true。未用 mock 顶替，未部署 | V08（探针待外部凭据） |
| 2026-09-23 | V09 | 已完成（本地） | shared 新增 `redaction.ts`：结构化脱敏（PEM 私钥块整块、Bearer、sk-/ghp_/xoxb-/AKIA 等密钥形态、邮箱、大陆手机含分组写法、18 位身份证、≥16 位长数字串），按类别计数不保留原值；`redactRequestMetadata` 把 IP 压成前两段/形状、header 只留小写名集合、query 只留有无——**不记录完整 IP/header/query**。API 侧在 `preflight` 脱敏一次，`askInput.text`（进 SDK）与 `settle` 落库 `question` **共用同一份结果**，不各留一份原文。边界如实声明：只处理有明显结构特征的模式，不宣称能识别所有个人信息；不做通用敏感词猜测，正文引用与普通日期数字不被破坏 | `redaction.test.ts` 9 项、`assistant-v09.service.test.ts` 4 项（密钥不进 prompt、落库与 prompt 同一份且不含邮箱/手机、正文引用原样、PEM 整块替换）；K3 真实 HTTP：输入含 sk-/邮箱/手机，落库 `question` 三处均为 `[redacted-*]` 且明文零残留。`pnpm typecheck`、shared 37 文件 294、api 70 文件 327、web 212、agent 30、admin 21、`build:api` 全绿。未调用真实模型，未部署 | V10 |
| 2026-09-23 | 隐患修复 | 已完成（本地） | ① 补丁声明从失效的 package.json `pnpm` 字段迁到 pnpm-workspace.yaml 的 `patchedDependencies`（pnpm 9 起不再读前者；此前仅靠 lockfile 已记录才生效，新机器 clean install 有丢补丁风险）。② `apps/api/.env` 过时注释更新：runtime 缺陷已被补丁修复，小影走规则兜底的真实原因是模型凭据无效（401），不是 runtime 缺陷。**副作用（已接受）**：补丁声明换位导致 pnpm 重算依赖树，`dsh-session-persistence`/`dsh-session-query` 由 0.1.1-rc.2 升到 0.1.5-rc.2——这正是 pnpm-workspace.yaml overrides 早已声明、而 lockfile 一直落后的版本（既有不一致），非降级；其余 292 处为 peer hash 重算。`sdk-protocol`/`workflow`/`subagent-in-process-driver` 仍留 0.1.1（不在 overrides 内，上游自钉） | `pnpm install` 无补丁警告；补丁生效（dsh-llm `assertNever` 入包）；四包版本统一 0.1.5-rc.2；`pnpm typecheck` + `pnpm test:api` 69 文件 323 项全绿。**R21 探针证据因依赖树变更而作废，暂标待重跑**（key 有效后重跑 `pnpm probe:runtime` 即可） | V09 |
| 2026-09-22 | V08 | 已完成（本地） | 匿名 cookie `walker-anon`（32 字节 hex，HttpOnly/SameSite=Lax/Secure，`WALKER_ANON_COOKIE_SECURE=0` 供本地 http 联调），服务端只存 sha256；形状不符的注入值一律重签。公开 POST 路由（intake/assistant/stream/likes/content-feedback/search-events）统一过 SameOriginMiddleware：跨站 Origin/Referer 403，白名单 `WALKER_PUBLIC_ORIGINS`。会话归属 fail-closed：只有「已登记+hash 一致+harness 会话」续轮，他人/未知/规则会话开新会话。requestKey（8–128 位 `[A-Za-z0-9_-]`）持久幂等：`(anonIdHash,requestKey)` 唯一，重复发送返回原 run 不再计预算；非法形状 400。新增每匿名身份限流（20/600s）叠加 IP 限流。AssistantRun 增列 anonIdHash/requestKey（迁移 `20260922220000_assistant_request_key`）；公开请求体无 grant/origin 字段（无注入面）。API 契约已回写 | `anon-cookie.test.ts` 3 项、`same-origin.middleware.test.ts` 3 项、`assistant-v08.service.test.ts` 6 项（hash 归属、劫持降级、存 hash 不存明文、幂等返回原 run、伪造 grant 无效）；迁移链测试补 AssistantRun 幂等键与旧行保留。K3 隔离库实测：cookie 签发/重签、同身份重复 requestKey 三次同 sessionId、跨身份不命中他人幂等、B 带 A 会话被开新会话、本人 harness 会话续轮（单测覆盖）、跨站 403/同源与无 Origin 放行、非法 requestKey 400。修复 `harness-runtime.adapter.ts` 顶层 `require` 与 CJS 保留名冲突（TS2441，build:api 原 fail）。`pnpm typecheck`、shared 36 文件 285、api 69 文件 323、web 37 文件 212、agent 5 文件 30、admin 7 文件 21、`build:api`/`build:admin` 全绿。未调用真实模型，未部署 | V09 |
| 2026-09-23 | 依赖修复 | 已完成（本地） | **推翻前一轮判断**：实测 pnpm 9.15.0 静默忽略 `pnpm-workspace.yaml` 的 `overrides`（荒谬版本号实验无任何反应），`package.json` 的 `pnpm.overrides`/`patchedDependencies` 则警告后忽略——两个位置都无效，此仓库的版本锁定机制从未生效过。修复改为：`apps/api/package.json` 直接钉死 23 个 dsh 生态包 + 6 个 cordis 包版本（直接依赖优先于传递 peer），删除 `patches/`（rc.3 上游自带 `assertNever`/`requestImageDimensions`）；`pnpm-workspace.yaml` 只留实测事实注释。上游 `latest` 标签被 0.0.1-rc.x 占位版本劫持是 254 处 peer 冲突的来源 | 全新解析后 `0.1.1-rc.2` 残留 **0**、`unmet peer` **0**；`pnpm typecheck`、shared 38 文件 303、api 71 文件 335、web 212、agent 30、admin 21、`build:api` 全绿 | R25a |
| 2026-09-23 | R25a | 已完成（本地） | 提供方管理改为 dsh 原生、可复用、可扩展：shared `model-directory.ts`（严格解析 settings 的接口段 → 提供方接口/apiKey 引用/API 网址/模型 id 及名称，按类别 fail-closed，不读凭据值）+ `fs-model-directory.ts`（读 `$WALKER_MODEL_HOME` 或 `$DSH_HOME` 的 settings.yaml 与 .credentials.yaml 的 **refs 名字**）+ kernel 接线；`harness-launch.ts` 不再有单提供方硬编码白名单，改为把提供方事实写进子进程 home 的 settings.yaml，凭据经环境变量按目录里的引用名传入（provider 与目录路由不一致时 fail-closed 不转发）；探针通道化并记录选择依据。**实测关键约束**：dsh rc.3 的 sdk profile 只要 home 里存在 `.credentials.yaml` 就启动失败（变体矩阵 A/B/C/D 证实，与 version 信封无关），故改为 env 通道并清理历史残留文件 | `model-directory.test.ts` 9 项、`fs-model-directory.test.ts` 6 项、`harness-launch.test.ts` 11 项（含 home 不写凭据文件、残留清理、路由不一致 fail-closed）。**真实探针通过**：`pnpm probe:runtime` → local=pass | R21 |
| 2026-09-23 | R21 | 已完成（本地） | 真实 SDK 运行与进程隔离验证通过。`pnpm probe:runtime`：`local=pass`、真实回答「好」（报告 sha256 `f867f341…` 经独立比对确认）、耗时 2044ms、`processExited=true`、`closeError=null`、RSS 记录完整；通道 deepseek-official / llm-deepseek / `https://api.deepseek.com`（由 dsh 目录解析）。凭据由站主更新为有效 key（尾号 `ded3`，直连 chat completions 200 复核）。运行时不再需要任何补丁 | [探针报告](docs/evidence/runtime-probe.json)；SDK/runtime 同为 0.1.5-rc.3；未用 mock 顶替，未部署 | R24 |
| 2026-09-23 | R24.a 修正 | 已完成（本地） | 站主指出预置模型**填错了**。调查两个权威来源并交叉核对：① **DeepSeek 官方文档**（api-docs.deepseek.com，含定价页）；② **dsh 适配器内置目录**（`dsh-llm-deepseek@0.1.5-rc.3` 的 `DEFAULT_MODELS`）。两边一致，且与更新的 alpha 版本（0.1.6/0.1.7-alpha 只有 2 个）相比 rc.3 的目录更全。**原实现的三处错误**：把**已退役**的 `deepseek-v4-flash` 当有效型号推荐；名称是自己编的（应为 `DeepSeek-V4.1-Flash` 等）；漏了 `deepseek-v4-flash-vision-exp`。修正为官方口径：V4.1 系列 1 个（`deepseek-flash`→DeepSeek-V4.1-Flash，2026-09-10 发布的最新型号）+ V4 系列 3 个（pro / flash / vision-exp），后两个在名称里如实标注「已下线」（官方原文：ID 仍可调用但由 V4.1-Flash 提供服务并按 Flash 计费） | 写回配置后模型列表与官方一致；设置页截图确认渲染正确。顺带用站主已填入的 Key 实测「测试连接」：**真发请求（268ms）并如实返回上游 401**（`api key ****ed3a is invalid`）——证明配置链路完整可用、且不假装成功。回归全绿（typecheck、api 70/345、admin 7/21、build:api） | R24 |
| 2026-09-23 | R25b | 已完成（Agent 页部分） | Agent 编辑页的提供方与模型直接接入 dsh 原生目录：`GET /ops/agent-models` 不再查 ModelProvider 表，改为 `buildAgentModelCatalog(dsh 目录快照)`，返回 `source/home/defaultProvider/defaultModel/providers[{id, interfaceName, baseURL, apiKeyRef, hasCredential, isDefault, models}]`；UI 提供方下拉显示 dsh 路由名与「dsh 默认」「未配置凭据」标记，模型改为 datalist（已知可选 + 允许填未列出的 id，由 dsh 请求时校验），并展示接口/网址/凭据引用；保存校验提供方必须存在于目录。**关键前提**：`AgentUnit.providerId` 原指向本地 `ModelProvider` 表，写 dsh 路由名会触发外键 P2003，故新增迁移 `20260923100000_agent_unit_provider_dsh` 去掉该外键（保留列与既有值）。未列出模型不本地伪造完整清单：dsh 内置目录不对外导出，用不完整清单误拒合法模型比交给 dsh 校验更糟 | shared `model-directory.test.ts` 12 项（新增 3 项：默认模型必在列、声明目录为准、默认提供方非已支持接口时不伪造 isDefault）；端到端实测：POST `/ops/agents/xiaoying/revisions` 用 `providerId=deepseek-official`/`modelId=deepseek-flash` **保存成功**（v1 落库），旧 id `deepseek` 被 **400** 拒绝；`/ops/agent-models` 返回 `source:dsh, home:/Users/happy/.dsh` 且不含凭据。`pnpm typecheck`、api 71 文件 335 项、admin 7 文件 21 项、`build:admin` 全绿（api 全量首跑 1 项时序偶发，单跑与复跑均通过）。未部署 | R25c |
| 2026-09-23 | R25c | 已完成（本地） | 删除自建提供方体系，**系统内不再有第二份提供方注册表**：删 `model-providers/` 模块（controller/service，8 个路由）、`model-provider.repository` 端口、`prisma-model-provider.repository`、`auth/credential-cipher.ts`(+test)；删 `ModelProvider` 与 `Credential` 两张表（迁移 `20260923110000_drop_model_provider_credential`，含旧 AES 密文）。技能执行的 `LlmClient`（`openai-compatible-llm.adapter`）改从 dsh 目录取 baseURL，凭据按 `apiKeyRef` 解析（不落库、不打印）。**过程中修正一处设计缺陷**：`LlmClient` 未指定提供方时原会盲信 dsh 的 `agent-default-model`，而它可能指向本运行时装不上的桌面版专有插件（实测被改成 `workbuddy`），导致可用通道一起失败；改为用 `pickUsableProvider` 取目录里确实可用的提供方（显式指定时仍严格查、找不到就报错） | `/model-providers` **404**、两表与外键消失（直接查 sqlite_master 确认）、`/ops/agent-models` 200、`/skills` 可用；`openai-compatible-llm.adapter.test.ts` 12 项（含新增「默认装不上时回落到可用提供方」）；`pnpm typecheck`、api 69 文件 325 项、shared 38 文件 306 项、web 212、agent 30、admin 21、`build:api`/`build:admin` 全绿。未部署 | R24 |

| 2026-09-23 | R27 | 已完成（本地） | 统一 Harness SDK 来源为 **npm 发布包**（即 GitHub `deepseek-ai/deepseek-harness` 的官方产物），退役已废弃的 git clone 路径：删 `scripts/update-harness.ts` 与 `harness:update`/`harness:check`（指向 `~/Desktop/deepseek-harness`，因 rolldown 构建损坏早已停用，但命令仍在维护一条死路）。新增 `scripts/sdk-version.ts`（`pnpm sdk:version` / `sdk:version:all`）：**只报告不自动改**——列出 23 个 dsh 主线包当前版本、cordis 家族（6 个，独立版本号不参与同版本约束）、上游 dist-tags 并标注我们在用哪个。**实测关键**：上游 `latest` 指向 `0.1.5-rc.2`（旧），`next` 才是我们在用的 `0.1.5-rc.3`——脚本同时列全部 tag 并提示 rc 阶段不能只看版本号、升级后必须跑 probe:runtime。同步更新 `apps/api/.env` 与凭据说明 | `pnpm sdk:version` 正确识别 23 包同版本 0.1.5-rc.3；无 clone 残留引用（剩余 `WALKER_DSH_RUNTIME_BIN` 两处均指向 npm 包 bin，是正常用法）；迁移后探针行为正确（独立 home 尚无凭据故如实报「没有可用通道」，**未偷偷继承站主环境**）；`pnpm typecheck`、api 69 文件 329 项、shared 39 文件 313 项全绿。未部署 | R26 |
| 2026-09-23 | R26 | 已完成（本地） | **每个 Agent 一个独立 Harness home**，配置隔离且不连站主个人环境。① 路径规则中立化到 `runtime/dsh-home-paths.ts`（runtime 与 adapters 共用，避免层间反向依赖）；② `resolveSessionHome` 支持 agentId：给定则 home = `<AdgaiWalker DSH_HOME>/agents/<agentId>`，非法 id fail-closed，**不回落 `~/.dsh`/`DSH_HOME`**；无 agentId 时保持 R10 的受众级分离；③ `syncProviderHome` 改**保留式合并**（原实现整文件覆盖会冲掉 Agent 自己的 `agent-default-model` 配置）；④ `RuntimeOwner` 加 `agentId`，执行链路用已有的 `locateRevision` 解析（**不加数据库列、零迁移**）；⑤ adapter 按 Agent 切换实例（不同 Agent 必须换实例；切换先 `close` 拿退出证明，保持 R12 单槽纪律、不留孤儿进程）；⑥ 站内助手小影也用 `agents/xiaoying/`，不留第二套目录约定 | 新增测试：`harness-launch.test.ts` 5 项（per-agent home 互不串 / 非法 id fail-closed / 未给 id 保持受众级 / 保留式合并不冲掉模型配置 / profile 落点）+ `harness-runtime.adapter.test.ts` 1 项（不同 Agent 换实例并关闭旧实例、同 Agent 复用、无 id 再切一次）；`pnpm typecheck`、api 69 文件 335 项全绿。探针真实行为正确：独立 home 尚无凭据 → **如实报「没有可用通道」而非偷偷继承站主环境**。未部署 | R24 |
| 2026-09-23 | R24.a | 已完成（本地） | 补齐闭环第一环——**后台模型连接配置**。站主反馈「后台的前端配置都不对」；无头浏览器截图证实：设置页只读能力表 + 明写「配置编辑尚未接入」，Agent 页显示「未配置凭据」却无入口可配，于是闭环断在第一环（没 Key → 试跑失败 → 三类测试待核查 → 部署门槛不过）。新增：① 凭据存储 port + `FsModelCredential`（写 `<Harness 主目录>/credentials.env`，0600、原子写、**刻意不写 dsh 的 .credentials.yaml**，因实测该文件存在会让 rc.3 启动失败）；② `ModelConfigService` + `GET/PUT /ops/model-config`、`POST /ops/model-config/test`（真发一次 max_tokens=4 请求验证连通，失败带上游片段）；③ 提取共用工具 `dsh-settings-file.ts`（保留式合并，运行时与配置界面同一份逻辑）与 `dsh-credentials-file.ts`；④ 运行时凭据解析改「环境变量优先 → 否则读凭据文件」，后台配好 Key 运行时立刻可用；⑤ 设置页新增「模型连接」区（网址/Key/模型增删/预置快捷添加/保存/测试连接），删掉「配置编辑尚未接入」；⑥ Agent 页「未配置凭据」旁加「去配置」，修掉「部署仍未接通」过时文案；⑦ 删掉会误导的 `.credentials.yaml.template`（它教人改名后启动会失败）换成 `credentials.env.example` | 新增 `fs-model-credential.test.ts` 7 项（未配置不谎报 / 增删改 / 多引用隔离 / 保留手工内容 / 非法名与空值 fail-closed / 去引号 / 0600 权限）+ `harness-launch.test.ts` 3 项（凭据文件转发进子进程 / env 优先 / 两处都无则不转发）；接口实测：GET 返回目录与预置、PUT 写入 settings.yaml 且 `defaultProvider=deepseek-official`/`defaultModel=deepseek-flash`、POST test 未配 Key 时报「凭据引用还没有值」；设置页截图确认配置区渲染正确。`pnpm typecheck`、api 70 文件 345 项、shared 39/313、admin 7/21、build:api、build:admin 全绿。未部署 | R24 |
| 2026-09-23 | 测试稳定化 | 已完成（本地） | 修掉一个**固有边界竞态**的偶发失败：`harness-assistant.adapter.test.ts` 的「排队时间计入 deadline」。根因：判定式是 `remainingMs = timeoutMs - (lockedAt - enqueuedAt)`，而第一问占锁时长 ≈ 它自己的预算、第二问用的又是同一个预算值，于是 `(lockedAt - enqueuedAt)` 必然落在预算边界上，最终落到 `queue-deadline` 还是 `timeout` 由调度抖动决定（实测 3 次失败 1 次）。**不是产品缺陷**：两种降级都表示预算没被白花在排队上。处置：接受两种降级码并写明根因，保留「第一问一次、第二问至多一次、绝不重试」的核心断言 | 连跑 6 次全绿（改前 3 次失败 1 次）；全量回归：typecheck、shared 39/313、api 69/335、web 37/212、agent 5/30、admin 7/21、build:api、build:admin 全绿 | R24 |
| 2026-09-23 | R24.b（qr 审理） | 已完成（本地） | 对抗性审理后台，挖出并修掉一个**功能性缺陷**：**凭据判定存在两个真相源**。`FsModelDirectory.snapshot()` 只读 dsh 的 `.credentials.yaml`（rc.3 下该文件被刻意删除，存在即启动失败），真实凭据则在 `credentials.env`；运行时 `providerCredential` 读的是后者。**实测后果三条**：同一提供方在设置页显示「已配置」、在 Agent 编辑页显示「未配置凭据」；`pickUsableProvider` 恒 `null` → 未显式指定提供方时**静默换用兜底提供方**；Agent 页「去配置」入口条件恒真。修复：目录适配器改从 `credentials.env` 读引用名与值（与运行时同源），Agent 层凭据改读 `agents/<id>/credentials.env`，删除死掉的 `readCredentialRefs`/`readCredentialValue`/`credentialsDoc`。附带修 P2/P3：Agent 创建页写死的模型默认值 `'deepseek-chat'`（**不在 dsh 目录里的旧 id**，提交必被 400 拒）改为目录驱动；服务端两处同款字面量收敛为 `DEFAULT_AGENT_MODEL_ID`；删除 orphan 死代码 `packages/shared/src/model-catalog.ts`（R25c 删表后遗留的**第二份模型目录**，零消费者，其过期预置正是误导来源）。 | **先证伪再修**：站立脚本证明旧算法 `hasCredential=false`/`pickUsableProvider=null`，应然 `true`/`deepseek-official`；修复后两个端点双双 `hasCredential:true`。**回归测试做了变异验证**：新增 3 项单一真相源守卫，改回旧行为时 **7 项失败**、复原后全绿。真实浏览器端到端：4 个模型渲染正确、创建 Agent 预填正确并**真实落库**（v1，`deepseek-official / deepseek-flash`），随即归档。全量回归：typecheck、shared 39/313、api **70/348**、web 37/212、agent 5/30、admin 7/21、build:api 全绿。未部署 | R24 |
| 2026-09-23 | R24.c 模型目录与协议调研 | 已完成（本地） | 站主要求调研最新热门模型（每系列 3 个）与**协议**（GPT 还是 Claude）。**三源交叉核对**：DeepSeek 官方文档、dsh `dsh-llm-deepseek` 内置目录、**pi-ai 内置目录**（`@earendil-works/pi-ai@0.85.1`，dsh 实际路由的同一份，实测 **39 提供方 / 9 协议**），另以 OpenRouter 实时目录（459 项）横向印证。**核心结论：协议是路由/模型的属性，不是厂商的属性**——DeepSeek 官方即**双协议**（OpenAI `api.deepseek.com` / Anthropic `api.deepseek.com/anthropic`，同 Key 两用）。协议值与 dsh `llm-pi-ai` 的 `api` 字段逐字一致：openai-completions / openai-responses / anthropic-messages / google-generative-ai / mistral-conversations / azure-openai-responses / openai-codex-responses / bedrock-converse-stream / google-vertex。通道上 dsh 提供两个可共挂载适配器：`llm-deepseek`（直连单协议）与 **`llm-pi-ai`（多提供方，支持路由手写 `api`+`baseURL`）**，故接兼容网关无需改代码。DeepSeek 官方只列 2 个在服务型号（`deepseek-flash`=V4.1-Flash 最新、`deepseek-v4-pro`），旧名仍可调用但已退役，故第三项如实标注「已下线」。落地：提供方 1→**10** 个并加 `protocol`/`label`；新增 9 协议登记与**每厂商 3 个**预置；接口加 `protocolLabel`/`presetsByProvider`/`protocols`；设置页加**协议选择器**。**又修三个缺陷**：默认模型被无凭据提供方抢走、协议可写进单协议适配器（不留半截配置）、`ModelConfigService` 自己 resolve 路径导致读写两个真相源。 | 新增 `model-config.service.test.ts` 9 项 + shared 协议/预置 8 项；**变异验证**：默认守卫改回旧行为即失败。全量回归 typecheck、shared **39/321**、api **71/357**、web 37/212、agent 5/30、admin 7/21、build:api/admin 全绿；浏览器实测 10 提供方 / 9 协议、切 Anthropic 自动换协议并显示 3 个 Claude 预置。未部署 | R24 |
| 2026-09-23 | R28 每 Agent 独立凭据与模型 | 已完成（本地） | 站主：「每个 agent 可单独配置 token apikey；模型名称和模型 ID 可以各自进行填空」。定稿语义（站主亲选）：**独立配置，可选全局**；**模型 ID 必填、名称选填**。**缺口**：R26 已建 per-agent home 地基、`AgentHomeView` 也能读 `agents/<id>/credentials.env`，但**没有写入通道**；且运行时 `providerCredential` **只读共享层**——即便存下来也永远用不到（假功能）。落地：shared 新增 `AgentModelConfigInput/View`+`CredentialScope`；新增 `AgentModelConfigService`（读时标注来源 agent/shared/none，写时只落该 Agent 自己的 home）；新增 `GET/PUT /ops/agents/:id/model-config`（PATCH 语义、拒未知字段）；**运行时优先级改为「显式 > 该 Agent 自己的 Key > 环境变量 > 共享层」**；Agent 详情页新增「模型与凭据」面板。**修掉四个缺陷**：mergeSettingsSection 不建父目录（per-agent 首写 ENOENT 500）、凭据引用名不跟随提供方切换（会拿 A 的 Key 打 B）、换提供方残留旧适配器段、清空模型名无效（写空串与无字段在 YAML 合并下不可区分）。 | 新增 service 测试 **10 项**（含共享层零改动、引用名跟随、清旧段、名称回落）+ harness-launch **3 项**（Agent Key 优先于共享层）。浏览器端到端：保存后来源变「本 Agent 专用」，磁盘 0600 正确且**共享层文件逐字节未变**。全量回归 typecheck、shared 39/321、api **72/369**、admin 7/21 全绿。未部署 | R28 |
| 2026-09-24 | R29 Agent 运行不可用根因 | 已完成（本地） | 站主：「系统和该页面的 key 都配了一样的，系统的可以用，agent 的不可以」。**第一性原理**：两条链路不同——设置页测试=进程内直连 fetch；Agent 试跑=经 dsh SDK 拉起 harness 子进程。**P0 根因**：SDK 的 `installedDshNodeLaunch()` 用 `import.meta.resolve` 定位 dsh 二进制，而 dev 服务器跑在 **tsx** 下，esbuild 把 `import.meta` 换成 CommonJS shim（只有 url、没有 resolve）→ `TypeError: define_import_meta_default.resolve is not a function` → `new HarnessClient` 抛错 → `runtime.start()` 失败 → FAILED runtime-error。实测：tsx 下 `typeof import.meta.resolve==='undefined'`，纯 node 下是 `function`。**长期未被发现的原因**：探针显式传了 `WALKER_DSH_RUNTIME_BIN` 恰好绕过该行（R21 绿灯属验证方式与被测对象不一致）；kernel 没传；失败只写 stopReason 无任何日志；早前归因于「key 无效」。修复：`dshBin = WALKER_DSH_RUNTIME_BIN ?? 按包解析兜底`，不再依赖 import.meta.resolve。**同源连修三缺陷**：① 用量读错事件（真实在 `assistant/message`：154/2/4124/3968，非 `step/end`）→ 此前「成功但零用量」；② 流式文本读错形状（真实在 `assistant/message.data.stream[].texts[]`，非 `assistant/chunk`）→ 流式从未外发；③ `homeDir` 默认 `os.homedir()` 导致在站主家目录写 `~/.dsh-admin`、`~/.dsh-assistant`（已备份清理），改为落在 AdgaiWalker 数据根。 | 真实队列试跑**连续成功**：SUCCEEDED + tokens 154/2 + elapsed≈1450ms + 事件 text「好」/usage；家目录不再被写。**变异验证**：去掉兜底新守卫即失败。新增 harness-launch 3 项、adapter 用量/流式 2 项改用 rc.3 真实形状；全量 typecheck、shared 39/321、api **73/377**、web 37/212、agent 5/30、admin 7/21、build:api 全绿。未部署 | R29 |
| 2026-09-24 | R30 执行闭环修复 | 已完成（本地） | 站主报「ReleaseTests 重复 key」，审理后发现是**调度与恢复层四个缺陷**层层相扣。**P0 队列无泵**：设计文档 §10.2 要求「持久队列由 Nest 内定时器领用」，实现里只有 accept() 提交时试一次 dispatch → 槽位忙则永久卡 QUEUED，且持续占额度预留与队列名额（越用越不可用）。**P0 槽位永久占死（最严重）**：dispatch 登记的 ProcessRecord 是 pid:null，而 inspect() 把「从未启动」与「启动过但无法证明」都归为 unproven，recoveryDisposition('unproven')=occupy → 恢复逻辑永远无法释放，泵每 2s 空转，**一次异常永久废掉系统且无解除通道**；修复：分出 unstarted（没东西可终止→可释放），不放宽 unproven 的保守占用。**P1 重复 key**：evidence() 铺开 listTests 全部历史行（重跑后 6 条），而 releaseGate 用 .find() 取最新 → 闸门与界面两个答案；改为按用例去重取最新并按套件顺序返回。**P1 竞态**：wait() 固定 1.5s < 实测运行 1.5–2.3s → 结果随机；改为跟随 run 自己的 deadline。附带：泵可测试（pumpForTest 走同一实现）、失败原因落日志（原全程无日志）、port 与 shared 的双真相源 ProcessObservation 合一。 | **三类测试首次全通过**（pass/pass/pass，gate.ok=true，界面无重复 key 无告警）。新增守卫 7 项 + 修正恢复语义 1 项；**四处变异验证**（去掉 unstarted 释放／泵／wait 跟随 deadline 均立即失败）。全量 typecheck、shared **39/322**、api **73/383**、web 37/212、agent 5/30、admin 7/21、build:api/admin 全绿。未部署 | R30 |
| 2026-09-24 | R31 前端超时契约修复 | 已完成（本地） | 站主「点运行三类测试仍不行」。**转折点**：改用浏览器抓真实点击的网络/控制台，发现**服务端跑完了、结果全对**，界面却弹「连接超时」——**前端在撒谎**。根因是**契约不一致**：前端默认 10s ｜ 后端后台 deadline 120s ｜ 单次模型调用 60s ｜ 三类测试实测 44.6s，**前端 10s < 后端 120s** → 长操作必然假失败。修法按语义分层（不调大默认值，那会掩盖真正卡死的请求）：`REQUEST_TIMEOUTS={read:10s,write:30s,longTask:180s}`，长操作显式声明预算。同时修超时文案撒谎（旧「连接超时，请重试」诱导重复提交 → 新「服务可能仍在后台执行…不要重复提交」）。**同类第二处**：设置页「测试连接」（服务端等上游 15s）一并修正。全局审计：GET/短 POST 保持 read/write；公开站无人工超时、等 15s，无需改。 | **真实浏览器点击 46.1s 正常完成**（此前 10s 假失败），显示三条结果；六个管理页零告警。新增守卫 2 项；全量 typecheck、shared 39/322、api 73/383、web 37/212、agent 5/30、admin **7/23**、build:api/admin 全绿。未部署 | R31 |
| 2026-09-24 | R32 提示词进模型 | 已完成（本地） | 站主后续追问中审理发现：Agent 修订有提示词（「你是小影，回答简洁。」），但试跑回答是 **dsh 通用开发助手人格**——提示词一个字都没进模型。**第一性原理**：dsh 协议 `SessionPromptParams.contentBlocks` 明确写 "sent verbatim as the user message"——SDK 只有用户消息，**没有 system 字段**；系统提示由 `dsh-agent-loop` 经 `createSystemMessage` 组装，SOURCE=@deepseek-ai/dsh-system-prompt。**排除两个错误方向（都实测）**：AGENTS.md 放 home 根和 materials/（真实 cwd）均无效（追问模型本体确认「上下文没有任何 AGENTS.md 指令」）——因为本仓 patch 显式 disabled 了 agent-instructions；直接改 patch 文件会被 materializeHarnessHome 重写。**正解**：dsh-system-prompt 的 `personaPrefix`（官方部署 persona 入口）。落地：`revision.prompt` → `RuntimeOwner.systemPrompt` → `factory(agentId, persona)` → `materializeHarnessHome(launch, persona)` → `readOnlyToolPatch(persona)`；实例复用条件改为「同 Agent 且提示词未变」。**第一次端到端失败**：`harnessRuntimeAdapter` 包装 `(agentId)=>create(agentId)` 把 persona 丢了 → 修复透传后 API 端到端通过。 | 直接探针回答「我是小影」；API 端到端：修订写「只回复：我是小影，站主的专属助手。」→ 试跑**逐字符合**；换回原始提示词建新修订 → 正确自称小影（证明提示词变化→重建实例链路真实生效）。守卫：adapter「提示词变化必须重建」+ patch 生成 3 项；**变异验证**：只按 agentId 缓存时守卫立即失败。全量 typecheck、shared 39/322、api **73/387**、web 37/212、agent 5/30、admin 7/23、build:api/admin 全绿。未部署 | R32 |
| 2026-09-24 | R33 试跑输出可见性 | 已完成（本地） | 站主给具体 URL：「只能看到输入，但我想看到输出」。**三层递进审理**：① 数据层——run 实际 SUCCEEDED、tokens 239/9、events 有完整回答，**数据没丢**；② 渲染层——UI text = live || saved，库里有就能显示，实测该 URL 正常；③ **时序层（真缺陷）**——follow() 把事件**攒到运行结束才批量写库**，RUNNING 期间 DB 零事件；SSE 订阅中断（页面刷新/网络抖动）后客户端在结束前**永远看不到输出**，结束 refetch 又可能撞上事件未落库窗口 →「还没有文本」。修复一：observe 回调 text/usage **实时 appendEvent**。**修复二（由修复一暴露，差点被当成修好了）**：实时写+批量补写**同一事件写两遍**（实测 events=3、文本「OKOK」重复），且两路并发读同一最大 seq 撞 @@unique([runId,seq]) 抛 Prisma 错误 → **成功的运行被标 FAILED**（实测连续 3 次，text 已写成功——「答对了却算失败」）。修复：appendEvent **并发安全**（撞键用下一 seq 重试、上限 6 次、事件不丢不抛错）+ follow 删除批量补写。修复三（UI）：输出区加「输出（模型的回答）」标签，空态按状态区分（运行中「正在生成…」/终态「没有输出记录」）。 | 连续多次队列运行全部 SUCCEEDED、events 恒 2（text+usage）无重复、RUNNING 期间实时落库。守卫：appendEvent 并发安全（并发 6 条→全落库 seq 唯一）；**变异验证**：去掉重试立即失败。全量 typecheck、shared 39/322、api **73/388**、web 37/212、agent 5/30、admin 7/23、build:api 全绿。未部署 | R33 |
| 2026-09-24 | R 系列收尾 | 已完成（本地） | 勾掉 R24 与 R25 本体并补验收记录。**R24.e 逐项实测**：创建修订（201）→ 三类测试 pass×3 + gate.ok → 真试跑 SUCCEEDED 带用量与真实回答 → 记录可回看 → RUNNING 中 stop 得 CANCELLED/user（终态 run 不可覆盖）→ 无 grant 提交 400（新公共位置仍关闭）→ 未连接写操作如实报缺凭据。**R25 验收汇总**：dsh 路由名保存修订 201、旧提供方 id 400、/ops/agent-models 不含凭据值、/model-providers 404；提供方「编辑写回」由 R24.a/c 的模型连接配置区承接（当时漏勾，实际能力已在）。测试产生的修订已清理（小影现生效 v8，原始提示词）。 | R24 全部验收项逐条通过；R25 a–e 全部通过；系统处于「闭环可用 + 提示词生效 + 队列自愈 + 超时契约一致」状态。未部署 | — |
| 2026-09-24 | V10 公共问答统一执行 | 已完成（本地） | `/assistant` 与 `/assistant/stream` 由 `PublicAssistantService` 接入位置/部署/核验快照解析和 `AgentExecutionService.runPublicChat`。统一队列固定 `origin=public`、`kind=chat`、无后台 grant、目标 slug 只读；ExecutionRun 持久记录位置、部署 ID/代次与 snapshot hash。新增 session→修订归属、同源核验快照投影及失败原因词表；旧 DTO 缺位置仍返回规则回答。 | API 75 文件 **402 项通过**；新增公共服务单测 5 项、真实 AppModule HTTP 集成 1 项、Kernel/SQLite 队列集成 3 项均通过；shared 39 文件 **323 项通过**；`pnpm typecheck`、`pnpm build:api` 通过；独立临时 SQLite 从空库成功应用 16 条迁移。生产未部署 | V11 |
| 2026-09-24 | V11.a SSE v2 合同 | 已完成（本地） | `/assistant/stream` 输出 `accepted/delta/done/error`；每帧带 message/attempt/request ID、消息内序号和稳定 event ID，`delta` 只发裁剪文本，`done` 包含最终校验结果。设置流式 HTTP 状态为 200；web API 门面校验 v2 帧并以 done 覆盖增量。 | RED：HTTP 集成实测旧路由为 201、事件为 text/done；GREEN：shared 40 文件/325 项、web 定向 17 项和 typecheck 通过。 | V11.b |
| 2026-09-24 | V11.b 消息与 ACK | 已完成（本地） | 公开位置有 Conversation 主体与幂等 Turn，存脱敏 visitor body；Attempt 绑定修订与统一 run；assistant Message 保存增量 partial、最终正文和 pending/sent/ack/unknown。HTTP 响应写完后标 sent；访客 ACK 仅在同匿名身份且 sent 状态下成功，重复 ACK 复用唯一 eventId。断流中止不发 done，并保留 partial/unknown；不把生成完成视为送达。ACK POST 已同步 AppModule Origin/Admin 鉴权排除表与 Caddy。 | API 75 文件/408 项、shared 40 文件/325 项、web 38 文件/215 项通过；typecheck、build:api、build:web、GEO 全绿。Kernel SQLite 公共问答与 Repository 测试覆盖位置归属、运行关联、partial→sent→ack、跨访客拒绝和重复 ACK。生产未部署 | V12 |
| 2026-09-24 | V12 文章页访客入口 | 已完成（本地） | 文章页只读位置 manifest 后展示 Agent/不可用状态、会话内可关闭的采集介绍、示例问题和共享消息流；不会因浏览自动请求模型。示例按当前 slug 和位置发送，并对已完成的消息 ACK；不可用时规则回答仍可见。UI 使用 Lucide。 | 组件测试覆盖 manifest 无流请求、sessionStorage 关闭状态、slug/ACK；K3 浏览器实测文章阅读无遮挡和 AI 关闭的规则回复。最终 typecheck/web/API/web 构建/GEO 验收通过；生产未部署 | V13 |
| 2026-09-24 | V13 成员切换与历史恢复 | 已完成（本地） | manifest 只返回当前合格成员的 opaque key/名称/修订并独立说明 AI 开关；问答请求带成员 key+部署 generation，服务端按当前 enabled deployment 重新解析，不允许任意 Agent revision。Conversation SDK session 按修订分支恢复，返回的 session 按相同分支保存。新增按匿名 cookie+文章位置定位的 GET 历史；设置 `private, no-store`，剥离 anon/session/run/revision ID；非当前公开修订的已存回答以隐藏占位投影，正文不外发。前端显示成员/修订，切换不清历史，刷新恢复时间线，409 后更新 manifest 并提示确认。 | RED：集成测试先观察 manifest 缺成员列表、历史路由 404。GREEN：API 75 文件/412 项、shared 40/325、web 39/220、agent 5/30 全量通过；typecheck、build:api、build:web、GEO 全绿。API 集成覆盖成员白名单、generation 冲突、访客历史隔离与 cache-control；服务测试覆盖修订 session 分支和旧修订回答隐藏；组件测试覆盖切换、刷新恢复、代次变更提示及 AI 关闭时规则提示。生产未部署 | V14 |
| 2026-09-25 | V14 访客真实停止入口 | 已完成（本地） | 新增同源 `POST /assistant/conversations/:placementKey/:scopeSlug/stop`，只收 Message ID；服务端校验匿名 cookie、文章位置及对应 ConversationAttempt，再由 `AgentExecutionService.stopPublicRun` 校验 origin/actor/placement/scope/grant 并走统一停止。排队运行即刻 CANCELLED；RUNNING→STOPPING，Runtime close 退出证明后才 CANCELLED，失败隔离为 UNKNOWN。SSE disconnect 不传 abort signal、不取消模型；显式停止返回 `user-stopped` 错误帧，无 done，保留 partial/unknown。停止后历史将同一访客的已确认取消片段作为 partial/stopped 恢复。 | RED：HTTP 集成先得到停止路由 404。GREEN：API 76 文件/414 项、shared 40/325、web 39/223、agent 5/30 全量通过；typecheck、build:api、build:web、GEO 全绿。API 集成覆盖同访客、跨访客、跨 Origin、后台 run 隔离；断流 controller 测试；R13 调度集成通过 public stop wrapper，覆盖 queued、STOPPING、close proof 与迟到结果保护；web 覆盖 PENDING 轮询、服务端确认后 UI 显示停止及刷新恢复片段。未部署 | V15 |

| 2026-09-25 | V15 助手部件交互事件 | 已完成（本地） | shared v1 解析器仅允许 expose/intro-dismiss/open/close/send/follow-up/member-switch/citation-click/feedback 和事件专属安全 ID。新增 `/assistant/events`；服务端限流，校验文章位于核验快照、成员 key 属当前 manifest、messageId 属同匿名访客文章、引用 slug 确为该答案已校验 citations。客户端不提交 conversationId；服务端从 cookie 和位置关联。`eventId` unique 去重，occurredAt 只存 `clientOccurredAt`，receivedAt 由 DB 生成。Feature key 已登记；UI 只在助手面板记录交互，不采全站点击。 | RED：shared parser 文件缺失、HTTP `/assistant/events` 404。GREEN：API 76 文件/415 项、shared 41/327、web 39/226、agent 5/30 全量通过；typecheck、build:api、build:web、GEO 全绿。API 覆盖重复 eventId、同源、非法 URL、Message/Conversation 关联、假 citation 拒绝和 server receive time；组件覆盖 panel expose/open/close/intro-dismiss/member-switch/send/citation/feedback。生产未部署 | V16 |
| 2026-09-25 | V16 日志故障补写与健康缺口 | 已完成（本地） | 新增 SQLite 同目录 `assistant-event-spool/` 文件队列，上限 20MiB/24h，eventId 去重，临时文件原子重命名；启动及每30秒最多回放100条，DB 已有记录（duplicate）也会移除队列项。public assistant 指标与部件事件改经 recorder；DB 写入 250ms 超时后入 spool。健康查询 `GET /admin/assistant-events/health` 受管理 token 保护，暴露 backlog 和未知丢失量。生成回答后的业务保存最多等待250ms，超时/失败仍返回已生成回答；不 spool 消息正文。关键副作用审计未改，审计写入失败仍回滚。 | RED：spool/recorder 实现缺失；final persistence 永不结束时测试超时；部署存储异常曾被误转规则回答并吞掉 409，已修正为仅原始存储异常规则降级、ApiError 继续抛出。GREEN：API 78 文件/428 项、shared 41/327、web 39/226、agent 5/30 全部通过；typecheck、build:api 通过。Kernel HTTP 验证健康路由无 token 401、有效 token 200；Operations Journal 集成测确认审计仍失败关闭。未真实填满磁盘（以 spool 目录无法创建与 20MiB 超限覆盖故障分支）。生产未部署 | V17 |
| 2026-09-25 | V17 日志资源登记与到期策略 | 已完成（本地） | 新增 `ConversationLogResource`、`DeletionTombstone` 与单行 `LogRetentionPolicy`；resourceKey 是逻辑 ID，Conversation owner 无外键以便删除后仍保留清理索引。迁移回填 Message、FeatureEvent、AssistantRun、ConversationSdkSession、ExecutionRun/Event。DB 行资源与来源写入同事务登记；trace 在文件创建前登记，spool 队列自身带会话 ID 可枚举，不在 DB 故障窗口双写。detail 90 天、aggregate 365 天，`expiresAt` 由创建时间和当前策略计算，政策 API 只能缩短。新管理接口列出资源类型/到期时间、不返回路径或底层 key；策略 PATCH 经过同源校验。 | RED：`LogResourceService` 测试先因目标模块缺失失败；migration diff 发现 policy id 默认值漂移后修正。GREEN：API 82 文件/439 项、shared 41/327、web 39/226、agent 5/30 全量通过；typecheck、build:api、真实 SQLite migration integration 与重复 deploy/schema diff 通过。资源服务+controller+SQLite kernel 定向 8 项通过；公共 HTTP 资源枚举/路径拒绝/Origin 鉴权通过。无 native fork 或对话导出当前写入点，类型预留。生产未部署 | V18 |
| 2026-09-25 | V18 可重试会话删除与防复活 | 已完成（本地） | 管理 DELETE 在同一事务内建立唯一 tombstone 并写入无正文审计；随后停止同访客公开运行，逐个删除登记的消息、事件、运行、SDK session/fork、trace 和 spool，最后原子删除 Conversation 并完成 tombstone。每步可重入；清理失败保留 tombstone 并报告安全错误码，同一 DELETE 可重试；服务启动及每 30 秒恢复 pending/stopping/deleting，blocked 由站主显式重试。公开读写、资源登记、spool 回放和创建均拒绝已删除会话。未确认停止时不清正文；清理器只按受控逻辑 ID 推导路径并拒绝符号链接/越界。 | API 87 文件 455 项、shared 41/327、web 39/226、agent 5/30 通过；`pnpm typecheck`、`pnpm build:api` 通过。14 个定向 API 文件/83 项通过；HTTP/SQLite kernel 集成覆盖授权、同源拒绝、正文副本和 session/trace/spool 清理、无正文审计、其他会话保留、完成状态及阻止重建；服务单测模拟 deleting tombstone 的启动恢复与文件清理重试。未实际杀进程/断电；备份恢复仍留 V19。未部署 | V19 |
| 2026-09-25 | V19 删除清单与备份恢复防复活 | 已完成（本地） | 新增本机控制清单与可选盒外副本。V18 删除开始前登记无正文 tombstone，副本失败不清正文；恢复时把旧备份缺失的 deletion tombstone 补入目标库，事务审计 `conversation-delete-replayed` 不存正文，并让既有删除服务清除消息/资源。API 启动前执行删除和到期资源清理；`restore.pending` 期间全部路由503、调度不派发，replay/cleanup任一失败不监听。新增 SQLite `VACUUM INTO` 快照命令及双脚本：验证文件完整性、SHA、恢复清单和 30 天备份期限，替换数据库前先迁移/校验 staging DB。 | RED：清单/恢复服务/启动门缺失；manifest 写失败时原删除服务仍返回 completed；未支持盒外副本时副本故障用例仍成功。GREEN：恢复失败会阻断清理，旧 `.db` 快照 + 后续 tombstone 文件集成回放后无正文、无 Conversation，墓碑完成且审计无正文；保留期到期失败阻断 API。定向 API 13 文件/53项；API 95/469，shared41/327、web39/226、agent5/30；typecheck、build:api 全绿。恢复脚本未在目标服务器执行；未配置生产盒外副本或对象存储生命周期，未部署。 | V20 |
| 2026-09-25 | V20 会话日志查询与后台回看 | 已完成（本地） | 增加管理只读 `GET /ops/conversations` 列表与 `/:conversationId` 详情，访问受默认 AdminTokenMiddleware 保护；Operations capability 动态读测 query repo。服务端按内容 slug/位置/Agent/最近提问日期/run state/关键词过滤；每页 50/100，opaque cursor 为 updatedAt+id。列表不返回回答全文；详情串联逐轮消息/引用、Agent 修订、Attempt、public ExecutionRun/Event 和助手交互事件。查询使用当前 detail retention cutoff 并排除全部 tombstone，会话删除中也不回正文。未知 Token 保持 null，实际零保持0。新增 Conversation(updatedAt,id) 排序索引。Records 访客对话标签接入筛选/分页/详情页，用现有 React Query 和 Lucide。 | RED：query service/repository/API 及访客记录页面缺失；invalid cursor 首次误被接受，修正 `cursor===INVALID` 分支；capability 仍错误显示 not-connected；列表曾返回最新回答全文，新增反例后从摘要 DTO 删除，只在详情显示。GREEN：真实 SQLite repository/API 集成覆盖过滤、deleted tombstone隐藏、token 0/null和50→100 cursor无重复；admin组件覆盖输入筛选/URL同步/详情数据；迁移测试验证索引。全量 API 98/481、shared41/327、web39/226、agent5/30、admin8/26；typecheck、build:api、build:admin、verify:docs全绿。浏览器K3在本地隔离SQLite、AI关闭下通过列表→组合筛选→详情；桌面和390px viewport。Playwright 未安装，使用可用 Ego browser；首次请求仅有预存 favicon.ico 404，无 React/Vite 运行异常。未部署。 | V21 |
| 2026-09-25 | V21 受控导出与下载 | 已完成（本地） | 新增管理员导出任务、筛选+截止时间+会话 ID 快照，10,000 行硬上限、CSV 汇总/JSON 明细、shared 文本脱敏、CSV 公式注入处理。job 记录只持久化必要状态；过期时间按 `snapshotAt + 15m` 计算、文件大小按下载时 stat，私有本机文件不暴露路径。未知筛选字段拒绝而不静默扩大范围。每会话使用既有 V17 export 资源行绑定 job，删除任一入选会话先删文件、撤销 job 并清除所有关联；专用 TTL 不与 90 天对话留存互相误删。创建/下载授权/失败/过期/删除撤销记录无正文审计。 | RED→GREEN：格式/服务/仓储/文件 adapter/API 用例先失败再实现。全量 `test:api` 103 文件/491 项（含重复 `db:migrate` SQLite migration integration）、shared41/327、web39/226、agent5/30、admin8/28；typecheck、build:api、build:admin、verify:docs 通过。真实隔离 SQLite HTTP 证明后续会话不进入旧快照、JSON 邮箱二次脱敏、CSV 公式转义、匿名创建/下载401、过期下载410、删除本机会话文件消失且 job REVOKED。未做实际 10,000 条压力、大文件满盘、目标服务器权限/生产验证；未部署。 | V22 |

| 2026-09-25 | V22 公共路由白名单与安全边界 | 已完成（本地） | Nest `AdminTokenMiddleware.exclude` 与 Caddy 公网 allowlist 固定为13条方法/路径；移除页面已改用构建期 JSON 的 `/support` 公开 API。`SameOriginMiddleware` 全局覆盖所有变更方法；Web/Admin Vite proxy 保留浏览器 Host，生产可信反代 Origin 用 exact-host `WALKER_PUBLIC_ORIGINS`。私有管理写入仍要求 token/Basic，Caddy 公网未命中404，Nest无宽泛CORS。 | RED→GREEN：Vite代理配置测试原失败 `changeOrigin:true`，改保留Host后通过；Nest/Caddy 白名单测试先发现多出 `/support` 后对齐；CSRF 全局映射先因非全路由失败后通过。SameOrigin单测覆盖 POST/PUT/PATCH/DELETE，AppModule HTTP 覆盖恶意Origin问答事件403不落库、管理员内容PUT403/401、`/ops/exports`错误方法401；静态边界测试核13条精确匹配/私有回环/basic-auth/无宽泛CORS。全量 API104/500、shared41/327、web40/227、agent5/30、admin9/29；typecheck、API/admin/web build、verify:geo、verify:docs 全绿。完整 Caddy binary 不在本机，未跑 `caddy validate`；公网/生产未部署。 | V23 |
| 2026-09-25 | V23 公共位置启用前检查 | 已完成（本地） | 新增管理员 readiness 报告，分别核对核验快照、部署全员只读 profile 与最新权限测试、真实 SDK runtime 探针、日志保留策略、删除清单/恢复门、Nest/Caddy 源白名单一致性。启用、启用中的回退与公开模型解析由服务端重新计算 gate；请求体 `canEnable`/`force` 不能绕过；已启用位置在 gate 失效后 manifest 不可用。Admin 显示 blocker 并 fail-closed 禁用启用操作。 | RED：探针门禁测试暴露只有 `status=pass`、没有真实回答与退出证明时仍被接受；HTTP 集成验证伪造 `canEnable:true,force:true` 仍会被拒。GREEN：探针要求回答长度/hash、`closeError=null` 和 `processExited=true`；readiness 分项解释 blocker；有效 fixture 可启用，缺失/失败报告阻断，并覆盖 gate 失效后 manifest 与模型解析。全量计数及命令见 [V23 验收报告](docs/evidence/GOAL-2026-09-25-V23.md)。当前本地 API 未配置探针报告，按缺少运行证明保持 blocked；未触发真实模型请求。生产 Caddy 运行态与目标服务器恢复/权限留待 G08，未部署。 | V24 |
| 2026-09-27 | G07 生产库迁移预演 + 脚本交付 | 已完成（发现阻塞部署的缺陷并给出可复跑工具） | 把生产库副本拉到本地、用新代码 24 个迁移零风险演练。**发现 1**：`db:baseline` 在生产副本上**直接拒绝**（`schema 与迁移历史不一致`）——生产库**比基线迁移更旧**（缺 `SkillRun`；`AgentRun` 缺 `providerId`/`promptSnapshot`/`temperature`），按文档流程部署会在 baseline 步失败。**发现 2**：`db push` 需 `--accept-data-loss`（策略禁止）故不可用。**数据画像**：遗留表全 0 行，真实数据仅 `AssistantRun`=44、`FeatureEvent`=112。**发现 3**：备选 C（全新库+全量迁移+数据搬迁）**端到端跑通**——44→44、112→112 无列丢失、`migrate diff` 报 `No difference detected`、`db:migrate` 报 `No pending migrations`。 | 演练全程仅操作 `/tmp` 副本；开发库 sha256 前后均 `5fd860570558…` 未变；生产零写入。**本轮交付迁移脚本** `scripts/rebuild-legacy-db.ts`（`pnpm rebuild:legacy-db`），五道守卫逐条实测正确拒绝（缺参/相对路径/缺 --confirm/源库已有历史/目标已存在）。**并对生产副本端到端实测通过**：24 迁移 + 搬迁 **218 行/8 表**（FeatureEvent 112、AssistantRun 44、AssistantSession 38、AssistantBudget 8、Clue 7、GuestQuota 7、ContentFeedback 1、LikeCounter 1）、无源独有列丢失、diff 零差异。**更正上轮判断**：生产并非「只有 44+112 行」，而是 8 表 218 行（上轮仅抽查部分表）。 | 待授权执行 | G07 |
| 2026-10-30 | G07 生产部署与 admin 云端常驻 | 已完成（线上已验证） | 站主授权后执行完整生产发布。①备份旧库与配置至 `C:\WalkerBackups`；②代码拉至 HEAD `e21b301`，无损重建搬迁生产库至 `walker-v2.db`（27 个迁移全部应用，405 行/8 表 100% 迁入，diff 零差异）；③依赖安装、构建 API/Admin 并导入激活已核验快照基线（`04105a1bf8ff…`）；④配置新 `.env` 并重启 WalkerApi 与 WalkerGateway；⑤Cloudflare DNS 将 `admin.iwalk.pro` 自动切至 A 记录 `43.163.4.104`（开启橙云代理），Caddy 自动签发并配置 Let's Encrypt 证书与 Admin 静态托管。端到端实测：`api.iwalk.pro/health` 200 回显 `e21b301`、`www.iwalk.pro/api/health` 200 连通、`admin.iwalk.pro` 200 独立于 Mac 7x24h 正常提供服务且鉴权正常（未认证 401、认证 200）。 | 生产已上线；405 行历史数据无损搬迁；admin.iwalk.pro 彻底脱离 Mac 独立运行 | G08 |
| 2026-09-27 | G06 可恢复部署包与执行顺序 | 已完成（本地） | **修复真实缺陷**：`install-dsh.ps1` 硬编码 dsh `0.1.2-alpha.3` 而代码钉 `0.1.5-rc.3`（adapter 要求同版本，照旧装机 runtime 起不来）→ 改为从 `apps/api/package.json` 派生。**新增 `pnpm verify:deploy`（K0 15 项）**：版本唯一/安装脚本不硬编码/探针一致/24 迁移有序/能力默认关闭/content dirty/data 不覆盖/双白名单逐方法一致/回退禁旧写路径。**K6 隔离演练**：24 迁移 → VACUUM INTO 45 表快照 → 回退一致、未走旧写入接口。部署文档新增版本固定表、停服释放引擎顺序、能力关闭默认值表、备份/可删/绝不删清单、**manifest 基线先于公共问答启用**、回退说明。 | K0 15/15 通过；K6 演练通过（45 表往返一致）；全量回归 typecheck、shared 48/376、api 140/689、web 40/227、agent 5/30、admin 17/78、build:api、verify:docs、verify:architecture 全绿（1400 项 0 失败）。未调用真实模型，未部署 | G07 |
| 2026-10-13 | CI 流水线 + 批次入库 + 并发加固 | 已完成（PR #40 rebase 合并 main，CI 四跑后 11/11 全绿） | GitHub Actions 新增 .github/workflows/ci.yml：push main / PR 触发，单一 job 串行执行仓库验证链——pnpm typecheck（含 build:shared）→ db:generate → 五端测试（shared/api/web/agent/admin）→ check:content-fields → verify:docs → verify:architecture → build:web → verify:geo。CD 不自动化：web 走 Vercel（push main 自动发），盒子 API 人工部署（ops/windows/README.md）。lockfile 多余 importer（本地未跟踪的 packages/dsh-open-design）不影响 CI install，本地已实测口径。测试库隔离：DATABASE_URL 指 runner 临时 .test.db，globalSetup 删库重建。package.json 新增 ci 聚合脚本；.gitignore 补防误收规则（mario/、dsh-open-design/、ui-review/、archify 本机件）；ENGINEERING.md 常用命令补 CI 段。**本地预先跑过**：typecheck 全绿、verify:docs（86 文档零死链）、verify:architecture 通过。批次入库（rebase 后 main：a0a58b0 批次 617 文件、90ac372 CI、dd8dc3f 并发加固），G07 明确排除的 54 个本地路径（mario/、dsh-open-design/、archify-local、ui-review）未入库。**CI 四跑抓到并修掉三个真缺陷**：①Prisma Client 生成必须先于 typecheck（本地已生成故误绿）；②CI 慢 I/O 下并发写事件互等 SQLite 写锁撞 P1008/P2028（5s 超时）——改为按 runId 进程内串行化 + 瞬态错误重试（P1008/P2024/P2034/P2028）；③测试 finally 与在途事务抢跑（删 run 撞外键）把真实失败原因盖住——改 allSettled + FK 安全清理顺序。 | 本地：api 全量 146 文件/764 项全绿 + 加压 8 轮全绿 + typecheck/verify:docs/verify:architecture 绿；Vercel 预览构建绿（build:web 的 Linux 侧已证）；PR CI 第四跑 11/11 全绿后合并（run 38395858469）。偏差明示：批次同时提交了 design-qa.md（根与 output/）与根目录粘贴截图的删除（历史可恢复）。盒子 API 仍未部署（G07/G08 待停服窗口）。 | G07 |
| 2026-09-27 | G05 逐条签收 PRD 验收 | 已完成（本地） | 逐条核对 A01–A28 原始 PRD 通过标准（不照抄任务映射），判定回写 §11 表新增「G05 判定」列。**28 项均有可复查结果、0 项未过**：24 项「已过（本地）」（A01、A03、A05–A09、A11–A15、A17–A28），4 项「本地已过 / 真实待 G08」（A02 真实上线并打开页面、A04 真实访客调用绑定版本、A10 真实模型通道可用性、A16 真实线上版本比对）。每项引用所属任务证据文档，并列出 G08 生产实测清单。**不提前声称生产通过**：公共位置 readiness 仍 blocked（缺 runtime 探针报告 + G03 内存余量门），符合 A20。 | 28/28 有可复查结果、0 未过；24 本地已过 + 4 真实待 G08；依据 G04 基线 HEAD `8884913` 上 1400 项 0 失败。未调用真实模型，未部署 | G06 |
| 2026-09-27 | G04 仓库规定回归链 | 已完成（本地） | 绑定版本 `main` HEAD `8884913` + 本批工作树（content/ 干净）。K1 八门全绿：typecheck、shared 48/376、api 140/689、web 40/227、agent 5/30、admin 17/78、build:api、build:admin，合计 **1400 项 0 失败**。K4 四门全绿：check:content-fields（29 文件）、build:web、verify:geo（27 页）、**verify:architecture**（无新增硬伤/已知债务 4 条；G01–G03 新增源文件改变代码图谱故必跑）。测试库隔离正反双向确证：开发库 sha256/size/mtime 逐字节未变 + `API_TEST_DB_URL` 指向开发库时启动即失败（fail-closed）。 | 1400 项 0 失败；开发库哈希 `5fd860570558…`/417792/1788865083 回归前后完全一致；隔离守卫报 `API_TEST_DB_URL 必须是绝对路径的独立 SQLite .test.db 文件`。无未解释新失败（G02/G03 的失败已在各自任务内修正）。未调用真实模型，未部署 | G05 |
| 2026-09-27 | G03 目标机器资源和并发验收 | 已完成（本地） | 新增 `resource-concurrency.g03.kernel.integration.test.ts`（6 项）：单槽纪律（RUNNING 占槽时第二条 QUEUED、start 恰一次、MODEL_SLOT_LIMIT=1）、公共排队上限（超限如实降级）、终止（STOPPING→CANCELLED+退出证据+槽即时释放）、恢复（租约丢失 isolated→证明退出 released）、无孤儿进程（终态后占用 0）。**新增内存余量门禁**：shared `resource-gate.ts`（默认 512MB、运维 env 覆盖）+ readiness `resourceHeadroom` 门 + admin 标签。**全量回归否决第一版**：门禁放 dispatch 热路径致 28 个既有测试失败（开发机内存常态低于阈值）——改为 readiness 上线门 + vitest 显式 env。 | 6 项 G03 + 4 项 shared resource-gate 全过；**全量 api 140/689 全绿**（第一版 28 失败 → 最终 0 失败）。实测本机 os.freemem 64-100MB，门禁真实阻断（正确性现场证据）。全量门禁：typecheck、shared 48/376、web 40/227、agent 5/30、admin 17/78、build:api、build:admin、verify:docs、boundary 全绿。未调用真实模型，未部署 | G04 |
| 2026-09-27 | G02 完整失败恢复演练 | 已完成（本地） | 新增 `recovery-order.g02.kernel.integration.test.ts`（6 项）逐点注入失败：恢复未完成（闸门 503 不放半恢复数据）、进程孤儿（UNKNOWN 不伪造终态、活孤儿不误判退出）、发布未知（不假装 PUBLISHED、快照不被污染）、补写与删除竞争（终态不回退、迟到补写精确清除）、旧备份恢复（清单重放补回删除事实、复活正文再次清干净）、恢复顺序不打架（与 main.ts 启动顺序一致）。**发现并修复真实缺陷**：`resumePending()` 只查未完成态，删除完成后迟到补写永久残留；第一版全局清扫被合并验证否决（`finalizeConversation` 连带删除远超必要范围，并行测试跨文件打架且失败集合漂移），最终改为 `lateWriteResources()` 只取 `registeredAt > completedAt`（只认删除完成后的写入），清扫限定三步删除、不回退终态、不触碰会话行。 | G02 六项全过、log-resources 16/34 全过、**全量 api 139/683 全绿**（跨文件干扰消失）。全量门禁：typecheck、shared 47/372、web 40/227、agent 5/30、admin 17/78、build:api、build:admin、verify:docs、boundary 全绿。未调用真实模型，未部署 | G03 |
| 2026-09-27 | G01 旧数据导入与兼容读演练 | 已完成（本地） | **逻辑与装配分离**：零装饰器 `legacy-data-migration.core.ts` 供 CLI 与 Nest 共用（`scripts/tsconfig.json` 未开 `experimentalDecorators`，直接 import 带装饰器的 Nest 类会报错），`LegacyDataMigrationService` 仅 DI 薄壳，新增 `pnpm legacy:migrate`。**溯源去重**：`ExecutionRun` 加 `legacySource`/`legacyId` + 唯一索引（迁移 `20260927110000`）。**四条纪律**：幂等、溯源去重、诚实未知（`agentRevisionId` 一律 null；用量 0 记 null 不记 0）、历史保全。 | 4 项 Kernel：首次迁移（state 映射、**无用量为 null 而非 0**、traceId 回写、会话索引补齐）；**升级两次增量全部为 0 且三项行数逐一对齐不变**；旧业务链可读（旧表一行未删、报表 total=2 且明细完整）；新记录单一权威写入（旧表行数不增）。**CLI 实测**：隔离库两次执行第二次全部归零。全量门禁：typecheck、shared 47/372、api **138/677**、web 40/227、agent 5/30、admin 17/78、build:api、build:admin、verify:docs、boundary 全绿。未调用真实模型，未部署 | G02 |
| 2026-09-27 | O10 验收真实运营回路 | 已完成（本地） | 新增全链路端到端集成演练 `operations-lifecycle.closed-loop.kernel.integration.test.ts`，在真实 SQLite 库与核心接线下串联八阶段：1. 访客提问（ack 送达）→ 2. 显式转更新事项（软引用/排期）→ 3. 到期扫描与处置（延后/完成）→ 4. 候选审批与正本原子写入（CAS/授权）→ 5. 发布预检、状态机推进、线上确证与快照同步 → 6. 内容复盘（指标来源声明、样本不足写未知）→ 7. 复盘建议显式转下一事项并设提醒（双向可回溯）→ 8. 运营统计真实确证。覆盖 A01、A14–A15、A20、A28，不编造增长结果。 | **K1/K2 内核演练通过**；**K3 浏览器核验继承覆盖**（O04/O07/O08/O09 的 Headless Chromium + CDP 验证）。全量门禁：typecheck、shared 47/372、api 137/673、web 40/227、agent 5/30、admin 17/78、build:api、build:admin、verify:docs、boundary 全绿。未调用真实模型，未部署 | G01 |
| 2026-09-27 | O09 复盘建议显式转下一事项 | 已完成（本地） | `ACTION_ENTITY_TYPES` 加入 `REVIEW`，新 Action 设置 `entityType='REVIEW'` 与 `entityId=review.id`。新增 `convertReviewToAction`（校验 nextAttempt 非空、requestKey 幂等、支持设置 plannedDate 并推导到期瞬时、**不自动选题/发布**）与 `getReviewForAction`（从事项回溯原复盘）。`ContentReviewPanel` 支持为每条复盘填写提醒日期并点击「转为下一事项」，重复点击提示此前已生效。 | **K3 真实浏览器核验**（Headless Chromium + WebSocket CDP 驱动）：打开 `/records?tab=reviews`，填入提醒日期 `2026-10-25` 点击转换成功；再次点击收到幂等提示；概览页提醒箱正确显示新事项与 `2026-10-25` 排期；**控制台 0 错误**。Kernel 集成 6 项：保留复盘引用、同 requestKey 幂等回放、可设提醒日期且扫描触发、从事项回溯原复盘、无 nextAttempt 拒绝、参数校验与不自动建 Seed/发布。组件测试 7 项全绿。全量门禁全绿，临时库与服务已清理。未调用真实模型，未部署 | O10 |
| 2026-09-27 | O08 内容更新复盘 | 已完成（本地） | 运营记录新增「更新复盘」标签页（`tab=reviews`），挂载 `ContentReviewPanel`。表单支持录入事项 ID、发布版本 ID（若提供且存在，其 stage 必须为 PUBLISHED）、变更行为（didWhat）、观察结果（observed）、观察窗口（windowStart/End）、证据充分度（evidenceState: UNKNOWN/INSUFFICIENT/SUFFICIENT，**样本不足如实写未知**）、指标来源说明（如引用 /ops/overview 窗口）与下一次尝试（自由文本，供 O09 显式转化）。显式提交并以 `requestKey` 幂等，模型建议不能自动变成已验证成效。 | **K3 真实浏览器核验**（Headless Chromium + WebSocket CDP 驱动）：打开 `/records?tab=reviews` 激活复盘标签并展示空态；展开表单录入事项/行为/观察/INSUFFICIENT 证据状态/指标来源说明/下一次尝试；提交成功反馈并呈现完整卡片；刷新页面后复盘持久化存在；**控制台 0 错误**。Kernel 集成 5 项：保存并回看完整复盘、样本不足写 UNKNOWN、未核验发布拒绝关联（400 `review-release-must-be-published`）、同 requestKey 幂等重放、全局与事项列表过滤。前端组件测试 4 项全绿。全量门禁全绿，临时库与服务已清理。未调用真实模型，未部署 | O09 |
| 2026-09-27 | O07 关键数据概览与状态刷新 | 已完成（本地） | 关键数据替换框架阶段的基础汇总，接入 `/ops/overview`；展示访客提问、回答分层、交付确认、到期事项、内容阶段与索引落后；5 秒可见轮询刷新/页面隐藏停轮询/15 秒标记陈旧；无数据引导且无假趋势图。下钻联动：已到期事项下钻带 `scope=overdue` 并过滤提醒箱；访客提问与失败运行下钻带 `tab=visitors`、`runState=FAILED`；内容阶段下钻带 `stage=ready`、`stage=review` 且 ContentListPage 同步下拉与列表；records 开放 reminders 标签页挂接提醒箱。 | **K3 真实浏览器核验**（Headless Chromium + WebSocket CDP 驱动）：概览关键数据卡片提问 1/逾期 1/送达 1；口径与来源可展开；无假图表；`/overview?scope=overdue` 显示仅到期事项且匹配事项；`/records?tab=visitors` 激活访客对话且显示访客问题；`/content?stage=ready` 绑定 ready 并过滤；**控制台 0 错误**。单元与组件测试：`OpsStatsPanel.test.tsx` 9 项全绿、`ContentListPage.test.tsx` 4 项全绿、`ReminderInboxPanel.test.tsx` 10 项全绿。全量门禁全绿，临时库与服务已清理。未调用真实模型，未部署 | O08 |
| 2026-09-27 | O06 可追溯的运营统计 | 已完成（本地） | 口径单一来源 `shared/ops-stats.ts`：提问数=唯一访客消息 id 基数（**重生成只增 attempt，不抬高提问数**）；成功/降级/**失败**/未知四类互斥 + 交付确认独立；`summarizeUsage` 只累加明确记录（**全缺→null、明确 0 仍是 0**）；`rateOrNull` 分母≤0→null（**不造没有分母的留存率/转化率**）。**修正一处粉饰**：初版忽略 `state` 会把 FAILED 算进「降级但可用」。新增 `GET /ops/overview`（窗口+来源+缺失覆盖，非法窗口回落默认）。 | shared 12 项 + Kernel 9 项：**再补两次重生成提问/会话/轮次一字不变**；**coverage 严格在 0~1 之间**证明缺失未被计 0；四类合计=运行总数；窗口外不计入。HTTP 实测：匿名 401、带 token 200、空库全 null 不造假、有数据 `coverage=0.333/total=420/failed=1/succeeded=0`。全量门禁通过；**K3 留待 O07 并已如实标注**。未调用真实模型，未部署 | O07 |
| 2026-09-27 | O05 访客问题转更新事项 | 已完成（本地） | **软引用而非外键**：`Action.evidenceRef` 存 `{conversationId,messageIds,capturedAt}`；加外键只会导致级联删事项或阻止访客删会话，两者都不可接受。**三条红线**：显式操作、不复制会话（只存摘要，不引用助手回答）、不授予 AI 写权限（测试断言授权数与候选数不变）。保留期口径复用既有会话服务，不另写。新增 preview（零写）/ convert（requestKey 幂等）/ evidence（deleted/expired/missing）三端点 + 对话详情面板。 | 11 项 Kernel：零写预览、幂等、**删除后 deleted 且事项仍在**、**过期后 expired 不回填旧正文**、伪造 id 丢弃、权限不变、排期沿用共享规则。**修复真实缺陷**：新测试遗留 DeletionTombstone 污染共享库，导致快照与恢复核对两个测试失败——即此前「批量顺序敏感」的真因；修复后 api **133/652 连续三次全绿**。K6 全新库 23 迁移全应用、旧行新列为 NULL。全量门禁通过；**K3 未重跑浏览器核验并已如实标注**。未调用真实模型，未部署 | O06 |
| 2026-09-27 | O04 事项与提醒箱界面 | 已完成（本地） | 服务端算到期、前端只展示：shared 提醒箱读模型 + `GET /ops/reminders/inbox`；**分类用站点本地日期**（UTC 日期会让 00:00–08:00 的「今天」错判为「已到期」），计数不计已忽略项。`ReminderInboxPanel` 内嵌概览与内容详情「提醒」标签，**不增第五个主工作面**。重复点击稳定：按钮自带稳定 requestKey → 服务端幂等回放 → 如实提示「此前已生效」；延后按本地日期 +7 天。 | 组件 9 项（含**同键复用**、延后日期、失败如实、空态不造假）；shared 13 项（含跨日边界）；API 新增 **AI 关闭时全链可用**；**K3 真实浏览器**：已到期 1 + 创建后可见、UTC 瞬时、三按钮、提醒标签与表单、**实际点击「完成」→「已标记完成」→ 刷新后消失且计数 0 → 控制台 0 错误**。全量 typecheck、shared 46/360、api 132/641、web 40/227、agent 5/30、admin 15/60、build:admin、verify:docs 全绿；核验服务与临时库已清理。未调用真实模型，未部署 | O05 |
| 2026-09-26 | O03 提醒完成、延后与忽略 | 已完成（本地） | 三种处置：complete（DONE + 清 dueAt）、snooze（plannedDate/dueAt/timezone **原子重算**，旧到期随改期失效）、ignore（撤下到期但事项仍 OPEN）。**新增专用处置端口**让「发生记录结果 + Action 更新 + 审计」**同事务提交**——既有 OperationsJournal 事务视图不含 Action/occurrence，塞进去会留半截状态。幂等以审计行 requestId 为依据（不额外建表）；`repeat` 非 none 在三处入口（处置/POST actions/PATCH actions）均 **501**，绝不静默降级。 | 9 项 Kernel：三语义正确；重复完成重放同 id 且审计恒 1 条；**连续延后两轮扫描不触发旧到期**、新到期才出第二条；repeat 拒绝且 none 通过；**事务故障注入后四类事实一起回滚**且失败请求键未被消费；fetch 零调用 + ExecutionRun 不增。3 项 HTTP：401/201 重放/501。全量 typecheck、shared 46/357、api 132/640、web 40/227、agent 5/30、admin 14/51、build:api、verify:docs、boundary 全绿；`src/reminder/` 33 项连续 3 次全绿。未调用真实模型，未部署 | O04 |
| 2026-09-26 | O02 到期扫描与恢复补检 | 已完成（本地） | 新增 `reminder-scan.service.ts`：每 5 分钟一轮、`scanOnce` 为唯一入口（定时器/启动补检/测试共用）、幂等 `startScheduler` 且 `unref`、单批 200 与 ≤20 轮限流、`scanning` 防重入、**恢复门或库不可写时 fail-closed 不扫描**、结果如实计数（已存在计 deduped）。`main.ts` 恢复门清除后先补检再起调度器。**设计要点**：去重仍由 O01 的唯一索引保证，扫描只「反复敲门」，不自己判断能不能建记录。 | 10 项 Kernel 集成：未到期/已完成均 0 条；连续三轮恒 1 条；**重建整套模块模拟重启后仍 1 条**；延后后旧到期不触发、新到期才产生第二条；并发三路仅 1 条；计时器不叠加可清理；**fetch 零调用 + ExecutionRun 行数不增**（不调模型不发通知不新建进程）；恢复门 fail-closed。全量 typecheck、shared 46/357、api 130/628、web 40/227、agent 5/30、admin 14/51、build:api、verify:docs 全绿；`src/reminder/` 21 项连续 3 次全绿。未调用真实模型，未部署 | O03 |
| 2026-09-26 | O01 提醒发生记录与复盘数据 | 已完成（本地） | shared 新增 `reminder.ts` 作唯一时间规则：`resolveActionDue`（日期→站点当日00:00→UTC，Intl 换算含夏令时校正）、`utcToZonedDate`（反向还原）、`reminderOccurrenceKey=actionId@dueAt@timezone`（**不含扫描时间**，否则重复扫描绕过唯一约束）、`normalizeReviewWindow`。持久层：`Action` 增量 `dueAt/timezone`（可空、旧行不反推）；新表 `ReminderOccurrence`（dedupeKey 唯一索引）与 `ReviewEntry`（关联已核验 releaseId、evidenceState 默认 UNKNOWN、requestKey 唯一）；迁移 `20260926100000_reminder_review`；两仓储撞唯一键返回既有记录（幂等）。用例 `ReminderService` + `/ops` 路由（默认管理鉴权，未进公开白名单）；`ActionService` 改期**原子重算** dueAt。**测试暴露并修正一处语义**：未排期时不再返回默认时区（无瞬时即无生成时区）。 | shared 10 项（UTC↔站点日期双向还原、三时区差异、NY 夏令时边界）；Kernel 8 项（三次扫描仅 1 条发生记录、改期后旧到期再扫不新增、复盘 requestKey 幂等、旧 Action 行为保留）；K6 新库 22 迁移全应用 + 7 新索引，旧表形状行迁移后逐字段保留且新列 NULL、重复 dedupeKey 被唯一约束拒绝。全量 typecheck、shared 46/357、api 128/615、web 40/227、agent 5/30、admin 14/51、build:api、public-route-boundary 通过。未调用真实模型，未部署 | O02 |
| 2026-09-26 | C24 完整内容更新闭环 | 已完成（本地） | 新增闭环 Kernel 集成验收，串起人工编辑→候选→审批消费→保存→预检清单→独立发布批准→阶段推进→线上核验→快照同步。**发现并修复 P0 真实缺陷**：`ContentRelease.sourceHash` 用正本文件字节 SHA-256，而线上证据（HTML `content-hash` 与 `public-manifest` 条目 hash）是公开投影哈希——两个命名空间不同，**生产环境线上核验与快照同步永远不可能通过**；C17 此前用直接构造的 release 夹具绕过 `prepareRelease`，把两半从未真正接上。修复：shared 新增唯一映射 `toPublicSnapshotSource`/`publicItemHash`/`normalizeLegacyBody`，`prepareRelease` 的 `sourceHash`/`baseHash` 改用公开投影身份，文件版本由 `changeId → change.appliedHash` 追溯（不新增列/迁移）；`generate-content.ts` 删除重复 MDX 降级实现改调 shared。 | 实测真实数据证伪：vibe0s 文件 hash `db16f586…` ≠ 线上 content-hash `25885fc2…`。**变异验证**：sourceHash 改回文件 hash 立即失败。**等价性**：去重后 content:gen 的 buildId/collectionHash/28 条 hash/条目数逐一相同。全量门禁：typecheck、shared 45/347、api 127/607、web 40/227、agent 5/30、admin 14/51、build:api/admin/web、verify:geo、check:content-fields；C24 范围 17 文件 65 项连续 3 次全绿。未调用真实模型，未部署 | O01 |
| 2026-09-25 | V24 首个文章位置及日志闭环 | 已完成（本地） | 新增完整 Kernel 集成验收，用隔离 SQLite、两位只读成员和确定性 Runtime fixture 走完：快照/发布证据→启用位置→两轮分别由不同成员回答→同访客历史→成员切换事件→后台筛选/回看→JSON 导出→删除/撤销导出；删除前 SQLite 快照恢复到临时库后，通过删除 manifest replay 清除复活消息。验证 `origin=public`、`grantId=null`、引用在核验快照内、他人看不到访客历史。 | **K1**：typecheck；API106/505、shared41/327、web40/227、agent5/30、admin10/31；API/admin/web build、GEO、文档门禁通过。**K3**：本地文章页两轮规则问答、刷新和浏览器返回均恢复历史；Admin Records 关键词筛选、双轮详情和 JSON 导出可下载状态通过，零 console error/warning/exception。页面截图通过 Codex 内置浏览器观察；Ego CDP 截屏超时但语义快照可读。**K4/K6**：web build 同时跑 GEO，另外执行 `verify:geo`；旧备份在第二份临时 `.test.db` 中恢复、清理后 tombstone completed、消息数归零。具体输出见 [V24 验收报告](docs/evidence/GOAL-2026-09-25-V24.md)。浏览器真实文章位置因当前未启用模型只走规则答复；Agent 切换和模型执行由假 Runtime 的 API 集成覆盖，不等同真实模型/生产启用。临时服务、凭据和数据库已清理，未部署。 | C01 |
| 2026-09-25 | C01 内容候选、审批与发布合同 | 已完成（本地） | shared 新增 ContentChange、ContentApproval binding、ContentRelease 和三版本只读投影合同。apply-candidate 与 publish-website 分开；审批 binding 固定 action/target/baseHash/candidateHash/grantId/grantRevision，规范 key/hash 不忽略未知字段；ContentChange 不含 PUBLISHED，ContentRelease 只能按 PREPARED→COMMITTING→PUSHED→VERIFYING→PUBLISHED 迁移，且发布 hash 要匹配已批准候选。网页 release stage 与 assistantIndexState 分开。更新技术方案和 PRD 语义，模型迁移仍留 C02。 | RED：shared 测试先观察新合同导出缺失；实现后反例发现审批比较忽略额外 `force` 字段，且缺 ContentChange 状态迁移 helper；索引状态 guard 初次缺失时失败。GREEN：严格键白名单、hash/grant/target 校验、binding 比较、状态机及发布 hash 核验 helper；5 项合同测试通过。全量 shared **42/332**、typecheck 通过；API 既有 ContentRelease/工作站集成 2 文件/10 项通过；API/Admin/Web build、verify:geo、verify:docs 通过。完整字段对照与设计裁决见 [C01 验收与实体模型审计](docs/evidence/GOAL-2026-09-25-C01.md)。未加迁移、未开放写 API、未部署。 | C02 |
| 2026-09-25 | C02 内容候选与发布持久模型 | 已完成（本地） | 新增 `ContentChange`/`ContentRelease` SQLite migration、请求键唯一索引与查询索引，保留旧 `Submission`/`Publication`；Kernel 新接两种 Prisma 仓储。候选可记录批准快照并只从 PROPOSED 转 APPROVED；release 仅可从已应用且 target/source hash 一致的候选创建，初始 PREPARED/PENDING，manifest/commit/核验字段可持久，网页 stage 与索引状态分开。 | **RED**：Kernel 候选仓储首次请求因 provider 缺失而失败；审批用例因 `recordApproval` 未实现失败；release 用例因 provider 未注册失败。**GREEN**：迁移 integration 保留既有 Submission/Publication 行；Kernel/SQLite 用例 5/5，覆盖候选与 release 的重启读回、同键幂等与不同事实冲突、批准重放/替换冲突、未应用候选发布拒绝。`pnpm typecheck`；API **107 文件/510 项**；shared **42/332**、web **40/227**、agent **5/30**、admin **10/31**；API/Admin/Web build、build:web 内 GEO 与独立 `verify:geo` 均通过；`verify:docs` 扫描 39 份活跃 Markdown，零死链、待办 SSOT 一致。验收详情：[C02 报告](docs/evidence/GOAL-2026-09-25-C02.md)。未写内容正本，未开放写 API，未部署。 | C03 |
| 2026-09-25 | C03 内容文件对象锁与 expectedHash CAS | 已完成（本地） | 文件仓储按绝对内容目录+slug 串行，详情返回当前 hash，保存锁内校验 expectedHash；新建 expectedHash=null。写入唯一同目录临时文件，完整写入后 fsync/sync，再 rename；失败清理临时文件并保留原文。旧 ContentAdmin 保存体缺 hash 会拒绝；工作站保存前读当前 hash，防止其调用绕过 CAS。 | **RED**：双仓储实例并发用例观察两次均成功，旧实现会静默让后写覆盖；错误 expectedHash 用例观察旧正文仍被过期编辑覆盖；替换故障探针注入 rename 错误时旧实现仍返回成功。**GREEN**：API 测试新增 7 项覆盖单赢家并发、过期 hash/重复创建拒绝、详情 hash、slug 越界、临时文件半写和 rename 失败；ContentAdmin controller 覆盖缺 expectedHash 拒绝及正确传参。`pnpm typecheck`；API **107 文件/517 项**；shared **42/332**、web **40/227**、agent **5/30**、admin **10/31**；`check:content-fields`、API/Admin/Web build、build:web 内 GEO 与结构门禁、独立 `verify:geo` 均通过；`verify:docs` 扫描 40 份活跃 Markdown，零死链、待办 SSOT 一致。细节见 [C03 验收报告](docs/evidence/GOAL-2026-09-25-C03.md)。只使用临时测试目录，未写仓库文章或部署。 | C04 |
| 2026-09-25 | C04 内容写入意图与崩溃恢复 | 已完成（本地） | 新增 `ContentMutationService.apply/reconcile` 并接入 Kernel。apply 先核验候选 bytes hash，在一个 SQLite 事务将 APPROVED→APPLYING 并记录 intent audit；再调用 C03 文件 CAS；完成后另一个 DB 事务按实测 hash 写 APPLIED/appliedHash 和结果 audit。重启恢复核对候选 hash 后只补 DB、不重复写；仍是 base hash 才用同一批准内容重试；其他 hash 记 CONFLICT 且正文保留。 | **RED**：真实 Kernel 中 `beginApply`/`finishApply` 方法和 mutation service provider 缺失时对应集成失败。**GREEN**：8 项 Kernel/隔离 SQLite/临时文件集成：intent+before/after 审计与同键无重复；审计 INSERT 故障时 SQLite 事务回滚且候选仍 APPROVED；成功 apply；写前 intent 后模拟中断并关闭/重建 Kernel 后续写；文件已替换、DB 回写失败后重启只补 DB、不再调文件写；外部 hash 变化转 CONFLICT 且保留外部正文。`pnpm typecheck`；API **108 文件/525 项**；shared **42/332**、web **40/227**、agent **5/30**、admin **10/31**；API/Admin/Web build 及 build:web 的架构门禁/GEO、独立 `verify:geo` 均通过；`verify:docs` 扫描 41 份活跃 Markdown，零死链、待办 SSOT 一致。细节见 [C04 验收报告](docs/evidence/GOAL-2026-09-25-C04.md)。不增加 schema，不改 `content/log`，不开放 API 或部署。 | C05 |

| 2026-09-25 | C05 人工保存受控出口 | 已完成（本地） | `/admin/content/:slug` 继续受 AdminToken 保护，人工保存委托 `ContentMutationService.saveManual`，固定 actor=`owner`，服务端生成 requestId。R05 journal 在 C03 expectedHash CAS 写文件前记录 intent，完成/冲突/失败后记录 before/after hash audit；移除 `content:gen` 自动刷新。人工保存不创建 ContentChange、不需要模型审批。 | **RED**：Kernel mutation 缺少 `saveManual`，ContentAdminService 对 mutation mock 的调用数为0。**GREEN**：定向 API 3文件/15项；HTTP真实 AppModule 测 401/stale hash 409/合法保存；intent 审计不可用时不写文件；CAS冲突记录审计并保留原文；结果审计故障明确回报正文已写入；人工保存后 `content.json` 字节不变，未创建候选。全量 API **109/530**；shared **42/332**、web **40/227**、agent **5/30**、admin **10/31**；typecheck、API/Admin/Web build、content 字段检查、架构、GEO 与文档门禁通过。验收见 [C05 报告](docs/evidence/GOAL-2026-09-25-C05.md)。不加 schema、不改仓库文章、不部署。 | C06 |
| 2026-09-25 | C06 文章编辑差异与预览 | 已完成（本地） | admin ContentDetailPage 接通正文编辑、实时预览与行级差异（纯函数 computeTextDiff）；持有 baseHash 与未保存状态；离开导航未保存弹窗保护；受控保存携带 expectedHash，保存后明确标示未发布；409 冲突保护本地 draft 不被覆盖并呈现冲突比对与站主决策。 | **RED**：缺少 computeTextDiff 算法，ContentDetailPage 缺少编辑器、差异标签、未保存弹窗与冲突比对，测试 5 项全败。**GREEN**：shared 纯函数差异测试 4 项通过，admin 详情页测试 5 项通过；全量测试 shared **43/336**、API **109/530**、web **40/227**、agent **5/30**、admin **11/36**；typecheck、API/Admin/Web 构建、字段核查、架构门禁、GEO 与文档链接全绿。见 [C06 报告](docs/evidence/GOAL-2026-09-25-C06.md)。 | C07 |
| 2026-09-25 | C07 独立候选文件仓储 | 已完成（本地） | 新增 `CandidateFileRepositoryPort` 与 `FsCandidateFileRepository` 适配器，按 candidateId/hash 在受控目录下保存不可变候选；相同 hash 幂等复用，不同 hash 冲突拒绝；读取核验 SHA-256 hash；严禁路径穿越；接入 KernelModule 并打通 `ContentMutationService` 对 candidateRef 的读取核验。 | **RED**：`FsCandidateFileRepository` 模块不存在，单元测试失败。**GREEN**：单元测试 6 项全部通过；Kernel 候选读取与应用集成测试通过（13/13）；全量测试 shared **43/336**、API **110/537**、web **40/227**、agent **5/30**、admin **11/36**；typecheck、API/Admin/Web 构建、字段核查、架构门禁、GEO 与文档链接全绿。见 [C07 报告](docs/evidence/GOAL-2026-09-25-C07.md)。 | C08 |
| 2026-09-25 | C08 后台生成内容候选 | 已完成（本地） | 实现 `ContentMutationService.propose` 与 `/ops/content-changes`（POST/GET 列表与详情）；固定输入正文版本并强制校验 R09 L1 `content:propose` 授权；调用 Agent 生成候选，来源 run 记录持久化；坏输出（缺少 frontmatter、无变动）与模型失败均被拦截不产生候选；正本文章保持只读且 hash 始终不变。 | **RED**：`mutation.propose` 缺失、`/ops/content-changes` 404，测试 5 项失败。**GREEN**：集成测试 5 项全部通过；全量测试 shared **43/336**、API **111/542**、web **40/227**、agent **5/30**、admin **11/36**；typecheck、API/Admin/Web 构建、字段核查、架构门禁、GEO 与文档链接全绿。见 [C08 报告](docs/evidence/GOAL-2026-09-25-C08.md)。 | C09 |
| 2026-09-25 | C09 精确审批与一次性消费 | 已完成（本地） | 实现 `ContentMutationService.approve` 与 `apply` 前复检，暴露 `/ops/content-changes/:id/approve` 与 `/apply` 路由；`approve` 绑定动作/原文/授权修订并留审计；`apply` 执行前复检授权有效性、撤销状态、grantRevision 及原文冲突，单个事务原子消费审批；CAS 写入后记终态；重复批准/执行幂等；修改授权绝不含发布。 | **RED**：`mutation.approve` 缺失、审批与应用端点 404，测试 5 项失败。**GREEN**：集成测试 5 项全过；全量测试 shared **43/336**、API **112/547**、web **40/227**、agent **5/30**、admin **11/36**；typecheck、API/Admin/Web 构建、字段核查、架构门禁、GEO 与文档链接全绿。见 [C09 报告](docs/evidence/GOAL-2026-09-25-C09.md)。 | C10 |
| 2026-09-25 | C10 候选差异与审批 UI | 已完成（本地） | admin ContentChangeReviewPanel 接通候选审阅与审批 UI；展示动作、范围、基线/候选 hash 与行级彩色差异（能看清修改什么）；显示审批信息与正本修改导致的基线冲突失效原因；“批准保存”与“应用到工作区”分别操作且重复点击幂等；“批准发布”独立操作解耦；后台显式禁用持续自主内容授权入口并标注安全红线。 | **RED**：`ContentChangeReviewPanel` 缺失，测试 5 项失败。**GREEN**：面板测试 5 项全过；全量测试 shared **43/336**、API **112/547**、web **40/227**、agent **5/30**、admin **12/41**；typecheck、API/Admin/Web 构建、字段核查、架构门禁、GEO 与文档链接全绿。见 [C10 报告](docs/evidence/GOAL-2026-09-25-C10.md)。 | C11 |
| 2026-09-25 | C11 清点并封闭内容写入旁路 | 已完成（本地） | 清点全仓正本写入、状态迁移与发布触发调用点，清单收敛至受控用例；封闭 `PublicationService.publishWebsite` 直接写文件旁路，改为委托 `ContentMutationService.saveManual`，补齐 CAS 与意图/完成审计；全仓仅受控 mutation 服务调用底层正本写入；集成测试覆盖旧工作站受控落盘、公开来源攻击、伪造管理员与未授权提权 401 拦截（A07/A08）、陈旧 hash CAS 冲突保护；清单无未处理可达项。 | **RED**：`PublicationService` 缺少受控 mutation 委托，无意图/完成审计。**GREEN**：集成测试 3 项全过；全量测试 shared **43/336**、API **112/547**、web **40/227**、agent **5/30**、admin **12/41**；typecheck、API/Admin/Web 构建、字段核查、架构门禁、GEO 与文档链接全绿。见 [C11 报告](docs/evidence/GOAL-2026-09-25-C11.md)。 | C12 |
| 2026-09-25 | C12 实际发布范围预检 | 已完成（本地） | 在 `GitStatusPort` 与 `NodeGitStatusRepository` 增加 `workspaceSnapshot` 单次 O(1) 解析；`ContentReleaseService.preflight` 增加实际发布范围预检与 manifest 生成；单篇发布若其他文章脏、support-config 脏或代码脏，返回 `scopeConflict` 并在发布时抛出 409 `scope-conflict` 拒绝；通过后生成结构化 manifest 且哈希稳定可见。 | **RED**：预检仅检查 frontmatter，其他文件脏仍 ok: true，无 manifest，测试 5 项失败。**GREEN**：新增 preflight 测试 5 项全过、release 测试 9 项全过；全量测试 shared **43/336**、API **114/555**、web **40/227**、agent **5/30**、admin **12/41**；typecheck、API/Admin/Web 构建、字段核查、架构门禁、GEO 与文档链接全绿。见 [C12 报告](docs/evidence/GOAL-2026-09-25-C12.md)。 | C13 |
| 2026-09-25 | C13 全工作区发布锁和清单复检 | 已完成（本地） | shared 实现跨进程发布锁协议；API `FsContentLock` 与 `scripts/content-publish.ts` 共用锁；发布时原子加锁，发布中拦截正本保存与应用（409 `content-locked`）防止混入；进入执行前复检清单与目标 hash，锁外额外变动使发布失效并终止；检测 PID 与过期 TTL 实现可核验崩溃恢复，不永久锁死。 | **RED**：`content-lock.js` 缺失，`ContentMutationService` 缺少发布锁互斥，测试失败。**GREEN**：shared 锁测试 3 项全过，API 锁集成测试 3 项全过；全量测试 shared **44/339**、API **115/558**、web **40/227**、agent **5/30**、admin **12/41**；typecheck、API/Admin/Web 构建、字段核查、架构门禁、GEO 与文档链接全绿。见 [C13 报告](docs/evidence/GOAL-2026-09-25-C13.md)。 | C14 |
| 2026-09-25 | C14 发布阶段与幂等脚本调用 | 已完成（本地） | `ContentReleaseRepository` 增加受状态机保护的 `updateStage` 事务推进；`ContentReleaseService` 完整实现阶段推进（PREPARED -> COMMITTING -> PUSHED -> VERIFYING）；子进程退出码 0 推进至 PUSHED 并转入 VERIFYING，绝不提前记为 PUBLISHED；读取并记录 Git commit；并发重复请求幂等复用在途 release；子进程非零退出时转入 FAILED 并保留已完成事实与 errorCode；命令行参数固定无文本注入。 | **RED**：`ContentReleaseService` 缺少阶段推进，测试 3 项失败。**GREEN**：集成测试 3 项全过，release 相关测试 4 文件 20 项全过；全量测试 shared **44/339**、API **116/561**、web **40/227**、agent **5/30**、admin **12/41**；typecheck、API/Admin/Web 构建、字段核查、架构门禁、GEO 与文档链接全绿。见 [C14 报告](docs/evidence/GOAL-2026-09-25-C14.md)。 | C15 |
| 2026-09-25 | C16 线上版本核验器 | 已完成（本地） | `WebsiteDeploymentVerifierPort` 契约扩展（旧 `{ title }` 调用保持兼容）；`HttpWebsiteDeploymentVerifier` 从文章 HTML 的 `content-hash` 与线上 `public-manifest.json` 双重取证，配音缓存头/破缓存参数、超时与重试边界；`ContentReleaseService.verify` 仅当 `verifiedHash === sourceHash` 才把 `VERIFYING` 推进为 `PUBLISHED` 并记录 `verifiedHash`/`verifiedAt`，旧网页/同标题旧正文/失败部署/缺 hash 证据一律保持 `VERIFYING`，重复核验幂等，非 `VERIFYING` 状态抛 409；暴露 `POST /admin/content/release/:id/verify`。顺带修复既有测试跨天时间炸弹。 | **RED**：`service.verify is not a function`，核验集成测试 6 项全败。**GREEN**：核验集成测试 **6/6**、适配器单测 **8/8** 全过；全量 API **118 文件/576 项**（串行两次稳定）；shared **45/342**、web **40/227**、agent **5/30**、admin **12/41**。见 [C16 报告](docs/evidence/GOAL-2026-09-25-C16.md)。 | C17 |
| 2026-09-25 | C15 网页构建版本证明 | 已完成（本地） | `scripts/generate-content.ts` 为公开 manifest 关联 `gitCommit` 与 `buildId`；`scripts/prerender-web.ts` 将单篇内容 SHA-256 hash、buildId 与 gitCommit 注入文章 `<head>` meta 标签与 DOM 属性中；同标题改动正文产生确定性不同 hash 区分版本；公开知识图谱规则与条目保持一致不分叉；不泄露内部未公开诊断。 | **RED**：图谱节点与 HTML meta 版本证明缺失，测试失败。**GREEN**：单元测试 3 项全过，`build:web` 全流程（含 prerender、feeds、GEO、pagefind）构建成功，HTML 标签实测验证通过；全量测试 shared **45/342**、API **116/561**、web **40/227**、agent **5/30**、admin **12/41**；typecheck、API/Admin/Web 构建、字段核查、架构门禁、GEO 与文档链接全绿。见 [C15 报告](docs/evidence/GOAL-2026-09-25-C15.md)。 | C16 |

2026-09-22 站主补充：本地工作台暂不需要密码，联调API使用空 `WALKER_ADMIN_TOKEN`、仅监听127.0.0.1，复用原有开发模式；本地启动方法已同步，生产鉴权未更改。

执行时每完成一项追加一行，勾任务复选框；失败追加原因与下一步，同一代码版本已通过证据可引用。若采用回退选型，记录“失败证据 → 替代 → 合同是否变化”，同步技术方案。任何生产状态仅在实际部署核验后写 STATUS。

## 11. PRD 验收追踪

下表是 G05 的逐条签收结果，明细见 [G05 验收签收](docs/evidence/GOAL-2026-09-27-G05.md)。

**判定口径**：「已过（本地）」= 有可复查的本地证据（测试/证据文档/K3 浏览器核验）；「本地已过 / 真实待 G08」= 本地语义已验证，但通过标准含**真实部署或真实访客调用**的部分必须在 G08 实测，**本文不提前声称生产通过**。当前公共位置 readiness 仍 blocked（缺 runtime 探针报告 + G03 新增内存余量门），与 A20 一致。

**2026-09-27 G05 结论**：A01–A28 **28 项本地均有可复查结果**；其中 4 项（A02、A04、A10、A16）含生产专属成分待 G08；**0 项本地未过**。

| 验收 | 主要任务 | 验收关注点 | G05 判定 |
|---|---|---|---|
| A01 | F18、O07、O10 | 真实可访问四面、可操作空态 | 已过（本地） |
| A02 | C06、C16、C17、C20、G08 | 保存与真实上线分开 | 本地已过 / 真实上线与打开页面待 G08 |
| A03 | C14、C18、C23 | 失败阶段、幂等重试 | 已过（本地） |
| A04 | R17、V05、V06、V24 | 测试通过的版本真实绑定 | 本地已过 / 真实访客调用待 G08 |
| A05 | R06、V04、V05 | 草稿、部署与回退隔离 | 已过（本地） |
| A06 | V06、V13、V24 | 默认与显式切换，不串会话 | 已过（本地） |
| A07 | R09、V10、C11、C23 | 公开输入不得修改任何内容字段 | 已过（本地） |
| A08 | R09、R10、C11 | 伪造管理员/子任务仍不可提权 | 已过（本地） |
| A09 | V01、V02、V03、V10 | 只引用已获准公开快照 | 已过（本地） |
| A10 | R12、R13、V10、V12 | 超额/超时/关闭/故障诚实降级 | 本地已过 / 真实模型通道待 G08 |
| A11 | C07、C08、C10 | 候选独立，不覆盖正本 | 已过（本地） |
| A12 | C09、C23 | 审批绑定、CAS、一次执行 | 已过（本地） |
| A13 | R13、R14、V14、C23 | 撤销、真停止、迟到保护 | 已过（本地） |
| A14 | O01、O02、O03、O04 | 到期5分钟、重启补扫与去重 | 已过（本地） |
| A15 | O06、O07、O08、O10 | 来源、未知和真实复盘 | 已过（本地） |
| A16 | V03、C15、C16、C17、C20 | 编辑/网页/索引版本诚实同步 | 本地已过 / 真实线上版本待 G08 |
| A17 | R14、C03、C04、C18、G02 | 重启核对与并发冲突 | 已过（本地） |
| A18 | V12、V15 | 介绍可关闭，不因浏览反复调用 | 已过（本地） |
| A19 | R09、V10、C11 | 同 Agent 前后台权限上限隔离 | 已过（本地） |
| A20 | F15、R22、C22、O10 | 首期未接入能力不能假装可用 | 已过（本地） |
| A21 | V07、V11、V13、V20 | 多轮、切换、消息与 run 可回看 | 已过（本地） |
| A22 | V08、V13、V15、O06 | 请求/事件去重与尝试区分 | 已过（本地） |
| A23 | V11、V14、V16、V20 | 生成、发送、确认、断流分开 | 已过（本地） |
| A24 | V20、V21 | 筛选与脱敏导出一致 | 已过（本地） |
| A25 | V16、V18、G02 | 采集失败仍能回答，恢复不重复 | 已过（本地） |
| A26 | V08、V20、V22、R09 | 同访客归属与后台日志权限 | 已过（本地） |
| A27 | V17、V18、V19、V21、G02 | 所有副本与备份恢复防复活 | 已过（本地） |
| A28 | O05、O08、O09 | 问题转事项，内容不被自动修改 | 已过（本地） |

  - **[x] R33 修复「试跑只见输入不见输出」+ 由此暴露的运行被误标失败（站主 2026-09-24）**
    - 触发：站主给出具体 URL（`?run=...`）说「只能看到输入，但我想看到输出」。
    - **审理过程（三层递进，每一层单独测都是好的，合起来才坏）**：
      - ① 数据层：该 run 实际 SUCCEEDED、tokens 239/9、events 里有完整回答「你好！有什么可以帮你的吗？」——**数据没丢**；
      - ② 渲染层：UI 用 `text = live || saved`，事件在库里就能显示——实测该 URL 渲染正常；
      - ③ **时序层（真正的缺陷）**：`follow()` 把事件**攒到运行结束才批量写库** → RUNNING 期间 DB 零事件；SSE 订阅中断（页面刷新/网络抖动）后，客户端在结束前**永远看不到输出**，结束时 refetch 又可能撞上「事件未落库」的窗口 → 显示「还没有文本」。
    - 修复一（实时落库）：`observe` 回调里 text/usage **实时 appendEvent**，不再攒批。
    - **修复二（由修复一暴露，差点被当成「修好了」）**：实时写 + 结束时批量补写**同一事件写两遍**（实测 events=3、文本「OKOK」重复）；且两路并发读同一最大 seq 撞 `@@unique([runId, seq])` 抛 Prisma 错误，**把成功的运行标成 FAILED**（实测连续 3 次 FAILED/runtime-error，但 text 已实时写成功——「答对了却算失败」）。
      - `appendEvent` 改为**并发安全**：撞 unique 键时用下一个 seq 重试（上限 6 次），事件绝不丢、绝不抛错给 follow；
      - follow 尾部**删除批量补写**（实时落库已覆盖），消除重复。
    - 修复三（UI 表达）：`<pre>` 加「输出（模型的回答）」标签；空态从「还没有文本」改为按状态区分——运行中「正在生成…」／终态「没有输出记录」。
    - 验收：**连续多次队列运行全部 SUCCEEDED、events 恒为 2（text+usage）、无重复**；RUNNING 期间实时落库生效。守卫：`appendEvent` 并发安全测试（并发写 6 条→全落库、seq 唯一）；**变异验证**：去掉重试逻辑守卫立即失败。全量回归：typecheck、shared 39/322、api **73/388**、web 37/212、agent 5/30、admin 7/23、build:api 全绿。未部署。
    - **反思**：这个 bug 藏得深是因为**每个环节单独测都正常**（SSE 正常、refetch 正常、终态渲染正常），坏在它们的**组合时序**上。以及修复一落地后我差点宣布完成——是「再跑一遍」发现 events=3 才暴露重复写入。**每个修复都必须跑真实的组合场景。**

  - **2026-09-24 未提交更改审查修复（本地，未部署）**
    - 执行链：修订的 provider/model 传入 Harness，Agent 自己的 Key 真正进入子进程环境；运行时缓存同时比较模型选择。事件写入串行并在终态前等待完成，写入失败使运行失败而非假报成功。
    - 部署链：启用中的部署拒绝普通保存改成员；回退仍核验目标。发布测试绑定当前有效模型、提供方设置及不含密钥值的凭据版本，配置变化后位置解析拒绝旧证据。
    - 模型连接：`llm-pi-ai.providers` 按路由保留式写入和读取；连通性测试使用被测提供方的模型与协议，暂不支持的协议明确提示走 Agent 试跑。
    - 访客链：小影按 rc.3 的 `assistant/message` 读取流式片段与用量；同一匿名身份、同一 requestKey 的并发请求只执行一次模型。
    - 公开快照：构建把公开清单放到站点根路径；导入前核对线上清单的集合 hash，未发布的本地内容不能直接激活。
    - 验证：typecheck；shared 39/323、api 73/393、web 37/212、agent 5/30、admin 7/23 全绿；`build:api`、`build:web`、GEO 门禁通过，网页 dist 清单与本地生成清单逐字节一致。生产未部署。
