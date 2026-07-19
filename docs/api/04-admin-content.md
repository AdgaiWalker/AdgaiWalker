# 04 · 内容创作闭环(admin)

围绕 Evidence → Decision → Action → Outcome 责任链的内容创作工作台。全部需要 admin+ 权限。

> 鉴权细节见 [01-auth.md](./01-auth.md)。

## 内容 CRUD(content)

### GET/PUT/PATCH/DELETE /api/admin/content/{slug} — 内容文件 CRUD
- **鉴权**:全部 **isAdminAsync**;401
- **GET**:→ `{ slug, content, sha, name }`;404 文件不存在
- **PUT**:体 `{ content(必填, ≤100KB), sha?, message?, create?(bool), topicId? }`
  - create=true 且已存在 → 409
  - 非 create 且无 sha → 自动读取当前 sha(不存在则 404)
  - 成功 → `{ ok:true, slug, sha, topicLinked, message }`(约 60s 后部署)
  - topicId 关联:内容 public → 选题标 produced,否则 accepted
- **PATCH**:体 `{ visibility?("public"|"draft"|"private"), layout?("immersive"|"media") }`(至少一个)→ `{ ok:true, slug, visibility?, layout?, sha }`
- **DELETE**:**走 `requireHighRiskAudit`** action=`content.delete` → `{ ok:true, slug }`
- **降级**:审计失败 → **503 storage-unavailable**;错误通过 `ContentStoreError` 透传 status(500 默认)
- **前端调用方**:`src/components/admin/AdminEditBar.astro:201/232/267`、`src/scripts/inline-editor.ts:184/226`、`src/scripts/version-history.ts`

### GET /api/admin/content/{slug}/history — Git 历史
- **鉴权**:**isAdminAsync**
- **请求**:`?perPage`(1..100,默认 30)
- **响应**:`{ slug, commits:[] }`;失败 500 / `ContentStoreError.status`
- **前端调用方**:`src/scripts/version-history.ts:32`

### GET /api/admin/content/{slug}/version — 读特定版本
- **鉴权**:**isAdminAsync**
- **请求**:`?ref`(必填)
- **响应**:`{ slug, content, sha, name }`;缺 ref 400;失败 500
- **前端调用方**:`src/scripts/version-history.ts:90+`

## 工作台与责任链(workbench / decisions / actions / outcomes)

### POST /api/admin/decisions — 创建 WorkItem 提案(P0-C02)
- **鉴权**:**isAdminAsync**
- **请求体**:
  ```jsonc
  {
    "queue": "user-demand|walker-thesis|system-event|ai-asset",  // 必填
    "title": "string",                                            // 必填
    "summary": "string",                                          // 必填
    "priorityBand": "now|week|observe|insufficient|blocked",      // 必填
    "priorityReasons": ["string?"],
    "uncertainty": ["string?"],
    "evidenceRefs": [                                             // 必填,至少一条
      { "evidenceId":"", "sourceType":"", "sourceId":"", "occurredAt":"", "summary":"",
        "collectedAt?":"", "environment?":"", "visibility?":"", "freshness?":"", "qualityStatus?":"" }
    ],
    "topicId?": "string",
    "requestDecision?": true
  }
  ```
- **响应**:201 `{ ok:true, item:<WorkItem> }`
- **状态码**:201 / 503(storage-unavailable) / 404(not-found) / 409(invalid-transition/missing-evidence/missing-expected-outcome) / 400(invalid-input)
- **不走审计**
- **前端调用方**:`src/pages/admin/outcomes.astro:113`、`src/pages/admin/topics.astro:348`、`src/scripts/workbench-shell.ts:239`

### PATCH /api/admin/decisions/{id} — 作出决定 / 请求决定 / 覆盖优先级
- **鉴权**:**isAdminAsync**(id = workItemId)
- **请求体**(三选一):
  - `{ overridePriority: { priorityBand, reason(必填) } }` — P1-D02 人工覆盖
  - `{ requestDecision: true }`
  - `{ decide: { outcome("accepted"|"rejected"|"paused"), reason(必填) } }`
- **响应**:`{ ok:true, item }`
- **状态码**:同 decisions(503/404/409/400)
- **前端调用方**:`src/pages/admin/outcomes.astro:140`、`src/pages/admin/topics.astro:372/412/442`、`src/scripts/workbench-shell.ts:208/259`

