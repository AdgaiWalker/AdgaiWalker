> **历史文档**：AI 自媒体工作站 MVP（2026-08）验证期文档。对应功能代码仍在 `apps/api`（workstation / workflow 模块）随生产运行，但本文档不再是现行规划依据；现行助手规划见 `docs/PRD-SITE-ASSISTANT.md`。

# Goal Document: AdgaiWalker AI 自媒体工作站 MVP

## Go / No-Go

- **Judgment**: Go
- **Reason**: 产品目标、15 项 P0、人与 AI 边界、固定技术栈和最终验收已经在 PRD 中确认。现有代码具备 Clue、Seed、Execution、Admin、API、SQLite 和网站发布基础；Codex CLI 已安装。图片生成器与公众号浏览器适配器尚未确定，但它们有明确的阶段进入门，不阻塞 Phase 0 和 Phase 1。
- **Goal status**: Active
- **Completion restriction**: 只有连续三篇真实作品通过最终验证后，才允许把 Goal 标记为 complete。文档、页面、接口或单篇演示完成都不等于 Goal 完成。

## Target Outcome

交付一个可在 Windows 本机持续使用的 AdgaiWalker AI 自媒体工作站：作者人工主选、写核心观点和初稿；系统完成初稿后的加工、检查、双封面、网站稿、公众号排版、集中审批、网站发布和公众号草稿准备；失败时从最近成功 Artifact 继续或由人接管。

目标完成时必须同时成立：

1. 已确认 PRD 的 15 项 P0 全部通过可观察验收；
2. 连续三篇真实作品走完同一条生产路线；
3. 三篇网站作品都有可访问的正式 URL；
4. 三篇公众号作品都在正常登录会话中保存为完整草稿，并停在人工公开确认之前；
5. 至少一次人为制造阶段失败，只重做失败阶段；
6. 至少一次导出完整作品包，并在不依赖 AdgaiWalker 运行时的目录中打开检查；
7. 未出现未经说明的核心观点改变、私密信息泄漏或未批准版本发布；
8. 初稿上传后，每篇作者主动操作累计不超过 15 分钟，不计算 AI 与外部平台等待时间。

## Goal Definition

- **Type**: product + technical + operational + delivery
- **Boundary**: 覆盖轻量选题、自由 Action、视频日志、作品创建、只读原稿、固定 AI Recipe、分阶段 Artifact、双封面、网站与公众号成品、集中审批、双渠道发布、完整导出、最小反馈和三篇真实验证。
- **Non-goals**:
  - 不建设通用工具中心、插件安装器、插件市场或 Recipe 编辑器；
  - 不建设远程 MCP Host、远程 Tool Runner、完整容器沙箱或分布式任务队列；
  - 不建设多人协作、云端后台、复杂角色权限、客户订单和财务系统；
  - 不建设小红书、抖音、B 站和 X 的自动发布；
  - 不建设复杂经营看板和全平台数据自动回收；
  - 不使用第二套 AI 引擎；
  - 不伪造认证、破解验证码、规避风控或绕过平台权限。
- **Deferred work**:
  - AI 联网问题调查、证据聚类和复杂选题评分；
  - capability 注册、工具版本并存和用户可见工具管理；
  - 日历拖动、周期排期和复杂提醒；
  - 多平台转译、自动拆条和跨平台分发；
  - 云端工作区、多人协作和商业化管理。
- **Verification rule**: 每个 Phase 只有在该阶段自动化测试、验收脚本、人工检查和证据记录全部通过后才可退出；总 Goal 只有在三篇真实作品及一次失败恢复完成后通过。
- **Evidence source**: Git 提交、Vitest 结果、TypeScript typecheck、生产构建、HTTP acceptance scripts、Artifact 哈希、manifest、正式网站 URL、公众号草稿状态、导出包、人工操作计时和用户最终确认。
- **Pass criteria**: 第 15 节“Final Validation”所有项目通过，任何 P0 不得以人工说明、界面截图或未来承诺替代运行证据。
- **Confidence note**: 对本地领域模型、文件 Artifact、Codex CLI 调用和现有网站管线的可验证性置信度高；对公众号页面自动化稳定性置信度中等，因此正常草稿保存与完整导出兜底必须分别验证。
- **Judgment owner**: 自动化测试负责技术规则裁决；正式网站和公众号草稿负责渠道结果裁决；用户负责确认三篇内容质量、观点保护、15 分钟操作指标和最终 Goal 完成。

## Current State

### 已有事实

