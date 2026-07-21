# 09 · 降级与限流总表(联调必读)

本章是 Vercel 生产联调的**核心诊断手册**。生产环境的很多"故障"其实是设计内的降级行为,理解这张表才能正确判断"是 bug 还是配置问题"。

## 一、生产 vs Dev 降级差异(最关键)

| 服务 | 缺凭据时(生产) | 缺凭据时(dev) | 联调信号 |
| --- | --- | --- | --- |
| **Redis** | `getRedis()` → null → store 操作返回 `storage-unavailable` → **写端点 503**(走审计的)或读端点返回空/默认 | null → 内存 Map 降级(重启丢) | 生产 503 = Redis 未连 |
| **COOKIE_SECRET** | 未配 → `signSessionToken` 抛错 → **登录/注册/setup 返回 500** | 未配 → 用硬编码 `walker-local-preview-session-only` | 生产登录 500 = COOKIE_SECRET 未配 |
| **模型 Gateway** | 读 Redis hash `ai-gateway:config`;无则读 `.gateway-config.json`(本地文件,生产没有);都没有 → `DEFAULT_CONFIG`(空 apiKey)→ `/api/match` 走本地规则匹配,`/api/ideas/ai-refine` 走硬编码 fallback | 读 `.gateway-config.json`(有真实 DeepSeek key) | 生产 `/api/match` 无模型增强 = Gateway config 未在 Redis 配 |
| **GITHUB_TOKEN** | 无 → admin 内容编辑 PUT 抛 `ContentStoreError('GITHUB_TOKEN 未配置。', 503)` | DEV 无 token → `createLocalContentFileStore` 写本地+git | 生产内容保存 503 = GITHUB_TOKEN 未配 |
| **BLOB_READ_WRITE_TOKEN** | 无 → `createVercelBlobMediaStorage` mode='unavailable' → 媒体上传抛 `media-storage-unavailable` | DEV 一律 `createFileMediaStorage` 本地 fs | 生产媒体上传失败 = BLOB token 未配 |
| **MATCH_PROCESS_SECRET / CRON_SECRET** | 未配 + PROD → `/api/match-process` 401;`/api/insights` token 路径 401(cookie 路径仍可用) | 未配 + !PROD → 放行 | 生产 cron 401 = secret 未配 |
| **NORTHSTAR_ENABLED** | 默认 false → offers/orders 写操作 409 `northstar-disabled` | 同 | 409 = 门控关闭(设计如此) |

## 二、Fail-closed vs Fail-open 清单

### Fail-closed(生产无 Redis → 503,拒绝执行)
**所有走 `requireHighRiskAudit` 的端点**——14 类高风险动作:

| 端点 | action |
| --- | --- |
| `DELETE /api/admin/appearance?assetId=` | media.delete |
| `PUT/PATCH/DELETE /api/admin/gateway` | gateway.config.update / undo / reset(POST 测试连接不审计) |
| `POST/DELETE /api/admin/grants` | grant.save / grant.revoke(GET 不审计) |
| `POST /api/admin/accounts/delete` | account.delete |
| `POST /api/admin/accounts/reset` | account.password.reset |
| `POST /api/admin/accounts/role` | account.role.update |
| `POST /api/admin/accounts/status` | account.status.update |
| `POST /api/admin/skills?action=admission` | skill.admission(create/pause/resume/rollback 不显式审计) |
| `PUT /api/admin/support` | support.config(GET 不审计) |
| `POST /api/admin/assets/promote` | asset.promote |
| `DELETE /api/admin/content/{slug}` | content.delete(GET/PUT/PATCH 不审计) |
| `POST/DELETE /api/admin/invite-codes` | invite-code.generate / delete(GET 不审计) |
| `POST/PATCH/DELETE /api/admin/northstar/offers` | offer.publish / update / unlist(GET 不审计) |
| `POST /api/admin/northstar/orders?action=pay\|fulfill\|refund` | order.transition(create 不审计) |

另外,以下端点的 service 自带 `storage-unavailable` 状态码 map(虽不走审计,但无 Redis 时也 503):
- `POST /api/admin/actions`、`POST /api/admin/decisions`、`PATCH /api/admin/actions/{id}`、`POST /api/admin/outcomes`、`PATCH /api/admin/decisions/{id}`、`PATCH /api/admin/learning-requests`