### POST /api/admin/actions — 为 WorkItem 创建行动(P0-C02)
- **鉴权**:**isAdminAsync**
- **请求体**:
  ```jsonc
  {
    "workItemId": "string",                    // 必填
    "actionType": "create-content|update-content|change-feature|create-learning-request|review-incident|evaluate-asset",
    "targetType": "string",                    // 必填非空
    "targetId?": "string",
    "expectedOutcome": "string",               // 必填非空
    "assignee?": "walker|ai|shared",
    "verifyAt?": "iso",
    "reversible?": true,
    "rollbackPlan?": "string"
  }
  ```
- **响应**:201 `{ ok:true, item:<WorkItem> }`
- **状态码**:同 decisions
- **前端调用方**:`src/pages/admin/outcomes.astro:146`、`src/pages/admin/topics.astro:456`、`src/scripts/workbench-shell.ts:159`

### PATCH /api/admin/actions/{id} — 更新行动状态
- **鉴权**:**isAdminAsync**(id = actionId)
- **请求体**:`{ workItemId(必填), status("authorized"|"in-progress"|"awaiting-verification"|"completed"|"blocked"|"cancelled"), reason?, targetId? }`
- **响应**:`{ ok:true, item }`
- **状态码**:同 decisions
- **前端调用方**:`src/scripts/workbench-shell.ts`(隐式)

### POST /api/admin/outcomes — 记录行动结果(P0-C02)
- **鉴权**:**isAdminAsync**
- **请求体**:`{ workItemId(必填), actionId(必填), result("successful"|"partial"|"failed"|"inconclusive"), summary(必填), evidenceRefs[](必填≥1), nextDecisionSuggested?(bool) }`
- **响应**:201 `{ ok:true, item }`
- **状态码**:同 decisions
- **前端调用方**:`src/scripts/workbench-shell.ts:288`

### GET /api/admin/workbench — 工作台投影/列表(P0-C02)
- **鉴权**:**isAdminAsync**
- **请求**:`?view=today|decisions|actions|outcomes`(默认 today)、`?queue=user-demand|walker-thesis|system-event|ai-asset`、`?status=<WorkItemStatus>`(或逗号分隔多个)、`?limit=1..100`(默认 30)
- **响应**:
  - `view=today` → `{ view:"today", items:[], focusItems(前3), backlogCount, counts:{total,proposal,pending,accepted,acting,awaitingVerification,paused} }`
  - `view=decisions` → `{ view:"decisions", items }`(默认 status=[proposal,pending,accepted,rejected,paused])
  - `view=actions` → `{ view:"actions", items }`(默认 [accepted,acting,awaiting-verification])
  - `view=outcomes` → `{ view:"outcomes", items:[{...item, nextSuggestion}] }`(每条附下一步建议)
- **前端调用方**:**无直接前端调用方**(workbench-shell.ts 直调 actions/decisions/outcomes)

### GET /api/admin/workbench/{id} — 单 WorkItem 详情
- **鉴权**:**isAdminAsync**
- **响应**:`{ item: <WorkItem> }`;不存在 404;缺 id 400
- **前端调用方**:无(仅测试引用)

## 创作简报(brief)

### POST /api/admin/brief — 生成选题简报
- **鉴权**:**isAdminAsync**
- **请求体**:`{ topicId: string }`(必填)
- **响应**:`{ brief: <Brief> }`;选题不存在 404
- **不走审计**;无 storage-unavailable 分支
- **前端调用方**:`src/pages/admin/brief.astro`(SSR 直调 service)、`src/pages/admin/review.astro:140`、`src/pages/admin/topics.astro:179`

## 联调验证

```bash
# 列工作台 today 视图
curl -b cookies.txt "https://<vercel-url>/api/admin/workbench?view=today"

# 创建决定(需要真实 evidenceRefs,联调时先用 demo-scenario 造数据)
curl -b cookies.txt -X POST https://<vercel-url>/api/admin/decisions \
  -H "Content-Type: application/json" \
  -d '{"queue":"user-demand","title":"联调测试","summary":"测试","priorityBand":"observe","evidenceRefs":[{"evidenceId":"e1","sourceType":"need-case","sourceId":"n1","occurredAt":"2026-07-04","summary":"测试证据"}]}'

# 读某篇内容
curl -b cookies.txt "https://<vercel-url>/api/admin/content/某篇"

# 内容历史
curl -b cookies.txt "https://<vercel-url>/api/admin/content/某篇/history?perPage=10"
```