- MVP PRD 已确认并提交：`8b6c319 docs: narrow AI workstation PRD to MVP`。
- Slice 1 TDD 实施计划已提交：`63c25ab docs: plan AI workstation Slice 1`。
- 代码库是 pnpm 9 monorepo，Node.js 版本要求为 20+。
- Admin 使用 React 19、Vite 6、React Router 7。
- API 使用 NestJS 11、Prisma 6、SQLite；另有 PostgreSQL 对齐 schema。
- 现有业务真相是 Clue、Seed、Execution，公开正文真相是 `content/log`。
- 现有脚本包含 `content:gen`、`content:publish`、构建、typecheck 和 acceptance 基础设施。
- 本机 Codex CLI 路径可用，当前检测版本为 `codex-cli 0.144.1`。
- `pyang5166/gbro-cover-design` 与 `cyberxiaowan/xiaowan-wechat-layout-skill` 已选定，但尚未固定提交并安装到本项目运行目录。

### 尚未实现

- PRD 新增的 Submission、Action、Publication 和 Artifact 工作目录尚未落地。
- Admin 尚未形成四入口工作台。
- Codex Stage Runner、固定 Recipe、进度、重试和人工 Artifact 接管尚未实现。
- 双封面、公众号 HTML、390px 预览和集中审批尚未实现。
- 网站批准发布、公众号草稿辅助、整包导出和最小反馈回流尚未实现。
- 三篇真实作品尚未进入验证。

### 工作区约束

- `apps/web/src/generated/content.json` 当前已有用户修改；所有阶段必须保留，不得顺带覆盖、暂存或提交。
- 实施必须在隔离 worktree 中开始，执行时先使用 `superpower:using-git-worktrees`。
- 所有本地私密原稿、工具运行目录、上传暂存和凭据都不得进入 Git。

## Plan Rewrite Notes

| Existing item | Decision | Reason |
|---|---|---|
| PRD Slice 1：作品骨架 | keep | 最早建立真实业务入口和 Artifact 所有权，是后续自动化的依赖 |
| PRD Slice 2：初稿到可审批成品 | keep | 独立证明 AI 加工、视觉、排版和审批价值 |
| PRD Slice 3：发布与三篇验证 | split | 发布闭环与三篇经营验证的风险不同，拆成 Phase 3 与 Phase 4 |
| 已提交 Slice 1 计划的 10 个 Task | keep | 文件边界、TDD、提交点和真实 HTTP 验收完整，可直接执行 |
| 旧版 60 项 P0 | remove | 与最短 MVP 冲突，不能重新进入执行范围 |
| 工具中心与通用安装器 | remove from MVP | P0 只需固定 Adapter 与内部 capability 映射 |
| 四级业务兜底 | keep | 是失败恢复和业务连续性的核心证明 |
| Apple 式直接拖动和专用弹簧动效 | remove from MVP | 不证明核心业务价值；排期先用日期选择和可逆操作 |
| 复杂调查、评分和数据看板 | defer | 只有三篇真实作品后才能判断是否是最大瓶颈 |
| 发布后反馈回流 | keep, move before final validation | 没有回流就不能证明经营闭环 |

## Drift Diagnosis

- **Goal drift**: 当前 Slice 1 计划没有越界，但只覆盖五项 P0；本 Goal 补齐剩余十项和最终三篇裁决，不把 Slice 1 误当成产品完成。
- **Phase drift**: 原 PRD 将“发布”和“三篇验证”放在同一切片；本 Goal 分开，避免技术发布成功掩盖真实连续使用失败。
- **Validation drift**: 禁止用文件存在、接口返回或单篇演示声明 MVP 完成；最终证明必须包含正式 URL、公众号草稿、哈希、故障恢复、导出和作者主动操作时间。
- **Compatibility drift**: 旧 Admin 路由仅在迁移期间通过直接 URL 保留；没有公开用户合同，不建立永久兼容别名或双主导航。
- **Cleanup drift**: 不进行与 15 项 P0 无关的代码清理、设计重构、框架迁移或依赖升级。

## Priority Rationale

1. 先建立作品、原稿和 Action 真相，再接 AI；否则 AI 输出没有可靠归属和恢复点。
2. 先证明一篇稿子能到集中审批，再自动发布；否则会放大发布错误。
3. 先固定 Recipe 和两个选定 Skill，再建设可替换接口；否则会提前滑向工具平台。
4. 将失败恢复前置到每个阶段，不在最后补救；Artifact 是整个系统的连续性骨架。
5. 将三篇真实验证单独设为最终阶段；只有重复运行才能区分“演示成功”和“业务可用”。

