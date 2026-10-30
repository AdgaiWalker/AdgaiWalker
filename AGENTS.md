# AGENTS.md

> **2026-10-13 文章版本历史（公开演进史）本地验收，未部署**：对象只定**文章**，放弃 Git 当历史层（Git 只剩发布通道）。核心语义：**发布即版本**——发布链确证 PUBLISHED 那一刻固化一条不可变版本；草稿（content/log）可反复重写不留痕。**双区物理独立**：草稿区 = content/log（可改，一字不动），公开区 = `content/versions`（只追加、进 Git、适配器无删除路径、blob 按 sha256 内容寻址只写一次）。纪律全部落在 shared `article-version.ts` 单点：只追加（回退 = 以旧版开草稿再发布成新版本）、变更说明必填（HTTP 400 version-note-required）、相同内容不建版本、diff 现算不落盘。公开五条：只公开已发布版本、每版稳定 URL `/posts/:slug/v/:n`、版本页 canonical 指向当前版、公开的是构建期静态页（content:gen 投影 article-versions.json → prerender 静态化，无公开 API 查询端点）、公开区无删除路径。界面双闭环：访客 = 文章页版本摘要 → 历史列表页 → 旧版页（含永久保留承诺）；后台 = /content/:slug 新「历史」tab（列表→查看→对比→回退二次确认）。发布面板「独立发布批准」新增**变更说明必填**（将公开）。ContentRelease 加 versionNote 列（第 27 条迁移）；版本库写入 fail-open（确证优先，缺失可 `pnpm content:backfill-versions` 补票）。29 篇既有文章已补票 v1「初始版本入库」。验证：typecheck 0 error、shared 420、api 772、web 237、admin 105、build:web + GEO 27 页全绿。**10-14 二审修复七刺**：①verify 写版本加**正文对账红线**（appliedHash ≠ 当前文件即拒绝写入，防把未上线草稿记成已发布，含红线测试）；②React 版本页 canonical 查重防双写；③frontmatter 剥离归 shared `stripFrontmatterBlock` 单点；④补票脚本改走适配器（写盘语义唯一）；⑤版本库目录解析补 CONTENT_LOG_DIR 线（修测试污染根因）；⑥补票加可见性闸门（修草稿文章误入公开历史）；⑦测试夹具改走真实 apply 链路；⑧**10-15 文案收敛 + 入口常驻（站主定案）**：文章页版本标签由 shared `articleHistoryLabel` 单点定义——**无版本不出链接 / 单版本给「版本」（不谎称已更新）/ ≥2 版给「已更新 N 次」**，一律不带日期（消除同一行两种日期格式）；历史页单版本改说人话；收掉 prerender 里第二份文案副本（SSOT）。证据见 [验收记录](docs/evidence/ARTICLE-VERSION-HISTORY-2026-10-13.md)。生产未部署。

> **2026-10-12 运营记录合并为单页活动流，未部署**：站主嫌五个 tab 点来点去，按"站主要干什么"重排——`/records` 不再是 运行记录/访客对话/更新提醒/更新复盘/运行监控 五个 tab，而是**一条时间线**：顶部四个计数卡（未完成事项 / 降级回答 / 失败回答 / 发布未确证——**全部复用 `/ops/overview` 的 7 天口径，零新统计**），下面按类型 chips 筛选（全部/访客/提醒/复盘/运行/后台操作）。四条纪律由 shared `activity.ts` 单点定义：①事实时间排序不漂移（提醒待办用 `ACTIVITY_TODO_TS` 占位置顶）；②**读取时投影不落第二真相源**（每条事件带 provenance 回指 run/会话/事项/复盘/AdminRequestLog，删了源流里就没有）；③归并分页如实降级（每源取最近 30 条、时间游标 `before`，深处稀疏不均，界面明说翻深建议按类型筛）；④参数非法一律 400。新增 `GET /ops/activity` 与 `GET /ops/activity/counts` 两个只读端点（管理鉴权内）。**运行监控搬到概览页底部折叠块**（进程内诊断与业务时间线不是一类），详情页 `/records/runs/:id`、`/records/conversations/:id` 保留，旧 tab 链接参数语义映射（`?tab=visitors→?kind=visitor`，runtime 不映射、清参回全部，不设重定向表）。**实踩一坑**：react-router v7 的 `setSearchParams` 在本仓库环境（jsdom 与活体浏览器双复现）不落 history，且组件里两个 setter 双写互相覆盖——统一为单入口 `navigate(replace)` 一次写全量 kind+before。生产未部署。

> **2026-10-12 后台日志前端下线，未部署**：站主要求去掉「后台日志」标签页（/records?tab=admin-log）——该 tab、面板组件与组件测试已删除；旧链接按既有口径回落到「运行记录」并清掉参数（不设兼容重定向表）。**后端不动**：AdminRequestLogMiddleware、AdminRequestLog 表与 GET /ops/admin-log 全部保留，**fail-closed 语义不变**（日志写不进去仍 503 拒绝执行后台操作）——它首先是正确性机制，不是显示功能。人工操作的可见性改由「运行监控 → 只看人工操作」提供：进程内、重启清零，**不再有可分页的持久历史界面**（此代价为站主知情后的选择）。

