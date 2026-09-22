# 后台重构前资产清单

记录日期：2026-09-21。依据当前工作区代码（包含尚未提交的修改），不是仅依据旧 PRD。

当前状态：站主确认仅清空管理界面。旧 src、样式、组件、导航、前端 API 门面及测试已移除；仅保留空白 Vite 启动骨架和 API 代理。API、数据库、文章、共享规则保留。本文是旧系统资产记录，不是新后台需求或必须恢复的待办清单。生产部署未变更。

## 已有界面与能力

| 区域 | 旧入口 | 现有能力 | 依赖接口 |
|---|---|---|---|
| 计划 | `/plan`，默认首页 | 任务排期、日历、完成/撤销/改期/删除、下一动作、执行交付与检验 | `/actions`、`/admin/plan/calendar`、`/admin/plan/next`、`/executions` |
| 内容 | `/content/ledger`、`/content/detail/:slug` | 文章/项目分栏、筛选搜索、源码编辑保存、阶段与字段门禁、上线预检、触发发布、运行事实时间线 | `/admin/content`、`/admin/content/ledger`、`/admin/content/release`、`/runs/:runId/trace` |
| 复盘 | `/review` | 助手提问、卡口输入、搜索未命中、内容反馈四类信号；聚类、频次、缺口、检查器 | `/insights/signals`，以及线索/题苗相关接口 |
| 题苗 | `/seeds`（深链） | 选题维护、线索关联、人工主选与 brief | `/seeds`、`/clues` |
| 执行 | `/executions`（深链） | 执行列表、提交交付链接、检验结果 | `/executions` |
| Agent | `/settings?item=agent` | 角色与提示词、模型绑定、文件直调、运行结果、耗时/token/轨迹 | `/agents`、`/model-providers`、`/runs/:runId/trace` |
| 模型 | `/settings?item=models` | 供应商配置、模型目录、连通与鉴权/能力验证、调试及对比调用 | `/model-providers`、`/agents/:id/try`、`/agents/:id/compare` |
| 技能 | `/settings?item=skills` | 技能目录、要求与参数、运行统计、自检、导出包 | `/skills` |
| 健康 | `/settings?item=health` | API / 数据库 / AI 开关与网关健康信息 | `/health` 及观测接口 |
| 观测 | `/settings?item=usage` | 使用排行、AI 用量、降级原因、预算、访客旅程 | `/admin/usage/stats`、`/admin/ai/stats`、`/admin/journey` |
| 结构 | `/settings?item=structure` | 知识图谱孤岛/坏链检查、代码依赖体检与基线对账 | `/graph/health`、`/architecture/health` |
| 通用壳 | 全站 | 导航、命令面板、旧路径重定向、错误/加载/空态、请求封装、轨迹组件 | 管理鉴权、共享契约 |

## 接口中仍有、不可直接视为现行页面的能力

管理 API 门面保留作品创建与原稿/附件上传、加工/取消、手工产物接收、审阅包、按 hash 审批/退回、网站准备与线上验证、微信草稿包、导出；还有工作台快照、指标、洞察报告生成与建议转题苗。旧工作站与流水线路由已经重定向到计划，不能据接口存在宣称这些都能从当前界面操作。

## 数据与复用资产

- `content/log`：文章原文与 frontmatter 的唯一真相源。
- `apps/api/prisma/schema.prisma` 及本地/服务器数据库：线索、题苗、执行、任务、发布、观测、模型与智能体配置等过程事实。
- `data/runs/<runId>/trace.jsonl`（实际目录由运行配置决定）：运行轨迹；原稿、附件、审阅候选与导出物也需保留。
- `skills/`：技能文件；`packages/shared`：业务纯函数、校验与跨端契约。
- `scripts/content-publish.ts`：现有内容发布出口；内容生成、预渲染与图谱生成脚本仍服务访客站和 agent。
- 环境配置、凭据与主密钥不写进本清单、不复制进版本库。

现行关键约束：保存不等于发布；主选/审批/发布由人触发；AI 权限 fail-closed；失败如实报告；访客站和 MCP 与管理端共用部分 API/契约，删除管理端不自动等于删除这些底层能力。

