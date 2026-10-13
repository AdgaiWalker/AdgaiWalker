---
status: active
type: contract
title: Nest API 契约
last_verified: 2026-09-25
ssot: true
applies_to: [api, admin, web]
---

# Nest API 契约

> **2026-10-12 本地运行监控，未部署**：新增三个只读端点 `GET /ops/runtime/{metrics,requests,logs}`（管理鉴权内、不进公网白名单）。数据来自**进程内**缓冲：请求明细最近 200 条、日志 800 行，进程重启即清零——这是「刚刚发生了什么」，不是历史归档。`ch` 只接受 task/chat/sys，`limit` 越界或非法一律 400（不静默兜默认值），`errorsOnly=1` 在服务端过滤，前端不做本地回退。请求记录只含时间、方法、路由模板、状态与耗时，**不含 query、请求/响应载荷与凭据**。采集 fail-open：读不到就是读不到，不影响业务；比率分母为 0 时返回 `null`，界面显示「—」。

> **2026-09-29 转事项幂等语义，本地未部署**：`POST /ops/conversations/:id/action` 的请求/响应形状不变。Action 与审计同事务写入；同一 `requestKey` 已提交则返回原事项和 `replayed:true`，审计失败会回滚事项。迁移前拒绝已有非空重复审计键。客户端对结果不明只原样同键重试，放弃核对须站主显式确认。

> **2026-09-28 本地首页小影**：公开位置 `home-xiaoying/site-public` 已登记。`GET /assistant/placements/:placementKey/:scopeSlug` 和同范围历史、`POST /assistant/stream`、`POST /assistant/events`、ACK 沿用现有路由；首页范围要求 `scopeSlug=site-public` 且快照存在可引用文章，引用 slug 仍须属于该快照。API 重启后未在本进程绑定的旧 SDK session 使用完整公开快照新建；SSE 完成后的 ACK 仅对 `assistant-message-not-sent` 短暂重试。仅本地启用，生产未部署。

> **2026-09-25 新后台本地实现**：产品行为见 [PRD v0.2](../specs/PRD-AGENT-OPERATIONS.md)，原子顺序见根 [to-do.md](../../to-do.md)。F 框架、R Agent 管理、V01–V24 访客问答/事件/日志保留、删除/恢复、只读回看、受控导出、公网边界、启用前 readiness 和隔离数据库端到端验收已本地完成；C01 定义内容候选/审批/发布 shared 合同，不代表内容写入端点已接通。当前本地 API 未配置运行报告路径，readiness 按缺少真实证据阻断。生产状态不因本地 API 路由而改变。

> 联调与实现的接口权威。历史分析见 [`archive/ANALYSIS.md`](../archive/ANALYSIS.md)；怎么打见 [`INTEGRATION.md`](./INTEGRATION.md)。
> 产品行为以 `docs/specs/PRD-AGENT-OPERATIONS.md` / `docs/PRODUCT.md` 为准。分层以 `docs/ARCHITECTURE.md` 为准。
> **Nest 无全局 `/api` 前缀。** 浏览器 `/api/health` → 上游 `GET /health`。

**状态图例：** 已落地 = 代码里有、可联调。待落地 = 本文设计、实现前前端不得假装已有。

---


## 新后台只读接口（F01–F18、V20，本地已验收、未部署）

全部走现有管理鉴权，不在公开白名单内；浏览器调用统一加 `/api` 代理前缀。

本地运行监控（2026-10-12，只读、进程内、fail-open，未部署）：

运营活动流（2026-10-12，只读聚合，未部署）：

| 方法与路径 | 返回及边界 |
|---|---|
| `GET /ops/activity?kinds=visitor,reminder,review,run,admin&before=<ISO>&limit=1..50` | `{events,sourceLimit,next}`；每条事件 `{key,ts,kind,severity,title,detail,provenance:{kind,id,ref},isTodo}`。**读取时投影**（run/会话/提醒箱/复盘/AdminRequestLog 的归并），不落库、每条带 provenance 回指；待办提醒用占位时间戳 `9999-12-31T23:59:59.999Z` 置顶；分页是时间游标（每源最近 30 条参与归并，深处稀疏不均——如实声明，翻深建议按类型筛）；kinds 出现未知值、limit/before 非法一律 400 |
| `GET /ops/activity/counts` | `{remindersPending,answersDegraded,runsFailed,releaseWorkingAhead}`；**全部来自 `/ops/overview` 的 7 天口径**（answers 系列 7 天窗口；工作区领先数无确证发布事实时为 null，不是 0）；本端点不发明任何新统计 |

| 方法与路径 | 返回及边界 |
|---|---|
| `GET /ops/runtime/metrics` | `RuntimeMetrics`：startedAt/uptimeMs/completed/failed/interrupted/inFlight/successRate/avgDurationMs/droppedLogLines/droppedRequests。`completed` 只计有真实 HTTP 结果的请求（**中断不计入**），`successRate` 与 `avgDurationMs` 在分母为 0 时是 `null`（不是 0） |
| `GET /ops/runtime/requests?limit=1..200&errorsOnly=0|1&humanOnly=0|1` | entries 逐条 {ts,method,route,status,outcome,durationMs,requestId,background}，按时间顺序（旧→新）取最后 limit 条；`route` 是路由模板，匹配不到为 `[unmatched]`，**不含 query**；`outcome` ∈ success/redirect/client_error/server_error/interrupted；`background=true` 表示自动轮询/发布预检（判据与后台日志共用 `auth/admin-background-request.ts`），`humanOnly=1` 在**服务端**滤掉它们；limit 越界或非法 400 |
| `GET /ops/runtime/logs?limit=1..500&ch=task|chat|sys&errorsOnly=0|1` | {entries:[{ts,channel,level,text,requestId,truncated}],counts:{task,chat,sys},dropped}；`counts` 统计整段缓冲（不随筛选变化）；`dropped` 是被容量上限覆盖的行数，界面如实显示 |

| 方法与路径 | 返回及边界 |
|---|---|
| `GET /ops/capabilities` | `OpsCapabilities`：checkedAt、database=sqlite、items(key/state/reason)；state=available/unavailable/not-connected。实际试读内容/角色/历史运行/执行仓储/会话查询；内容写入、发布与提醒已接通时返回 available，存储故障返回 unavailable。发布能力可用不等于某次预检通过 |
| `GET /ops/agents` | `{items: OpsAgent[],total}`；id/name/providerId/modelId/isSystem/updatedAt/revision=最新版本号（未导入时 null）。`providerId=null` 的修订在运行时继承系统默认，列表中的旧 modelId 仅是草稿占位。只读仓储，不自动创建默认角色，不返回 prompt/凭据 |
| `GET /ops/runs?page=1&pageSize=20&agentId=...` | `OpsList<OpsRun>`：items/total/page/pageSize；page 1–100000、pageSize 1–100，非法参数400；AgentRun按createdAt/id降序，真实总数，按agentId筛选 |
| `GET /ops/runs/:id` | `OpsRunDetail`；摘要字段外含instruction/output，缺失404；列表不带大段文本 |
| `GET /ops/conversations?limit=50&cursor=&keyword=&contentSlug=&placementKey=&agentId=&from=&to=&runState=` | 仅管理端。最近活动倒序、opaque cursor；limit 只接受 50/100。关键词匹配问题/回答，日期按最近提问日，筛选由服务端执行；按 tombstone 与当前明细保留期隐藏已删除/已过期会话 |
| `GET /ops/conversations/:conversationId` | 仅管理端；不存在、已删或已过期统一404。返回逐轮问题/对外回答、投递状态、引用、Agent 修订、公开运行及实际 text/usage 事件和交互事件；不返回匿名明文或 SDK session ID。Token `null` 表示未知，`0` 表示实际记录为零 |
| `GET /admin/content/ledger` | `ContentLedger` 汇合文件/Git、最近一次已确证发布和激活问答索引；旧 `stage=live` 只表示 Git 文件干净，不代表线上已核验 |
| `GET /admin/content/:slug` | 复用正文GET；`slug/title/type/updatedAt/raw/hash/ext`；hash 是当前 UTF-8 正文的 SHA-256；不保存、不生成索引，缺失404 |