> **2026-10-12 运行监控与后台日志的分工（补）**：两者数据层不重复，界面层此前看不出区别。后台日志 = **人工操作审计**（持久、可分页、fail-closed：写不进去就不执行后台操作），运行监控 = **进程内实时诊断**（重启清零、含自动轮询与公开请求、fail-open）。本轮补齐两块面板的定位文案，并给运行监控加「只看人工操作（流水）」筛选——自动请求的判据抽成唯一一份 `apps/api/src/auth/admin-background-request.ts`，后台日志中间件与运行监控中间件共用它；筛选在服务端生效，前端不做本地回退。生产未部署。

> **2026-10-12 本地运行监控台，未部署**：运营记录新增「运行监控」tab，复用本机面板 WorkBuddy2API 控制台 `#logs` 的两块形态。①**请求指标不是从零造**：`apps/api/src/observability/request-id.middleware.ts` 早就在给每个 HTTP 请求发结构化行，本次接进进程内指标缓冲（最近 200 条明细 + completed/failed/interrupted/inFlight/成功率/平均耗时），并**修正口径**——原先写 `req.url`（带 query），改为 Express 路由模板，匹配不到写 `[unmatched]`。②**运行日志**由 `app.useLogger` 的 tee 采集（终端行为不变），进 800 行环形缓冲，按频道 任务/对话/系统 归类、单行 2KB 截断、溢出计数 `dropped` 并如实显示。③**三条纪律由 shared `runtime-monitor.ts` 单点定义**：频道与报错判定只有一份（前后端共用同一函数）、筛选一律在服务端生效（前端**不做**本地回退——面板源码注释记载过「筛选为空退回未筛选数据，管理员据此查错人」的事故）、分母为 0 不出比率（`null` 显示「—」）。④**fail 语义相反且写进注释与文案**：本能力 **fail-open**（采集坏了业务照跑），后台日志仍 **fail-closed**（写不进去 503 拒绝执行）。⑤只读、不落库、不引外部监控栈、**不新增第五个主工作面**；轮询带 `x-admin-background-poll` 标记，不把每 5 秒一次的 GET 写进后台日志。**已知盲区**：API 启动失败或进程崩溃时缓冲同归于尽、页面也打不开，终端仍是唯一现场（落文件只留钩子，第一版不开）。新增 `GET /ops/runtime/{metrics,requests,logs}` 三个只读端点，管理鉴权内、不进公网白名单。生产未部署。

> **2026-10-12 本地 Agent 直调与访客助手修复，未部署**：同一件事的三处根因一起收敛。①**授权可用性只有一份判据**：shared 新增 `grantDenial`（权限：身份/来源/动作/范围/撤销/到期）与 `grantUsable`（权限 + 剩余额度），`/ops/agents/:id/grants` 读视图补齐 `runsReserved/runsCharged/usageReserved/usageCharged`，token 在运行成功时终态记账进 `usageCharged`（此前 `usageLimit` 是永远为 0 的装饰字段）；`AuthorizationService.selectUsable` 是后端唯一"挑一条能跑的授权"入口，试跑面板与直调都改用它。**执行准入仍只看 `grantDenial`**，额度由 `reserve` 的原子 UPDATE 把关，不许读侧重复拒绝改掉"额度已用完，已改为规则处理"的语义。②**等待与取结果只有一份实现**：`AgentExecutionService.awaitTerminal/savedText` 跟随运行自己的 `deadline`，发布测试与直调都复用；`/agents/:id/try` 不再固定等 2 秒把空事件当 201 成功——没有可用授权 409 `grant-required`，运行未成功 5xx 带 `state`/`stopReason`，成功零文本 502 `agent-run-empty`。③**访客助手到预算上限时交付已生成的正文**并标 `partial`（前端显示"未写完"），不再丢弃半成品换成"当前 AI 未启用"的规则文案；首轮上下文改为"全量目录 + 相关正文"（shared `packFirstTurnContext`，命中加权 + 条数/字符双闸），不再整库倾泻 3.4 万字。同时删除假功能面：`compare`（承诺换引擎对比、实现被红线禁止）、`run-file`/`log-files`（与内容工作站重复）、`agents/:id/runs`（读 G01 后只读保留的历史表 `AgentRun`），`RUN_KINDS` 去掉 `compare`。生产未部署。

> **2026-09-29 本地后台日志与默认模型，未部署**：人工触发的管理 API 请求先在独立 `AdminRequestLog` 留进行中记录，结束后补路由模板、状态与耗时；自动定时轮询不计作人工操作，其他变更请求始终记录；日志不含 query、请求/响应载荷或凭据。日志不可写时拒绝执行后台操作。Agent 未选择提供方时，运行与发布测试解析当前系统默认模型；清除 Agent 专属配置后恢复继承。迁移总数 26，生产尚未应用；证据见 [本地目标与验收](docs/evidence/GOAL-2026-09-29-ADMIN-LOG-DEFAULT-MODEL.md)。

