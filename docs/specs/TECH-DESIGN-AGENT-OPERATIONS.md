---
status: active
type: design
title: 站主内容与 Agent 运营系统技术方案
version: v1.3
last_verified: 2026-09-25
ssot: true
applies_to: [admin, api, shared]
---

# 站主内容与 Agent 运营系统技术方案

> **2026-09-29 本地请求日志**：人工触发的管理请求在鉴权后写 `AdminRequestLog` 独立 SQLite 表，处理前写进行中行，HTTP 完成后补路由模板、状态、耗时；日志写入失败拒绝执行，补记失败保留进行中状态供核对。定时 GET 与只读发布预检 POST 带明确后台轮询标记，避免持续占满日志；其余变更请求无论是否带标记都写入。业务事实仍由 `AuditRecord` 负责。无提供方的 Agent 修订在运行与发布测试共用的 `resolveHarnessConfiguration` 中解析当前系统默认模型，旧占位模型 ID 不决定运行模型。

> **2026-09-29 本地 O05 事务修正**：会话转事项增加内部提交 port，Prisma 事务同时创建 Action 与 `conversation.convert` 审计；唯一审计请求键消除并发双提交。迁移前对已存非空请求键分组检查，发现重复直接拒绝；不新增公开 API 或第二份过程真相。证据见根 `to-do.md`，生产未部署。

版本：v1.14 · 2026-09-25 · F01–F18、R01–R33、V01–V24 与 C01–C16 已本地验收；下一项 C17，未部署。当前公共位置 readiness 因本地未配置真实探针报告而保持 blocked。

2026-09-22 执行补充：按站主指令优先交付可运行框架；详细任务及依赖见 [to-do.md](../../to-do.md)。数据库确定为 SQLite，本地开发、隔离测试、现有生产分别使用独立文件；不接入 PostgreSQL，不进行双库适配。

2026-09-24 审查修复（本地，未部署）：执行进程从不可变修订选择提供方和模型，并在独立 Agent home 注入该 Agent 的凭据；模型目录按 `llm-pi-ai.providers.<route>` 读取和保留多路由。发布测试的配置指纹包含生效模型、提供方配置及不含密钥值的凭据文件版本；运行中配置变化时，位置解析立即拒绝旧测试证据。启用中的部署禁止普通保存改成员，回退仍须验证目标修订。公开快照导入须与线上构建提供的清单集合 hash 一致。

输入：[PRD v0.2](PRD-AGENT-OPERATIONS.md)、[开源调研](RESEARCH-AGENT-OPS-OPEN-SOURCE.md)、当前工作区代码。PRD 决定产品行为；本文决定实现边界；[主计划](../../PLAN.md)决定实施顺序；[架构图面](../ARCHITECTURE.md)记录拓扑。旧 `docs/archive/TECH-DESIGN.md` 的“不改 schema”“所有记录由 trace 重建”等约束不适用于此次重构。生产能力以代码及部署核验为准。

## 框架已实施边界

- React/DOM 19.2.7、Refine 5.0.12 已通过构建与真实读链验证；assistant-ui 0.15.21 的 Runtime/Provider 仅用于测试探针，SSE text/done/取消/断流通过，无模型能力开放。
- 新增受管理鉴权的 `/ops/capabilities`、`/ops/agents`、`/ops/runs`、`/ops/runs/:id`；数据来自现有仓储与 AgentRun。避免旧 Agent list 自动创建默认角色，不建设第二份历史数据。
- capabilities 实际试读各数据源；历史零用量/版本/交付确认保留未知。只读界面不暴露旧写入口，服务端旧写路径治理仍须 R/C 完成，不能因前端不显示按钮而视为已封闭旁路。
- JSON401由页面处理，普通导航仍保留Basic挑战，凭据条件未改变。测试入口只接受绝对 SQLite `.test.db`，每次重建隔离库；运行环境的版本迁移已由 R01 接管。
- 完整本地结果见 [框架验收](../evidence/ADMIN-FRAMEWORK-ACCEPTANCE.md)，原子进度只在 `to-do.md`。
- C02 已新增 `ContentChange`/`ContentRelease` SQLite 模型与 Prisma 仓储：同请求键重放同一记录，不同事实冲突；审批 binding 与 SHA-256 固定在父记录，网页 release 仅能引用已应用且 hash 一致的候选。C03 为既有文件保存路径加入 CAS，但尚未让候选/发布服务消费这些新模型；跨重启写入记录、审计和新发布副作用留给 C04 及后续任务。
- C03 的文件 adapter 在单进程内按内容 slug 加锁，读取并核对 `expectedHash` 后写同目录唯一临时文件、同步文件句柄并 rename 替换；正文详情返回当前 SHA-256，保存 API 缺少版本 hash 即拒绝。它不持久化写入意图，不协调其他进程或外部编辑器；C04 增加崩溃恢复，C05 再完成受审计保存出口并移除保存后自动重建索引。
- C04 的 `ContentMutationService` 已接入 Kernel，校验调用方提供的候选原文 hash。仓储在一个 SQLite 事务内把候选置为 APPLYING 并写 intent audit；文件写入仍独立使用 C03 CAS；完成/冲突状态与 outcome audit 再用一个 DB 事务提交。重启后 reconcile 读取实际 hash：candidate hash 补记 APPLIED，base hash 安全重试同一已批准字节，其他 hash 标记 CONFLICT。候选字节目前由内部调用方传入并 hash 核验；C07 再实现按 opaque candidateRef 读取的独立候选仓储。
- C05 的 `ContentAdminService.save` 仍受 AppModule `AdminTokenMiddleware` 保护，保存副作用改由 `ContentMutationService.saveManual` 执行：R05 journal 在文件操作前/后持久化 intent 与结果 audit，文件层执行 expectedHash CAS；保存不触发 `content:gen`。actor 固定为单站主 `owner`，日志只记 slug/requestId/hash，不保存管理凭据或正文。

## 1. 架构结论

采用 **React/Vite + Refine 后台、assistant-ui 对话组件、现有 Nest 模块化单体、SQLite、DeepSeek Harness SDK**。保留内容、发布、Action、凭据和规则资产；新增不可变 Agent 版本、位置绑定、授权、可靠执行和会话记录。Paperclip 作为授权、运行监督和任务组织的设计参考，不引入其整套后端；首期不部署 Langfuse。

最先解决的结构问题是：**一次调用由谁授权、用了什么版本、是否真的结束、是否真的写入或上线，必须有明确且可恢复的答案。** UI 库负责展示与交互，Nest 负责这些事实。Agent 是可部署的配置和能力组合，不是一份常驻进程。

## 2. 架构地图

当前主链已演进为：访客请求 → `PublicAssistantService` → 注册位置/启用部署/核验快照 → `AgentExecutionService` 公共队列 → `RuntimePort`；后台试跑也使用同一执行生命周期。`/assistant/stream` 输出带稳定 ID 的 SSE v2 帧，Conversation/Attempt/Message 持久化并区分 partial/sent/ack/unknown。C02 已把独立 `ContentChange`/`ContentRelease` 表与 Kernel 仓储接入 SQLite；C03 为内容文件保存加入 CAS 和原子替换；C04 提供内部候选 apply/reconcile；C05 让现有人工保存走已鉴权的 CAS/audit 服务且不刷新公共索引。候选原文读取/HTTP 入口与新发布服务仍未接通，旧工作站发布继续走既有路径。