## 删除时需要同步处理的连接点

- 根 package.json 的 dev:admin / build:admin、pnpm workspace/lockfile。
- 类型检查、旧验收脚本、代码图谱生成产物与架构门禁。
- Windows Caddy 的管理静态目录与启动前检查（不能因移除 admin 构建产物使公开网关无法启动）。
- AGENTS.md、PLAN.md、docs/ARCHITECTURE.md、STATUS、产品与后台 PRD/设计/执行文档的有效状态。
- 本地 5174 服务及旧 dist 产物，避免源码删了旧页面仍在运行。

## 重构前代码索引

以下路径是盘点时的位置；删除后可能不再存在。此处记录用途，不要求照原结构重建。

- `apps/admin/src/pages/AgentWorkbenchPage.tsx`
- `apps/admin/src/pages/AiGatewayPage.tsx`
- `apps/admin/src/pages/CodeStructurePage.tsx`
- `apps/admin/src/pages/DataPage.tsx`
- `apps/admin/src/pages/DebugPanel.tsx`
- `apps/admin/src/pages/ExecutionsPage.tsx`
- `apps/admin/src/pages/GraphHealthPage.tsx`
- `apps/admin/src/pages/ModelDirectoryPanel.tsx`
- `apps/admin/src/pages/NotFoundPage.tsx`
- `apps/admin/src/pages/SeedsPage.tsx`
- `apps/admin/src/pages/SkillPackPanel.tsx`
- `apps/admin/src/pages/agent/ModelsPage.tsx`
- `apps/admin/src/pages/agent/SkillsPage.tsx`
- `apps/admin/src/pages/content/ContentFacePage.tsx`
- `apps/admin/src/pages/content/ContentFacts.tsx`
- `apps/admin/src/pages/content/ContentInspector.tsx`
- `apps/admin/src/pages/content/ContentListPane.tsx`
- `apps/admin/src/pages/content/GatePanel.tsx`
- `apps/admin/src/pages/content/StageBadge.tsx`
- `apps/admin/src/pages/plan/ExecutionSheet.tsx`
- `apps/admin/src/pages/plan/NextActionsPanel.tsx`
- `apps/admin/src/pages/plan/PlanPage.tsx`
- `apps/admin/src/pages/review/ReviewFacePage.tsx`
- `apps/admin/src/pages/review/ReviewInspector.tsx`
- `apps/admin/src/pages/review/ReviewListPane.tsx`
- `apps/admin/src/pages/settings/SettingsFacePage.tsx`

## 数据模型名称（仅结构盘点，未读取用户记录）

`SchemaMeta`, `Clue`, `Seed`, `SeedClueLink`, `Execution`, `Submission`, `Action`, `Publication`, `GuestQuota`, `FeatureEvent`, `LikeCounter`, `ContentFeedback`, `SearchMiss`, `AssistantSession`, `AssistantRun`, `AssistantBudget`, `Credential`, `InsightReport`, `ModelProvider`, `AgentUnit`, `SkillRun`, `AgentRun`

## 本次清空记录

移除旧 src 文件 70 个。未提交源码的本机恢复副本：`/Users/happy/.codex/backups/walker-admin-20260921-194500.tar.gz`（仓库外，不含环境配置、数据库或文章）。

旧 `accept` 浏览器验收包含已退役页面，不再作为当前验收命令；后台重构后须重新定义界面验收。

## 本次验证结果

- 通过：全仓 typecheck、shared 251 项测试、web 212 项测试、agent 测试、admin 空白构建、web 构建、架构门禁、GEO。
- API 测试未执行到用例：独立 `walker.test.db` 初始化时 Prisma 报 `Schema engine error`，globalSetup 退出。未修改 API 代码或开发数据库来绕过。
- 运行检查：5174 旧路径返回空白入口；8788 与 5174 代理 health 返回 `ok=true, db=true`。
- 全仓 diff 空白检查另报既有 `packages/shared/src/next-actions.test.ts` 末尾空行；本次未改该文件。
- 未提交、未推送、未部署；线上后台不受此次本地清空影响。