> **2026-09-29 本地会话/小影修复，未部署**：访客对话转更新事项的 Action 与 `conversation.convert` 审计同 SQLite 事务提交，`AuditRecord(action,targetType,requestId)` 唯一键防并发重复；迁移前检查非空重复键，该次修复新增第 25 条迁移。管理端结果不明时冻结原请求并同键重试，明确放弃后才允许编辑；详情补真实状态/成员事件文案。首页小影收起气泡使用 `inert`、恢复焦点，隐藏历史回答只展示安全占位。长会话仅测量，见 [本地验收](docs/evidence/LOCAL-CONVERSATION-XIAOYING-FIX-2026-09-29.md)；G07/G08 不因此通过。

> **2026-09-28 首页小影本地接入（优先于下方旧探针状态）**：新增 `home-xiaoying/site-public` 公开位置，使用当前部署的小影 Agent 和已核验全站可引用快照。仅本机 `apps/api/.env` 指向已通过的真实 runtime 探针报告，并将 `WALKER_MEMORY_HEADROOM_MB=0` 作为本地内存采样覆盖；生产默认 512MB 未变。开发库中已创建并启用小影 v1 部署，浏览器实测 AI 回答及文章引用；G07/G08 与生产状态均未改变。API 重启后旧 SDK 会话以完整公开上下文新建，访客业务消息仍保留；交互事件支持全站位置，ACK 对投递完成竞态重试。详见 [本地验收](docs/evidence/LOCAL-HOME-XIAOYING-2026-09-28.md)。

> **2026-09-28 本地体验改版，未部署**：访客可见名称从“卡／逛”改为“提问／文章”，原 `/tools`、`/posts` 路径与业务流程保留；首页沿用原卡片与头像，不使用生成图。后台内容列表区分 Git、线上确证、问答索引，`live` 旧阶段不得直接显示为已上线；四个主工作面不变。旧术语在下文历史记录中只表示当时版本，当前进度见根 `to-do.md`。

> **2026-09-27 内容发布审查修复**：C13–C20 的旧本地验收记录曾遗漏发布锁交接、批准版本执行前复核、推送结果不明、连续发布及站内未保存导航边界。本轮修复以根 `to-do.md` 的审查修复记录为准：API/手工脚本共用持久锁，执行发布必须引用当前 `PREPARED` 发布单，脚本启动后的不明结果保持 `UNKNOWN`，网页版本取最近一次已确证发布。生产仍未部署，新后台上线仍按 G07/G08 门槛。