## Assumptions and Open Decisions

| Item | Status | Impact | Owner / Next step |
|---|---|---|---|
| Windows 本机工作站是 P0 运行环境 | confirmed | 决定本地文件、Codex CLI 和浏览器会话路线 | 已由用户确认 |
| 人负责主选、观点、初稿、审批和公众号公开 | confirmed | 决定所有 Human Gate | 已写入 PRD，任何阶段不得弱化 |
| Codex CLI 是唯一 P0 AI 执行器 | confirmed | 决定 AgentRunnerPort 的首个实现 | Phase 2 固定已验证版本并做契约测试 |
| Clue、Seed、Execution 与 `content/log` 保持真相所有权 | confirmed | 避免第二套选题和内容数据库 | Phase 1 按聚合视图实现 |
| 首批三篇真实初稿由用户提供 | unresolved input | 不阻塞基础开发，但阻塞 Phase 1 真实退出和 Phase 4 | 用户在 Phase 1 验收前提供第一篇，在 Phase 4 前提供另外两篇 |
| 图片生成器 Adapter | unresolved decision | 不阻塞 Phase 1；阻塞 VIS-01 和 Phase 2 退出 | Phase 2 开始前在 OpenAI Images API、本地生成器或其他已授权 API 中选定一个正常实现；人工上传只算兜底 |
| GBRO 与小顽 Skill 固定版本 | unresolved evidence | 不阻塞 Phase 1；阻塞 Phase 2 工具执行 | Phase 2 首项记录来源、许可证、提交哈希、输入输出和健康检查 |
| 公众号浏览器辅助实现 | unresolved decision | 不阻塞 Phase 1/2；阻塞 PUB-01 正常路径 | Phase 3 开始前选择一个能使用正常登录会话、可停在最终公开前的浏览器 Adapter |
| 网站 Git 推送凭据和 Vercel 部署正常 | assumed | 阻塞正式 URL 验收 | Phase 3 入口运行只读远程、分支和部署探测；失败则暂停，不伪造 URL |
| `apps/web/src/generated/content.json` 属于用户现有改动 | confirmed | 防止误提交和数据覆盖 | 所有提交前检查 staged file allowlist |

## Requirement Coverage

| P0 | Phase | Primary proof |
|---|---|---|
| TOP-01 | Phase 1 | Topic 四状态 API、Admin 操作和持久化验收 |
| TOP-02 | Phase 1 | 没有人工动作不能 SELECTED；主选只产生一个 Execution 和无日期 Action |
| ACT-01 | Phase 1 | 日期设置/清除、完成/恢复、VIDEO 计划与实际完成时间 |
| WORK-01 | Phase 1 | 两种入口、一次 multipart 上传、幂等重复请求返回同一 Work |
| WORK-02 | Phase 1 | original 只写一次、文件 SHA-256、核心观点与禁止改变项可查 |
| PROD-01 | Phase 2 | 固定 Recipe 各 Stage 结构化输出和质量报告 |
| PROD-02 | Phase 2 | 进度、耗时、最近输出、等待输入、终止和重启恢复 |
| PROD-03 | Phase 2 | 两次重试、替代实现、人工 Artifact 和只重做失败 Stage |
| VIS-01 | Phase 2 | 同主题双封面、独立尺寸、中文逐字检查和单图重做 |
| VIS-02 | Phase 2 | 网站 Markdown、公众号 HTML、资源清单、390px 预览且不改冻结正文 |
| REV-01 | Phase 2 | 单页原稿差异、风险、双封面与双平台预览 |
| REV-02 | Phase 2 | 批准/退回/恢复/取消；发布器只接受批准哈希 |
| PUB-01 | Phase 3 | 正式网站 URL、公众号完整草稿、独立 Publication 状态 |
| SYS-01 | Phase 3 | 完整作品包在独立目录可打开并人工继续 |
| FB-01 | Phase 3 | 最小指标、真实完成、反馈原文与确认后的 Seed/Action 转换 |

## Phases

### Phase 0: 执行基线与隔离

- **Purpose**: 建立不会破坏用户工作区的执行环境，并获得可比较的测试、构建和工具基线。
- **Entry condition**: PRD 与本 Goal 已确认；活动 Goal 状态为 active。
- **Phase rules**:
  - 使用 `superpower:using-git-worktrees` 建立隔离 worktree 后才允许修改代码；
  - 不移动、覆盖、暂存或提交主工作区的 `apps/web/src/generated/content.json`；
  - 本阶段只做只读检查、隔离设置和基线验证，不实现 P0；
  - 基线失败必须区分既有失败与本阶段环境问题，不带病进入 Phase 1。