`OpsRun` 包含 id/agentId/agentName/model/status/createdAt、nullable elapsedMs/tokens，revision/delivery均为null。旧零用量没有可靠计量证据，返回null而非补造0。类型唯一来源 `packages/shared/src/agent-ops.ts`；不提供任何通用写入provider。

### 受控会话导出（V21，本地已验收、未部署）

三个接口都要求管理凭据，不进入公共路由白名单；`POST` 同时经过 Origin 校验。筛选字段与 `/ops/conversations` 相同，但不接收分页 cursor/limit：服务端创建时冻结 `snapshotAt`、动态明细 `retentionCutoff` 和匹配的会话 ID 集；超出 10,000 个会话返回 422 `conversation-export-limit-exceeded`，不截断。

```http
POST /ops/exports
Content-Type: application/json

{"format":"csv","filters":{"contentSlug":"post-a","placementKey":"post-detail","agentId":"agent-id","from":"2026-09-01","to":"2026-09-25","runState":"FAILED","keyword":"退款"}}
```

成功返回 `{id, format, state, filters, snapshotAt, retentionCutoff, expiresAt, rowCount, errorCode, downloadPath, fields}`。`state` 为 `QUEUED | PROCESSING | READY | FAILED | REVOKED | EXPIRED`。CSV 先写等宽 `metadata` 行（快照时间、截止时间、筛选、记录数），再写一会话一行的汇总；JSON 是逐轮明细并在 metadata 中标明字段。所有字符串再次应用 shared 已知凭据/联系方式脱敏；CSV 对所有字段加引号，并对 `= + - @` 等表格公式前缀加文本标记。该规则不会识别所有敏感内容。

| 方法与路径 | 返回及边界 |
|---|---|
| `POST /ops/exports` | 接收 `{format:'csv'|'json',filters:{keyword,contentSlug,placementKey,agentId,runState,from,to}}`；未知顶层/筛选字段返回 400，避免静默扩大范围；排队后立即返回任务信息；行数超过上限返回 422 |
| `GET /ops/exports/:id` | 仅返回任务/筛选快照、行数、字段和有效期；不返回文件内容或路径。超过 15 分钟后状态为 `EXPIRED` 且清空筛选快照，删除撤销也清空筛选 |
| `GET /ops/exports/:id/download` | 仅 `READY` 且未过期可下载；文件使用 attachment、`Cache-Control: no-store` 与 `nosniff`。排队中返回 409；过期/撤销/文件缺失返回 410 |

文件位于 API 私有 `data/exports`（可用 `WALKER_EXPORT_DIR` 指向受控目录），文件名只使用服务器 job ID 和格式，不接受客户端路径。到期时间按 `snapshotAt + 15 分钟` 计算，文件大小按下载时 stat，不在 SQLite job 行重复存储。每个入选会话通过 V17 `ConversationLogResource` 绑定同一个导出 job；删除任一入选会话会清除整份本机导出、撤销 job 并移除全部资源关联。导出按独立 15 分钟 TTL 清理，不混入 90 天通用会话保留删除。创建、下载授权、失败、过期与撤销均有不含筛选文本或对话正文的审计；已下载到外部的副本无法远程撤回。

## 后台执行接口（R15，本地已验收、未部署）

历史 `GET /ops/runs` 继续读取 AgentRun。新执行不并入该列表。后台界面从 R16 起改读本接口。全部走管理鉴权，不进公开白名单。

| 方法与路径 | 返回及边界 |
|---|---|
| `POST /ops/execution-runs` | 来源固定为站主。请求只含 idempotencyKey、kind、agentRevisionId、input、可选 targetId、grantId。重复幂等键返回同一运行。非法字段 400，修订或授权不成立 403，队列满或过期 429。不从请求体接收 origin/actor |
| `GET /ops/execution-runs?cursor=&limit=&agentId=` | 只列站主自己的运行，可按 Agent 筛选。返回 items/next/total。total 是筛选后的真实条数，不是当前页长度。cursor 是上一页最后一条运行编号，limit 1–50 |
| `GET /ops/execution-runs/:id` | 运行详情。字段均可追到 ExecutionRun。其他来源或缺失 404 |
| `GET /ops/execution-runs/:id/events?after=` | 只返回 runtime 实际发出的 text/usage。没有事件就是空列表，不补思维过程 |
| `GET /ops/execution-runs/:id/stream` | SSE，帧与现有助手相同：`text` 增量、成功 `done`、失败 `error`。连接断开只停止观察，不停止运行 |
| `POST /ops/execution-runs/:id/stop` | 只停止站主自己的运行。排队中立刻 CANCELLED，不调用 close。重复停止返回当前终态 |

## 公共位置 readiness（V23，本地已验收、未部署）

位置绑定列表为每个草稿提供受管理鉴权的 readiness 报告。`canEnable` 由全部独立 gate 的状态计算，不是持久开关，也不接受请求体字段覆盖。Gate 项包含 `key/state/reason/details`，覆盖当前公开快照、每个成员的只读 profile 与最新权限测试、本机真实 SDK 探针、明细/聚合日志保留策略、未完成删除及恢复门、Nest/Caddy 方法路径匹配。

| 方法与路径 | 返回及边界 |
|---|---|
| `GET /ops/deployments/:id/readiness` | 管理鉴权；返回 `{deploymentId, placementKey, scopeSlug, enabled, checkedAt, canEnable, gates[]}`，并逐项解释未通过原因 |
| `POST /ops/deployments/:id/enable` | 写库前服务端重新计算全部 gate；成员权限/测试不通过返回 403，其余门槛缺失返回 409 `public-readiness-blocked`。附加 `canEnable`/`force` 布尔字段不能覆盖检查结果 |

Admin 按 gate 展示 blocker；加载中、请求失败或报告缺失时启用按钮保持禁用。禁用操作不受 readiness 阻止。已启用位置若后续未通过检查，公开 manifest 返回 `available:false`，公开模型成员解析返回 503。运行隔离报告由 `WALKER_RUNTIME_PROBE_REPORT` 指向，必须证明真实回答、回答 SHA-256、`closeError=null` 和 `processExited=true`；缺失、失败或字段不完整均保持 blocked。当前本地 API 未配置报告路径，readiness 按缺少证据阻断；仓库最近存档的脱敏探针记录显示无可用模型通道。验收没有触发真实模型请求。

JSON请求（`Accept: application/json`）认证失败仍返回401/code/message，但不附WWW-Authenticate，避免浏览器原生弹窗悬住请求；普通导航保留Basic挑战。没有降低认证要求，前端内存凭据清空时私有查询缓存一并清空。

[验收与隔离启动](../evidence/ADMIN-FRAMEWORK-ACCEPTANCE.md)。旧写路径尚存，关闭旁路仍是R/C的必做项，不把本批只读UI视为后端写权限已治理。

## 0. 传输

### 0.1 成功

HTTP 2xx。响应体即业务 JSON（**没有**统一 `{ ok, data }` 外壳）。管理端 `fetchJson` 把 2xx 整包当作 `data`。

