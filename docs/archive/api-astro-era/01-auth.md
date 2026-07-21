# 01 · 认证机制与鉴权模型

所有 user/admin/owner 端点共享同一套认证机制。本章是联调的前置知识——理解了这里,后续每个端点的"鉴权"字段才看得懂。

## 一、会话 Cookie:`walker-session`

### 机制
- **格式**:HMAC-SHA256 签名的 base64url 字符串
- **载荷**:`{ sid: string, role: 'user'|'admin'|'owner', iat: number }`(只装这三项,不装画像/敏感数据)
- **签名密钥**:`COOKIE_SECRET` 环境变量
- **Cookie 属性**:`HttpOnly; SameSite=Lax; Path=/; Max-Age=30天`;**生产额外加 `Secure`**

### 密钥处理(`src/lib/account-auth.ts:20-25`)
```
function getSecret(): string {
  const configured = import.meta.env.COOKIE_SECRET ?? '';
  if (configured) return configured;
  return import.meta.env.DEV ? 'walker-local-preview-session-only' : '';  // dev 硬编码兜底
}
```
- **生产**:`COOKIE_SECRET` 未配 → `signSessionToken` 抛错 → 登录/注册/setup 返回 **500**
- **dev**:`COOKIE_SECRET` 未配 → 用固定弱密钥 `walker-local-preview-session-only`(仅本机预览用途)

> ⚠️ **联调注意**:Vercel 生产**必须**配 `COOKIE_SECRET`,否则所有写账号的端点都 500。这是生产联调的第一道关卡。

## 二、鉴权函数层级

```
readSessionId(request)          同步,只验签名,返回 sid 或 null(不查会话有效性)
readSessionPayload(request)     同步,只验签名,返回 {sid, role, iat} 或 null
isAdmin(request)                同步,纯 cookie 判定 role ∈ {admin, owner}(无 Redis)
isAdminAsync(request, store)    异步,验签名 + 查 sessionStore 是否撤销(生产 admin gate 必须用)
isOwnerAsync(request, store)    异步,仅 role === 'owner'
```

### 关键差异:`isAdmin` vs `isAdminAsync`
- `isAdmin`(同步):**只验 cookie 签名**,不查会话是否被撤销。如果 owner 在 admin 后台点了"撤销该用户全部会话",用 `isAdmin` 的端点**仍会放行**直到 cookie 自然过期。
- `isAdminAsync`(异步):验签名 + 查 `sessionStore` 确认会话未撤销。**生产 admin gate 应该用这个**。
- 当前代码里**绝大多数 admin 端点用 `isAdminAsync`**,只有 `GET /api/admin/system-map` 用同步 `isAdmin`(已知历史遗留)。

### DEV 模式降级(`src/lib/admin-auth.ts:30-32`)
```
function devFallback(): boolean {
  return import.meta.env.DEV;  // DEV 模式无 Redis 时放行,避免 HMR 重启需重登
}
```
- DEV + 无 Redis → `isAdminAsync`/`isOwnerAsync` 通过 `devFallback()` 放行(只要 cookie 签名有效)
- 生产 + 无 Redis → `sessionStore` 校验失败 → **401**(不是 503,这是已知行为)

## 三、UserContext 解析(`src/services/user-context.service.ts`)

`userContextService.resolve({ sessionId, isAdmin })` 是 user 端点的鉴权核心,返回 `authState`:

```
isAdmin === true                    → authState = 'admin'(其余字段 null)
无 sessionId / 会话过期 / 账号 status ≠ 'active'
                                    → authState = 'public'(未登录处理)
否则                                 → authState = 'user',带 sessionId + username + profile
```

`status ≠ 'active'` 包括:`banned`(封禁)、`deleteRequested`(用户申请删除中)。这些账号即使 cookie 有效,也被当 public 处理。

## 四、角色与数据边界