- **Todos**:

| Todo | Surface | Proof | Depends on |
|---|---|---|---|
| [ ] 创建隔离 worktree并验证绝对路径位于预期仓库范围 | Git/worktree | `git worktree list` 与两个工作区 `git status --short` | Goal accepted |
| [ ] 记录主工作区未提交文件并建立不可触碰清单 | Git/evidence | 证据记录只列路径，不读取或复制私密内容 | worktree created |
| [ ] 在隔离 worktree 安装锁定依赖 | pnpm | `pnpm install --frozen-lockfile` 退出 0 | worktree created |
| [ ] 运行现有 shared、API、web 测试 | test | `pnpm test:shared`、`pnpm test:api`、`pnpm test:web` 零失败 | dependencies installed |
| [ ] 运行现有 typecheck 与三端构建 | build | `pnpm typecheck`、`pnpm build:api`、`pnpm build:admin`、`pnpm build:web` 退出 0 | dependencies installed |
| [ ] 记录 Codex CLI 路径、版本和 `codex exec` 能力 | tool evidence | `Get-Command codex`、`codex --version`、`codex exec --help` 输出归档且不含凭据 | none |
| [ ] 建立脱敏证据记录位置 | docs/evidence | 创建本 Goal 的阶段证据索引；不提交原稿、Cookie、密钥和私密日志 | worktree created |

- **Exit proof**: 基线命令全部通过；隔离 worktree 干净；主工作区原修改未变化；Codex CLI 可调用。
- **Stop condition**: 依赖无法锁定、既有测试失败原因不明、worktree 指向错误目录、主工作区文件发生变化或 Codex CLI 不可运行。

### Phase 1: 作品骨架、选题与自由行动

- **Purpose**: 交付一篇作品从人工主选或现有初稿进入系统的可靠入口，建立后续 AI 流程唯一可依赖的 Work 与 original Artifact。
- **Entry condition**: Phase 0 退出；使用已提交的 Slice 1 计划 `docs/superpowers/plans/2026-08-04-ai-workstation-slice1-work-skeleton.md`。
- **Phase rules**:
  - 使用 `superpower:executing-plans` 或用户明确授权的 `superpower:subagent-driven-development` 逐 Task 执行；
  - 每个行为先写失败测试，再最小实现，再通过测试，再提交；
  - 只覆盖 `TOP-01`、`TOP-02`、`ACT-01`、`WORK-01`、`WORK-02`；
  - 不添加“启动 AI”、审批、发布、工具中心或未来页面占位按钮；
  - SQLite 与 PostgreSQL schema 同步；Artifact 和原稿不进 Git；
  - 旧 Admin 页面可通过直接 URL 暂时访问，但主导航只展示已真实实现的入口。
- **Todos**:

| Todo | Surface | Proof | Depends on |
|---|---|---|---|
| [ ] 实现 Topic、Action、Work 与 multipart 共享契约 | shared/tests | shared 领域测试和 FormData boundary 测试通过 | Phase 0 |
| [ ] 增加 Seed 状态、Execution brief、Submission 与 Action schema | Prisma/migration | SQLite `db:push`、PG schema parity 测试、Prisma generate 通过 | shared contracts |
| [ ] 实现 Topic 编辑和幂等人工主选 | API/domain | SELECTED 只能来自主选；重复请求只有一个 Execution 和一个 Action | schema |
| [ ] 实现自由 Action 与 VIDEO 记录 API | API/domain | 无日期、设置/清除日期、完成/恢复测试通过 | schema |
| [ ] 实现 Work 两种入口和幂等创建 | API/domain | selected Execution 与 manual draft 两条路径通过，重复 key 返回同一 Work | schema |
| [ ] 实现 original 只写一次、文件名净化、SHA-256 和原子 manifest | filesystem/tests | 第二次写入被拒绝，哈希与实际字节一致，路径穿越测试通过 | Work contract |
| [ ] 实现只读 Workbench aggregate | API | Snapshot 来自 Seed/Action/Submission 真相，不复制业务状态 | repositories |
| [ ] 配置 Admin Testing Library 与 workstation transport | Admin/tests | multipart 不强制 JSON header；Admin typecheck 通过 | API contracts |
| [ ] 实现工作台的选题、Action、视频记录和进行中作品 | Admin/UI | 键盘交互测试、日期清除、主选 brief 和完成恢复通过 | Workbench API |
| [ ] 实现作品创建与 original 时间线 | Admin/UI | 两种入口、文件保留、观点与哈希展示通过 | Work API |
| [ ] 运行 Slice 1 HTTP acceptance 和人工 Admin walkthrough | acceptance | `accept:ai-workstation:slice1` 返回 ok；真实初稿进入 DRAFT_READY | all Phase 1 tasks |

