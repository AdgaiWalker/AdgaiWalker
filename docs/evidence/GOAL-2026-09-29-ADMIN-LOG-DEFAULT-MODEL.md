# Goal Document: 后台操作日志与 Agent 默认模型

## Go / No-Go
- **Judgment**: Go。已有管理鉴权、SQLite 和运营记录工作面，可接入一条可查询的请求时间线。

## Target Outcome
人工触发的 Nest 管理请求留下不含敏感载荷的时间、方法、路径、结果及耗时；自动定时轮询不算人工操作。站主可在运营记录查看。Agent 未明确配置模型时，试跑和公开运行解析到当前系统默认提供方与模型。

## Goal Definition
- **Type**: 产品与技术。
- **Boundary**: 本地后台人工触发的管理 API 请求（含读取及失败）；定时后台轮询另作运输噪声排除。Agent 修订和 Agent 专属配置的默认继承。
- **Non-goals**: 访客请求、浏览器纯本地点击、模型原始提示词与响应全文的访问日志、生产部署。
- **Deferred work**: 日志归档/保留周期由部署容量实测决定。
- **Verification rule**: 管理请求产生可查询记录；记录无查询串、请求体或凭据；未配置模型的运行解析与系统默认一致，默认变化会使旧发布测试失效。
- **Evidence source**: API/前端测试、SQLite 隔离测试、本地浏览器、仓库门禁。
- **Pass criteria**: 正常与失败请求均有记录，列表可分页；显式模型仍保持；默认继承不使用硬编码模型。
- **Confidence note**: 测试覆盖请求边界与解析函数；本地浏览器验证展示。
- **Judgment owner**: 自动化测试与本地验收。

## Current State
- `AuditRecord` 保存业务审计事实，没有后台逐请求时间线。
- Agent 配置页没有清晰的默认继承选项；修订的 `modelId` 必填，启动时优先用修订模型。
- 工作区有未提交改动，必须原样保留。

## Priority Rationale
先确认记录边界和敏感字段，再写日志入口；先固定默认解析，再改表单文案。

## Assumptions and Open Decisions
| Item | Status | Impact | Owner / Next step |
|---|---|---|---|
| “每一步”指后台 API 请求，不包括纯前端 hover/滚动 | assumed | 定义日志覆盖范围 | 本轮按此实施 |
| DB 故障时日志也可能无法写入 | confirmed | 无法宣称绝对无遗漏 | 日志写入失败须显式报错/诊断 |

## Phases
### Phase 1: 请求时间线
- **Purpose**: 建立统一可查询记录。
- **Entry condition**: 既有管理鉴权与 SQLite 可用。
- **Phase rules**: 不存请求/响应载荷或 query；不用业务 `AuditRecord` 混装访问日志。
- **Todos**:
  - [x] 添加隔离数据库记录与查询测试；证明成功、失败及敏感信息剔除。
  - [x] 增加持久模型、管理请求记录入口和分页查询。
  - [x] 在运营记录增加后台日志标签。
- **Exit proof**: API、admin 测试与浏览器复核。
- **Stop condition**: 记录机制会泄露凭据或阻断恢复入口。

### Phase 2: 默认模型
- **Purpose**: 未配置时使用系统当前默认。
- **Entry condition**: 明确显式与继承的表示。
- **Phase rules**: 显式修订选择不被覆盖；运行与发布测试用同一解析器。
- **Todos**:
  - [x] 写解析与清除独立配置的失败测试。
  - [x] 实现默认继承并更新 Agent 页面。
- **Exit proof**: 默认切换后实际解析和发布测试指纹同步改变。
- **Stop condition**: 旧已配置修订语义被改变。

## Dry-Run Findings
- 逐请求日志与业务审计生命周期不同，需要独立表。
- 新路由必须保留管理鉴权；生产不部署。

## Final Validation
类型检查、shared/API/web/Agent/admin 测试、admin/web 构建、GEO、文档与部署门禁，本地浏览器复核。

## First Execution Step
为请求日志存取和默认模型解析写 RED 测试。

## 实施与验收结果（2026-09-29，仅本地）

- **RED**：`GET /ops/admin-log` 原为 404；未选提供方的旧草稿模型错误覆盖系统当前默认；清除 Agent 专属提供方仍保留旧模型字段。
- **GREEN**：`AdminRequestLog` 独立表和第 26 条迁移；认证后的管理请求先写开始、后写状态/耗时，路径取 Express 路由模板；失败 4xx/5xx 也记录。日志开始不可写时返回 503 且业务不执行，完成状态未补记时保留“进行中 / 待核对”。定时读取带后台轮询标记，不作为人工操作写入；变更请求即使伪造该标记仍照常记录。`GET /ops/admin-log` 支持分页和方法筛选；运营记录默认显示变更请求，可切换全部。未配置提供方的修订在运行与发布测试共用解析器中取共享默认模型；Agent 专属配置可清除并跟随以后默认变化。
- **浏览器**：本地 `/records?tab=admin-log` 展示一次无效创建请求 `POST /ops/agents`、状态 400、耗时 2ms；Agent 详情显示系统默认提供方、模型、API 地址及协议。
- **本地数据库**：先用 SQLite `.backup` 备份开发库到 `/tmp/walker-dev-before-admin-log-20260929.db`，完整性检查 `ok`；随后只应用 `20260929130000_admin_request_log`。生产库未操作。
- **门禁**：`pnpm typecheck`；shared 378、API 全量、web 全量、Agent 30、admin 90 项测试；`build:api`、`build:admin`、`build:web`、`verify:geo`、`verify:docs`、`verify:architecture`、`verify:deploy` 15/15、K6 隔离演练（26 迁移 / 46 表备份回退）和 `git diff --check` 全通过。
- **边界**：这是人工触发的管理 API 请求日志，不捕获浏览器内未发请求的 hover/滚动；业务内部阶段仍由各业务审计/运行事件承担。后台自动轮询不写入（实测 8 秒内日志行数保持 1806 → 1806）；未制定自动删除策略，生产容量需在 G07/G08 复核。