> **2026-09-25 框架优先与数据库决定**：新后台先执行根 `to-do.md` 的 F01–F18，再按依赖细化能力；该文件是此次重构唯一原子进度源，旧 EXEC-PLAN/TODO 不继承完成状态。本地开发、测试与现有生产统一 SQLite 独立文件，不使用 PostgreSQL、不维护双库。F01–F18、R01–R33、V01–V24、C01–C24、O01–O10、G01–G06 已本地验收，下一项 G07；C02 持久化候选/发布事实，C03 为文件写入加入对象锁、expectedHash CAS 和同目录原子替换，C04 在 SQLite 原子记录 apply 意图/审计并按磁盘 hash 恢复，C05 将站主手工保存经管理鉴权、CAS 与审计出口，移除保存后公共索引生成副作用，C06 实现文章编辑、预览与行级差异并受未保存和冲突保护，C07 实现独立候选文件仓储与受控路径防穿越，C08 实现后台调用 Agent 生成内容候选并绑定 L1 授权与来源 run，C09 实现精确审批绑定授权修订与执行前复检、原子消费，C10 接通候选差异与审批 UI 面板，C11 清点并封闭全仓正本写入与状态旁路，C12 实现实际发布范围预检与稳定清单生成，C13 实现全工作区跨进程发布锁与提交前清单复检，C14 实现发布阶段状态机推进与幂等脚本调用，C15 将版本证明与 Git 标识写入公开 manifest 与文章 HTML，C16 实现线上版本核验器与发布 hash 门禁，C17 接通发布后问答快照切换与独立索引状态，C18 实现结果不明的发布核对，C19 实现发布脚本的进程树终止核验，C20 接通发布清单和版本状态界面，C21 将旧工作站发布接入同一出口，C22 对齐项目与小店的内容边界，C23 验证审批撤销和并发写入边界，C24 验收完整内容更新闭环（并修复发布源 hash 与线上版本证明命名空间不一致的缺陷），O01 增加提醒发生记录与复盘数据（时间规则单一来源、发生记录唯一键去重、旧 Action 保留），O02 实现到期扫描与恢复补检（每 5 分钟一轮、启动补检、恢复门 fail-closed、不调模型不发外部通知），O03 实现提醒完成/延后/忽略（处置同事务提交、requestKey 幂等、未实现重复规则 501 明确拒绝），O04 接通事项与提醒箱界面（服务端算到期、前端只展示、重复点击幂等、不增第五个主工作面），O05 实现访客问题转更新事项（证据软引用不设外键、不复制会话、不授予 AI 写权限），O06 实现可追溯的运营统计（唯一实体计数、缺失不记 0、不造无分母比率），O07 接通关键数据概览与状态刷新（5秒刷新/15秒陈旧、数字可下钻且筛选联动、无假趋势图），O08 实现一次内容更新复盘（关联事项/已核验发布、样本不足写未知、指标有来源、模型建议不能自动变成已验证成效），O09 实现复盘建议显式转下一事项，O10 验收真实运营回路（全链路端到端闭环串联八阶段，覆盖 A01、A14-A15、A20、A28，不编造增长结果），G01 完成旧数据导入与兼容读演练（零装饰器迁移核心 CLI/Nest 共用、legacySource/legacyId 去重、升级两次行数稳定、旧历史只读保留、新记录单一权威写入），G02 完成完整失败恢复演练（六失败点逐点验证：闸门 503 不放半恢复数据、进程孤儿 UNKNOWN 不伪造终态、发布未知不假装 PUBLISHED、补写删除竞争终态不回退、旧备份恢复清单重放、恢复顺序不打架；修复迟到补写永久残留缺陷——lateWriteResources 只取 registeredAt > completedAt 的精确清扫），G03 完成目标机器资源和并发验收（单槽纪律/排队上限/终止/恢复/无孤儿进程六项 + 新增内存余量门禁：shared resource-gate 默认 512MB、readiness resourceHeadroom 门阻止不满足时上线、运维 env 可覆盖；门禁放 readiness 上线门而非 dispatch 热路径——第一版热路径方案被全量回归否决致 28 个测试失败），G04 完成仓库规定回归链（HEAD 8884913 上 K1 八门 + K4 四门全绿共 1400 项 0 失败，测试库隔离正反双向确证：开发库逐字节未变且守卫拒绝指向开发库），G05 完成 PRD 验收逐条签收（A01–A28 共 28 项均有可复查结果、0 项未过；24 项本地已过 + A02/A04/A10/A16 四项真实成分待 G08，判定口径与生产实测清单见证据，不提前声称生产通过），G06 完成可恢复部署包与执行顺序（修复 install-dsh.ps1 硬编码 dsh 版本致 SDK/runtime 漂移——改为从 apps/api/package.json 派生；新增 pnpm verify:deploy K0 15 项门禁 + K6 隔离演练迁移/备份/回退往返；部署文档补版本固定表、停服释放引擎顺序、能力关闭默认值、备份与删除清单、manifest 基线先于公共问答启用、回退禁旧写路径）。C 系列与 O 系列全部完成，G 系列进行中。本地 API 未配置 runtime 探针报告，V23 readiness 仍阻断真实位置启用。新后台重构尚未部署。

> **2026-09-25 新后台设计入口**：此次重构以 `docs/specs/PRD-AGENT-OPERATIONS.md`、`docs/specs/RESEARCH-AGENT-OPS-OPEN-SOURCE.md`、`docs/specs/TECH-DESIGN-AGENT-OPERATIONS.md` 为配套设计，顺序见根 PLAN 新后台章节，拓扑见 ARCHITECTURE 新目标图。F 框架、R Agent 基础、V01–V24 与 C01–C24 已本地验收，O01–O10 已验收（O 系列全部完成），G01–G06 已完成；下一项 G07；生产未部署。C01 定义 shared 合同；C02 增加 SQLite 候选/发布持久模型；C03 实现文件 CAS；C04 实现 apply 意图审计与崩溃 hash 恢复；C05 让人工保存经鉴权、CAS 和审计并移除公共索引副作用。候选文件读取与编辑器、新发布链仍待实施；V24 用假 Runtime 验收访客日志闭环，真实生产启用仍留 G08。下文旧后台路径和旧技术方案不得当作新重构需求。新增 Agent 写能力开放前必须封闭既有写入旁路。

> **2026-09-21 后台重构状态（优先于下文旧界面说明）**：站主要求清空管理界面。`apps/admin` 仅保留空白开发/构建入口与 API 代理；计划、内容、复盘、设置、旧路由及管理 UI 均已退役。API、数据库、文章与共享规则保留，生产未部署此变更。旧后台页面图与验收记录仅作历史参考，不作为新重构需求。资产清单见 [后台重构前资产清单](docs/evidence/ADMIN-REBUILD-INVENTORY.md)。


本文件是本仓库内 Agent 的项目级常驻指令与工程约定单一真相源（SSOT）。