### 0.2 失败

HTTP 4xx/5xx，体：

```json
{ "code": "admin-auth-required", "message": "管理凭据缺失或不正确" }
```

| HTTP | 典型 code |
|------|-----------|
| 400 | `validation-error`、`slug-required`、`missing-clue`、`content-brief-incomplete` |
| 401 | `admin-auth-required` |
| 404 | `api-not-found`（代理到 HTML 时也会被门面标成这个） |
| 409 | 发布并发（进行中的同 slug） |
| 410 | `conversation-export-expired`、`conversation-export-revoked`、`conversation-export-file-unavailable` |
| 422 | `conversation-export-limit-exceeded`（超过10,000个会话，不截断） |
| 429 | `rate-limited`、`guest-quota-exceeded` |
| 503 | `storage-unavailable` |

前端不得靠 HTTP 文案分支业务，只认 `code`。

### 0.3 鉴权

| 面 | 怎么进 |
|----|--------|
| 公开白名单 | 无管理凭据。白名单在 `apps/api/src/app.module.ts` exclude，必须与 `ops/windows/Caddyfile` 同步。 |
| 其余一切 | `x-admin-token: <WALKER_ADMIN_TOKEN>` 或 Basic 密码等于该 token。 |

本地未设 `WALKER_ADMIN_TOKEN` 时中间件放行。生产缺该变量拒启。

所有 `POST`、`PUT`、`PATCH`、`DELETE` 先经过 `SameOriginMiddleware`；只有请求 Host 与 Origin/Referer host 相同，或 Origin host 命中精确的 `WALKER_PUBLIC_ORIGINS` 才放行。该变量是逗号分隔 host（不带 scheme），生产 Vercel 同源代理配置 `www.iwalk.pro`。Origin/Referer 同时缺失允许脚本/curl 服务器调用；浏览器变更请求不能省略。Nest 未开启跨域 CORS，外域页面不能读取响应。公共路由网关也只按明确的方法+路径转发，未命中走404。

公开白名单（方法必须一致）：

| 方法 | 路径 |
|------|------|
| GET | `/health`、`/likes`、`/assistant/placements/:placementKey/:scopeSlug`、`/assistant/conversations/:placementKey/:scopeSlug` |
| POST | `/intake`、`/assistant`、`/assistant/stream`、`/assistant/events`、`/assistant/conversations/:placementKey/:scopeSlug/stop`、`/assistant/messages/:messageId/ack`、`/likes`、`/content-feedback`、`/search-events` |

Nest 排除表与 Caddy matcher 由 `apps/api/src/public-route-boundary.test.ts` 逐方法对照；`/ops`、`/admin` 与内容写入不在公网集合，未命中的 Caddy 请求 404。`GET /support` 由网站构建期静态 JSON 提供，保留的 Nest API 仅管理端可访问。

### 0.4 前缀对照

| 调用方 | 写出的 URL | Nest 收到 |
|--------|------------|-----------|
| admin/web（dev Vite proxy） | `/api/clues` | `/clues` |
| 脚本/curl 直打 :8788 | `/clues` | `/clues` |
| 生产 www → Caddy | `/api/*` 反代到 api 主机（无二次 `/api`） | 与上相同 |

---

## 1. 公开面（访客）

访客站运行时主要读构建产物 `content.json`，**不**经 API 拉文章正文。API 只承担写与问答。

### `GET /health` 已落地

```json
{ "ok": true, "db": true, "aiEnabled": true, "version": "abc1234" }
```

`version` 来自 `WALKER_BUILD_VERSION`，未配置为 `null`。

### `POST /intake` 已落地

访客「卡」。body：`{ "body": string, "source"?: string }`。
201。规则或 AI 生成 `nextStep`；`AI_ENABLED≠true` 时走规则，回答仍非空。引用 slug 必须 ⊆ citable。匿名 cookie + IP 限流。

### `POST /assistant` 已落地

站内助手。body：`{ "body": string, "placementKey"?: string, "scopeSlug"?: string, "memberKey"?: string | null, "deploymentGeneration"?: number | null, "conversationId"?: string | null, "sessionId"?: string | null, "requestKey"?: string | null, "source"?: string }`。返回包含 `requestId`、`conversationId`、`messageId`、`attemptId`、`runId`（规则路径为 null）。没有位置上下文的请求仍走规则回答；文章位置若无可用部署、公开快照或 AI，则规则回答。AI 可用时请求必须带当前位置 manifest 中的成员 key 与代次；成员不属于当前部署或代次过期时拒绝模型调用并返回冲突。当前注册位置为 `post-detail`。

公共模型调用由统一执行队列接收，运行记录固定 `origin=public`、`kind=chat`、无后台 grant，并保存位置、部署代次与内容快照 hash。公开权限最高为 `agent:run` + `content:read`，工具配置必须是当前只读 profile。请求体不能设置 origin、actor、grant、Agent 修订或写动作；AI 关闭、部署/快照缺失、内容不可引用、额度拒绝、排队超时或运行失败均走规则回答。流式 `POST /assistant/stream` 使用 SSE v2：`accepted` → `delta*` → `done`，失败发 `error`；每帧包含 request/message/attempt ID、消息内序号和 `messageId:sequence` 事件 ID。`delta` 仅有裁剪文本，`done.result` 是校验后的最终答案与引用。访客消息、助手正文和 attempt 按 Conversation 持久化；delivery 从 pending/partial 到 sent，客户端通过 ACK 路由确认收到。

### `GET /assistant/placements/:placementKey/:scopeSlug` 已落地

公开位置 manifest 只返回 `placementKey`、`scopeSlug`、展示标签、部署/成员可用状态、AI 开关状态、部署代次、公开成员 key/名称/修订序号和默认 key，不返回 Agent ID、修订数据库 ID、prompt、模型配置或凭据。`available` 表示该位置有当前合格公开成员；`aiEnabled:false` 时，页面明确提示规则回答，且不会尝试模型。成员 key 只对同一位置当前代次有效。未登记位置返回 404；已登记但未启用或没有通过当前只读发布门槛的成员时返回 `available:false`。

### `GET /assistant/conversations/:placementKey/:scopeSlug` 已落地

服务端按匿名 cookie 和文章位置定位会话，前端不提交可枚举的 conversation ID。返回访客问题、当前仍公开修订的助手回答、公开成员名称/修订和交付状态；不包含匿名 hash、SDK session、attempt/run ID。访客归属不符或文章不在核验公开快照时返回空历史。已不在当前部署的成员回答只返回隐藏占位，不返回原正文；pending/unknown 消息不恢复。

### `POST /assistant/conversations/:placementKey/:scopeSlug/stop` 已落地

body：`{ "messageId": string }`。匿名 cookie 必须拥有该位置下的 assistant Message；服务端从业务消息关联的 Attempt 解析 run，不接受客户端提交 runId。仅允许 `origin=public`、同一访客、同一文章范围、无 grant 的 chat run。排队中的 run 可立即转 `CANCELLED`；运行中的 run 先处于 `STOPPING`，等待 Harness close 退出证明后才确认 `CANCELLED`；无法证明退出时返回 `UNKNOWN`，不向访客显示“已停止”。接口返回 `{ state, confirmed }`，不会暴露 run ID。SSE 网络断开只影响交付观察，不会取消服务端运行；访客显式按下停止才调用此接口。

### `POST /assistant/events` 已落地

