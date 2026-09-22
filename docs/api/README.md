# Nest API 契约

> **2026-09-22 新后台设计**：新产品行为见 [PRD v0.2](../PRD-AGENT-OPERATIONS.md)，拟新增接口与兼容策略见 [技术方案 §13](../TECH-DESIGN-AGENT-OPERATIONS.md#13-前端与-api-落点)。F 框架、Agent 修订和事项授权接口已本地实现（见下表）；执行提交与内容写入待实施；新旧写入口最终接入同一授权/版本检查用例。

> 联调与实现的接口权威。分析见 [`ANALYSIS.md`](./ANALYSIS.md)；怎么打见 [`INTEGRATION.md`](./INTEGRATION.md)。  
> 产品行为以根 `PRD.md` / `docs/PRODUCT.md` 为准。分层以 `docs/ARCHITECTURE.md` 为准。  
> **Nest 无全局 `/api` 前缀。** 浏览器 `/api/health` → 上游 `GET /health`。

**状态图例：** 已落地 = 代码里有、可联调。待落地 = 本文设计、实现前前端不得假装已有。

---


## 新后台框架只读接口（F01–F18，本地已验收、未部署）

全部走现有管理鉴权，不在公开白名单内；浏览器调用统一加 `/api` 代理前缀。

| 方法与路径 | 返回及边界 |
|---|---|
| `GET /ops/capabilities` | `OpsCapabilities`：checkedAt、database=sqlite、items(key/state/reason)；state=available/unavailable/not-connected。实际试读内容/角色/历史运行/执行仓储；`agentExecute` 在执行仓储可读时 available。部署/修改/发布/访客会话/提醒仍 not-connected |
| `GET /ops/agents` | `{items: OpsAgent[],total}`；id/name/modelId/isSystem/updatedAt/revision=最新版本号（未导入时 null）。只读仓储，不自动创建默认角色，不返回prompt/凭据 |
| `GET /ops/runs?page=1&pageSize=20&agentId=...` | `OpsList<OpsRun>`：items/total/page/pageSize；page 1–100000、pageSize 1–100，非法参数400；AgentRun按createdAt/id降序，真实总数，按agentId筛选 |
| `GET /ops/runs/:id` | `OpsRunDetail`；摘要字段外含instruction/output，缺失404；列表不带大段文本 |
| `GET /admin/content/ledger` | 复用既有ContentLedger；新UI不将历史live当线上已核验 |
| `GET /admin/content/:slug` | 复用正文GET；`slug/title/type/updatedAt/raw/ext`；不保存、不生成索引，缺失404 |

`OpsRun` 包含 id/agentId/agentName/model/status/createdAt、nullable elapsedMs/tokens，revision/delivery均为null。旧零用量没有可靠计量证据，返回null而非补造0。类型唯一来源 `packages/shared/src/agent-ops.ts`；不提供任何通用写入provider。

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

JSON请求（`Accept: application/json`）认证失败仍返回401/code/message，但不附WWW-Authenticate，避免浏览器原生弹窗悬住请求；普通导航保留Basic挑战。没有降低认证要求，前端内存凭据清空时私有查询缓存一并清空。

[验收与隔离启动](../ADMIN-FRAMEWORK-ACCEPTANCE.md)。旧写路径尚存，关闭旁路仍是R/C的必做项，不把本批只读UI视为后端写权限已治理。

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
| 429 | `rate-limited`、`guest-quota-exceeded` |
| 503 | `storage-unavailable` |

前端不得靠 HTTP 文案分支业务，只认 `code`。

### 0.3 鉴权

| 面 | 怎么进 |
|----|--------|
| 公开白名单 | 无管理凭据。白名单在 `apps/api/src/app.module.ts` exclude，必须与 `ops/windows/Caddyfile` 同步。 |
| 其余一切 | `x-admin-token: <WALKER_ADMIN_TOKEN>` 或 Basic 密码等于该 token。 |

本地未设 `WALKER_ADMIN_TOKEN` 时中间件放行。生产缺该变量拒启。

公开白名单（方法必须一致）：

| 方法 | 路径 |
|------|------|
| GET | `/health`、`/likes`、`/support` |
| POST | `/intake`、`/assistant`、`/assistant/stream`、`/likes`、`/content-feedback`、`/search-events` |

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

站内助手（小影）。body：`{ "body": string, "sessionId"?: string | null, "source"?: string }`。  
201。fail-closed：未知/他人会话开新会话。流式走 `POST /assistant/stream`（text-delta 只出裁剪文本）。

### `POST /likes` · `GET /likes` 已落地

点赞写/读。公开。

### `POST /content-feedback` 已落地

读后反馈。进入复盘四源之一。

### `POST /search-events` 已落地

搜索未命中。进入复盘「搜索没找到」。

### `GET /support` 已落地

支持页配置（只读）。

---

## 2. 内容面（站主）

文章真相是文件。API 提供台账读模型与保存/上线动作。

### `GET /admin/content/ledger` 已落地

**必须注册在** `GET /admin/content/:slug` **之前**。

```ts
{
  generatedAt: string;       // ISO
  gitAvailable: boolean;     // false 时前端阶段显示「未知」，不得当成已上线
  items: Array<{
    slug: string;
    title: string;
    type: string;            // knowledge | learn | idea | tool | project
    group: 'product' | 'article' | 'idea';
    stage: 'draft' | 'review' | 'ready' | 'live';
    visibility: 'public' | 'draft' | 'private';
    missing: string[];       // 门禁缺字段；非 public 为空
    dirty: boolean;
    updatedAt: string;       // ISO
  }>;
}
```

阶段只许来自 shared `deriveContentStage`。前端「还要你 / 已上线」是展示切分，**不要**为此加字段或新路由。

### `GET /admin/content/:slug` 已落地

单篇原文。`{ slug, title, type, updatedAt, raw, ext }`。

### `PUT /admin/content/:slug` 已落地

body：原文字符串（或既有包装，以实现为准）。**保存 ≠ 上线。** 只写 `content/log`。

### `POST /admin/content/release/preflight` 已落地

body：`{ "slug": string }`。`{ ok: boolean, missing: string[] }`。失败零写。

### `POST /admin/content/release` 已落地

body：`{ "slug": string }`。触发 `scripts/content-publish.ts --json --push`。  
`{ runId: string, status: string }`。同 slug 进行中再来一次返回进行中，不启第二进程。

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

### 角色 `/agents` 已落地

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/agents` | 列表 |
| POST | `/agents` | upsert `{ id, name, icon?, providerId?, modelId?, prompt }` |
| DELETE | `/agents/:id` | `{ ok: true }` |
| POST | `/agents/:id/run-file` | 文件直调 `{ targetFile, instruction, providerId?, modelId?, temperature? }` → 含 `runId` |
| POST | `/agents/:id/try` | 无文件试一句话 `{ input, providerId?, modelId?, temperature? }` |
| POST | `/agents/:id/compare` | 同题 2–4 引擎 `{ input, targets: [...] }` |
| GET | `/agents/:id/runs` | 该角色的运行索引 |
| GET | `/agents/log-files` | 可直调文件名单（真实列表，禁止假样例） |

运行写入 `data/runs/<runId>/trace.jsonl`。读回 `GET /runs/:runId/trace`。

### 模型 `/model-providers` 已落地

密钥 AES-256-GCM 落库，主密钥 `WALKER_CREDENTIAL_MASTER_KEY` 只在服务器 `.env`，**永不进 Git**。

| 方法 | 路径 |
|------|------|
| GET | `/model-providers` |
| GET | `/model-providers/presets` |
| POST | `/model-providers` |
| PUT | `/model-providers/:id` |
| DELETE | `/model-providers/:id` |
| 另有 | ping / remote-models / verify（以实现为准，管理端 `admin-api.modelProviders`） |

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
| GET | `/graph/health` | 知识图谱体检（内部面，勿把明细写进公开 json） | 已落地 |
| GET | `/architecture/health` | 代码结构体检 + 基线对账 | 已落地 |

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

均经过现有管理鉴权；actor 固定取服务端站主身份，body 中的 origin/principal 等未知字段拒绝。详见 [本地验收](../AGENT-CORE-ACCEPTANCE.md)。

| 接口 | 行为 |
|---|---|
| GET /ops/agent-models | 已启用供应商与模型目录，不含凭据 |
| POST /ops/agents | 创建身份及版本 1；requestKey/baseVersion=0/name/prompt/providerId/modelId/toolProfile |
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
