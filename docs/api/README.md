# Nest API 契约（当前唯一）

> **权威范围**：`apps/api`（NestJS）。  
> **栈**：React monorepo · SQLite（生产）/ PostgreSQL（可选）· **管理面已启用令牌**（2026-09-03 切流起）。  
> **废止**：Astro 时代 67 端点文档见 [`docs/archive/api-astro-era/`](../archive/api-astro-era/)。

## 前缀约定

| 调用方 | 路径形态 | 说明 |
|--------|----------|------|
| 直连 API（`:8788`） | `/health`、`/intake`、… | **无**全局 `setGlobalPrefix`；只绑 127.0.0.1 |
| 浏览器经 Vite 开发代理 | `/api/health`、`/api/intake`、… | `apps/web` / `apps/admin` 把 `/api` 前缀 strip 后转发到 8788 |
| 生产同站反代 | `www.iwalk.pro/api/*` → `https://api.iwalk.pro`（Caddy 白名单）→ Nest 裸路径 | 见 `docs/ENGINEERING.md` §5 |

## 鉴权

| 类 | 机制 |
|----|------|
| 公开 | 白名单路由免鉴权（下表「公开」段；与 `ops/windows/Caddyfile` 双侧同步）；游客 Cookie `walker-anon`（HttpOnly，intake 配额 / 助手会话归属） |
| 管理 | Basic 密码 = `WALKER_ADMIN_TOKEN`（Nest `AdminTokenMiddleware`），或 `x-admin-token` 头；公网另有 Caddy basic auth 双防线。生产缺 `WALKER_ADMIN_TOKEN` 拒启 |
| 用户登录 | **未实现**（延后范围） |

## 错误码（机器可读 `body.code`）

| code | HTTP | 含义 |
|------|------|------|
| `validation-error` | 400 | 入参不合法（具体原因在 `body.message`，如 `content-brief-incomplete`、`work-already-running`） |
| `missing-clue` | 400 | 主选等缺线索 |
| `artifact-hash-mismatch` | 400 | 审批/发布绑定的候选 hash 与最新产物不一致 |
| `guest-quota-exceeded` | 429 | 游客完整 intake 次数用尽（配额原子消耗，拒绝不留线索） |
| `rate-limited` | 429 | 限流 |
| `storage-unavailable` | 503 | 无 `DATABASE_URL` 或存储不可写 |

**FeatureEvent.failCode** 与上表同一 kebab 词表（`FEATURE_FAIL_CODES`）；另含 `budget-exceeded`（助手日预算触顶）、`budget-storage-failed`（预算存储失效，已用进程内兜底计数）。

## 端点表

### 公开（免鉴权，白名单内）

| 方法 | 路径 | 请求 | 成功 |
|------|------|------|------|
| GET | `/health` | — | `{ ok, db, aiEnabled }` |
| POST | `/intake` | `{ body, source? }`（写 anon cookie） | **201** `{ clueId, nextStep, bucketId, aiUsedFlag, suggestedSlug, suggestedTitle, poolStatus }` |
| POST | `/assistant` | `{ body, source?, sessionId? }`；`body` ≥2 字符；`sessionId` 须属于当前访客的 harness 会话，否则**静默开新会话**（归属 fail-closed） | **201** `{ sessionId, answer, citations:[{slug}], aiUsedFlag, elapsedMs }` |
| POST | `/assistant/stream` | 同上（SSE） | 事件序列 `text`（只含裁剪后的 answer 增量，原始模型 JSON 不出网关）→ `done`（Run 合同终值，整体覆盖）/ `error`；浏览器断流自动取消服务端等待 |
| GET | `/likes?path=` / POST `/likes` | `{ path }` | `{ path, count }` |
| POST | `/content-feedback` | `{ contentId, signal: useful\|needs-more\|outdated, note? }` | `{ id, contentId, signal }` |
| POST | `/search-events` | `{ query?, hadResults? }` | `{ ok: true }` |
| GET | `/support` | — | 赞赏配置 |

### 管理（须 Basic/token）

**过程四面（线索/题苗/执行）**

