# 03 · 账号 API

登录、注册、登出、画像、改密、本机预览。所有成功登录/注册/setup 都回 `Set-Cookie: walker-session=...`。

> 鉴权细节见 [01-auth.md](./01-auth.md)。

## 认证入口(auth)

### POST /api/auth/login — 用户名密码登录
- **鉴权**:公开入口
- **请求体**:`{ username: string, password: string }`
- **响应 200**:`{ ok:true, username, role }` + `Set-Cookie: walker-session=...`
- **状态码**:200 / 429(限流) / 400(格式) / **401(`{ ok:false, reason }`,统一"用户名或密码错误"防枚举)** / 500(COOKIE_SECRET 未配)
- **限流**:`rateLimit`(IP + 固定窗口,无 Retry-After):每 IP 每分钟 **10 次**(防爆破)。Redis incr+expire,异常→内存降级
- **前端调用方**:`src/pages/login.astro`、`src/pages/admin/login.astro`

### POST /api/auth/register — 邀请码门控注册
- **鉴权**:公开入口(凭邀请码)
- **请求体**:`{ inviteCode: string, username: string, password: string, personaAnchor?: string }`
- **响应 200**:`{ ok:true, username, role }` + `Set-Cookie`
- **状态码**:200 / 429(限流) / 400(格式/缺字段/注册失败,带 `reason`) / 500(COOKIE_SECRET)
- **限流**:每 IP 每分钟 **5 次**(防邀请码枚举)
- **前端调用方**:`src/pages/login.astro`

### POST /api/auth/setup — owner 一次性 bootstrap
- **鉴权**:凭 `ADMIN_PASSWORD`(`accountService.bootstrapOwner`)。**仅当系统无账号时可用,之后自锁**
- **请求体**:`{ adminPassword: string, ownerUsername: string, ownerPassword: string }`
- **响应 200**:`{ ok:true, username, role:"owner" }` + `Set-Cookie`(直接登录 owner)
- **状态码**:200 / 400(格式/bootstrap 失败) / **410(`code === 'bootstrap-locked'`,系统已有账号)** / 500(COOKIE_SECRET)
- **限流**:无(靠一次性自锁)
- **前端调用方**:`src/pages/login.astro`

### POST /api/auth/logout — 登出
- **鉴权**:读 cookie sessionId(可空)
- **请求体**:无
- **响应 200**:`{ ok:true }` + `Set-Cookie: walker-session=; Max-Age=0`(清 cookie)。**登出服务端失败仍清 cookie**(try/catch 吞错)
- **前端调用方**:`src/scripts/auth-chip.ts`、`src/pages/login.astro`

### POST /api/auth/change-password — 用户自助改密
- **鉴权**:**需登录 user**(`userContextService.resolve`,**强制 `isAdmin:false`** — admin/owner 不走此入口)。`!user` → 401
- **请求体**:`{ currentPassword: string, newPassword: string }`
- **响应 200**:`{ ok:true }`
- **状态码**:200 / 401(未登录) / 400(格式/缺字段/改密失败,返回 result 对象带 `ok:false, reason`)
- **注意**:改密会撤销当前会话
- **前端调用方**:`src/pages/account.astro`

### POST /api/auth/dev-preview — 本机开发预览会话
- **鉴权**:**双重门**:`import.meta.env.DEV === true` AND hostname ∈ {127.0.0.1, localhost, [::1], ::1}(loopback)。不满足 → **404**(伪装不存在)
- **行为**:不建账号、不写数据库;创建 `local-preview:<uuid>` 临时会话(role=**owner**,24h 过期),签发 `Set-Cookie`
- **响应**:200 `{ ok:true }` + `Set-Cookie`;或 404 `{ ok:false, reason:"此入口仅在本机开发环境可用。" }`
- **降级/安全**:生产构建/非 loopback 一律 404。COOKIE_SECRET 未配时 DEV 用固定弱密钥 `walker-local-preview-session-only`
- **前端调用方**:`src/pages/login.astro`(开发态按钮)

## 画像(profile)

### GET/POST /api/profile — 当前账号画像
- **鉴权**:读 `walker-session` → `userContextService.resolve`
- **GET**:
  - `admin` → `{ authState:"admin", profile:null }`
  - `user` → `{ authState:"user", profile }`
  - `public` → **401**
- **POST**(仅 `user`,`!user` → 401;admin 也不能 POST):
  - 请求体:`{ personaAnchor?: string(≤200), nickname?: string(≤200) }`(均可选,trim)
  - 响应:`{ profile }`
- **状态码**:200 / 401(未登录) / 400(格式/字段过长/`PersonaAnchorPiiError` 含手机号邮箱 → "锚点含敏感信息")
- **前端调用方**:`src/scripts/tool-match-chat.ts:92`、`src/scripts/auth-chip.ts`、`src/components/auth/AuthChip.astro`、`src/pages/account.astro`

### POST /api/profile/delete-request — 请求删除画像与相关需求事件
- **鉴权**:**user**(`userContextService.resolve`)
- **行为**:标记账号 `deleteRequestedAt`,触发需求事件脱敏(`redactNeedCasesBySession`)
- **前端调用方**:见 `src/pages/account.astro`(删除请求入口)

> 注:该端点在扫描中确认存在(`src/pages/api/profile/delete-request.ts`),详细 body 字段以代码为准——联调时实际跑一次补充。

## 联调验证(Vercel 生产)

```bash
# 1. 验证系统是否已 bootstrap:尝试 setup,预期 410(已有账号)或 200(首次)
curl -i -X POST https://<vercel-url>/api/auth/setup \
  -H "Content-Type: application/json" \
  -d '{"adminPassword":"<ADMIN_PASSWORD>","ownerUsername":"walker","ownerPassword":"<新密码>"}'
# 预期:410 bootstrap-locked(生产已初始化)

# 2. owner 登录(联调主用账号)
curl -i -c cookies.txt -X POST https://<vercel-url>/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"<owner>","password":"<pwd>"}'
# 预期:200 + Set-Cookie + role:"owner";cookies.txt 保存 cookie 供后续 admin 联调用

# 3. 限流验证:连续 11 次错误登录,第 11 次应 429
for i in $(seq 1 11); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST https://<vercel-url>/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"x","password":"x"}'
done
# 预期:前 10 个 401,第 11 个 429

# 4. 画像读取(带 cookie)
curl -b cookies.txt https://<vercel-url>/api/profile
# 预期:{ authState:"user"|"admin", profile:... }

# 5. 改密(用 user 账号,非 owner)
curl -X POST https://<vercel-url>/api/auth/change-password \
  -b "walker-session=<user-cookie>" \
  -H "Content-Type: application/json" \
  -d '{"currentPassword":"<旧>","newPassword":"<新>"}'
# 预期:200 { ok:true }(改密后该会话失效)
```

## 已知边界

- **`/api/auth/change-password` 强制 user**:admin/owner 不能走这个入口改密。owner 改密需要通过 `/api/admin/accounts/reset`(让另一个 owner 重置,或用 setup 流程)。
- **`dev-preview` 在生产 404**:这是设计如此,不是 bug。生产环境联调时不要尝试调用这个端点。
- **防枚举**:login 的 401 统一返回"用户名或密码错误",不区分用户不存在 vs 密码错。
