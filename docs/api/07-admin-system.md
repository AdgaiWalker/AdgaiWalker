# 07 · 系统管理(admin)

账号、邀请码、对象级授权、AI Gateway、外观、赞赏、事件、架构图。涵盖系统运营的全部管理功能。

> 鉴权细节见 [01-auth.md](./01-auth.md);owner-only 端点用 ⚠️ 标注。

## 账号管理(accounts)

### GET /api/admin/accounts — 账号列表
- **鉴权**:**isAdminAsync**(admin+owner);401
- **响应**:`{ accounts: [{ username, role, status, createdAt, lastLoginAt, inviteCodeHash }] }`
- **降级**:无 Redis → `devFallback()` 放行(DEV);生产 sessionStore 校验失败 → 401
- **头**:`Cache-Control: no-store`

### GET /api/admin/accounts/{username} — 单用户详情
- **鉴权**:**isAdminAsync**
- **响应**:`{ account:{username,role,status,createdAt,lastLoginAt,inviteCodeHash}, profile:{personaAnchor,nickname}|null, sessions:[{sessionId,createdAt,expiresAt}](未过期), needCases:[{needCaseId,needSummary,feedbackStatus,adminReviewStatus,createdAt}] }`
- **状态码**:200 / 404(不存在)
- **前端调用方**:`src/pages/admin/accounts/[username].astro`

### ⚠️ POST /api/admin/accounts/delete — 删账号(owner-only)
- **鉴权**:**isOwnerAsync**(owner-only!403 "仅站主可删账号")
- **请求体**:`{ username: string }`(不能删自己)
- **响应**:`{ ok:true }`
- **走 `requireHighRiskAudit`** action=`account.delete`(级联:撤销会话 + 删画像 + 需求脱敏 + 删账号)
- **降级**:审计 fail-closed → **503 storage-unavailable**
- **前端调用方**:`src/pages/admin/accounts/[username].astro:206`

### POST /api/admin/accounts/reset — 重置密码
- **鉴权**:**isAdminAsync**(admin 即可,非 owner)
- **请求体**:`{ username: string }`
- **响应**:`{ ok:true, newPassword: <明文一次性> }`
- **走 `requireHighRiskAudit`** action=`account.password.reset`(撤销该用户全部会话 + 生成临时密码)
- **降级**:审计 fail-closed → **503 storage-unavailable**
- **前端调用方**:`src/pages/admin/accounts.astro:191`、`src/pages/admin/accounts/[username].astro:188`

### ⚠️ POST /api/admin/accounts/role — 指派角色(owner-only)
- **鉴权**:**isOwnerAsync**(owner-only!403);不能改自己
- **请求体**:`{ username, role: "user"|"admin"|"owner" }`
- **响应**:`{ ok:true }`
- **走 `requireHighRiskAudit`** action=`account.role.update`(detail 含新 role)
- **降级**:审计 fail-closed → **503 storage-unavailable**
- **前端调用方**:`src/pages/admin/accounts.astro:214`、`src/pages/admin/accounts/[username].astro:201`

### POST /api/admin/accounts/status — 封禁/解封
- **鉴权**:**isAdminAsync**(admin 即可,非 owner)
- **请求体**:`{ username, status: "active"|"banned" }`
- **响应**:`{ ok:true }`
- **走 `requireHighRiskAudit`** action=`account.status.update`
- **降级**:审计 fail-closed → **503 storage-unavailable**
- **前端调用方**:`src/pages/admin/accounts.astro:206`、`src/pages/admin/accounts/[username].astro:195`

## 邀请码(invite-codes)

### GET/POST/DELETE /api/admin/invite-codes — 邀请码管理
- **鉴权**:
  - `GET` **isAdminAsync**(admin+owner 可看)→ 401
  - ⚠️ `POST`/`DELETE` **isOwnerAsync**(owner-only!403)
- **GET**:→ `{ codes:[] }`
- **POST**:体 `{ label?(默认"通用"), count?(1..500,默认1), maxUses?(默认1) }` → `{ ok:true, codes:[<明文码,仅显示一次>] }`
  - **走 `requireHighRiskAudit`** action=`invite-code.generate`
- **DELETE**:体 `{ code }` → `{ ok:true }`
  - **走 `requireHighRiskAudit`** action=`invite-code.delete`(detail 含 codeHashSuffix 末4位)