### Fail-open(无 Redis 返回空集或默认值,**非** 503)
| 端点 | 行为 |
| --- | --- |
| `GET /api/admin/conversations` | `{ conversations:[], total:0 }` |
| `GET /api/stats` | `matchCount=0, topCategories=[]`(`contentCount` 仍正常) |
| `GET /api/like?path=` | count=0 |
| `POST /api/search-events` | 静默 fire-and-forget,仍返回 `{ok:true}` |
| `POST /api/ideas/ai-refine` | 硬编码 fallback,始终 200 |
| `POST /api/match` | 本地规则匹配降级(无模型增强) |
| 所有 `consumeRateLimit`/`rateLimit` | 进程内 Map(带 setTimeout 过期) |

### DEV 模式额外宽松
- `isAdminAsync`/`isOwnerAsync` 无 Redis 时通过 `devFallback()` 放行(只要 cookie 签名有效)
- 生产无 Redis 时 sessionStore 校验失败 → **401**(不是 503)

## 三、限流总表

### consumeRateLimit(IP SHA-256 哈希 + 60s 滚动窗口,带 Retry-After)
| 命名空间 | 端点 | max | dev 放宽 |
| --- | --- | --- | --- |
| `content-feedback` | `POST /api/content-feedback` | 5 | ×50 = 250 |
| `content-telemetry` | `POST /api/content-telemetry` | 20 | ×50 = 1000 |
| `canvas-save` | `POST /api/posts/{slug}/canvas` | 15 | ×50 = 750 |
| `collaborate` | `POST /api/posts/{slug}/collaborate` | 3(更严) | ×50 = 150 |

### rateLimit(IP + 固定窗口,无 Retry-After)
| 端点 | 窗口 | max |
| --- | --- | --- |
| `POST /api/auth/login` | 60s | 10(防爆破) |
| `POST /api/auth/register` | 60s | 5(防邀请码枚举) |

### rateLimiter.checkAndIncrement(三桶:per-subject daily + per-minute + global daily)
| 端点 | daily limit | per-minute | global daily | 降级 daily(无 Redis) |
| --- | --- | --- | --- | --- |
| `POST /api/match` | `MATCH_DAILY_LIMIT`(默认 20) | 5 | 1000 | **5**(`FALLBACK_DAILY_LIMIT`) |

主体 = SHA-256 哈希(`MATCH_RATE_LIMIT_SALT`/`CRON_SECRET` 加盐)的 `user:<sid>` 或 `admin:<ip>`。

### 无限流的端点
`match-end`、`match-feedback`、`match-history`、`match-process`、`insights`、`like`(靠 store 内冷却)、`stats`、`profile`、`search-events`、`ideas/*`(全部 4 个)、`posts/[slug]/export`、`auth/logout`、`auth/setup`、`auth/change-password`、`auth/dev-preview`、所有 admin 写端点(靠鉴权门槛)。

## 四、诊断速查表

| 现象 | 最可能原因 | 验证方法 |
| --- | --- | --- |
| 登录返回 500 | `COOKIE_SECRET` 未配(Vercel) | 检查 Vercel Environment Variables |
| admin 写操作 503 storage-unavailable | Redis 未连(Vercel) | `curl /api/stats` 看 matchCount 是否 0 |
| 内容保存 503 GITHUB_TOKEN 未配置 | `GITHUB_TOKEN` 未配(Vercel) | 检查 Vercel env |
| 媒体上传失败 | `BLOB_READ_WRITE_TOKEN` 未配 | appearance 页面会显示存储模式 |
| `/api/match` 无模型增强 | Gateway config 未在 Redis 配 | `/api/admin/gateway` GET 看 config |
| `/api/match-process` 401 | `MATCH_PROCESS_SECRET`/`CRON_SECRET` 未配 | 检查 Vercel env |
| offers 写操作 409 | `NORTHSTAR_ENABLED` 未配(设计如此) | 不是 bug,门控关闭 |
| admin 端点 401 但已登录 | 生产无 Redis,sessionStore 校验失败 | 先修 Redis,这是 fail-closed |
| admin 端点在 dev 可用、生产 401 | 同上 + dev `devFallback()` 放行掩盖了问题 | 生产必须有 Redis |

## 五、联调必跑的 3 个健康检查

```bash
# 1. COOKIE_SECRET 已配(登录应 200,非 500)
curl -i -X POST https://<vercel-url>/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"<owner>","password":"<pwd>"}' | head -1

# 2. Redis 已连(走审计的端点应返回业务结果,非 503)
curl -i -b cookies.txt -X POST https://<vercel-url>/api/admin/invite-codes \
  -H "Content-Type: application/json" \
  -d '{"label":"健康检查","count":1}' | head -1

# 3. stats 反映 Redis 状态(matchCount=0 不一定是 bug,但结合上面 503 可确认)
curl https://<vercel-url>/api/stats
```