| 数据 | public | user | admin | owner |
| --- | --- | --- | --- | --- |
| 公开统计 | 聚合 | 聚合 | 完整 | 完整 |
| 自己的画像 | 不可见 | 可见/可改 | 可见 | 可见 |
| 他人画像 | 不可见 | 不可见 | 可见 | 可见 |
| 原始需求事件 | 不可见 | 仅自己摘要 | 完整脱敏 | 完整脱敏 |
| TopicCandidate | 不可见 | 不可见 | 可见 | 可见 |
| draft/private 内容 | 不可见 | 不可见 | 可见 | 可见 |
| admin-only 数据 | 不可见 | 不可见 | 可见 | 可见 |
| 账号管理 | 不可见 | 不可见 | 列表/封禁/重置 | +删账号/指派角色/邀请码 |
| 对象级授权(grants) | 不可见 | 不可见 | 不可见 | 独占 |

## 五、Owner-only 端点清单(403 而非 401)

这 5 类端点用 `isOwnerAsync`,**admin 调用返回 403**(`仅站主可...`),不是 401:

| 端点 | action |
| --- | --- |
| `GET/POST/DELETE /api/admin/grants` | 对象级授权管理(grant.save/grant.revoke) |
| `POST /api/admin/accounts/delete` | 删账号(account.delete) |
| `POST /api/admin/accounts/role` | 指派角色(account.role.update) |
| `POST/DELETE /api/admin/invite-codes` | 生成/删除邀请码(invite-code.generate/delete) |
| `POST /api/admin/invite-codes/disable` | 禁用邀请码 |

> 注:`GET /api/admin/invite-codes` 是 admin+owner 可看,但 POST/DELETE 限 owner。

## 六、Token / Secret 鉴权(cron 与双轨端点)

### Token 来源
- 环境变量 `MATCH_PROCESS_SECRET` 或 `CRON_SECRET`
- 请求头:`x-match-process-secret: <secret>` 或 `Authorization: Bearer <secret>`

### 适用端点
| 端点 | 鉴权 |
| --- | --- |
| `GET/POST /api/match-process` | Token 必填(密钥未配时:`!PROD` 放行,`PROD` 拒绝 401) |
| `GET/POST /api/insights` | **双轨**:admin cookie 优先,或同 match-process 的 token |

## 七、环境门控端点

这两个端点不靠 cookie/token,靠环境变量 + 主机名:

| 端点 | 门控 |
| --- | --- |
| `POST /api/auth/dev-preview` | `import.meta.env.DEV === true` AND hostname ∈ {127.0.0.1, localhost, [::1]} → 否则 404(伪装不存在) |
| `POST /api/admin/demo-scenario` | `isAdminAsync` + DEV-only + loopback → 否则 404 |

## 八、Actor 派生(`src/lib/admin-actor.ts`)

所有 admin 写动作的 `actor` 字段由会话派生,**不信任客户端传入的 actor**:
```
username (从会话) → role (admin/owner) → 'anonymous'(兜底)
```
客户端在 body 里传 `actor` 字段会被忽略。联调时不要试图伪造 actor。

## 九、审计门闩(`src/lib/admin-audit.ts`)

`requireHighRiskAudit(action, detail, actor)` 是高风险动作的统一前置门闩:

```
生产/预览 无 Redis  → { ok:false, code:'storage-unavailable', status:503 }(fail-closed,拒绝执行)
审计写入抛错        → { ok:false, code:'audit-write-failed', status:503 }
detail 字段自动剔除  → password/token/apikey/secret 等敏感 key(防泄露)
```

走审计的 14 类端点见 [09-degradation.md](./09-degradation.md)。**生产无 Redis 时这些端点全部 503**,这是联调时验证 Redis 可用性的关键信号。

## 联调验证(Vercel 生产)

```bash
# 1. 验证 COOKIE_SECRET 已配:登录应返回 200 + Set-Cookie,而非 500
curl -i -X POST https://<vercel-url>/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"<owner>","password":"<pwd>"}'

# 2. 拿到 cookie 后,验证 admin gate
curl -i https://<vercel-url>/api/admin/auth \
  -b "walker-session=<上一步的 cookie>"

# 3. 验证 Redis 可用:任一走审计的端点应返回业务结果而非 503
curl -i -X POST https://<vercel-url>/api/admin/invite-codes \
  -b "walker-session=<cookie>" \
  -H "Content-Type: application/json" \
  -d '{"label":"联调测试","count":1,"maxUses":1}'
# 预期:201 { ok:true, codes:[...] };若 503 storage-unavailable → Redis 未连
```