- **降级**:审计 fail-closed → **503 storage-unavailable**
- **前端调用方**:`src/pages/admin/invite-codes.astro:155/188`

### ⚠️ POST /api/admin/invite-codes/disable — 禁用邀请码(owner-only)
- **鉴权**:**isOwnerAsync**(owner-only!403)
- **请求体**:`{ code: string }`
- **响应**:`{ ok:true }`
- **不走审计**(与 index.ts DELETE 不同,这里直接调 store.disable)
- **前端调用方**:`src/pages/admin/invite-codes.astro:184`

## 对象级授权(grants)— owner 独占

### ⚠️ GET/POST/DELETE /api/admin/grants — 对象级授权(P4 §29)
- **鉴权**:全部 **isOwnerAsync**(owner-only!失败 403 "仅站主可管理授权")
- **GET**:`?grantee=username` → `{ grants:[], count }`
- **POST**:体 `{ grantee(必填), resourceType(必填, content|workitem|skill|insights|hit-rate|northstar), resourceId(必填,"*"表全部), actions[](必填≥1, read|write|comment|review|evaluate), expiresAt?, reason(必填) }` → 201 `{ ok:true, grant }`
  - **走 `requireHighRiskAudit`** action=`grant.save`
- **DELETE**:`?grantId=` → `{ ok:true }`
  - **走 `requireHighRiskAudit`** action=`grant.revoke`
- **降级**:审计 fail-closed → **503 storage-unavailable**
- **前端调用方**:`src/pages/admin/grants.astro:175/189`

## AI Gateway(gateway)

### GET/PUT/POST/PATCH/DELETE /api/admin/gateway — AI Gateway 配置
- **鉴权**:全部 **isAdminAsync**
- **GET**:→ `{ config, stats, logs, history, providers }`(并发 Promise.all)
- **PUT**:体 `{ provider?, baseUrl?, apiKey?, model?, maxTokens?(100..8000), temperature?(0..2), timeoutMs?(3000..120000) }` → `{ ok:true, config }`(apiKey 返回时脱敏)
  - **走审计** action=`gateway.config.update`
- **POST**:测试连接,体 `{ provider?, baseUrl?, apiKey?, model?, apiFormat? }` → 测试结果(不审计)
- **PATCH**:撤销配置。**走审计** action=`gateway.config.undo` → `{ ok:true, config }` 或 404
- **DELETE**:重置配置。**走审计** action=`gateway.config.reset`
- **降级**:审计失败返回 audit.status(**503 storage-unavailable** 在生产无 Redis 时)
- **前端调用方**:**无直接前端调用方**(`src/pages/admin/ai-gateway.astro` SSR 直接 import service modules,不走 API)

## 外观与媒体(appearance)

### GET/PATCH/POST/DELETE /api/admin/appearance — 外观与媒体(UX1)
- **鉴权**:全部 **isAdminAsync**
- **GET**:→ `{ ok:true, ...themeState }`(state 含 theme 字段)
- **PATCH**:体 `{ name?, accent?("walker-jade"|"aurora"|"sunset"|"mint"), density?("low"|"comfortable"), backgroundAssetId?, readabilityOverlay?(number), reducedMotion? }` → `{ ok:true, theme }`
- **POST**:`?action=reset` → `{ ok:true, theme }`;否则 multipart/form-data 上传 `file` → 201 `{ ok:true, media }`
- **DELETE**:`?assetId=`(必填)。**走 `requireHighRiskAudit`** action=`media.delete` → `{ ok:true }`
- **状态码**:`storage-unavailable→503`、`unsupported-media→415`、`too-large→413`、`not-found→404`、`invalid-input→400`
- **前端调用方**:`src/pages/admin/appearance.astro:135/152/164/173`

### GET /api/admin/appearance/media — 后台媒体读取(UX1)
- **鉴权**:**isAdminAsync**
- **请求**:`?assetId`(必填)
- **响应**:**二进制文件流**(非 JSON),`Content-Type: <mimeType>`、`Cache-Control: private, no-store`、`X-Content-Type-Options: nosniff`
- **失败** JSON:`{ error, code }`,`not-found→404`、`storage-unavailable→503`
- **前端调用方**:`src/services/appearance.service.ts:142`

## 赞赏码(support)