body 使用 shared 的 `AssistantInteractionInput`：`{ schemaVersion: 1, eventId, event, placementKey, scopeSlug, occurredAt?, memberKey?, messageId?, targetSlug?, feedback? }`。事件仅允许 `expose`、`intro-dismiss`、`open`、`close`、`send`、`follow-up`、`member-switch`、`citation-click`、`feedback`；额外字段（包括任意 URL、全站点击数据和自由文本属性）拒绝。成员 key 必须属于当前公开 manifest；messageId 必须属于同匿名访客、同文章的业务 Conversation；targetSlug 必须是核验公开快照中该助手回答实际引用的文章。客户端不能传 conversationId，服务端按 cookie+位置定位并修正关联。`eventId` 唯一，重复上报返回 `{ recorded: false, duplicate: true }`；`occurredAt` 仅保存为 `clientOccurredAt`，`FeatureEvent.receivedAt` 由服务端数据库生成。写入使用 `featureKey=assistant.interaction`，同源 POST 与 Caddy 公网白名单已同步。

数据库写入失败或超过 250ms 时，事件进入 SQLite 文件同目录下的 `assistant-event-spool/`；spool 仅存白名单事件元数据，不存消息正文、IP 或匿名明文。总量上限 20MiB、保留 24 小时，按 eventId 去重并在启动后及每 30 秒最多回放 100 条；数据库已存在的 eventId 会确认后移除。超限、过期或 spool 不可用会告警，健康状态将 `droppedCount` 标为 `null`，不虚报精确丢失数。已生成回答的历史写入有 250ms 等待上限，超时不改变回答结果。

### `POST /assistant/messages/:messageId/ack` 已落地

仅同一匿名 cookie 可以确认自己的助手消息。delivery 必须先为 `sent`；重复 ACK 返回 `duplicate: true` 且不重复写事件，未发送或 partial 消息返回 409，未知/他人消息统一返回 404。

V08 准入：匿名 cookie（`walker-anon`，HttpOnly/SameSite=Lax/Secure，服务端只存 sha256）+ IP 限流 + 每匿名身份限流；`requestKey`（8–128 位 `[A-Za-z0-9_-]`）持久幂等——重复发送返回原结果，不重新调用模型。公开位置按 Conversation 与 Agent 修订分别恢复 SDK session；切换成员保留访客消息时间线，但模型上下文独立。公开写路由（`/intake`、`/assistant`、`/assistant/stream`、`/assistant/events`、`/assistant/conversations/:placementKey/:scopeSlug/stop`、`/assistant/messages/:messageId/ack`、`/likes`、`/content-feedback`、`/search-events`）先过同源校验：跨站 Origin/Referer 403，白名单 `WALKER_PUBLIC_ORIGINS`。

### `POST /likes` · `GET /likes` 已落地

点赞写/读。公开。

### `POST /content-feedback` 已落地

读后反馈。进入复盘四源之一。

### `POST /search-events` 已落地

搜索未命中。进入复盘「搜索没找到」。

赞赏页直接使用构建期嵌入的 `content/support-config.json`，不调用 API。Nest 保留的 `/support` 读取/更新路由仅限管理凭据，未放入 Caddy 公网白名单。

---

## 2. 内容面（站主）

文章真相是文件。API 提供台账读模型与保存/上线动作。

### `GET /admin/content/ledger` 已落地

**必须注册在** `GET /admin/content/:slug` **之前**。

```ts
{
  generatedAt: string;       // ISO
  gitAvailable: boolean;     // false 时前端阶段显示「未知」，不得当成已上线
  publicationAvailable: boolean; // 发布事实不可读时为 false，前端显示「状态待核对」
  items: Array<{
    slug: string;
    title: string;
    type: string;            // knowledge | learn | idea | tool | project
    group: 'product' | 'article' | 'idea';
    stage: 'draft' | 'review' | 'ready' | 'live';
    visibility: 'public' | 'draft' | 'private';
    missing: string[];       // 门禁缺字段；非 public 为空
    dirty: boolean;
    publication: {
      currentPublicHash: string | null; // 当前文件的公开投影 hash，不与原文件 hash 混用
      publishedHash: string | null;     // 最近一次 PUBLISHED 的线上确证 hash
      verifiedAt: string | null;
      indexedHash: string | null;       // 当前激活问答快照条目 hash
      latestAttemptStage: ContentReleaseStage | null; // 较新的 UNKNOWN 不覆盖已确证版本
    };
    updatedAt: string;       // ISO
  }>;
}
```

阶段只许来自 shared `deriveContentStage`，其中 `live` 是历史 Git 干净口径。网页“已确证”只来自最近一次 `PUBLISHED` 记录；没有记录显示“未核验”。索引与网页 hash 只在同一公开投影命名空间比较。台账一次批量取发布记录、一次读激活快照，不逐 slug 查询；不新增持久真相源。

### `GET /admin/content/:slug` 已落地

单篇原文与当前正文版本。`{ slug, title, type, updatedAt, raw, hash, ext }`，`hash` 为 UTF-8 正文的 SHA-256，用作下一次保存的 CAS 基线。

### `PUT /admin/content/:slug` 已落地

body：`{ raw: string, expectedHash: string | null }`。已存在文章传 GET 返回的 `hash`；新建文章传 `null`，仅当目标不存在时成功。缺失 hash、过期 hash、目录越界 slug 均拒绝；并发保存发生版本冲突时返回 `content-version-conflict`。写入经 slug 对象锁和同目录临时文件替换，并记录 intent/result hash audit；人工保存不创建 ContentChange，也不要求模型批准。**保存 ≠ 上线**，只修改 `content/log`，不触发公共快照重建。

### `POST /admin/content/release/preflight` 已落地

body：`{ "slug": string }`。返回 `ok`、`missing`、文件 `targetHash`、公开投影 `publicHash`、发布清单与范围冲突；失败零写。两个 hash 属不同命名空间，不得直接比较。

### `POST /admin/content/release/prepare` 已落地

body：`{ slug, changeId?, grantId?, requestKey? }`。站主手工点击生成独立的 `PREPARED` 发布单；显式填写 `grantId` 时必须是当前文章有效的 `content:publish` 授权。返回发布单及批准绑定。

### `POST /admin/content/release` 已落地

body：`{ slug: string, releaseId: string }`，缺少发布单即拒绝。执行前在工作区锁内复核批准的目标、文件和公开版本、授权修订与撤销状态，再触发 `scripts/content-publish.ts --json --push`。

返回 `{ runId, status: 'RUNNING' }`；同一发布单在途重试复用运行，其他发布单并发返回 409。脚本派发后的取消、超时或非零退出如无法证明远端结果，发布单保持 `UNKNOWN`，需调用 reconcile；只有线上目标 hash 确证后才为 `PUBLISHED`。

### 提醒与复盘（O01，本地已验收、未部署）

复用既有 `Action`，不新建通用任务中心：提醒规则 = 「Action + plannedDate/dueAt」。

| 路径/方法 | 合同 |
|---|---|
创建/更新事项（`POST /actions`、`PATCH /actions/:id`）若带 `repeat`（非 `none`）一律返回 **501**：字段已预留但首期只支持单次提醒，不做静默降级。