> **2026-09-25 本地实现状态**：新 admin 默认 `/overview`，四面 `/overview`、`/content`、`/agents`、`/records`，低频 `/settings`；路径唯一来源 `apps/admin/src/shared/routes.ts`。框架、Agent 修订/试跑/部署管理及 V01–V24 访客文章助手、日志保留/删除、备份恢复、会话回看、受控导出、公网路由边界、启用 readiness、首个文章日志闭环、C01 合同、C02 持久模型、C03 文件 CAS、C04 apply/reconcile 崩溃恢复、C05 人工保存受控审计出口、C06 文章编辑/差异/预览及未保存保护、C07 独立候选文件仓储、C08 后台生成内容候选、C09 精确审批与一次性消费、C10 候选差异与审批 UI 面板、C11 写入旁路清点封闭、C12 发布范围预检、C13 全工作区发布锁及清单复检、C14 发布阶段与幂等调用、C15 网页构建版本证明、C16 线上版本核验器、C17 问答快照自动切换、C18 结果不明发布核对、C19 发布脚本进程树终止核验、C20 发布清单和版本状态界面、C21 旧工作站发布接入同一出口、C22 对齐项目与小店内容边界、C23 审批撤销与并发写入边界与 C24 完整内容更新闭环已本地验收；新发布链和生产部署未完成。真实 runtime probe 尚未配置，公共位置 readiness 保持 blocked。测试库仅接受绝对 SQLite `.test.db` 文件并重建。

## 文档阅读顺序

1. 根 `PLAN.md`（主执行计划：北极星 · 宪法 · 主线排期 · 冻结条款）→ 2. 根 `AGENTS.md`（栈 / 命令 / 部署须知）→ 3. `docs/README.md`（文档地图）+ `docs/ARCHITECTURE.md`（架构图面：当前态/最终/飞轮）→ 4. 按改动区域读 `docs/PRODUCT.md`（产品红线）、`docs/api/README.md`（API 契约）、`docs/STATUS.md`（生产状态）。
改站内助手必须先读 `docs/PRD-SITE-ASSISTANT.md`。执行实录与决策日志在 `docs/archive/TODO-SITE-ASSISTANT.md`（已完成，禁止当待办队列）。`docs/archive/` 是退役方案，禁止当现行契约。

### 架构图（archify）· 每次进场必读

**每次进入本仓库开工前，先读架构图规格**：`output/archify/adgaiwalker-architecture.json`（唯一源，可重出）；产物 `output/archify/adgaiwalker-architecture.html`。

- 图面与文档会漂移，**读的时候顺手核对**，至少核三处：第三张卡片「真相源与实施状态」的 C 系批次号（以本文档顶部为准）、四个边界的成员、`data 目录` 的两条写入归属（`nest → runs / trace / logs`、`dsh → 会话 home`）。
- 发现不一致就改规格并重出，走 archify 合同：`validate --quality showcase` → `deliver` → `visual-check`，并带 `--repo-root .` 固定证据 revision。
- **视觉评审必须真看图**：`visual-check` 的 `visualReview` 恒为 `pending`，那是待人工/视觉模型审阅的标记。没真正看过截图前不得声称视觉通过；当前模型不支持读图就如实标注「未做视觉评审」。
- 改了架构图后，按「仓库结构与验证门禁」里的「改生产拓扑 / 部署流程 / 产品行为后必须回写文档」一并回写本文档与 `docs/ARCHITECTURE.md`，保持图、码、文三者一致。

## 仓库结构与验证门禁

