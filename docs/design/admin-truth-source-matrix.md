# 后台事实源清单（S0-01）

Updated: 2026-06-21  
Scope: `/admin` 首屏与核心详情字段  
Rule: 没有事实源的字段显示空/未知，不显示 0 或“已完成”冒充真实状态。

| 区域 | 字段/状态 | Owner | Source | Freshness | Empty behavior | Error behavior | 决策 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AdminLayout 侧栏 | 系统健康 | System | `deriveAdminSystemHealth({ gatewayConfig, gatewayStats, incidents })` | 请求时 | `unknown`，显示“状态未知” | 显示 `unavailable/degraded` 与最近检查时间 | connect |
| AdminLayout 二级导航 | 工作台/决定/动作/结果数量 | Workbench | `/admin` SSR 的 `createWorkbenchService().list/getTodayProjection` 投影 | 请求时 | 不显示徽章，不用 0 冒充清空 | 不显示徽章，页面主体显示错误/空状态 | connect |
| 工作台首屏 | 今日日期 | System/UI | `Intl.DateTimeFormat(new Date())` | 请求时 | 不适用 | 不影响业务判断 | keep |
| 工作台首屏 | 7 天需求数 | NeedCase | `getNeedCaseStats({ days: 7 })` | 7 天窗口 | 显示 0 条需求（这是统计事实，不是待办清空） | 不作为核心待办依据 | keep |
| 工作台首屏 | 存储模式 | Storage | `resolveStorageMode/getRedis` 经 service/API 合同 | 请求时 | development 明确标“开发内存模式（重启丢失）” | production/preview 写入返回 503 | connect |
| 工作台队列 | 持久化 WorkItem | Workbench | `WorkItemRepositoryPort.listActive/getTodayProjection` | 请求时 | 不生成默认 Walker 主张 | API 失败不伪造成功 | owner |
| 工作台队列 | 待复盘需求 | NeedCase | `getPendingReviewNeedCases` | 请求时 | 不显示 | 不生成假事项 | connect |
| 工作台队列 | 内容反馈待办 | ContentFeedback | `findRecentContentFeedback`，仅 `needs-more/outdated` 且 `consentForAnalysis=true` | 请求时 | 不显示 | 不生成假反馈 | connect |
| 工作台队列 | LearningRequest | Asset/Learning | `findLearningRequestsByStatus('open')` | 请求时 | 不显示 | 不生成假学习任务 | connect |
| 工作台队列 | 系统事件 | Incident | `getUnresolvedIncidents` | 请求时 | 不显示 | Gateway 状态降级时仍保留事件入口 | connect |
| 工作台详情 | 原始证据 | EvidenceRef | `WorkItem.evidenceRefs` 或待办原始对象脱敏摘要 | 事实发生时间 + collectedAt | 显示“原始文本已脱敏或未保留” | 不允许进入正式决定 | owner |
| 工作台详情 | AI 提案 | Workbench/UI | 命令栏会话草稿；无 EvidenceRef 不持久化为正式决定 | 当前会话 | 刷新清空，明确“未保存” | 不允许 accepted/action | remove fake |
| 工作台详情 | 当前责任方 | Workbench | 最新 Action assignee / 无 Action 时 Walker | 请求时 | 显示“你” | 不显示 AI 自动执行 | connect |
| 工作台详情 | 下一步 | Workbench | WorkItem 状态、Action、Outcome 与 `suggestNextAction` | 请求时 | 显示需要先作决定 | 失败时保留输入并显示错误 | connect |
| 结果页 | Outcome 历史 | Workbench | `service.list({ status: 'resolved' })` | 请求时 | 空状态解释如何产生 Outcome | 不作为核心流程唯一入口 | owner |
| 资产页 | LearningRequest | Asset | `AssetService.listLearningRequests` | 请求时 | 空状态解释证据缺口 | PATCH 失败保留输入 | owner |
| 命中率页 | 阅读深度（readingOutcome） | ContentTelemetry | `hit-rate.service.buildContentOutcomeSummaries` 第三组，源 `findRecentContentTelemetry` | 请求时 | completionRate=null 显示"暂无阅读信号"，不返 0% | 无反馈不冒充失败 | connect |
| 命中率页 | 内容阅读结果（contentOutcome） | ContentFeedback | `findRecentContentFeedback` 聚合 | 请求时 | usefulRate=null | 不合并分母 | connect |
| 工作台队列 | AI proposal 过期 | Workbench | `WorkItem.expiresAt`（queue=ai-asset）；`getTodayProjection` 过滤过期项 | 请求时 | 过期项退出今日投影（不删，留审计） | 不过期项正常显示 | owner |
| Skill 页 | 注册护栏字段（boundary/反例/evalSet） | Asset | `SkillCandidate.applicableBoundary/failureBoundary/negativeExamples/evalSet`；`validateSkillRegistration` 两路径共用 | 注册时 | 缺字段返回 missing-boundary/counterexample/eval-set（409） | 不允许无护栏注册 | owner |
| Skill 页 | 暂停/回滚状态 | Asset | `SkillCandidate.paused/pausedReason/admissionSnapshots`；`pauseSkill/rollbackSkill` | 请求时 | admitted 未暂停正常显示 | 暂停项不被 Agent 调用 | owner |
| 授权页 | Contributor grant | ObjectGrant | `ObjectGrantRepositoryPort`（findAllObjectGrants）；`canAccessAdminResource` 消费 | 请求时 | 无 grant 显示空列表 | 无 grant 的 user 访问受保护端点返回 401 | owner |
| 授权页 | 操作审计 | ActionAudit | `ActionAuditRepositoryPort.findRecent` | 请求时 | 无审计显示空 | 审计写失败不影响判定 | connect |

## 重复事实 owner

- WorkItem 的 Decision / Action / Outcome 权威 owner 是 `WorkbenchService + WorkItemRepositoryPort`；页面只投影。
- ContentFeedback 原始事实 owner 是 `ContentFeedbackRepositoryPort`；hit-rate 和工作台只读取/派生。
- ContentTelemetry（阅读深度）原始事实 owner 是 `ContentTelemetryRepositoryPort`；hit-rate readingOutcome 只派生，不与 match/content 合并分母。
- LearningRequest owner 是 `AssetService + LearningRequestRepositoryPort`；工作台只把 open/in-progress 作为待办入口。
- ObjectGrant/ActionAudit owner 是对应 RepositoryPort；授权页与受保护端点只读取/判定。
- 系统健康 owner 是 `admin-shell-state` 推导函数；任何页面不得硬编码"系统可用"。

## 删除或未知项

- 固定 `ownerIdea`：已删除；无真实 WalkerThesis/WorkItem 时显示空状态。
- AI 无证据建议：仅会话草稿，不进入正式待决定队列；AI 来源 proposal 有 expiresAt，过期退出今日投影。
- 未知二级导航数量：不显示徽章，不显示 0。