| `POST /ops/reminders/resolve-due` | body `{ plannedDate?: string \| null, timezone?: string \| null }`。纯计算、零写：返回 `{ dueAt: string \| null, timezone: string \| null, source: 'date' \| null }`。仅设日期的事项按站点时区（默认 `Asia/Shanghai`）当日 00:00 到期；未排期返回 `dueAt: null` 且 `timezone: null`（没有瞬时就不假装保留生成时区） |
| `GET /ops/actions/:id/occurrences` | 该事项的发生记录（含历史，按 dueAt 倒序）。站主据此看到「反复延后是否触发过旧到期」 |
| `POST /ops/reviews` | body `{ actionId, didWhat, releaseId?, observed?, windowStart?, windowEnd?, nextAttempt?, evidenceState?, evidenceNote?, requestKey }`。关联事项与已核验发布版本（若提供 releaseId，该发布阶段必须为 PUBLISHED），记录行为/观察窗口/指标来源说明/下一次尝试；`requestKey` 幂等，重复提交返回同一记录。`evidenceState` 缺省 `UNKNOWN`（样本不足如实写未知）。**只能人工登记事实，模型建议不能自动变成已验证成效，不自动改内容或发布** |
| `GET /ops/reviews` | `?actionId=&limit=`。支持查看全局复盘列表或按特定事项筛选 |
| `GET /ops/reviews/:id` | 单条复盘详情 |
| `POST /ops/reviews/:id/action` | body `{ title?, note?, plannedDate?, requestKey }`。**显式**将复盘建议（nextAttempt）转为下一事项；`requestKey` 幂等（重复提交回放同一事项，`replayed: true`）；支持设置排期日期并推导到期瞬时；**不自动选题/发布** |
| `GET /ops/actions/:id/review` | 从事项回溯原复盘（当 action.entityType === 'REVIEW' 时返回原复盘记录，否则返回 null） |
| `POST /ops/actions/:id/disposition` | body `{ disposition: 'complete' \| 'snooze' \| 'ignore', plannedDate?, reason?, repeat?, requestKey }`。**完成 / 延后 / 忽略**三选一；`requestKey` 幂等（重复提交回放首次结果，`replayed: true`，不产生第二次副作用）。`repeat` 非 none 时返回 **501**（重复规则首期未实现，明确拒绝而非静默降级） |
| `GET /ops/actions/:id/dispositions` | 该事项的处置历史（审计事实，仅回 `reminder.disposition` 条目） |
| `GET /ops/conversations/:id/action-preview` | 访客问题转事项的**零写入**预览：`{ conversationId, contentSlug, title, summary, messageIds, turnCount }`。摘要只取访客问题首段并截断，供界面预填 |
| `POST /ops/conversations/:id/action` | body `{ title?, note?, plannedDate?, messageIds?, requestKey }`。**显式**把访客问题转为更新事项；Action 与审计同 SQLite 事务提交，审计键唯一；同键重放返回同一条及 `replayed: true`，失败不留下半提交事项。只保存摘要与**软引用**，不复制完整会话；**不授予 AI 任何内容写权限** |
| `GET /ops/actions/:id/evidence` | 从事项回看证据：`{ available, reason, conversationId, contentSlug, capturedAt, messages[] }`。会话**已删除** → `reason: 'deleted'`；**超出保留期或不存在** → `'expired'`；无引用 → `'missing'`。不可用时 `messages` 为空且**绝不假装可见** |

**到期语义**：`Action.dueAt` 为 UTC 瞬时，`Action.timezone` 保留生成它的 IANA 时区，使「站点本地日期 → UTC → 本地日期」可无损还原；旧行两列保持 `NULL`，不反推。

**去重语义**：`ReminderOccurrence.dedupeKey = actionId@dueAt@timezone` 上有唯一索引。键**不含扫描时间**，因此重复扫描必然命中同一键 —— 去重靠数据库约束，不靠应用层判断。

**证据软引用（O05）**：`Action.evidenceRef` 存 `{ conversationId, messageIds, capturedAt }`，**刻意不加外键**——会话删除后事项必须保留并如实标注「证据已不可用」，加外键只能二选一（级联删掉站主要做的事，或阻止访客行使删除权）。`messageIds` 只保留该会话内**真实存在**的消息 id，伪造 id 被丢弃。

**处置语义（O03）**：`完成` → 事项转 `DONE` 且清空 `dueAt`；`延后` → `plannedDate/dueAt/timezone` **原子重算**（旧到期随之失效，不会再被扫描领取）；`忽略` → 撤下这次到期（清 `dueAt`）但事项**仍保持 `OPEN`**。三者的「发生记录结果 + Action 更新 + 审计」在**同一事务**提交：任一步失败整体回滚，不留「提醒已处理、事项仍指旧到期」的半截状态。

| `GET /ops/reminders/inbox` | 提醒箱读模型：服务端算好到期分类与计数，前端只展示。返回 `{ today, timezone, items[], counts{overdue,today,upcoming,undated}, generatedAt }`。**到期分类用站点本地日期**（不用 UTC 日期，否则跨日会误判）；`counts` **不计已忽略项** |

### 到期扫描与恢复补检（O02，本地已验收、未部署）

后台定时任务，**无公开端点**（不需要界面触发，也不进公开白名单）：

- **每 5 分钟**扫一轮 `dueAt <= now` 且状态为 `OPEN` 的 Action，为每个到期写一条发生记录。
- **启动即补检**：进程启动时先跑一轮，重启期间到期的提醒不必等下一个 5 分钟。
- **不调用模型、不发外部通知、不新建 Agent 进程**；唯一副作用是本地发生记录。
- 单轮单批至多 200 条、至多 20 轮；防重入（上一轮未完成则跳过）；计时器 `unref`，不拖住进程退出。
- **fail-closed**：恢复门（restore pending）挂起期间一律不扫描；库不可写同样跳过。
- 扫描结果如实计数 `{ scannedAt, created, deduped, skipped }`：**已存在不计入 created**，跳过不算成功。

### `GET /runs/:runId/trace` 已落地

`?after=<seq>&limit=<n>`。默认尾部 500。事件经 shared `normalizeTraceEvent`。前端只传 `runId`。

---

## 3. 计划面

### `GET /admin/plan/calendar` 已落地

`?from=YYYY-MM-DD&to=YYYY-MM-DD`。

日历格子 + 未排期 OPEN + 窗口外逾期 OPEN + 未排期「待上线」内容。内容阶段实时读台账，不复制状态。

### `GET /admin/plan/next` 已落地

计划打开时的下一动作。规则 = shared `pickNextActions`（入池 > 主选 > 检验 > 交付；同类至多 1；最多 3）。

**为什么要这个：** 现在 admin 并行打 `/clues` `/seeds` `/executions` 再在浏览器算。摘要会暴露内部 id。读模型把「人话摘要」收进服务端一次完成，Agent/MCP 以后也能问「下一件」。

```ts
// 响应
{
  generatedAt: string;
  actions: Array<{
    kind: 'pool-clue' | 'promote-seed' | 'review-execution' | 'deliver-execution';
    id: string;             // 对应 clue / seed / execution id
    label: string;          // 入池线索 | 主选题苗 | 检验执行 | 交付执行
    summary: string;        // 人话；禁止把 t-xxx 当摘要
  }>;
}
```

实现约束：摘要用关联线索正文；没有正文且 title 像记录 id 时用「未命名题苗」。**禁止**第二份优先级规则。

admin 计划面列表走此端点；点主选/交付/检验再拉对象列表开浮层。