- **Exit proof**: Slice 1 计划的 10 个 Task 和 exit criteria 全部勾选；一篇真实初稿通过 Admin 上传；刷新和 API 重启后 original 哈希不变；没有未来空功能进入主导航。
- **Stop condition**: 无真实初稿用于退出验证、幂等性无法保证、original 可以被覆盖、Action 日期被强制、schema 无法保持双提供方对齐或需要新增 PRD 决策。

### Phase 2: Artifact-first AI 生产与集中审批

- **Purpose**: 把 Phase 1 的真实初稿稳定转换为可批准的双平台成品，证明 AI 加工、封面和排版价值。
- **Entry condition**: Phase 1 退出；图片生成器 Adapter 已选定；GBRO 与小顽 Skill 已固定提交、许可证和健康检查；单独的 Slice 2 TDD 计划已写并确认。
- **Phase rules**:
  - 只实现 `PROD-01`、`PROD-02`、`PROD-03`、`VIS-01`、`VIS-02`、`REV-01`、`REV-02`；
  - P0 只有一个固定 Recipe，不建设 Recipe 编辑器或工具中心；
  - 业务 Stage 依赖 capability，不直接依赖具体工具名；
  - Codex 通过受限子进程和结构化 schema 运行，不使用跳过审批或沙箱的危险参数；
  - 每个成功 Stage 原子保存新 Artifact，永不覆盖 original 或历史结果；
  - 排版和封面只消费冻结正文，不得改变正文语义；
  - 高风险事实、隐私、夸大或观点偏移未解决时不得进入 REVIEW_READY；
  - 人工上传只证明兜底，不能替代一次正常 AI 双封面和排版路径。
- **Todos**:

| Todo | Surface | Proof | Depends on |
|---|---|---|---|
| [ ] 编写并确认 Slice 2 TDD 实施计划 | docs/plan | 覆盖七项 P0、文件边界、RED/GREEN、提交点和真实验收 | Phase 1 |
| [ ] 定义 Recipe、Stage、Artifact、检查报告、修改摘要和 manifest schema | shared/contracts | schema 单测覆盖合法与非法输出；版本固定为 1 | Slice 2 plan |
| [ ] 固定 Codex CLI 版本并实现 AgentRunnerPort | API/adapter | fake child-process 契约测试、JSONL 解析、超时、终止、脱敏通过 | Artifact schema |
| [ ] 实现 Stage orchestrator 与固定 Recipe | API/workflow | NORMALIZE→EDIT→QUALITY_CHECK→FREEZE_BODY 状态测试通过 | AgentRunner |
| [ ] 实现 NEEDS_INPUT、最多两次重试、终止和重启恢复 | API/workflow | 模拟超时、进程退出、格式错误、人工终止后只恢复失败 Stage | orchestrator |
| [ ] 实现人工 Artifact 上传与格式验证 | API/UI | 合法人工结果继续后续 Stage；非法 schema 不推进 | Artifact schema |
| [ ] 固定并审查 GBRO 与小顽 Skill | local tools/evidence | 来源、提交哈希、许可证、权限、输入输出和健康检查可查 | external access |
| [ ] 实现 GBRO CoverPlan Adapter 与选定图片生成 Adapter | API/tool | 正常路径生成同主题竖版和横版；Adapter 输出有版本与哈希 | pinned GBRO + image provider |
| [ ] 实现封面中文标题检查和单图重做 | workflow/tests | 故意错字只让对应图片失败并重做 | cover adapters |
| [ ] 实现网站 Markdown Formatter | API/tool | 输出通过现有内容字段检查和构建；不含本地临时资源路径 | frozen body |
| [ ] 实现小顽公众号 HTML Adapter 与资源清单 | API/tool | HTML 无脚本、乱码和失效本地图片；正文语义哈希不变 | pinned Xiaowan |
| [ ] 实现 390px sandbox 预览和粘贴检查 | Admin/UI | 预览测试覆盖标题孤行、异常留白、资源缺失和超宽内容 | WeChat HTML |
| [ ] 实现作品进度、耗时、最近输出、补充、终止和恢复 UI | Admin/UI | 刷新和 API 重启后状态一致；运行中控制可键盘操作 | orchestrator |
| [ ] 实现集中审批页 | Admin/UI | 同页显示原稿、候选正文、修改摘要、风险、双封面与双预览 | all final artifacts |
| [ ] 实现批准、退回、历史恢复、取消与 approvedArtifactHash | API/UI | 未批准或哈希不同的 Artifact 被发布端口拒绝 | review page |
| [ ] 运行 Slice 2 acceptance 与强制失败演练 | acceptance | `accept:ai-workstation:slice2` 返回 ok；一篇真实稿到 REVIEW_READY；失败后从最近成功 Artifact 继续 | all Phase 2 tasks |