| 方法 | 路径 | 请求要点 | 说明 |
|------|------|----------|------|
| GET/POST | `/clues` | POST `{ body, source? }` | 线索列表 / 手动入库 |
| PATCH | `/clues/:id/pool` | `{ poolStatus }` | 池状态 |
| GET/POST | `/seeds` | POST `{ title }` | 题苗 |
| PATCH | `/seeds/:id` | `{ title?, workflowStatus?, whyNow? }` | 选题状态机（SELECTED 只能经 promote） |
| POST | `/seeds/:id/link` | `{ clueId, asPrimary? }` | 挂线索 |
| POST | `/seeds/:id/promote` | `{ clueId, brief, whyNow? }` | **主选必带完整 brief**（audience/scenario/problem/keyQuestion/intendedAction，缺即 400 `content-brief-incomplete`）；成功建执行卡 + 写作任务 |
| POST | `/seeds/:id/two-questions` | `{ severity, selfInterest }` | 两问 |
| GET | `/executions` | — | 执行卡 |
| POST | `/executions/:id/deliver` | `{ url?, form?, note? }` | 交付 |
| POST | `/executions/:id/review` | `{ outcome, evidence? }` | 检验 |
| GET | `/metrics` | — | 闭环 + 功能事件 |
| GET | `/workbench` | — | 今日/过程聚合快照 |
| GET/POST/PATCH | `/actions`… | 任务/视频日志 | `complete` / `reopen` |
| GET | `/assistant/runs?limit=` | — | 助手问题池（转题苗人工触发） |
| GET | `/insights/signals?days=N` | — | 四源需求信号聚合 |
| POST | `/insights/report` / GET `/insights/reports` | — | 需求周报（harness 归纳） |
| POST | `/insights/suggestions/seed` | `{ kind, text, evidence? }` | 周报建议→INBOX 题苗（仅 write；7 天同题幂等；evidence→whyNow；主选仍人工五问） |
| GET/PUT | `/admin/content`… | PUT `{ raw }` | 内容文件读写（保存后异步 `content:gen`；上线走 `pnpm content:publish --push`） |
| GET/PUT | `/credentials`… | AES-256-GCM 密文 | 凭据库（`reveal` 须二次确认） |

**工作站（works）**

| 方法 | 路径 | 说明 |
|------|------|------|
| GET/POST | `/works`（POST multipart：idempotencyKey/title/coreViewpoint/必填 brief 五项/draft 文件） | 人工初稿建 work（幂等键防重复创建） |
| GET | `/works/:id` | 单 work |
| POST | `/works/:id/produce` | 跑固定配方（假 runner 缺省；`fromStage` 断点续跑）；**同 work 运行互斥**，重复触发 400 `work-already-running` |
| POST | `/works/:id/produce/cancel` | 取消：abort 在途 runner，CANCELLED 为稳定终态，迟到结果不覆盖 |
| POST | `/works/:id/artifacts` | 手工接受阶段产物 |
| GET | `/works/:id/review` | 审阅包（原稿全文 + 完整候选 + hash + 风险 + 双平台预览）；刷新后可完整恢复 |
| POST | `/works/:id/approve` | `{ artifactHash }`：按审阅包候选 hash 批准 |
| POST | `/works/:id/return` / `cancel` / `recover` | 退回修改 / 终止 / 从指定阶段恢复 |
| GET | `/works/:id/publications` | 发布记录（channel/status/url/lastError） |
| POST | `/works/:id/publish/website` | `{ artifactHash }`：写 `content/log`（frontmatter 与 build:web 门禁同源合同，缺字段写盘前即拒）。状态 **PREPARED** ——保存 ≠ 发布，上线须 `pnpm content:publish --push` |
| POST | `/works/:id/publish/website/verify` | 校验线上 URL → `PUBLISHED` / `FAILED` |
| POST | `/works/:id/publish/wechat-draft` | 公众号草稿准备包（WAITING_USER，人工上传） |
| POST | `/works/:id/export` | 整包导出 |

## curl 示例

```bash
# 健康（直连 API）
curl -sS http://127.0.0.1:8788/health

# 游客 intake（保留 cookie 测配额）
curl -sS -c /tmp/w.jar -b /tmp/w.jar -H 'Content-Type: application/json' \
  -d '{"body":"想用 AI 写周报但每天只有半小时"}' \
  http://127.0.0.1:8788/intake

# 管理接口（带令牌）
curl -sS -H "x-admin-token: $WALKER_ADMIN_TOKEN" http://127.0.0.1:8788/clues
```

## 存储与限流（生产注意）

| 项 | 实现 | 含义 |
|----|------|------|
| 持久化 | 生产 SQLite + Prisma（PG 迁移已补齐，启用前须空库重放验证） | 缺库写路径 → `storage-unavailable` |
| 游客配额 | `GuestQuota` 原子条件消耗 | 并发恰好消费一次；拒绝不留线索 |
| 限流 | **进程内内存** `InMemoryRateLimiter` | **单实例有效**；多副本需换适配器 |
| AI | `AI_ENABLED=true` 才调模型；**运行时统一为 dsh**（助手/卡口 nextStep/工作站配方/洞察周报同家族） | 助手 200 问/日预算熔断（存储失效进程内兜底）；访客面任何降级 `aiUsedFlag:false` 如实标注；站主面（配方）无兜底、失败如实 FAILED |

## 前端门面

| 端 | 模块 | 职责 |
|----|------|------|
| web | `apps/web/src/api/public-api.ts` | 页面只调门面，不散落 fetch |
| admin | `apps/admin/src/api/*` | 管理过程 |

## 维护规则

1. 改 `apps/api/src/**/*.controller.ts` 后同步本文件。  
2. **禁止**把 `docs/archive/api-astro-era` 当现行契约。  
3. 行为验收：`pnpm accept:dual-entry` / `pnpm accept:deep`（需三端已起）；测试一律走独立测试库（vitest 自动隔离）。  