### Action（日历待办）已落地

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/actions` | `?status=&kind=` |
| POST | `/actions` | `{ title, note?, kind?: 'TASK'\|'VIDEO', plannedDate?, entityType?, entityId? }`。`entityType` 词表 fail-closed，含 `CONTENT` |
| PATCH | `/actions/:id` | 改期/标题/引用 |
| DELETE | `/actions/:id` | 只删 Action 行，不碰 `content/log` |
| POST | `/actions/:id/complete` | 勾完成 |
| POST | `/actions/:id/reopen` | 撤销完成 |

---

## 4. 过程对象（写仍按对象）

页面可以并进计划/复盘，HTTP 不按页面拆写接口。

### 线索 `/clues` 已落地

| 方法 | 路径 | body / 说明 |
|------|------|-------------|
| GET | `/clues` | `?limit=` |
| POST | `/clues` | `{ body, source? }` 热记。`source` 如 `manual-self` |
| PATCH | `/clues/:id/pool` | `{ poolStatus: 'candidate' \| 'in-pool' \| 'discarded' }` |

Clue：`{ id, body, source, poolStatus, createdAt }`。

### 题苗 `/seeds` 已落地

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/seeds` | 列表 |
| POST | `/seeds` | `{ title }` 转题苗 |
| PATCH | `/seeds/:id` | title / workflowStatus / whyNow |
| POST | `/seeds/:id/link` | `{ clueId, asPrimary? }` |
| POST | `/seeds/:id/promote` | **主选**。`{ clueId, brief, whyNow? }`。`brief` 五问全填，否则 `content-brief-incomplete`。禁止 AI 自动主选 |
| POST | `/seeds/:id/two-questions` | 两问（严重性 + 自身兴趣） |

### 执行 `/executions` 已落地

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/executions` | 列表 |
| POST | `/executions/:id/deliver` | `{ url, form?, note? }` |
| POST | `/executions/:id/review` | `{ outcome: 'yes' \| 'no', evidence? }`。可计数闭环 |

Execution：`{ id, seedId, status, deliveryUrl, outcome }`。

### 复盘原料 `/insights/signals` 已落地

`GET /insights/signals?days=30`（1–90）。

```ts
{
  days: number;
  signals: Array<{
    id: string;
    source: 'assistant' | 'intake' | 'search-miss' | 'feedback';
    text: string;
    createdAt: string; // ISO
  }>;
  frequency: Array<{ normalized: string; display: string; count: number; sources: string[] }>;
  gaps: Array<{ query: string; count: number; covered: boolean; matchedTitles: string[] }>;
}
```

`source==='intake'` 的信号带 `poolStatus?: string`（已落地）。复盘入池不必再 GET `/clues`。不要为复盘顶栏再打 `GET /metrics`。

周报 `POST /insights/report`、`GET /insights/reports` 已落地，驾驶舱默认不用（不做分析引擎首页）。

`GET /metrics` 已落地，过程计数。驾驶舱复盘面不作为依赖。

---

## 5. Agent（工坊 + 运行）

与访客 `POST /assistant` 分路：工坊是站主装配与直调；访客助手是站内问答。共同约束：AI 可关、公开输入不进命令行、轨迹前端只认 `runId`。

### 授权额度（2026-10-12 本地，未部署）

`GET /ops/agents/:id/grants` 返回的每条授权都带**已用量**（`runsReserved`/`runsCharged`/`usageReserved`/`usageCharged`），
判定函数只有一份：shared `grantDenial`（权限：身份/来源/动作/范围/撤销/到期）与 `grantUsable`（权限 + 剩余额度）。

- **执行准入只看 `grantDenial`**：额度由存储层 `reserve` 的原子 `UPDATE … WHERE` 把关，读侧不重复拒绝，
  否则「额度已用完，已改为规则处理」会被悄悄换成笼统的 403。
- **挑一条授权来用只看 `grantUsable`**：`AuthorizationService.selectUsable` 是后端唯一入口；
  试跑面板同样用它，不再自己写一遍「未撤销 + 未过期」——那正是本次空跑的成因。
- token 额度**终态记账**：运行成功时把 `tokensIn + tokensOut` 计入 `usageCharged`（同一条运行只记一次）；
  在此之前 `usageLimit` 是个永远为 0 的装饰字段。

### 角色与试跑 `/agents` 已落地

> 注：旧 `POST /agents` 与 `DELETE /agents/:id` 已退役；Agent 身份创建、修订与归档统一走 `/ops/agents`（见下文 R06–R09）。
>
> **2026-10-12 收敛（本地，未部署）**：`run-file`、`compare`、`agents/:id/runs`、`agents/log-files` 四个面已删除——
> `run-file`/`log-files` 与内容工作站重复且是旧工作台残留；`compare` 承诺「2–4 引擎并排」，
> 而直调**明令禁止换引擎**，实现只返回 `execution-denied` 占位，属于假功能；
> `agents/:id/runs` 读的是 G01 之后**只读保留**的历史表 `AgentRun`，现行运行在 `GET /ops/runs`。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/agents` | 列表（简要字段） |
| POST | `/agents/:id/try` | 试一句话 `{ input }`（传 `providerId`/`modelId`/`temperature` 一律 403） |

`/agents/:id/try` 不是第二套执行器：它走与后台试跑相同的统一执行栈——按 shared `grantUsable`
选一条**还有额度**的授权 → 入队 → **等到运行终态**（跟随运行自己的 `deadline`）→ 读回已落库文本。
没有可用授权返回 409 `grant-required`（不隐式签发）；运行未成功返回 5xx 并带 `state`/`stopReason`；
成功但零文本返回 502 `agent-run-empty`。历史上这里是「固定等 2 秒 → 把空事件当 201 成功返回」。

### 后台请求日志（2026-09-29 本地，未部署）

**2026-10-12：本端点的后台界面（「后台日志」标签页）已按站主要求下线，端点与 fail-closed 语义保留。** `GET /ops/admin-log?limit=1..100&before=<opaque-id>&method=WRITE|GET|POST|PUT|PATCH|DELETE` 仅走管理鉴权，按时间倒序返回 `{items,next}`。每条包含 `id/actor/method/path/statusCode/durationMs/createdAt`；`path` 是路由模板，查询串、路径参数值、请求/响应载荷和凭据均不写入。请求开始先落进行中行，结束补状态；补记失败保留空状态供核对。`WRITE` 汇总变更方法。后台自动轮询的 GET 和只读发布预检 POST 由前端以 `x-admin-background-poll: 1` 标记，不计作人工操作；其他 POST/PUT/PATCH/DELETE 即使带标记仍写日志。新表 `AdminRequestLog` 与业务 `AuditRecord` 分开。

### 模型提供方：**已退役，改用 dsh 原生管理**（R25c，2026-09-23）

`/model-providers` 全部端点、`ModelProvider` / `Credential` 表、`CredentialCipher`（AES-256-GCM）与
`WALKER_CREDENTIAL_MASTER_KEY` 依赖已删除。提供方与凭据**以 dsh 原生设置为唯一真相源**：

- **提供方接口 / API 网址 / 模型目录**：dsh `settings.yaml` 的接口段（如 `llm-deepseek`）；
- **apiKey**：settings 声明**引用名**（如 `DEEPSEEK_API_KEY`），值由 dsh 凭据来源持有；
- 读取入口：`GET /ops/agent-models`（返回接口/网址/引用名/凭据状态/模型 id 及名称，**绝不含凭据值**）；
- 技能执行的 `LlmClient` 与后台 Agent 试跑都从该目录取配置，系统内不再有第二份提供方注册表。

新增提供方 = 在 dsh 设置里声明接口段（改配置，不改代码）。目录主目录可用 `WALKER_MODEL_HOME` 指定。

### 模型连接配置 `/ops/model-config`（R24 闭环第一环，2026-09-23）

此前设置页只显示能力表并写明「配置编辑尚未接入」，导致「配供应商 → 建 Agent → 试跑 → 看记录 → 部署」
整条链断在第一环。现补齐；全部走管理鉴权，不在公开白名单。