- **Exit proof**: 一篇真实初稿通过正常 Codex、正常双封面、正常小顽排版到 REVIEW_READY；作者在一个页面批准唯一哈希；一次失败和一次人工 Artifact 接管均成功恢复。
- **Stop condition**: 图片生成器未确定、外部 Skill 无法固定许可证/提交、Codex 输出无法稳定结构化、AI 连续两次实质改变核心观点、封面标题无法可靠检查或公众号排版改变冻结正文。

### Phase 3: 双渠道发布、整包导出与反馈回流

- **Purpose**: 将批准版本安全送达网站和公众号草稿，并证明没有 AI 或渠道自动化时仍可继续业务。
- **Entry condition**: Phase 2 退出；网站远程与 Vercel 只读探测通过；公众号浏览器 Adapter 已选定并能使用正常登录会话；单独的 Slice 3 TDD 计划已写并确认。
- **Phase rules**:
  - 只实现 `PUB-01`、`SYS-01`、`FB-01` 和最终四入口导航；
  - 网站与公众号分别持有 Publication，不共享成功/失败状态；
  - 发布器只消费 approvedArtifactHash 对应文件；
  - 网站发布前检查 staged allowlist，发现无关改动立即停止；
  - 公众号保存草稿后必须停在最终公开确认之前；
  - 验证码、重新登录、权限确认和风控提示必须交还用户；
  - 导出兜底必须验证，但不能替代正常网站 URL 与公众号草稿的首篇通过。
- **Todos**:

| Todo | Surface | Proof | Depends on |
|---|---|---|---|
| [ ] 编写并确认 Slice 3 TDD 实施计划 | docs/plan | 覆盖三项 P0、双渠道状态、安全门、导出和反馈验收 | Phase 2 |
| [ ] 增加 Publication 与最小 Feedback 数据模型并保持 schema 对齐 | Prisma/tests | SQLite/PG parity、迁移、索引和状态测试通过 | Slice 3 plan |
| [ ] 实现 approved Artifact 到 `content/log` 的 WebsitePublisherPort | API/adapter | 未批准哈希被拒绝；公开文件只来自 final Artifact | Publication model |
| [ ] 实现 content generation、build、Git allowlist、独立 commit/push | scripts/API | 脏工作树注入测试停止；预期文件集通过；不包含用户原修改 | website adapter |
| [ ] 实现正式 URL 验证与网站 Publication 更新 | API/acceptance | 检查 URL、标题、正文特征和资源，失败不写 PUBLISHED | website push |
| [ ] 实现公众号发布包 | API/artifact | 包含 HTML、标题、摘要、作者、正文图片、横版封面、字段清单和哈希 | approved Artifact |
| [ ] 实现正常登录会话中的公众号草稿辅助 | browser adapter | 字段填写和草稿保存成功；停在最终公开确认前；遇验证交还用户 | browser decision |
| [ ] 实现网站与公众号独立重试和错误展示 | API/UI | 一个平台失败时另一平台状态和结果不变 | two publishers |
| [ ] 实现完整作品包导出 | API/filesystem | 调查/任务书、原稿、附件、所有 Stage、检查、封面、平台稿和发布记录齐全 | work manifest |
| [ ] 在独立目录解压并验证人工继续能力 | manual acceptance | Markdown、HTML、图片和字段清单无需运行 AdgaiWalker 即可读取 | export package |
| [ ] 实现最小数据、真实完成和反馈记录 | API/Admin | 指标与 Publication/周期关联；反馈保留原文和来源 | Publication |
| [ ] 实现反馈确认后转为 Seed 或 Action | API/Admin | 未确认不创建；重复确认不重复创建 | feedback model |
| [ ] 完成工作台、作品、审批、发布四入口导航 | Admin/UI | 四个入口均有真实数据与操作；旧入口不在主导航 | all product pages |
| [ ] 运行 Slice 3 acceptance 和首篇真实发布 | acceptance | `accept:ai-workstation:slice3` 返回 ok；正式 URL 与公众号草稿同时存在 | all Phase 3 tasks |

