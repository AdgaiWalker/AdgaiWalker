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

## 重复事实 owner

- WorkItem 的 Decision / Action / Outcome 权威 owner 是 `WorkbenchService + WorkItemRepositoryPort`；页面只投影。
- ContentFeedback 原始事实 owner 是 `ContentFeedbackRepositoryPort`；hit-rate 和工作台只读取/派生。
- LearningRequest owner 是 `AssetService + LearningRequestRepositoryPort`；工作台只把 open/in-progress 作为待办入口。
- 系统健康 owner 是 `admin-shell-state` 推导函数；任何页面不得硬编码“系统可用”。

## 删除或未知项

- 固定 `ownerIdea`：已删除；无真实 WalkerThesis/WorkItem 时显示空状态。
- AI 无证据建议：仅会话草稿，不进入正式待决定队列。
- 未知二级导航数量：不显示徽章，不显示 0。