| 方法与路径 | 行为 |
|---|---|
| `GET /ops/model-config` | 全部提供方（id/显示名/接口/**协议**/API 网址/引用名/是否有凭据/是否 dsh 默认/模型列表）+ 主目录 + 凭据文件位置 + **按提供方分组的预置模型** + **全部线协议**。**响应绝不含凭据值** |
| `PUT /ops/model-config` | 保存 `providerId` / `baseURL` / `protocol?` / `apiKey?` / `models?`：网址、协议与模型写 settings.yaml；`apiKey` 有值才更新。**只有该提供方凭据就位才写 `agent-default-model`**——否则「给未配置的提供方填个网址」会把默认从可用通道抢走。非法网址 400；未知协议 400；**单协议适配器被塞别的协议 400**；未登记接口 400 |
| `POST /ops/model-config/test` | 真发一次最小请求（`{baseURL}/chat/completions`，max_tokens=4，15s 超时）验证连通。失败如实带回上游片段；**未配 Key 时明确报「凭据引用还没有值」，不假装成功** |

#### 线协议：GPT 的协议还是 Claude 的协议

**协议是路由/模型的属性，不是厂商的属性。** 同一家厂商可能同时提供多种端点——
DeepSeek 官方就是**双协议**：OpenAI 格式在 `https://api.deepseek.com`，
Anthropic 格式在 `https://api.deepseek.com/anthropic`，同一把 Key 两种都能调。
因此配置里必须能逐路由、逐模型声明协议。

协议取值与 dsh 的 `@deepseek-ai/dsh-llm-pi-ai` 的 `api` 字段**逐字一致**（写回的就是它）：

| 协议 | 家族 | 说明 |
|---|---|---|
| `openai-completions` | OpenAI | 事实标准 `/chat/completions`，绝大多数网关都兼容 |
| `openai-responses` | OpenAI | OpenAI 新的 `/responses`（Codex 系） |
| `anthropic-messages` | Anthropic | Claude 原生 `/v1/messages` |
| `google-generative-ai` | Google | Gemini 原生 |
| `mistral-conversations` | Mistral | Mistral 原生 |
| `azure-openai-responses` / `openai-codex-responses` | OpenAI | Azure 与 Codex 传输 |
| `bedrock-converse-stream` / `google-vertex` | AWS / Google | 云厂商托管通道 |

#### 提供方登记（两条通道）

dsh 0.1.5-rc.3 发布两个可共挂载的 LLM 适配器（路由名不冲突，实测可同时装载）：

- **`llm-deepseek`**：DeepSeek 直连，只服务 DeepSeek；
- **`llm-pi-ai`**：**多提供方适配器**，按 pi-ai 内置目录（实测 **39 个提供方 / 9 种协议**）
  路由请求，并支持在路由上手写 `api`（协议）与 `baseURL`——
  所以任何 OpenAI/Anthropic 兼容网关都能接入而无需改代码。

当前登记 10 个提供方（`KNOWN_PROVIDER_INTERFACES`）：DeepSeek 直连、Anthropic、OpenAI、
Google Gemini、智谱 GLM、月之暗面 Kimi、xAI Grok、MiniMax、Mistral、OpenRouter。

#### 预置模型：每个厂商 3 个代表作

> **数据来源**（2026-09-23 核对）：DeepSeek 取**官方文档** api-docs.deepseek.com
> （「Models & Pricing」与「Lists Models」）；其余厂商取 **pi-ai 内置目录**
> （`@earendil-works/pi-ai@0.85.1` 的 `dist/providers/data/*.json`，即 dsh 实际路由的同一份目录）。
> 预置只是「快速添加」的起点，**不是权威全集**——未列出的 id 仍可手填，由 dsh 请求时校验。

| 提供方 | 3 个预置 | 协议 |
|---|---|---|
| DeepSeek 直连 | `deepseek-flash`(V4.1-Flash，最新)、`deepseek-v4-pro`、`deepseek-v4-flash-vision-exp`(已下线) | openai-completions |
| Anthropic | `claude-opus-5`、`claude-sonnet-5`、`claude-haiku-4-5` | anthropic-messages |
| OpenAI | `gpt-5.6-terra`、`gpt-5.6-sol`、`gpt-5.6-luna` | openai-responses |
| Google | `gemini-3.8-flash`、`gemini-3.5-flash`、`gemini-2.5-pro` | google-generative-ai |
| 智谱 | `glm-5.3`、`glm-5.3-flash`、`glm-5.2` | openai-completions |
| 月之暗面 | `kimi-k3`、`kimi-k2.7-code`、`kimi-k2.6` | openai-completions |
| xAI | `grok-4.6`、`grok-4.5`、`grok-4.3` | openai-responses |
| MiniMax | `MiniMax-M3`、`MiniMax-M2.7`、`MiniMax-M2.7-highspeed` | anthropic-messages |
| Mistral | `mistral-large-latest`、`devstral-latest`、`codestral-latest` | mistral-conversations |
| OpenRouter | `deepseek/deepseek-v4.1-flash`、`anthropic/claude-sonnet-5`、`openai/gpt-5.6-terra` | 逐条标注 |

> **DeepSeek 官方只列 2 个在服务型号**：`deepseek-flash`（DeepSeek-V4.1-Flash，2026-09-10 发布，
> 支持图像输入，1M 上下文 / 384K 输出）与 `deepseek-v4-pro`（DeepSeek-V4-Pro-0813）。
> 第三项取已下线的 `deepseek-v4-flash-vision-exp` 并**如实标注「已下线」**——
> 官方原文：「ID 仍被接受，但对应模型已退役，请求由 DeepSeek-V4.1-Flash 提供服务并按 Flash 计费」。
> 不把 legacy 当有效型号推荐，也不隐藏它仍可调用的事实。

**凭据存放**：`<Harness 主目录>/credentials.env`（`引用名=值`，明文，0600，被 `.gitignore` 覆盖）。
不写 dsh 的 `.credentials.yaml`——实测 0.1.5-rc.3 的 sdk profile **只要该文件存在就启动失败**。
运行时按「环境变量优先 → 否则读该文件」解析，读出的值只经环境变量注入子进程，不落日志、不进接口响应。

**凭据状态只有这一个真相源**（R24.b 修正）：`/ops/model-config` 与 `/ops/agent-models` 的
`hasCredential`、以及运行时实际取值的 `credentialValue`，三者都从 `credentials.env` 解析。
曾经 `/ops/agent-models` 走的是 dsh 的 `.credentials.yaml`（rc.3 下恒不存在），导致同一提供方
在设置页显示「已配置」、在 Agent 页显示「未配置凭据」，`pickUsableProvider` 也恒为 `null`
从而静默换用兜底提供方。Agent 层凭据（`agents/<id>/credentials.env`）**默认共用共享层**，Agent 可自备覆盖。

### 技能 `/skills` 已落地

列表 / export / selfcheck。管理端 `adminApi.skills`。

---

## 6. 设置 · 观测与结构