- monorepo：`apps/web`（访客静态站）/ `apps/admin`（站主工作台，**默认首页=概览 `/overview`**；主工作面：概览 `/overview`、内容 `/content`、Agent `/agents`、运营记录 `/records`；底部：设置 `/settings`）/ `apps/api`（Nest）/ `apps/agent`（判断代理 · Cordis 组合 + MCP stdio，读 content.json，aiUsePolicy fail-closed）/ `packages/shared`（纯函数与契约，多端共用）/ `scripts/`（构建与预渲染）/ `content/log`（内容唯一真相源）/ `ops/windows`（盒子部署物料）。
- **管理端页面地图**：概览 `/overview`；内容 `/content` 与 `/content/:slug`；Agent `/agents`、部署 `/agents/deployments` 与 `/agents/:id`；运营记录 `/records` 与 `/records/runs/:id`；底部设置 `/settings`。路径唯一来源 `ADMIN_ROUTES`（`apps/admin/src/shared/routes.ts`）。旧后台路由已退役且不设兼容重定向表。跳转禁止硬编码路径。
- 改内容运营后台先读 `docs/PRD-AGENT-OPERATIONS.md` / `docs/TECH-DESIGN-AGENT-OPERATIONS.md` / 根 `to-do.md`（旧方案已归档至 `docs/archive/` 仅作历史参考）。
- **构建产物双份**：`apps/web/src/generated/` 下有 `content.json`（内容投影）与 `graph.json`（知识图谱：节点 + 边 + 度数）。图谱由 `content:gen` 与 content.json 一并产出，web 打包它、API 用同一个 shared 纯函数从 content.json 现算、agent 复用同一函数——**建图规则只有一份**（`packages/shared/src/graph.ts`），禁止各处自己写抽边逻辑。
- 主计划与图面：`PLAN.md`（排期/冻结条款/宪法）与 `docs/ARCHITECTURE.md`（当前态/最终架构/飞轮）是拓扑与排期权威，改动须回写。
- `apps/api` 是六边形分层：`ports/`（Symbol 接口）→ `adapters/`（实现）→ 用例 service → `kernel.module.ts` 统一接线。新增能力先定 port 再写 adapter。
- `apps/web` 运行时只读 `apps/web/src/generated/content.json`，禁止在 web 里做 fs / 直连内容目录。
- 改动后验证链：`pnpm typecheck` → `pnpm test:shared && pnpm test:api && pnpm test:web && pnpm test:agent` → 改了 web 再 `pnpm build:web && pnpm verify:geo`（GEO 是构建门禁）→ 改了内容先 `pnpm check:content-fields`。
- 测试库隔离：`apps/api` 的 vitest 把 `DATABASE_URL` 强制改写到独立 `walker.test.db`（globalSetup 每次删库重建 schema）；如需指定测试库，`API_TEST_DB_URL` 只接受绝对 SQLite `.test.db` 文件。测试绝不写开发库。真实 kernel 接线的集成测用 `Test.createTestingModule` + `KernelModule`（假 runner/临时目录用 `overrideProvider`/env 覆盖，见 `promote.kernel.integration.test.ts`、`workstation.chain.integration.test.ts`）。
- 改生产拓扑 / 部署流程 / 产品行为后，**必须回写文档**（AGENTS.md / PRD / TODO / STATUS / api/README 对应处），保持文档与生产一致。
- SQLite 迁移只走绝对 `file:` 路径。新库 `pnpm db:migrate`；已有库先备份，只有 schema 与基线完全一致时才可 `pnpm db:baseline`。当前生产旧库与基线不一致，须按 `ops/windows/README.md` 的 G07 重建搬迁流程处理；`dev:api` 不再隐式改 schema。旧 PG schema/迁移仅在 `apps/api/prisma/legacy-postgresql/` 供历史查阅。

## 技术栈（唯一）

- **pnpm monorepo**：`apps/web` · `apps/admin` · `apps/api` · `packages/shared`
- **前端**：React + Vite + TypeScript（**无 Astro**）
- **后端**：NestJS + Prisma + **SQLite**（本地开发、隔离测试和现有生产分别使用独立文件；不使用 PostgreSQL）
- **内容真相源**：`content/log/**/*.{md,mdx}` → `pnpm content:gen` → `apps/web/src/generated/content.json`（**进 Git 才上 Vercel**；Admin 保存≠自动 push）

## 常用命令与工作流

```bash
pnpm install

# 内容生成与版本历史（改 content/log 后或切换分支后必跑）
pnpm content:gen
pnpm content:backfill-versions

# 本地三端开发（SQLite 默认）
pnpm db:generate && pnpm db:migrate
pnpm dev:api    # :8788
pnpm dev:web    # :5173（自动先 content:gen）
pnpm dev:admin  # :5174

# 内容受控发布 → GitHub → Vercel
pnpm content:publish --push

# 验证门禁链
pnpm typecheck
pnpm test:shared && pnpm test:api && pnpm test:web && pnpm test:agent && pnpm test:admin
pnpm check:content-fields   # 校验所有 Markdown frontmatter 必需字段
pnpm verify:docs            # 校验全仓文档链接单一事实源
pnpm verify:geo             # 校验生成搜索引擎与 AI 爬取元数据
pnpm build:web              # 前端全量静态预渲染构建（含 feeds、llms.txt、pagefind）
pnpm accept                 # 验收测试
```

## 内容管道与构建依赖

```
content/log/**/*.{md,mdx}  →  scripts/generate-content.ts  →  apps/web/src/generated/content.json
```

- `content/log` 是内容**唯一真相源**；生成的 JSON 是 WebApp 的只读内容模型。
- `dev:web` 和 `build:web` 自动运行 `content:gen`。
- `build:shared` 是隐式前置条件——`packages/shared` 必须先编译，`apps/api`、`apps/admin` 和 `apps/web` 才能使用它。

## 领域词汇（SSOT）

同一概念只用一个词；不同概念禁止同名。全文见 [`docs/PRODUCT.md`](docs/PRODUCT.md)。

| 术语 | 含义 | 出现位置 |
|------|------|----------|
| **提问** | "带着问题来" — `/tools` 入口，接收问题 | `dualEntry.ask`、`ToolsPage` |
| **文章** | 阅读公开内容的 `/posts` 总览与详情 | `dualEntry.browse`、`PostsPage` |
| **线索** (Clue) | 用户提交的原始问题 | `/clues` 端点、`CluesPage` |
| **题苗** (Seed) | 从线索升级而来的潜在主题 | `/seeds`、`SeedsPage` |
| **执行** (Execution) | 有效交付——可追踪的工作单元 | `/executions` |
| **nextStep** | 下次该做什么——由规则或 AI 生成 | `NextStepStrategy`、intake 响应 |