### GET/PUT /api/admin/support — 赞赏/收款码配置(P5)
- **鉴权**:**isAdminAsync**(注意:PUT 是 admin 不是 owner,但走审计)
- **GET**:→ `{ config: <SupportConfig|null> }`(null 时返回 `{ updatedAt:"" }`)
- **PUT**:体 `{ wechatQrUrl?, alipayQrUrl?, externalUrl?, externalLabel?, blurb? }`(URL 字段仅校验 http(s) 前缀,非法静默丢弃)→ `{ ok:true, config }`
  - **走 `requireHighRiskAudit`** action=`support.config`
- **降级**:审计 fail-closed → **503 storage-unavailable**
- **前端调用方**:`src/pages/admin/northstar.astro:195`

## 安全事件与架构(incidents / system-map / conversations)

### GET /api/admin/incidents — 未解决事件
- **鉴权**:**isAdminAsync**
- **请求**:`?limit`(1..100,默认 50)
- **响应**:`{ incidents:[] }`,`Cache-Control: no-store`
- **前端调用方**:`src/components/admin/AdminLayout.astro:48/159`、`src/pages/admin/incidents.astro:30`、`src/pages/admin/index.astro:213`

### GET /api/admin/system-map — 后台架构图
- **鉴权**:**isAdmin**(同步版!非 async)→ 401 `{ ok:false, error:"unauthorized" }`
- **响应**:`{ ok:true, version:1, contract:"Evidence -> Decision -> Action -> Outcome -> Capability", modules:[{...module, navigation, apiPrefixes}], relationships }`
- **前端调用方**:**无直接前端调用方**(数据由 `src/lib/admin-system-map.ts` 元数据生成)

### GET /api/admin/conversations — 管理员查看所有对话
- **鉴权**:**isAdminAsync**
- **请求**:`?limit`(默认 20,上限 50)
- **响应**:`{ conversations: [{ sessionId, startedAt, lastActiveAt, endedAt, messageCount, audienceGroup, aiStage, isMinorContext, messages:[{role,content,timestamp}] }], total }`
- **降级(fail-open)**:`if (!redis) return { conversations: [], total: 0 }`(**不返回 503**,返回空集合)
- **前端调用方**:**无直接前端调用方**(仅在 manifest/test 元数据中提及)

## 开发演示(demo-scenario)— 环境门控

### POST/DELETE /api/admin/demo-scenario — 开发演示数据
- **鉴权**:**isAdminAsync** + **DEV-only + loopback**(127.0.0.1/localhost/[::1])
- **POST**:创建 demo 反馈→提案→决定→行动闭环 → 201 `{ ok:true, demo:true, workItemId, feedbackId, label }`;PROD 直接 404
- **DELETE**:清 demo 前缀数据 → `{ ok:true, demo:true, deleted:{ workItems, feedback } }`
- **前端调用方**:`src/scripts/workbench-shell.ts:427`

## 联调验证

```bash
# 账号列表
curl -b cookies.txt "https://<vercel-url>/api/admin/accounts"

# 邀请码生成(owner-only,验证 Redis:成功 201,无 Redis 503)
curl -b cookies.txt -X POST https://<vercel-url>/api/admin/invite-codes \
  -H "Content-Type: application/json" \
  -d '{"label":"联调","count":1,"maxUses":1}'

# 封禁用户(admin 即可)
curl -b cookies.txt -X POST https://<vercel-url>/api/admin/accounts/status \
  -H "Content-Type: application/json" \
  -d '{"username":"test","status":"banned"}'

# 未解决事件
curl -b cookies.txt "https://<vercel-url>/api/admin/incidents?limit=20"

# 对话列表(fail-open,无数据时返回空集而非 503)
curl -b cookies.txt "https://<vercel-url>/api/admin/conversations?limit=5"

# Gateway 配置(无前端调用,只能 curl 验证)
curl -b cookies.txt "https://<vercel-url>/api/admin/gateway"
```

## 已知边界

- **`system-map` 用同步 `isAdmin`**:唯一一个不走 async 鉴权的 admin 端点,生产无 Redis 不影响它(cookie 签名即可)。
- **`gateway` 和 `system-map` 无前端调用**:`ai-gateway.astro` 走 SSR 直调 service,不经 API。联调只能 curl。
- **`conversations` fail-open**:无 Redis 返回空集而非 503,与其他 admin 端点的 fail-closed 模式不同。