| 方法 | 路径 | 说明 | 状态 |
|------|------|------|------|
| GET | `/health` | 见公开面；设置默认页也用它 | 已落地 |
| GET | `/admin/usage/stats?days=` | 使用 | 已落地 |
| GET | `/admin/ai/stats?days=` | AI 运行统计 | 已落地 |
| GET | `/admin/journey?days=&anonId=` | 旅程事件 | 已落地 |
| GET | `/admin/assistant-events/health` | 交互事件 spool 状态：healthy/backlog/loss-unknown、待回放量/字节、最早入队时间；未知精确丢失量返回 `null` | 已落地（需管理凭据） |
| GET | `/admin/log-retention` | 查看明细与聚合日志保留天数 | 已落地（需管理凭据） |
| PATCH | `/admin/log-retention` | 更新保留策略，只接受 `detailRetentionDays` / `aggregateRetentionDays`，上限分别为 90/365 天 | 已落地（需管理凭据 + Origin 校验） |
| GET | `/admin/log-resources/conversations/:conversationId` | 枚举该业务会话登记的资源类型与到期时间；不返回消息正文、存储 key 或文件路径 | 已落地（需管理凭据） |
| GET | `/admin/log-resources/expired?limit=` | 按当前保留策略选出已到期资源；默认 100，最多 1000 | 已落地（需管理凭据） |
| DELETE | `/admin/log-resources/conversations/:conversationId` | 建立删除墓碑和无正文审计，停止相关公开运行后清理该会话全部已登记副本；返回删除任务状态 | 已落地（需管理凭据 + Origin 校验） |
| GET | `/admin/log-deletions/:id` | 查询删除任务状态，不返回会话正文、存储 key 或文件路径 | 已落地（需管理凭据） |
| GET | `/graph/health` | 知识图谱体检（内部面，勿把明细写进公开 json） | 已落地 |
| GET | `/architecture/health` | 代码结构体检 + 基线对账 | 已落地 |

日志资源表保存服务端逻辑资源 ID 和所属会话，不保存路径；普通日志 `expiresAt` 按资源创建时间、类型和当前保留政策即时计算，因此缩短保留期限后旧资源会立刻进入到期候选。默认明细 90 天、无正文聚合 365 天，策略接口仅允许设为 1 天至各自默认上限。V21 导出资源通过 `parentKey=jobId` 与会话关联，文件路径由受控 job ID 推导，按独立 15 分钟 TTL 清理，不进入通用 90 天候选。spool 队列在数据库暂不可写期间由其受限文件记录自身资源，恢复后再与数据库事件资源对齐。

删除请求先写入唯一 tombstone 与不含正文的操作审计，再把 ID 记入本机恢复清单和可选副本，确认停止关联的公开运行后才按资源登记清理数据库行和受控文件。响应状态为 `pending`、`stopping`、`deleting`、`blocked` 或 `completed`；清理错误进入 `blocked`，重复调用同一 DELETE 会重试，服务启动和每 30 秒继续在途阶段。删除期间禁止公开会话读写和资源补登记，spool 回放遇到 tombstone 会丢弃对应事件。API 启动在 listener 前重放删除清单并处理到期资源；恢复清理失败时 API 不监听，`restore.pending` 存在时已启动进程对请求返回 503。V21 导出资源清理器会先删本机文件、撤销 job，再移除该 job 的全部会话资源关联；任何外部已下载副本不承诺撤回。备份、恢复命令与 30 天到期策略见 [`ops/windows/README.md`](../../ops/windows/README.md)。

不设 `GET /admin/settings` 聚合包。设置低频，各读各的。

---

## 7. 工作台配方（深链，非驾驶舱日常）

`/workbench`、`/works*`（创建、produce、cancel、approve、审阅包）。
驾驶舱导航已撤。契约以 controller 为准；新联调不要把配方车间当默认首页。

---

## 8. 明确不做

| 不做 | 原因 |
|------|------|
| 为「还要你」加 `needsAttention` 字段或新路由 | 展示切分，ledger.stage 已够 |
| 为四个面各做一个 BFF 巨石 | 写仍按对象；只补计划 next 一个读模型 |
| 新公开路由「方便 admin」 | 漏 Caddy 即裸奔 |
| 改 Prisma 迁就驾驶舱 | 过程对象已够；阶段不进库 |
| 前端自己抽边建图 | 建图只在 `packages/shared/src/graph.ts` |
| 把模型原文 JSON 经 stream 外发 | 只出裁剪文本 |

---

## 9. 联调优先级

1. **现在就能对：** ledger → 单篇 GET/PUT → preflight/release → trace；calendar + **next**；clues/seeds/executions 写；insights/signals（含 intake `poolStatus`）；agents try + runs + trace；health。
2. **不要等：** 设置聚合、复盘第二套分析 API、CMS。

逐步与 curl 见 [`INTEGRATION.md`](./INTEGRATION.md)。

## Agent 修订与授权（R06–R09，本地实现、未部署）

均经过现有管理鉴权；actor 固定取服务端站主身份，body 中的 origin/principal 等未知字段拒绝。详见 [本地验收](../evidence/AGENT-CORE-ACCEPTANCE.md)。

| 接口 | 行为 |
|---|---|
| GET /ops/agents/:id/model-config | 该 Agent **自己的**模型与凭据配置（R28）。返回 `{providerId, modelId, modelName, baseURL, protocol, providerFromAgent, modelFromAgent, apiKeyRef, credentialScope, hasCredential, hasOwnCredential, homeDir, knownProviders}`；`baseURL/protocol` 是共享 dsh 路由的生效只读摘要。`credentialScope` = `agent`（本 Agent 专用）/ `shared`（沿用全局）/ `none`（无凭据）。**绝不返回凭据值** |
| PUT /ops/agents/:id/model-config | 保存该 Agent 自己的模型与凭据（PATCH 语义，字段不传即不改动）。`providerId`（null=清除专属提供方/模型并继承系统默认）、`modelId`（明确选提供方时必填）、`modelName`（选填，留空回落 ID）、`apiKey`（字符串=写入；`null`=删除自己的 Key 而回落全局）、`apiKeyRef`。**只写该 Agent 自己的 home，绝不触碰共享层**；换提供方时凭据引用名跟随切换并清掉旧适配器段。未知字段 400 |
| GET /ops/agent-models | **提供方与模型直接来自 dsh 原生设置**（R25b）：`{source:'dsh', home, defaultProvider, defaultModel, providers:[{id, interfaceName, baseURL, apiKeyRef, hasCredential, isDefault, models:[{id,name}]}]}`。`id` 是 dsh 适配器路由名（如 `deepseek-official`）；`apiKeyRef` 是引用名，**返回值绝不含凭据**。`models` = 设置里声明的目录 + dsh 默认模型（dsh 内置目录不对外导出，故前端允许填写未列出的 id，由 dsh 在请求时校验） |
| POST /ops/agents | 创建身份及版本 1；requestKey/baseVersion=0/name/prompt/providerId/modelId/toolProfile。`providerId` 必须存在于 dsh 目录（否则 400「提供方不在 dsh 目录中」）；该提供方在设置里声明了 `models` 时，`modelId` 必须命中，未声明时交由 dsh 在请求时校验 |
| GET /ops/agents/:id | 身份、归档时间及修订历史 |
| POST /ops/agents/:id/revisions | baseVersion 乐观校验后创建下一版；旧版不可 PATCH |
| POST /ops/agents/import-legacy | 显式导入无版本的历史角色，重复调用幂等 |
| POST /ops/agents/:id/archive | 归档自定义身份，保留修订和运行历史 |
| POST /ops/agents/:id/import-skill/:skillId | 显式读取已登记技能提示词并创建新修订 |
| GET /ops/agents/:id/revisions/:revisionId/export | 返回 SKILL.md 文本，不自动写文件 |
| POST /ops/grants | requestKey/level/agentId/actions/resourceScope/expiresAt/runLimit/usageLimit；L2 单次、L3 仅提醒 |
| GET /ops/agents/:id/grants | 最近 100 条授权，含撤销状态 |
| POST /ops/grants/:id/revoke | 撤销及审计同事务；重复撤销不增版本 |

旧 POST /agents、DELETE /agents/:id 已退役，不做重定向兼容。grant 的创建/撤销不启动执行。R12 在调度入口对同一 SQLite 事务做额度预留，预留成功后才调用 RuntimePort.start；R15 HTTP 执行提交尚未接通。前台不能使用后台 grant；内容写入/发布入口仍未开放。