- **Exit proof**: 第一篇真实作品通过批准哈希发布到正式网站并保存公众号草稿；网站和公众号独立状态经失败注入验证；完整作品包可在独立目录人工继续；一条真实反馈回写为 Seed 或 Action。
- **Stop condition**: 远程仓库/部署不可验证、发布器可能提交无关文件、公众号需要绕过认证或风控、草稿无法停在人工确认前、导出缺少任一核心资产或反馈转换不能保持幂等。

### Phase 4: 连续三篇真实验证与最终裁决

- **Purpose**: 证明系统可以重复经营，而不是只完成一次技术演示，并根据真实瓶颈决定是否进入下一轮产品扩张。
- **Entry condition**: Phase 3 退出；用户提供三篇真实作品中的剩余初稿；验证期间固定代码版本、Recipe 和工具版本。
- **Phase rules**:
  - 不在验证期间增加新功能、换状态模型或升级工具；
  - 每篇使用同一条正常流程，人工接管必须记录阶段和原因；
  - 作者主动操作时间与外部等待时间分开记录；
  - 至少一篇包含视频或音频附件，验证 WORK-01 混合材料；
  - 至少一次主动制造可恢复失败；
  - 任何安全硬检查失败都先修复再发布，不以按时完成压过安全；
  - 推翻条件触发时不得把 Goal 标为 complete，必须重新审理路线。
- **Todos**:

| Todo | Surface | Proof | Depends on |
|---|---|---|---|
| [ ] 冻结验证版本、Recipe、Skill/Adapter 提交和权限快照 | release/evidence | 三篇 manifest 记录相同版本集合 | Phase 3 |
| [ ] 为三篇建立真实 Topic、Action、Work 和核心观点 | product data | 每篇可追溯到人工主选或人工确认入口 | user drafts |
| [ ] 完成作品 1 全闭环并记录操作时间 | operation/evidence | URL、公众号草稿、哈希、反馈和时间记录 | frozen version |
| [ ] 完成作品 2 全闭环并记录一次正常工具复用 | operation/evidence | 无新增工具仍生成成品并发布 | work 1 |
| [ ] 在作品 2 或 3 制造一个 Stage 失败并恢复 | resilience/evidence | 只重做失败 Stage；历史 Artifact 哈希不变 | work 1 |
| [ ] 完成作品 3 全闭环，包含音频或视频附件 | operation/evidence | 混合材料进入 original 并可追溯 | work 2 |
| [ ] 对三篇运行发布前硬检查复核 | safety/review | 十项硬检查逐篇通过并记录批准哈希 | three works ready |
| [ ] 对三篇运行最终 acceptance | scripts/tests | `accept:ai-workstation:mvp` 返回 ok，并列出三篇证据路径 | three works published |
| [ ] 计算作者主动操作时间和人工打断次数 | metric | 三篇每篇不超过 15 分钟；正常审批一次；数据有原始记录 | operation logs |
| [ ] 检查路线推翻条件 | product judgment | 对四项推翻条件逐项给出数据结论 | metrics |
| [ ] 用户完成最终内容与业务确认 | user acceptance | 用户明确确认三篇内容、发布、恢复和导出满足目标 | all evidence |
| [ ] 仅在全部通过后将活动 Goal 标记为 complete | goal state | Goal 工具返回 complete；报告最终 token usage | user acceptance |

- **Exit proof**: 三篇正式 URL、三篇公众号草稿、三份完整作品包、一次失败恢复、三份操作记录、15 项 P0 证据矩阵和用户明确确认同时存在。
- **Stop condition**: 任一作品必须重做全部流程、两篇 AI 加工需要人工重做、固定工具无法复用、任一作品超过 15 分钟且原因来自产品流程、公众号不能正常保存草稿、安全检查失败或用户不认可内容质量。

## Dry-Run Findings