**禁止在页面中硬编码路径字符串**（如 `'/tools'`、`'/posts'`）——始终从 `dualEntry` 或 `WEB_ROUTES` / `ADMIN_ROUTES` 读取。

## 前端分层规范

**Component ≠ 只有 UI/UX。** 按责任分层；展开见 [`docs/ENGINEERING.md`](docs/ENGINEERING.md)。

| 层 | 做什么 |
|----|--------|
| **配置** | `dual-entry` / `nav` 等产品语义 SSOT |
| **规则** | shared 纯函数、错误码与限流约束 |
| **门面** | `public-api`（Web）/ API 数据层（Admin），无 className |
| **页** | 路由任务编排，调门面、组块 |
| **块/壳** | 可复用 UI+UX；壳只布局 |

禁止：块里写领域规则；页复制第二套校验；规则 import React；壳办业务。

## 开发纪律与禁止事项

- 严禁重新引入 Astro / `.astro` 组件 / `@astrojs/*`
- 严禁在 React 正文里保留对 `.astro` 的 import
- 严禁把旧 WorkItem 巨石后台、Match 双轨当默认路径
- 严禁绕过受控发布流程直改线上构建

## 功能开发检查清单

添加任何功能时，按顺序确认：
1. **配置？** — 新 path / 文案 / 导航项 → `dual-entry` / `nav`
2. **规则？** — 新校验 / 纯计算 → `packages/shared`
3. **门面？** — 新 HTTP 调用 → `public-api`（Web）/ 数据层（Admin），并同步 `docs/api/README.md`
4. **页 + 块？** — UI 编排：页调门面 + 组合块；UI 块仅 `props + onXxx`，能测补测

## 部署与发版链路

| 项 | 事实 |
|----|------|
| GitHub | `https://github.com/AdgaiWalker/AdgaiWalker` · 分支 **`main`** |
| Vercel 项目 | **`adgai-walker`**（账号/团队 `praxiswalker-6245`） |
| 生产域名 | **https://www.iwalk.pro**（访客端）· **https://admin.iwalk.pro**（管理端）· **https://api.iwalk.pro**（后端 API） |
| 触发方式 | **`git push origin main` → Vercel 自动构建部署 Web；盒子上执行受控发布** |
| 构建流程 | 根 `vercel.json`：`pnpm build:web` → `apps/web/dist`（含字段门禁、预渲染、sitemap、llms、GEO、pagefind） |

```text
改代码/改内容 → commit → push main → Vercel 构建 web → 发布 www.iwalk.pro
```

## 生产拓扑（2026-09-03 切流后）

- 访客：`www.iwalk.pro`（Vercel 静态，push main 自动发）→ `/api/*` 反代 → `api.iwalk.pro`（盒子上 Caddy + Let's Encrypt）→ Nest `127.0.0.1:8788` → SQLite / DeepSeek Harness。
- **公网白名单双侧同步**：放行新公开路由必须同时改 `apps/api/src/app.module.ts`（exclude 表）和 `ops/windows/Caddyfile`，漏一侧即 401/404。管理路由另有 `WALKER_ADMIN_TOKEN` + Caddy basic auth 双防线。
- **方法/CSRF边界**：`SameOriginMiddleware` 对所有 POST/PUT/PATCH/DELETE 统一校验 Origin/Referer；可信反向代理源用精确 `WALKER_PUBLIC_ORIGINS` host 列表（不带 scheme），Nest 不开宽泛 CORS。Admin/Web Vite API 代理必须保留浏览器 Host（`changeOrigin:false`）。`apps/api/src/public-route-boundary.test.ts` 会逐方法比较 Nest exclude 与 Caddy 公网 Matcher，新增/变更白名单必须更新并验证。
- **管理凭据体系**：Basic 密码必须等于 `WALKER_ADMIN_TOKEN`（Nest 中间件校验）。改密码 = 同步改服务器 `apps/api/.env` 的 `WALKER_ADMIN_TOKEN` + `C:\Walker\data\admin-basic-auth.txt`（格式 `user:password`，明文仅存 data 目录）→ 重启 WalkerApi 和 WalkerGateway。脚本调管理接口带 `x-admin-token` 头。模型提供方与 API Key 凭据以 dsh 原生管理（`settings.yaml` / `.credentials.yaml`）为唯一真相源（R25c，自建提供方表与 AES 密钥已删除，密钥数据永不进 Git）。
- 盒子（腾讯云轻量，Windows Server 2C2G，新加坡）运行目录 `C:\Walker`：`app`（Git 工作树）/ `data`（持久数据，**不得覆盖**）/ `bin`（node/pnpm/git/caddy/dsh）/ `logs`。