目标拓扑的权威图见 [ARCHITECTURE.md「新后台目标拓扑」](../ARCHITECTURE.md#agent-operations-target)。职责流如下：

| 链路 | 服务端职责 | 事实去向 |
|---|---|---|
| 访客选择位置/Agent → 问答 | 解析已部署版本、只读内容范围、配额、执行、输出校验 | Conversation/Message、ExecutionRun、交互事件 |
| 站主试聊/生成候选 → 审阅 | 固定 Agent 版本与输入对象版本，运行结果成为独立候选 | ExecutionRun、ContentChange、候选文件 |
| 站主批准 → 保存/发布 | 校验具体授权与内容版本、串行执行副作用、核验结果 | 审计、ContentChange、ContentRelease |
| 到期扫描 → 更新事项 → 复盘 | 确定性规则、去重、状态聚合；需要时单独调用 Agent | 现有 Action、提醒发生记录、运营统计 |

## 3. 边界与假设

- 首期服务单个站主，文章完整闭环；项目复用现有内容类型，小店仅内容入口，不加入订单、支付或库存系统。
- “实时更新”按后台事实同步解释，不增加外部网站监控。后台可见页面每 5 秒刷新状态，超过 15 秒未获得新事实显示陈旧；静态文章正文仍需部署。
- 前台来源的运行永久只读。后台 L1 可产生候选，L2 可批准一次具体写入；L3 首期只开放到期扫描和后台提醒，持续自主修改/发布是后续能力。
- 保留一台 Windows 2C2G 盒子和一个 Nest。SQLite 持久队列是本地表与轮询，不是新增队列基础设施。默认先限制全局一个模型运行；“一访客 + 一后台”双槽须通过内存和终止隔离验证再启用。
- 不恢复退役后台页面；新页面在空白 `apps/admin` 上建立。新库版本需经安装兼容探针锁定，本方案不把 GitHub 最新提交当作可直接安装版本。

## 4. 审查视角

| 视角 | 在本项目要解决的问题 |
|---|---|
| 信息隐藏与模块深度 | 页面、控制器不理解 dsh 进程、租约、重试与文件恢复细节 |
| 所有权与真相源 | Agent 配置、编辑内容、线上内容、对话、执行诊断各有唯一职责 |
| 生命周期与错误边界 | 取消等待不等于取消运行；提交成功不等于上线；错误能定位且恢复 |
| 权限与依赖方向 | 公共输入不能升级来源，业务写动作不能绕过服务端授权 |
| 演进成本 | 利用现有端口和数据，分批替换调用入口，避免整平台迁移 |

## 5. 最痛的复杂度中心

问题集中在**运行结果到业务副作用的交界处**。目前短调用超时通过 Promise.race 返回，原运行可以继续；文章保存异步刷新工作索引，发布又以脚本退出码结束。若只加一个“Agent 管理”界面，上层将不得不逐个猜测底层状态，授权、停止、发布、日志也会各写一遍。

解决方式是让 ExecutionService 隐藏运行生命周期，让 ContentMutationService 隐藏内容写入与恢复，让 ContentReleaseService 隐藏 Git 和线上核验。三个模块各自拥有不同的结果事实，通过稳定 ID 关联，避免一个全能 AgentManager 接管所有业务。

## 6. 方案比较与开源取舍

| 方案 | 边界与能力 | 迁移成本/风险 | 结论 |
|---|---|---|---|
| A：纯 React 自建页面，给既有用例补授权与版本 | 保留所有调用入口；UI 自由，需自己维护列表、筛选与数据状态 | 前期最少依赖；若不收拢执行层，监督规则会重复实现 | 可行保守方案；库兼容失败时回退到自建 UI，仍采用本文服务端边界 |
| B：Refine + assistant-ui，现有 Nest 内统一执行与写入边界 | 管理资源、对话交互复用，业务权限和事实仍在自己的服务端 | 中等改造；需要新表、适配现有 API 和真实 SSE 协议 | **推荐**，与现有前台、SQLite、Harness 最贴合 |
| C：以 Paperclip 整体二开 | Agent/任务/预算/监督产品结构最接近 | Express/Drizzle/PostgreSQL 与现有 Nest/Prisma/SQLite 重叠；Harness adapter、Windows 资源成本未验证 | 暂不采用整套运行栈，保留设计参考 |

具体复用边界：

- **Refine**：后台资源路由、列表/筛选/分页、请求状态；自写 dataProvider 适配现有无统一 envelope 的 Nest 响应。accessControlProvider 只控制按钮呈现，真实鉴权仍在 Nest。auditLogProvider 不替代服务端审计。仅安装实际使用的核心依赖。
- **assistant-ui**：访客和后台试聊的消息列表、输入、流式呈现；使用自有 Runtime 适配当前 HTTP/SSE。持久化、会话归属、切换 Agent 和停止结果由服务端协议实现，不引入第二套聊天云服务。
- **Paperclip**：参考 Agent 生命周期、任务与运行关联、预算、审批展示；不复制组织层级、公司模型、数据库与调度器。未来只有明确需要组织协作时才重评整体迁移。
- **Langfuse**：参考 trace/run/usage 的关联与查询体验，首期使用 SQLite + 受控文件诊断；不在 2GB 盒子部署其多服务栈。
- 不同时引入 Refine 与 react-admin，不叠加 CopilotKit/AG-UI，不以 Dify/Flowise 替换 Harness。具体源码快照、许可证及排除原因见调研，复制源码时逐文件保留适用声明。

## 7. 现有实现中的高优先级缺口

以下是工作区静态核查结论，不声称已在生产复现事故。

| 优先级 | 证据与观察 | 影响与对应决策 |
|---|---|---|
| 高：发布范围不一致 | `content-release.service.ts:114` 接收 slug，`:151` 调无目标参数的 runRelease；`scripts/content-publish.ts:25`、`:178` 提交固定内容路径集合 | 单篇审批不能授权其他脏文章。引入发布清单，首期发现其他内容改动即阻断单篇发布（§11） |
| 高：工作内容可能提前进入公开索引 | C05 已移除 `ContentAdminService` 保存后的 content:gen；`fs-site-content-index.ts` 仍是工作区索引适配器 | 公开问答只读已核验发布快照；工作区人工保存不刷新公共投影，完整候选发布仍由独立 ContentRelease 流程承接 |
| 高：停止等待与停止执行混淆 | `dsh-agent.runner.ts:68` 短调用保留超时实例并释放锁；`:117`–`:127` 只竞争 Promise；`:106` 不等待 close | 隐藏真实活跃任务，容量与取消判定失真。等待进程终止证明，失败隔离实例（§10） |
| 高：调用与权限入口分散 | `agent-runner.service.ts:138`、`:166` 后台试聊走 llm.chat。R10 已把 Harness 子进程环境收到 `runtime/harness-launch.ts` 白名单 | 后台直连模型仍待 R18。RuntimePort 见 R11。只读工具 patch 不能被 `DSH_PERMISSION_MODE` 单独代替（§9–10） |
| 中：Agent 配置缺少不可变部署版本 | `schema.prisma:279` AgentUnit 是可变 prompt/model；`agent-unit.service.ts:69`–`:90` DB 更新后同步文件 | 草稿修改与公开部署需分离。DB 版本为配置事实，技能文件为显式导入/导出（§8） |
| 中：记录不足以重建访客体验 | `schema.prisma:189`、`:201` 只有模型 session 与问答记录；`assistant.service.ts:243` traceId 为 null，存储失败捕获后仍返回 | 缺少业务会话、交付确认、尝试与交互事件关联。新增稳定关联与采集缺口状态（§12） |

这些修正遵循信息隐藏和错误边界原则：让调用者获得“完成/未完成/待核对”的业务结果，不要求调用者理解子进程或猜测 Git 状态。代价是增加少量持久状态与核验过程；只增强 UI 或仅增加日志无法替代这些边界。

## 8. 保留资产与数据模型

已有六边形分层、aiUsePolicy、输出/引用校验、规则降级、凭据加密、内容发布门禁及工作站 candidate hash 审批值得保留。新增能力沿现有 ports/adapters 和 KernelModule 接线，不另建后端。

### 8.1 真相源

| 数据 | 权威存储 | 不承担的职责 |
|---|---|---|
| 内容正本 | `content/log`；原始 UTF-8 字节的 SHA-256 作编辑版本 | DB 不存另一份可独立编辑的正文 |
| 已核验公开内容 | 正本派生的不可变发布快照 + 生效指针 | 不接受直接编辑，不以工作区 mtime 判定上线 |
| Agent 配置与版本、部署、授权 | SQLite | `skills/` 导出物不再反向静默覆盖 DB |
| 会话与实际对外消息 | SQLite | 不用原始模型 JSON 或 SDK 历史假装最终回答 |
| 执行控制、候选、发布、审计 | SQLite；大候选/诊断文件通过 ID/hash 索引 | 不从临时日志推导授权是否有效 |
| SDK 执行诊断 | Harness 原生会话 + 应用结构化 trace | 不作为正文发布或访客已收到的证明 |

只读投影可以重建；批准、撤销、提交和交付确认是独立业务事实，不能宣称均可由 trace 重建。Agent 配置选择 DB 为主是为了原子完成版本、部署和授权变更；现有技能文件若需引入，必须导入为新修订，站主再部署。

### 8.2 模型增量

下表记录逻辑 schema 与实施映射；R01 已把旧 PG schema/迁移归档，现行 `prisma/migrations` 是 SQLite 基线：空库直接 `db:migrate`，已有库先备份并 `db:baseline`；部署前检查迁移文件校验值、历史连续性和实际 schema 漂移。C02 已通过 `20260925160000_content_change_release` 增加 `ContentChange`/`ContentRelease`，并在 Kernel 注册对应 Prisma 仓储；表与仓储尚未接入内容文件副作用、HTTP 写 API 或发布执行器。迁移测试在旧库行上验证 `Submission`/`Publication` 保留，生产库未执行。其余后续模型仍按原子任务增量迁移。可空计量字段用 null 表示未知，历史零值不反推真实用量。

| 模型 | 最小字段/约束 | 复用与关系 |
|---|---|---|
| AgentUnit + AgentRevision | Unit 保留 id/name/archivedAt；Revision 含 agentId、version、prompt、provider/model、toolProfile、schemaVersion、configHash、createdAt；unique(agentId,version) | 现有 AgentUnit 迁为身份/草稿指针；Revision 不可变，历史不级联删除 |
| AgentDeployment + DeploymentMember | placementKey、对象范围、enabled、generation；成员 revisionId、isDefault、序号；每个有效位置恰有一个默认项 | 同一位置多 Agent，发布配置事务内切换；禁用独立于删 Agent |
| AuthorizationGrant | principal/agentId、origin、actions、resourceScope、expiresAt、run/usageLimit、revision、revokedAt | 单次与持续授权共用动作模型；默认拒绝，不接受客户端来源字段 |
| ExecutionRun | id、kind、origin、actor、revisionId、deploymentGeneration、contentSnapshotId、grantRef、requestKey、resourceScope、parentRunId、state、attempt、leaseOwner/epoch/until、deadline、stopReason、usage nullable | 运行控制权威；unique(actorScope,requestKey)，index(state,createdAt)；历史 AgentRun/SkillRun 只读兼容 |
| Conversation + Message | conversationId、ownerHash、placement、createdAt、retentionUntil；Message 含 id、role、turnId、attempt、runId、text、citations、agentRevision、contentSnapshot、deliveryState | 新业务会话；SDK session 单独在运行关联中登记；unique(conversationId,messageId) |
| ContentChange | id、`action=apply-candidate`、targetSlug、baseHash、candidateHash、opaque candidateRef、sourceRunId、state、apply approval binding/hash/grant 快照、appliedHash、requestKey | C02 已迁移并由 Kernel Prisma 仓储持久化；独立候选，不要求先创建八阶段作品流水线；候选引用不是文件路径；APPLIED 只证明工作区写入 |
| ContentRelease | id、changeId、`action=publish-website`、targetSlug、baseHash（当前已核验网页）、sourceHash（候选）、publish approval binding/hash/grant 快照、manifestHash/ref、gitCommit、publishedSnapshotId、stage、verifiedHash/At、assistantIndexState、errorCode、requestKey | C02 已迁移并由 Kernel Prisma 仓储持久化；网页发布阶段与问答索引同步状态分别记录；target hash 集保存在由 manifestRef 指向的不可变清单；与既有 Submission/Publication 不强行合并，旧工作站发布接入此出口 |
| ContentApproval（值合同） | approvalId、action、targetSlug、baseHash、candidateHash、grantId、grantRevision、bindingHash、approvedBy/At | 同一候选应用和网站发布是两个批准动作；按 binding 快照附着到 ContentChange/ContentRelease，不新建通用审批中心；是否已消费从父记录状态推导 |
| ContentVersionSnapshot（读投影） | workingHash、publishedHash、indexedHash | 当前文件、已核验网页和已激活问答快照的 hash 分别推导，不造一个模糊的“内容版本” |
| FeatureEvent 增量 | eventId、schemaVersion、conversationId、messageId、runId、placement、eventType、occurredAt/receivedAt、小型白名单属性 | 复用现有事件表；unique(eventId)，按时间/位置/会话建索引，不新增平行点击流库 |
| Action + ReminderOccurrence | 复用 Action 的目标/日期/状态；发生记录 actionId、scheduledAt、createdAt，unique(actionId,scheduledAt) | 无第二套通用任务中心；提醒无需模型运行 |
| ReviewEntry | id、actionId/contentId、做了什么、观察结果、下次尝试、统计窗口/快照引用、createdAt | 轻量复盘记录；不强制建立选题方法论，不自动把相关性写成因果 |
| AuditRecord + Outbox | actor、action、target、before/afterHash、outcome、requestId、at；Outbox 含 topic、aggregateId、payloadRef、attempt、nextAt、deliveredAt | 关键审计与业务状态同事务，Outbox 用于可靠派发/投影，不做全量事件溯源 |
| DeletionTombstone | conversationId/范围、requestedAt、cutoff、phase、finishedAt、backupPolicyVersion | 记录删除任务与恢复后重放，不保留被删正文；审计用不可反查访客的标识 |

SQLite 使用短事务、WAL/busy_timeout 配置验证和有界批处理；事务中不等待模型、文件 IO 或网络。消息先按日期/位置收窄再关键词查找；首期可用参数化 LIKE，数据达到实际瓶颈再为既有消息加 FTS 索引，索引必须跟随删除。

## 9. 模块与服务端权限

### 9.1 模块接口

| 应用服务 | 对外最小能力 | 隐藏的实现 |
|---|---|---|
| AgentCatalogService | createRevision、testRevision、deploy、resolvePlacement、disable | 配置快照、默认成员约束、部署世代、测试记录 |
| ExecutionService | submit、get、observe、requestStop | 配额预留、持久排队、租约、runtime 生命周期、终态条件更新 |
| ContentMutationService | propose、approve、apply、reconcile | 有效授权、版本冲突、文件锁/原子替换、写前日志与恢复 |
| ContentReleaseService | preflight、release、reconcile | 实际提交范围、Git、副作用核验、公开快照切换 |
| ConversationService | acceptMessage、recordDelivery、query、export、delete | 归属、脱敏、去重、业务记录、SDK 关联与保留策略 |
| OperationsService | overview、scanDue、updateAction、review | 统计口径、提醒幂等、采集健康，不暗中调用模型 |

策略校验是 shared 纯函数；读取授权和执行动作在 Nest 用例。底层端口分为 RuntimePort、ExecutionRepository、ContentFileRepository（增加 CAS）、PublicSnapshotRepository、ReleaseRunner、ConversationRepository 等实际适配边界；不用为每个方法再包一层 service。Runtime factory 从 assistant adapter 抽出，后台 runner 不反向依赖访客用例。

### 9.2 授权计算与不可绕过的出口

有效动作集合 = 来源上限 ∩ Agent 工具允许集合 ∩ 本次事项授权 ∩ 对象 aiUsePolicy/业务策略。

- origin 由通过鉴权的控制器构造，公共请求体中即使带 `origin=admin`、grantId 或任意 Agent ID 也不能改变上下文。访客只能选该位置已部署成员，不能加载草稿或内部角色。
- 新任务的公开来源、对象范围和预算上限沿 parentRunId 单向收窄。首期关闭自动子 Agent；将来接入时不得通过子任务丢失来源。
- 公共模型运行不挂载写文件、shell、发布、任意 HTTP/MCP 或读后台日志工具；只接收服务端准备的公开资料。所谓 read-only profile 不足以证明不能读凭据。
- dsh 子进程环境改为显式白名单；只传对应 provider 必需凭据，不传管理 token、数据库或主密钥。凭据不能进入 prompt/trace；中立 cwd、分隔前后台会话目录，运行账号/文件访问面须经探针验证。
- 后台模型也只生成候选或结构化动作请求；**实际内容写入与发布均由用例执行**，不授权模型直接写正本或 git。未来 L3 内容授权可省逐次人工点击，但仍经过相同动作入口。
- L2 审批绑定 `{action,target,baseHash,candidateHash,grantId,grantRevision}`；shared 的 `contentApprovalBindingKey()` 用固定字段顺序序列化，API 对此值计算 SHA-256；未知字段拒绝，修改任一项须重新批准。候选应用和网站发布是不同动作，两者不可共用一次批准。写入前、发布前重新检查授权/撤销/有效期与对象版本，配额原子预留。
- 撤销与动作获准派发通过短事务排序；派发后已经开始的不可逆动作属于进行中，撤销不伪称回滚。对象锁内再核 hash，迟到运行结果只能留作诊断，不能再申请副作用。
- 所有旧后台写路径、工作站发布、管理脚本逐步接入同一受控出口；存在可达旁路时不得开放新 Agent 的写能力。人工保存使用已鉴权站主权限，也必须 CAS 与审计。

## 10. Harness 执行、调度与停止

### 10.1 SDK 兼容边界

本机 `@deepseek-ai/dsh-sdk-client` 为 **0.1.5-rc.2**。本机 README 明确没有逐轮 cancel、没有完整服务端请求/交互审批支持，run 返回活动区间结果。调研中的上游 0.1.6-alpha.2 不代表当前可用；首期按本机契约实现，升级需要独立适配验证。

RuntimePort 接受固定版本配置、整理好的消息/资料和事件回调；返回校验前模型结果、实际用量、SDK 会话关联。ExecutionService 负责终态，业务解析器决定结果是否满足候选/问答合同。提示词输出合同只组装一次。

一个 runtime 同时最多一个活动调用。复用必须满足 provider/模型/凭据版本/工具 profile 相同；业务会话的 SDK session 必须归属同一访客和 Agent 修订。Agent 切换、修订更新、权限收窄时开新模型会话，界面仍可保留同一业务 Conversation 的时间线。

Agent 部署前运行正常问答、内容未知、越权请求三类测试，作为 kind=test 的 ExecutionRun 保存 testCaseId、suiteVersion、configHash 和断言结果。部署校验测试对应的修订、工具策略和供应商配置仍有效，权限用例失败禁止启用；模型不确定时结果标待核查，不能只以“没抛异常”判通过。凭据轮换只递增不含密钥的 credentialRevision，失效旧 runtime；不得把凭据值或其可猜测派生值写入公开配置 hash。

### 10.2 状态与恢复

```text
QUEUED → CLAIMED → RUNNING → SUCCEEDED | FAILED
QUEUED → CANCELLED
RUNNING → STOPPING → CANCELLED | FAILED
RUNNING / STOPPING → UNKNOWN（重启或无法确认终止/结果）
UNKNOWN → 核对后的事实终态；不得直接自动重跑副作用
```

`stopReason` 区分用户停止、截止时间、配额、系统关闭；超时确认终止后记 FAILED/timeout，用户停止确认后记 CANCELLED。候选待审批属于 ContentChange，不能把已经结束的 SDK run 展示为“模型等待审批”。

持久队列由 Nest 内定时器领用；领取原子更新 leaseOwner/epoch，后续结果写入须匹配 epoch 和允许状态。进程 PID、创建时间和所属 run/启动批次由 runner 私有记录，不能只凭可复用 PID 杀进程。重启先确认遗留进程被终止/隔离，再恢复容量；租约到期本身不是重启模型的许可。

**进程观测必须区分「从未启动」与「无法证明」（2026-09-24 实测事故）**：`inspect` 对 `pid: null` 的记录返回 `unstarted`（从没启动过，没有东西需要终止，**释放容量是安全的**）；只有「启动过但读不到身份」才是 `unproven`，保守占用。两者混为一谈会让唯一的模型槽被永久占死——调度泵每轮都因槽占用而等待，队列再也不会推进，且没有任何解除通道。这与「无法证明终止就继续占用」不冲突：没启动过就无所谓终止。

运行中停止：标记 STOPPING → 停止外发 → `await runtime.close()` → 验证实际退出 → 写终态并释放槽。失败则隔离该实例并标 UNKNOWN、保留容量占用告警，不能先创建无限替代实例。固定发布脚本的子进程树也要有终止验证；SDK close 不负责终止其他脚本。

终态使用条件更新，已取消结果不能回写成功。断开 SSE 只表示传输断开；客户端停止按钮调用停止接口。只读回答可按截止时间结束，已经进入 Git push 的发布不提供“已取消”的虚假保证，转入核验。

### 10.3 初始配额与资源参数

| 参数 | 初始建议 | 约束 |
|---|---|---|
| 模型并发 | 全局 1；双槽候选配置 1 公共 + 1 后台 | 双槽必须实测；不按 Agent 数量常驻 |
| 等待队列 | 公共最多 3 等待者；后台最多 10 | 满/过期拒绝或规则降级，禁止无界排队 |
| 截止时间 | 公共沿用总响应预算 15 秒，含排队；后台默认 120 秒 | 更长任务单独配置，取消仍须确认进程终止 |
| 费用保护 | 每匿名主体/位置/全站请求配额；每 run 输出、时间上限 | SDK maxTokens 不是全 run 总 token 上限，不能宣称严格控制总费用 |
| 运维余量 | 双槽峰值测试后系统至少保留 512MB 可用内存、无持续分页/服务失联 | 不满足则维持单槽；重构建按运维流程在停服维护窗口执行 |

公平调度避免后台无限饿死：有限公共优先，达到配置的连续公共次数后取一个后台任务；公开等待超预算直接降级。实际延迟、RSS、冷启动及关闭耗时进入探针报告，不用估算伪装 SLO 已达标。DB 无法预留额度时不启动新的付费模型调用，改规则回答；已生成回答的诊断保存失败按 §12 处理。

## 11. 内容写入、发布与索引一致性

### 11.1 候选与保存

`ContentChange` 只承载候选应用动作：`PROPOSED → APPROVED → APPLYING → APPLIED`；另有 REJECTED、EXPIRED、CONFLICT、UNKNOWN。候选保存在受控数据目录，`candidateRef` 是不透明 ID、`candidateHash` 是候选正文 hash。APPLIED 只表示工作区正本以 CAS 写入，不表示网页或问答索引已经更新。网站发布使用独立 `ContentRelease` 和 `publish-website` 批准；站主手工保存可不走候选批准，但必须走受控出口并传 expectedHash。

C03 已在 `FsContentFileRepository` 落地当前进程内按目录+slug 串行锁：在锁内确定 `.md`/`.mdx` 目标、拒绝双扩展冲突、计算实际正文 SHA-256 并与 `expectedHash` 比对；新建必须传 `null`，只有目标不存在时成功。写入先用唯一同目录临时文件，以排他创建写全正文并 `sync`，再 `rename` 替换；写入/替换失败清理临时文件且不触碰原文件。HTTP 内容详情返回 hash，保存体必须显式带字符串 hash 或 `null`。锁仅协调同一 API 进程中的调用。

C04 已在 `ContentMutationService.apply/reconcile` 落地候选应用恢复。开始时验证候选原文 hash，`beginApply` 在 DB 事务内将 APPROVED 改为 APPLYING 并写 before/after hash 审计，然后调用文件 repository CAS；成功后 `finishApply` 在另一个事务内写 APPLIED/appliedHash 和结果审计。进程在意图后退出时，重启后调用 `reconcile`：若磁盘仍是 baseHash，重试同一批准候选；若已是 candidateHash，只补 DB 状态/审计不重复写文件；其他 hash 标记 CONFLICT 并保留外部正文。当前没有启动期扫描或自动恢复任务，因为候选字节仍由内部调用方提供；C07/C09 再接 candidateRef 读取与 apply 触发。由于文件系统与 SQLite 无法同事务，任何阶段都如实保留可观察状态，不宣称跨资源原子提交。此内部服务尚未连接管理路由。

候选应用先持久化操作意图与审计，锁住目标并读取 baseHash，再向同目录临时文件写入、刷新并原子替换。文件系统和 SQLite 不能同事务：保存前后 hash 与恢复日志用于核对。重启后调用 `reconcile` 时，当前 hash 等于批准的 candidateHash 则补记 APPLIED；等于 baseHash，则只重试同一已批准正文的 CAS；其他值进入冲突，绝不自动覆盖。`appliedHash` 只在文件 hash 已核验后提交，不用于代替崩溃后实际读取。当前候选 bytes 由内部调用方提供，尚无启动期扫描/自动调度；C07/C09 接入后再确定恢复触发入口。

目标是所有应用写入遵循同一对象锁；发布还需全内容工作区锁。人工 Git/脚本修改须接入同一锁协议，检测锁外修改即中止核对；这不是对任意外部编辑器的无条件原子性保证。C04 当前用于候选 apply/reconcile；C05 已让管理端人工保存通过同一 CAS 文件仓储与 before/after audit，保存后不再触发 `content:gen`。旧工作站发布和其他正本写入口仍待 C11 盘点收敛。

### 11.2 发布清单与上线事实

**2026-09-27 修正口径**：管理执行请求必须带与当前目标/文件 hash/公开投影 hash 一致的 `PREPARED` 发布单。显式 L2 授权在准备与派发前均复检，撤销与阶段推进在同一 SQLite 事务排序；站主手工批准不强制创建 Agent 授权。API 与手工脚本使用同一持久锁，脚本以内部锁标识接续持有权。`COMMITTING` 覆盖 commit 与 push；脚本启动后的取消、超时、非零退出或进程树退出未证实均先记 `UNKNOWN`，本地存在 commit 不能证明远端已推送。只有派发前确定失败才能记 `FAILED`，线上 hash 确证后才能记 `PUBLISHED`。`public-manifest.json` 含构建 Git 标识，为构建产物，不作为内容提交路径；`graph.json` 随内容投影提交。

`ContentRelease.stage` 状态：`PREPARED → COMMITTING → PUSHED → VERIFYING → PUBLISHED`；阶段失败为 FAILED，效果无法确定为 UNKNOWN。普通迁移不允许跳阶段，PUBLISHED 只可从 VERIFYING 到达，且持久 `verifiedHash` 必须匹配批准的 `sourceHash`，同时记录 `verifiedAt`。失败保留已完成阶段、commit 和 manifest，重试先查已有事实，不重新提交同一内容。

1. 预检生成清单：实际目标正文 hash、所有将提交的内容路径、派生产物 hash、目标分支和已批准动作。首期单篇发布发现其他文章或 support-config 改动，返回 `release-scope-conflict` 并展示阻塞路径；不将它们悄悄加入批准范围。
2. 取得工作区发布锁，重新检查清单/授权/必填字段/暂存区。只允许清单内内容与必要生成物进入提交；预检后多出的变化导致失效。现有 pathspec 和“不夹带代码”保护保留。
3. 调固定发布脚本完成构建、commit、push，记录 commit。命令只含受控参数，公开输入只走 SDK 数据通道。`exitCode=0` 最多表示脚本步骤成功。
4. 构建产出公开 manifest，包含 build 标识、公开内容集合 hash 和每篇公开版本 hash；文章 HTML 同时带自身内容 hash。核验线上 manifest 与目标文章版本一致，且不是缓存中的旧版本，才认定已上线；只匹配标题不够。
5. 将该次构建的只读内容快照放入持久数据目录，核验 hash 后原子切换公开索引指针。`assistantIndexState` 独立于 website `stage`；若网页已上线而索引切换失败，保留 `stage=PUBLISHED` 与 `assistantIndexState=FAILED`，显示“网页已上线 / 问答同步失败”，不能声称全部成功。

### 11.3 三个版本与安全收窄

后台用 `ContentVersionSnapshot` 分别显示 `workingHash`（当前编辑文件）、`publishedHash`（线上 manifest 核验通过的正文）和 `indexedHash`（当前激活问答快照中的正文）。三者从各自真相源推导，不互相覆盖；网页已发布但问答未同步时，三个 hash 可以不同并分别解释。public snapshot 是正本派生产物，复用 shared 构建和图谱规则，不新写一套抽边/引用逻辑。API 公共索引与服务公开请求的 MCP 能力均不得读取工作草稿快照；本地私有开发工具另有明确来源。

`publishedHash` 取最近一次已确证的 `PUBLISHED` 记录，不被较新的 `PREPARED`/`FAILED` 尝试遮蔽。工作文件 hash 与公开投影 hash 口径不同，页面判断是否有待发布修改时使用预检返回的公开投影 hash。

访客请求带页面版本用于一致性校验，不能借此选择任意历史内容。首期若页面版本与当前可用公开索引不同，显示更新提示并走安全规则回答；保留快照供核验，不向访客开放历史版本查询。撤销 readable/citable 或禁用位置立即进入服务端拒绝集合，下一次请求即收窄，不能等静态部署；之后发布新快照清除过期投影。

首次启用必须从线上实际部署的 Git 版本构建并核验快照；无法证明当前线上版本时，相关动态问答保持规则模式，不能用脏工作区冒充线上基线。公开站点下线旧页面/旧构建本身属于发布动作，不宣称 API 拒绝就已删除 CDN 上的静态内容。

## 12. 访客数据、日志与运营统计

### 12.1 对话与事件协议

浏览器首次发送前展示采集说明；服务端签发匿名会话标识，保存在同源 Secure/HttpOnly/SameSite cookie，服务端存其哈希。前台无管理凭据；Origin/CSRF 校验、速率限制和归属验证共同保护有状态接口，不能仅凭 conversationId 访问历史。

一次输入含 clientMessageId 和 requestKey，重复请求返回同一 turn/run；明确“重新生成”创建新 attempt。业务 Conversation 跨 Agent 切换保留时间线，但 SDK 上下文分支隔离。SSE 使用既有裁剪输出，补充 accepted、delta、done、error 的版本化载荷，含 messageId/runId；原始 JSON、模型内部思考和管理工具载荷不外发。

done 内容经过最终输出合同与引用校验，整体替换临时流式文本。记录生成、开始发送、客户端确认、断流和未知；客户端 ack 仅证明收到完成消息，不等于阅读/满意。中断时保存实际已发送的裁剪片段并标 partial，不能伪造完整答案。刷新恢复读取业务消息，不重放原始 trace。

交互事件限制在 AI 部件：介绍展示/关闭、打开、发送、追问、切换、引用点击、反馈。每个事件有唯一 eventId、客户端发生时间和服务端接收时间；服务端推导可信 run/版本关系。位置属性、点击目标只收白名单 ID，不采页面任意 URL 查询参数或全站点击流。

### 12.2 可靠记录与删除

- 关键授权、批准、写入、发布、导出、删除先形成持久审计；无法落地则拒绝相关动作。trace 写入失败不能成为绕过审批的理由。
- 已产生的回答允许在诊断/消息保存失败时返回。助手指标与面板事件使用 SQLite 同目录的受控磁盘补写队列（上限 20MiB、TTL 24 小时），按稳定 eventId 幂等补写；磁盘不可用或超限则丢弃并记录告警，健康查询将精确丢失量标未知。回答正文不会写入 spool。关键授权、批准、写入、发布、导出、删除等操作审计继续失败关闭。
- 用户问题在进入 SDK 前过滤明显密钥/联系方式等敏感模式，避免原生会话另存未脱敏副本；脱敏不是完美识别所有个人信息。模型 provider 凭据经配置通道供 SDK 使用，不记入会话正文。最终面向用户展示与业务存储采用同一安全文本。
- Harness session、fork、应用 trace、补写队列与业务 Conversation 建立资源登记；不能仅清理 AssistantRun。停止相关运行后删除正文、事件正文副本、搜索索引与原生会话，删除期间禁止补写重新生成数据。
- 默认明细保留 90 天，可缩短；不可回连聚合默认 365 天并单独缩短。删除任务分阶段重试并保留 tombstone。恢复备份后先重放删除和到期清理，再开放读接口；备份本身有到期策略。已由站主导出的外部副本不能声称已撤回。
- V17 的 `ConversationLogResource` 登记逻辑 resource type/key、可选 Conversation owner、parent key 与源资源创建时间；native/session/trace 等真实路径由对应 adapter 从受控 ID 推导，客户端不传路径。`expiresAt` 运行时按当前 policy 计算，不将会漂移的到期时刻复制到每条资源。`DeletionTombstone` 不设 Conversation 外键，资源 owner 删除后仍保留到清理完成。
- V18 的 `ConversationDeletionService` 先事务提交唯一 tombstone 和无正文审计，再停止关联公开 run，按登记顺序清文件与数据库副本，最后原子移除 Conversation 并完成 tombstone。中断阶段由启动恢复和 30 秒恢复轮询继续；清理失败保留墓碑进入 `blocked`，同一 DELETE 可人工重试。墓碑阻止新会话读写、资源登记与 spool 回放；公开 run 停止未获退出证明时不开始清正文。文件路径仅由资源类型、revision 与 opaque key 推导，拒绝越界与 symlink。
- V19 在 V18 删除正文前将 tombstone ID/Conversation ID/请求时间原子写入本机无正文清单，可配置盒外副本；任一已配置副本写失败则任务 `blocked`，不开始内容清理。SQLite 备份用 `VACUUM INTO`，附数据库/清单 SHA-256、完整性校验和 30 天过期时间。restore marker 下 main 在 `listen` 前导入清单、恢复 tombstone、运行 retention cleanup 并确认每条清单项完成；中途失败保持 marker，API 启动时不监听，已运行服务会返回 503。Windows backup/restore PowerShell wrapper 已写但未在目标服务器执行；生产存储副本与过期策略未配置。
- V20 通过只读 `/ops/conversations` API 回看保留期内访客会话；筛选由 SQL repository 在服务端执行，更新时间/id 构成稳定 cursor。查询始终排除所有 tombstone 并按当前 `detailRetentionDays` 过滤。共享 DTO 返回逐轮消息、引用、Agent 修订、Run/Event 和交互事件；nullable token 保留未知值。管理 Records 以 URL 驱动筛选和分页；公共 Assistant controller 不提供全局会话查询。
- V21 的管理导出走 `POST /ops/exports`、`GET /ops/exports/:id` 和鉴权下载。创建时以同一 V20 SQL 筛选器捕获最多 10,000 个会话 ID、筛选值、请求时刻和 detail retention cutoff；异步生成只读取该集合，并按快照时间过滤已追加的轮次/消息/交互。CSV 输出等宽 metadata 行和一会话一行摘要，JSON 输出逐轮明细；字符串二次复用 shared `redactSensitive`，CSV 单元格全引号并转义 `= + - @` 公式前缀。结果写入 `data/exports/<opaque-id>.<format>`，临时文件关闭后 rename；HTTP 管理鉴权且 15 分钟后返回 410。本机文件大小按下载时 stat 计算，到期时间由 `snapshotAt+15m` 推导，不在 Job 表重复存储。Job 最小字段为格式、状态、脱敏筛选 JSON、快照时间、保留截止、行数和安全错误码；`ConversationLogResource` 按每个入选 Conversation 绑定同一 parent job，删除任一命中会先清文件、撤销 job 并删全部关联，到期/撤销时清空筛选快照。export 独立 15 分钟 TTL，不进入普通 90 天会话资源清理，以免误删整个会话。审计只写操作 ID、action/outcome，不写筛选文本或对话正文。外部下载副本无法远程撤销。
- V22 公开面在 Nest `AdminTokenMiddleware.exclude` 与 Caddy matcher 固定为 13 条既有必要方法/路径；相同合同由 `public-route-boundary.test.ts` 静态对照，所有 `/ops`、`/admin` 与内容写方法留在管理面。未被 Web 使用的 `GET /support` 不再通过 Caddy/Nest 公开白名单，Web 页面使用 build-time `support-config.json`。`SameOriginMiddleware` 全局覆盖 POST/PUT/PATCH/DELETE，阻断任意新管理写路由漏掉 Origin 校验；无 Origin 仍允许脚本调用，浏览器请求须同源或匹配精确 `WALKER_PUBLIC_ORIGINS`。Nest 不开全局 CORS；Web/Admin Vite 代理 `changeOrigin:false` 保留浏览器 Host。生产同源反代需配置 `WALKER_PUBLIC_ORIGINS=www.iwalk.pro`。Caddy CLI 未安装，本机只完成 matcher 与 Nest 路由/方法一致性测试，未做公网部署核验。
- 保留策略默认 detail 90 天、不可回连 daily aggregate 365 天；管理策略只能缩短到 1 天以上。当前代码没有持久化 daily aggregate 实体；为未来汇总资源独立保留期限槽位。
- 问题转 Action 只保存必要摘要和 conversation/message 引用，原文仍有自己的保留期限；删除后证据链接显示“已删除/已过期”。禁止通过复制完整会话到 Action 绕过删除。站主另行创作的公开内容不作为会话日志自动级联删除。

### 12.3 查询与指标

后台按时间、内容、位置、Agent 修订、运行状态、关键词查询，游标分页默认 50 条、最大 100；导出异步按相同服务端筛选、ID 集合与 cutoff 生成，首期限 10,000 会话/次，不截断。CSV 做公式注入转义，JSON 保留字段类型；文件 15 分钟后过期，下载需鉴权。导出文件以 V17 资源登记接入会话删除；过期清理由导出 job TTL 处理，不沿用通用会话资源 90 天策略。

| 指标 | 定义与限制 |
|---|---|
| 会话/提问量 | 按唯一 conversation/已接受用户 message 计数；重新生成不算新问题 |
| AI 成功与降级 | 有效模型终值为 AI 成功；规则回答单列；失败/取消/未知分别统计 |
| 交付确认率 | 获 ack 的完成消息 / 已发送 done 消息；不是阅读率 |
| 有效反馈与后续行动 | 带反馈的消息及由证据产生的 Action/完成次数；无反馈不等于满意 |
| 延迟与用量 | 排队、首字、总耗时分开；token 来源与缺失覆盖率可见，未知不计作 0 |
| 内容与复盘 | 编辑/上线/索引版本、到期事项、一次更新前后同窗口指标；不自动归因为 Agent 提升 |

首期没有全站访客分母或稳定跨设备身份，不展示伪造的全站转化率/留存率。数据用于找问题、更新内容、验证一次尝试，再逐步积累方法论。

### 12.4 提醒与复盘落地

每 5 分钟扫描到期且未完成/未忽略的 Action，启动恢复时立即补扫；以发生记录唯一键消除重复，不通过模型判断是否到期。仅设置日期的事项按站点时区当日 00:00 到期，默认 Asia/Shanghai；时间点存 UTC，同时保留生成该时间点的时区。延后原子更新 plannedDate/下一发生时间，完成或忽略保留历史发生记录；对同一内容和同一提醒规则的创建请求使用稳定幂等键，避免两次点击产生两条规则。首期先做单次提醒，重复规则字段可预留，未实现时不展示开关。

ReviewEntry 由站主或有明确授权的后台操作创建，Agent 只能先给建议。记录本次 Action、已核验发布版本、观察窗口和下一次尝试；下一次尝试需显式转为 Action，不能在生成复盘时自动发布内容。采集缺口和样本量一并展示，便于判断这次更新有没有可用证据。

## 13. 前端与 API 落点

后台资源面：概览、内容、Agent、运营记录；设置放凭据、保留期限、容量等低频项。Refine 适配器映射后端分页/错误码；assistant-ui 的 stop 只发送停止请求并展示 STOPPING，不乐观标取消。文章编辑器保留 expectedHash 和版本差异；项目/小店未接通的操作不显示可执行。

以下是**待落地**的 Nest 路径草案，浏览器调用加 `/api` 代理前缀；实施时登记 [API 契约](../api/README.md)，不宣称现在能调用。新增 `/ops` 命名空间避开现有动态路由冲突。

| 面 | 路径/方法 | 主要合同 |
|---|---|---|
| 管理 | `/ops/capabilities` GET | 框架阶段即提供已实现/未接入/不可用状态；不泄露配置秘密，客户端开关不能替代鉴权 |
| 管理 | `/ops/agents` GET/POST；`/:id/revisions` POST | 建身份/修订，禁止修改历史修订 |
| 管理 | `/ops/deployments` GET/POST/PATCH | 位置、成员、默认项、generation CAS；测试结果须匹配配置 hash |
| 管理 | `/ops/runs` POST/GET；`/:id` GET；`/:id/stop` POST | 服务端确定后台来源，幂等请求、分页、真实终态 |
| 管理 | `/ops/grants` GET/POST；`/:id/revoke` POST | 明确动作/范围/有效期，撤销可重复 |
| 管理 | `/ops/content-changes` POST；`/:id/approve`、`/:id/apply` POST | 候选/审批/应用分开；审批绑定 action/target/baseHash/candidateHash/grantId+revision；人工保存不强制模型审批 |
| 管理 | `/ops/releases/preflight`、`/ops/releases` POST；`/:id` GET | 独立 publish 批准、实际清单、单篇范围冲突、release stage 和线上 hash 核验；assistant index 状态另列 |
| 管理 | `/ops/conversations` GET；`/:id/messages` GET；`/:id` DELETE | 筛选、脱敏、分页、异步删除状态 |
| 管理 | `/ops/exports` POST；`/ops/exports/:id` GET；`/ops/exports/:id/download` GET；`/ops/overview` GET | 筛选快照导出与真实统计；Action 沿现有接口增强 |
| 公共 | `/assistant/placements/:key` GET | 仅公开名称、默认成员、可选项、介绍和生效版本，不返回 prompt/授权 |
| 公共 | 现有 `/assistant`、`/assistant/stream` POST | 向后兼容扩展 placementKey、memberId、messageId；归属/版本由服务端解析 |
| 公共 | `/assistant/events` POST；`/assistant/conversations/:id/messages` GET | 白名单事件、同访客历史；禁止全库查找 |
| 公共 | `/assistant/conversations/:id/runs/:runId/stop` POST | 同访客、同会话、只停止其运行；不能猜 ID 停后台任务 |

公共新增项逐条同步 Nest exclude 与 Caddy 白名单，方法匹配且不开放 `/ops`。鉴权保留 Basic + 管理 token，增加严格 Origin/CSRF 防护；浏览器状态变更不能仅依赖自动附带的 Basic。错误采用既有 `{code,message}`：409 version-conflict/release-scope-conflict，403 capability-denied，429 queue-full/budget-exceeded，503 storage-unavailable；客户端只依 code 分支。

## 14. 迁移、故障核验与回退

采用扩展迁移：备份数据，新增表/列，旧历史保持只读，切换新入口后再收缩。历史 AgentUnit 生成初始修订；旧 AgentRun/SkillRun/AssistantRun 用 legacySource/legacyId 唯一映射，不制造缺失的版本、事件、token 或确认记录。既有审批/作品资产保留，接入新副作用出口时核查原候选 hash。

UI 可先只读展示现有资产，未过权限/终止门禁不开 Agent 写入。旧 HTTP 路由迁为新用例的兼容适配，不能让新旧控制器各写一遍数据。新消息只写一个业务源，旧报表通过适配读取，避免永久双写。

回退优先关闭新位置、新调用与写能力，保留手工运营和已验证公开快照；前端回退不删除新增数据。禁止通过回滚到旧无版本/无权限写路径恢复服务。数据库回退需与代码兼容并保留新增记录；不得直接覆盖生产持久目录。

| 故障注入点 | 必须观察到的结果 |
|---|---|
| 审批后候选或原文变化；同时两次保存 | 冲突，不能覆盖；重复审批执行只应用一次 |
| 写前日志后崩溃/文件替换后崩溃 | 按 before/after hash 核对并补记，无盲目重写 |
| 撤销后轮到排队任务；旧 epoch 返回 | 不产生新副作用，迟到结果不能改终态 |
| SDK close 拒绝/超时；Nest 重启 | STOPPING/UNKNOWN 与隔离容量可见，不出现双活动调用 |
| Git push 成功但响应丢失/Vercel 失败 | 查 commit/线上 hash，展示具体阶段，不重复 commit/push |
| 文章 A 发布时 B 也脏；保存后立即问答 | 阻断单篇发布；问答仍用核验快照或安全降级 |
| DB 失效/trace 满盘/补写重复 | 新付费准入降级；已生成回答可交付，采集缺口可见、去重有效 |
| 删除中仍有补写/从旧备份恢复 | tombstone 阻止正文复活，恢复先清理后开放 |

## 15. 对抗检验与剩余风险

| 红方问题 | 蓝方设计 | 剩余风险/上线门槛 |
|---|---|---|
| 访客传后台角色或要求子 Agent 写文章 | 来源服务端构造、绑定成员白名单、工具隔离、唯一写出口 | 需覆盖旧接口/所有工具，未封闭旁路不开写能力 |
| read-only dsh 仍读到了服务端密钥 | 环境白名单、无通用读工具、最小文件面和会话隔离 | SDK 实际 profile 必须验证；不满足则公共运行仅受控上下文且禁通用工具，无法证明仍不启用 |
| 模型没停，页面却允许继续运行 | await close、进程退出证据、lease epoch、隔离实例 | 杀进程树需实机探针，不以模拟测试替代 |
| 一次批准导致其他文章上线 | 发布清单 hash + 全工作区锁 + 单篇额外改动拒绝 | 锁外人工修改必须检测；未来批量发布另做范围审批 |
| 日志删了，SDK/导出/补写仍留全文 | 资源登记、分阶段删除、tombstone、备份恢复门禁 | 无法回收用户已下载到外部的副本，如实说明 |
| 换个大框架能否更快 | Refine/assistant-ui 只接 UI，Paperclip 保留为参考 | 接口和组件兼容未安装验证；失败退纯 React UI，不重写业务核心 |

## 16. 验收覆盖与证据

| PRD 验收 | 技术落点/必须提供的证据 |
|---|---|
| A01、A15、A20 | §12–13；真实空态、统计来源/未知覆盖率、未实现能力禁用 |
| A02、A03、A16、A17 | §11、14；保存/发布/索引 hash、冲突与各崩溃边界核验 |
| A04、A05、A06 | §8–10；三类测试匹配修订 hash、绑定切换与会话隔离 |
| A07、A08、A09、A19 | §9、11；公开越权、委托继承、引用集合及凭据隔离测试 |
| A10、A13 | §10；关闭/额度/排队降级、实际进程停止、迟到结果测试 |
| A11、A12 | §9、11；独立候选、审批绑定及重复执行测试 |
| A14、A18 | §8、12–13；重启补扫/去重、关闭介绍后不主动调用 |
| A21、A22、A23 | §12；连续问答、Agent 切换、重复上报、断流/ack 的端到端证据 |
| A24、A25、A26 | §12–14；相同筛选导出、采集故障恢复、跨访客/前后台隔离 |
| A27、A28 | §12、14；日志副本删除/备份恢复、证据转 Action 后到期处理 |

本次已审阅的证据包括：

- 产品与调研：[新 PRD](PRD-AGENT-OPERATIONS.md)、[固定源码快照调研](RESEARCH-AGENT-OPS-OPEN-SOURCE.md)、[资产清单](../evidence/ADMIN-REBUILD-INVENTORY.md)、根 PLAN/CLAUDE/旧 TECH-DESIGN、架构图面/API 契约。
- 运行与配置：[Harness adapter](../../apps/api/src/adapters/harness-assistant.adapter.ts)、[dsh runner](../../apps/api/src/adapters/dsh-agent.runner.ts)、[后台 runner](../../apps/api/src/agents/agent-runner.service.ts)、[Agent 配置服务](../../apps/api/src/agents/agent-unit.service.ts)、本机 SDK README.zh.md/types/package.json。
- 内容链：[内容保存](../../apps/api/src/content-admin/content-admin.service.ts)、[文件 adapter](../../apps/api/src/adapters/fs-content-file.repository.ts)、[公开索引](../../apps/api/src/adapters/fs-site-content-index.ts)、[发布服务](../../apps/api/src/content-release/content-release.service.ts)、[发布脚本](../../scripts/content-publish.ts)、[线上核验端口](../../apps/api/src/ports/website-deployment-verifier.port.ts)、工作站 publication 用例。
- 数据与接线：[Prisma schema](../../apps/api/prisma/schema.prisma)、[assistant 用例](../../apps/api/src/assistant/assistant.service.ts)、[trace 合同](../../packages/shared/src/trace.ts)、[公开路由](../../apps/api/src/app.module.ts)、[Caddy](../../ops/windows/Caddyfile)。搜索核对了 runRelease、llm.chat、content:gen、session、run/close、审批 hash 与发布调用点。

未验证：Refine/assistant-ui 安装兼容、上游 Harness 新版、真实终止/内存、真实线上发布 manifest、迁移演练。本次是方案与静态证据核查，不是这些能力的实现或验收报告。

## 17. 下一步

实施顺序见主计划「新后台重构实施顺序」和 [原子清单](../../to-do.md)。F01–F18、R01–R33、V01–V24、C01–C02 已本地验收；C01 定义 `ContentChange`、独立 `ContentRelease`、操作绑定审批及 working/web/index 三套 hash，C02 已迁移持久模型并注册仓储，下一项 C03 做内容文件 CAS。C02 尚未接管理 API、文件副作用或实际发布服务。V10 复用部署测试门槛、只读 profile、核验快照和统一执行队列；V12 在文章页按真实位置 manifest 提供访客入口，V13 增加当前部署成员切换、修订级 SDK session 分支与访客历史恢复；V14 将 Message ID 绑定到同访客 public chat run 的真实停止；V15 复用 FeatureEvent 表记录助手部件白名单事件，V16 增加 20MiB/24小时的稳定 eventId spool 回放和管理侧健康查询，V17 登记逻辑资源及分别可调的明细/聚合保留策略，V18 实现单会话 tombstone 删除，V19 将清单 replay 与到期清理置于 API 启动门内，V20 实现只读会话筛选、游标分页与后台逐轮回看，V21 实现冻结会话 ID 集的受控 CSV/JSON 导出和 15 分钟下载，V22 固定公网路由双侧合同并全局验证变更请求 Origin；V23 在启用、启用中的回退及公开模型解析前重新计算六项 readiness gate；V24 用隔离 SQLite 与假 Runtime 做端到端闭环，实际文章页在 AI 关闭时验证规则回答、刷新和返回恢复。Nest 与 Caddyfile 的源码一致性在服务内检查，生产 Caddy 实际加载状态仍由 G08 核验。当前公共位置 readiness 因本地未配置真实探针报告而保持关闭。旧 `/assistant` DTO 可省略位置但只会规则降级。生产状态仍以已部署版本为准。

2026-09-22 实施补充：R01–R09 见 [Agent 基础验收](../evidence/AGENT-CORE-ACCEPTANCE.md)。运行用例命名 AgentExecutionService，避免覆盖旧交付域 ExecutionService。对象策略暂仅开放允许引用的索引内容和当前 Agent，只读 profile 不授予模型写工具。

R10：公共启动配方在 `apps/api/src/runtime/harness-launch.ts`。访客用 `ASSISTANT_DSH_HOME` 或 `~/.dsh-assistant`，后台用 `WALKER_DSH_ADMIN_HOME` 或 `~/.dsh-admin`。子进程环境是启动白名单加 `deepseek-official` 的 `DEEPSEEK_API_KEY`；工作区是该会话目录下的 `materials`。工具 patch 关闭 dsh-base 0.1.5-rc.2 的文件、shell、网络插件，不插入 MCP。未使用 `sdk-minimal`，因为它仍公布持久 shell。真实进程探针留 R21。

R11：`RuntimePort` 在 `apps/api/src/ports/runtime.port.ts`，Harness 适配器在 `apps/api/src/adapters/harness-runtime.adapter.ts`。它要求 `@deepseek-ai/dsh-sdk-client` 与 `@deepseek-ai/dsh` 版本相同，返回文本、一次 JSON、用量和会话；坏 JSON、重复合同、传输断开和未知用量都有确定结果。R15/R18/R19 已把后台旧直调和工作站调用接入执行生命周期。

2026-09-24 V10 实施补充：`POST /assistant` 与 `/assistant/stream` 由 `PublicAssistantService` 解析注册位置、启用部署默认修订与 `SiteContentIndexPort.loadCitableSnapshot()`，然后调用 `AgentExecutionService.runPublicChat()`。执行记录固定 `origin=public`、`kind=chat`、文章资源范围、部署 ID/代次和快照 hash；模型上下文及助手历史只保存脱敏输入。public 请求无后台 grant，只读策略与快照内容准入仍在统一执行服务复核。旧 DTO 不传位置、AI 关闭、快照缺失、文章不可引用、排队/额度拒绝及运行失败均诚实返回规则回答。定向与全量 API/shared/typecheck/SQLite 迁移证据见根 `to-do.md` V10 与 §10；未部署。