1. **路线无循环依赖。** Phase 1 建立 Work/Artifact；Phase 2 消费 Work 并产生 approved Artifact；Phase 3 只消费批准哈希；Phase 4 重复前三阶段。
2. **现有 Slice 1 计划可以直接执行。** 它覆盖五项 P0，并已包含 TDD、schema parity、HTTP acceptance 和真实初稿退出条件。
3. **Slice 2 和 Slice 3 必须分别写 TDD 计划。** 当前 Goal 足以规定目标和证明，但不替代逐文件实施步骤；两份计划必须在对应阶段入口编写，避免根据尚未交付的接口猜路径。
4. **图片生成器是 Phase 2 的真实阻塞决策。** GBRO 只负责封面设计策划，正常 VIS-01 还需要一个可调用的图片生成实现；人工上传只能验证兜底。
5. **公众号浏览器 Adapter 是 Phase 3 的真实阻塞决策。** 完整发布包不能冒充正常登录会话中的草稿保存。
6. **外部 Skill 尚未在项目中固定。** 允许 Phase 1 先执行；进入 Phase 2 前必须记录提交哈希、许可证、权限和健康检查。
7. **当前主工作区不干净。** 发布脚本未来必须在隔离 worktree 验证 allowlist；现有 `content.json` 修改不能进入任何功能提交。
8. **真实内容是必需依赖。** 自动生成的测试稿可以验证技术，但不能让 Phase 1 或 Phase 4 退出。
9. **Go 判断成立。** 所有未决项都有明确的最晚决策门，没有一项需要在 Phase 0 开始前解决。

## Final Validation

### 自动化命令

```powershell
pnpm install --frozen-lockfile
pnpm test:shared
pnpm test:api
pnpm test:web
pnpm --filter @walker/admin test
pnpm typecheck
pnpm build:shared
pnpm build:api
pnpm build:admin
pnpm build:web
pnpm accept
pnpm accept:ai-workstation:slice1
pnpm accept:ai-workstation:slice2
pnpm accept:ai-workstation:slice3
pnpm accept:ai-workstation:mvp
git diff --check
git status --short
```

全部命令必须退出 0。最终 `git status --short` 只能显示用户在主工作区原有的未提交内容，实施 worktree 必须干净。

### 15 项 P0 裁决

- `TOP-01` 至 `WORK-02`：由 Slice 1 acceptance、Admin walkthrough 和持久化证据裁决；
- `PROD-01` 至 `REV-02`：由 Slice 2 acceptance、Artifact/manifest、批准哈希和故障演练裁决；
- `PUB-01`、`SYS-01`、`FB-01`：由 Slice 3 acceptance、正式渠道结果、导出包和反馈回流裁决；
- 全部 15 项：由 `accept:ai-workstation:mvp` 的证据矩阵汇总裁决。

### 真实业务裁决

每篇必须保存以下证据：

- Topic、Execution、Work 和 Publication ID；
- original 文件名、大小和 SHA-256；
- 核心观点、禁止改变项和批准 Artifact 哈希；
- Recipe、Codex、Skill、Adapter 版本；
- 每个 Stage 的开始、结束、重试、人工接管和输出哈希；
- 双封面、网站 Markdown、公众号 HTML 和资源清单；
- 正式网站 URL 和公众号草稿状态；
- 完整导出包路径和独立打开结果；
- 作者主动操作时间、AI 等待时间和外部平台等待时间；
- 首批数据、真实完成结果、用户反馈和新 Seed/Action。

### 安全裁决

三篇逐篇验证：

1. 原稿存在且哈希未变；
2. 核心观点没有未说明改变；
3. AI 新增事实有来源或明确标记待核实；
4. 无私密信息泄漏；
5. Markdown 可以构建；
6. 网站资源无本地临时路径；
7. 公众号 HTML 无脚本、乱码和失效本地图片；
8. 390px 预览无严重错位；
9. 双封面中文标题逐字正确；
10. 发布 Artifact 哈希等于批准哈希。

### Goal 完成规则

只有自动化、15 项 P0、三篇真实业务和安全裁决全部通过，并得到用户明确确认后，才调用 Goal 状态更新为 complete。任何部分失败时保持 active；同一真实阻塞连续三次且无法继续时，才允许按 Goal 工具规则标记 blocked。

## First Execution Step

调用 `superpower:using-git-worktrees`，在仓库外或已验证的工作树目录创建隔离 worktree；记录主工作区 `git status --short`；确认 `apps/web/src/generated/content.json` 仍只属于用户原改动；随后运行 Phase 0 的依赖、测试、typecheck、构建和 Codex CLI 基线命令。没有完成这一步前，不修改任何生产代码。