## 盒子部署与运维坑（实测教训）

- 部署流：SSH 进盒子（**优先 `ssh walker-tencent`，走 Tailscale 主路径**，与出口 IP/防火墙无关；`walker-tencent-public` 仅应急）→ `cd C:\Walker\app && pnpm check:content-dirty && git pull origin main` → lockfile 变了再 `pnpm install --frozen-lockfile` → `pnpm build:shared` → `pnpm build:api`（admin 改了再 build:admin）→ 更新 `apps\api\.env` 的 `WALKER_BUILD_VERSION=<git rev-parse --short HEAD>` → `schtasks /End + /Run /TN WalkerApi`（网关是 `WalkerGateway`）→ 按 `ops/windows/README.md`「部署验证清单」四步核对（health 回显 version/8788 归属/443/路由隔离）。
- **停服才能换 Prisma 引擎（2026-09-14 实测）**：API 运行时跑 `pnpm db:generate` 必失败——`EPERM: operation not permitted, rename ... query_engine-windows.dll.node`（运行中的 node 锁着引擎 DLL；`db:push` 走同一路径也会连带失败）。部署顺序因此固定为：`schtasks /End /TN WalkerApi` → **核 8788 是否真释放**（僵尸旧进程占着先 `taskkill /PID <pid> /F`）→ `pnpm db:generate` / `build:api` / `build:admin` → 写 `WALKER_BUILD_VERSION` → `schtasks /Run /TN WalkerApi` → 部署验证清单四步。另注：远程默认 shell 是 **cmd**（不是 PowerShell），多层引号易被吞，复杂脚本用 `powershell -EncodedCommand <base64-UTF16LE>` 传。
- **SSH 会熔断**：短连接多次后出现 `Connection closed by ... port 22`（两个成因：开 VPN 后出口 IP 不在防火墙白名单 → 走 Tailscale 主路径即解；构建打满 2G 内存把 sshd 僵死 → 控制台重启实例）。带外替代：腾讯云控制台 → 实例 → 「执行命令」（TAT，不走 22 端口），可远程 git pull + 构建 + 重启，实测 23 秒跑完全套。
- 2C2G 内存紧张：**构建（tsc/vite）可能把 sshd 打僵死**（TCP 可连但无 banner）→ 控制台重启实例可解；避免在 API 服务运行时跑重构建。
- PowerShell 脚本含中文必须带 **UTF-8 BOM**，否则 Windows PowerShell 按 ANSI 解析报错。给服务器写的 `.ps1` 一律 **纯 ASCII 注释**最稳。
- PowerShell 5 下 `$ErrorActionPreference='Stop'` 会把原生命令（pnpm/node）的 stderr 输出当终止错误杀掉脚本：要么 `'Continue'` + 检查 `$LASTEXITCODE`，要么把输出 `| Out-Null`。
- Caddy `basic_auth` 只支持**块形式**（行内参数会把第一个参数误读为哈希算法名）；Caddyfile 的 `{$VAR}` 占位符展开不跨 token，"user hash" 必须拆成两个环境变量。
- **Windows 保留文件名**（`nul`、`con` 等）在部分开发机上能提交、服务器上无法检出（`error: invalid path`）——提交前别把这类文件加进 Git。
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

服务器已接入 Tailscale（tailnet `AdgaiWalker@github`，服务器节点名 `walker-server`，虚拟 IP `100.115.242.59`）。**主路径走虚拟内网，与 VPN / 出口 IP 无关**：

```bash
ssh walker-tencent            # 100.115.242.59（Tailscale，永远可用）
ssh walker-tencent-public     # 43.163.4.104（公网备用，仅当防火墙白名单含当前出口 IP）
```

非交互验证：

```bash
ssh -o BatchMode=yes -o ConnectTimeout=15 walker-tencent "whoami && hostname"
```

- 主路径不通时先查本机 Tailscale 客户端和服务器上的 `tailscale status`；服务器端已加 `--unattended`，无用户会话也常驻。
- 公网备用路径被拒（`Connection closed ... port 22`）通常是 VPN 改变了出口 IP：`curl -fsS https://api.ipify.org` 查当前 IP → 腾讯云防火墙把 TCP 22 来源更新为 `<IP>/32`。**优先修 Tailscale 路径，别依赖这条**。
- 服务器端重启 Tailscale 入网用 Auth Key（管理后台 Settings → Keys 生成，单次使用）+ `--unattended`；不带 `--unattended` 会在无用户会话时自动掉线。
- 连接参数和私钥位置由本机 SSH 配置管理，不要在仓库中复制 IP、用户名、密钥内容或基础设施细节。
- 不得读取、输出、提交、上传或转发私钥内容。
- 连接失败时不要直接重装系统、重置密码或创建新密钥。
- 未经用户明确授权，不得重装系统、重置密码、删除服务器数据或替换 SSH 密钥。
