# Nest API 契约（当前唯一）

> **权威范围**：`apps/api`（NestJS）。  
> **栈**：React monorepo · PostgreSQL · 管理鉴权 `Authorization: Bearer <ADMIN_API_TOKEN>`。  
> **废止**：Astro 时代 67 端点文档见 [`docs/archive/api-astro-era/`](../archive/api-astro-era/)。

## 前缀约定

| 调用方 | 路径形态 | 说明 |
|--------|----------|------|
| 直连 API（`:8788`） | `/health`、`/intake`、… | **无**全局 `setGlobalPrefix` |
| 浏览器经 Vite 开发代理 | `/api/health`、`/api/intake`、… | `apps/web` / `apps/admin` 把 `/api` 前缀 strip 后转发到 8788 |
| 生产同站反代（切流） | 通常对外 `/api/*` → Nest 裸路径 | 见 `docs/ENGINEERING.md` §5 |

## 鉴权

| 类 | 机制 |
|----|------|
| 公开 | 无 Bearer；游客用 Cookie `walker-anon`（HttpOnly，intake 配额） |
| 管理 | **必须** `Authorization: Bearer <ADMIN_API_TOKEN>`，令牌长度 ≥ 16；未配置或错误 → **401** |
| 用户登录 | **未实现**（`/login` 仅为前台壳；无 session/cookie 登录 API） |

角色枚举 `public/user/admin/owner` 与邀请码账号体系 **不在** 本 monorepo 管理面路径内。

## 错误码（机器可读 `body.code`）

| code | HTTP | 含义 |
|------|------|------|
| `validation-error` | 400 | 入参不合法 |
| `missing-clue` | 400 | 主选等缺线索 |
| `guest-quota-exceeded` | 429 | 游客完整 intake 次数用尽 |
| `rate-limited` | 429 | 限流 |
| `storage-unavailable` | 503 | 无 `DATABASE_URL` 或存储不可写 |

**FeatureEvent.failCode** 与上表 **同一 kebab 词表**（`FEATURE_FAIL_CODES`）。读指标时历史 snake（如 `quota_exceeded`）会 **merge 进** 对应 kebab，不改库内旧行。

## 端点表

### 公开

| 方法 | 路径 | 鉴权 | 请求 | 成功 |
|------|------|------|------|------|
| GET | `/health` | 无 | — | `{ ok, db, aiEnabled }` |
| POST | `/intake` | 无（写 anon cookie） | `{ body: string, source?: string }` | **201** `{ clueId, nextStep, bucketId, aiUsedFlag, poolStatus }` |
| GET | `/likes?path=` | 无 | query `path` | `{ path, count }` |
| POST | `/likes` | 无 | `{ path: string }` | `{ path, count }` |
| POST | `/content-feedback` | 无 | `{ contentId, signal, note? }` signal: `useful` \| `needs-more` \| `outdated` | `{ id, contentId, signal }` |
| POST | `/search-events` | 无 | `{ query?, hadResults? }`；`hadResults===false` 记 miss | `{ ok: true }` |

### 管理（均需 Bearer）

| 方法 | 路径 | 请求要点 | 说明 |
|------|------|----------|------|
| GET | `/clues?limit=` | — | 线索列表 |
| POST | `/clues` | `{ body, source? }` | 手动入库 |
| PATCH | `/clues/:id/pool` | `{ poolStatus }` | 池状态 |
| GET | `/seeds?limit=` | — | 题苗列表 |
| POST | `/seeds` | `{ title }` | 新建题苗 |
| POST | `/seeds/:id/link` | `{ clueId, asPrimary? }` | 挂线索 |
| POST | `/seeds/:id/promote` | `{ clueId }` | 主选 → 建执行卡 |
| POST | `/seeds/:id/two-questions` | `{ severity, selfInterest }` | 两问 |
| GET | `/executions?limit=` | — | 执行卡列表 |
| POST | `/executions/:id/deliver` | `{ url?, form?, note? }` | 交付 |
| POST | `/executions/:id/review` | `{ outcome, evidence? }` | 检验；可计数由规则判定 |
| GET | `/metrics` | — | 闭环 + 功能事件 + 线索来源分桶等 |
| GET | `/admin/content` | — | 内容文件列表（`content/log`） |
| GET | `/admin/content/:slug` | — | 单篇 raw markdown |
| PUT | `/admin/content/:slug` | `{ raw }` | 写回磁盘（需 frontmatter）；保存后异步 `content:gen` |
| GET | `/support` | — | 赞赏配置（公开） |
| PUT | `/support` | SupportConfig body | 写赞赏配置（Bearer） |

## curl 示例

```bash
# 健康（直连 API）
curl -sS http://127.0.0.1:8788/health

# 游客 intake（保留 cookie 测配额）
curl -sS -c /tmp/w.jar -b /tmp/w.jar \
  -H 'Content-Type: application/json' \
  -d '{"body":"想用 AI 写周报但每天只有半小时"}' \
  http://127.0.0.1:8788/intake

# 管理线索
TOKEN=你的ADMIN_API_TOKEN
curl -sS -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8788/clues
```

## 存储与限流（生产注意）

| 项 | 实现 | 含义 |
|----|------|------|
| 持久化 | PostgreSQL + Prisma | 缺库写路径 → `storage-unavailable` |
| 游客配额 | PG `GuestQuota` | 与 anon cookie 绑定 |
| 限流 | **进程内内存** `InMemoryRateLimiter` | **单实例有效**；多副本需换适配器，否则可被绕过 |
| AI | `AI_ENABLED=true` 才可能调模型；默认关，规则 nextStep | |

## 前端门面

| 端 | 模块 | 职责 |
|----|------|------|
| web | `apps/web/src/api/public-api.ts` | 页面只调门面，不散落 fetch |
| admin | `apps/admin/src/api/*` + Bearer token-store | 管理过程 |

## 维护规则

1. 改 `apps/api/src/**/*.controller.ts` 后同步本文件。  
2. **禁止**把 `docs/archive/api-astro-era` 当现行契约。  
3. 行为验收：`pnpm accept:dual-entry` / `pnpm accept:deep`（需三端已起）。
