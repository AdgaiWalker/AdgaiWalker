---
status: active
type: manual
title: 本地与管理端联调手册
last_verified: 2026-09-25
ssot: false
applies_to: [api, admin]
---

# 联调手册

本地默认：API `127.0.0.1:8788`，admin `127.0.0.1:5174`（Vite 把 `/api` 剥掉反代到 8788），web `127.0.0.1:5173`。

## 1. 起服务

```bash
cp apps/api/.env.example apps/api/.env   # 首次
pnpm db:generate && pnpm db:migrate # DATABASE_URL 必须是独立库的绝对 file: 路径；已有未标记库先 db:baseline
pnpm build:shared
pnpm dev:api
pnpm dev:admin
```

本地可以不设 `WALKER_ADMIN_TOKEN`（中间件放行）。一旦设置，所有非白名单请求必须带：

```bash
curl -sS http://127.0.0.1:8788/health
curl -sS -H "x-admin-token: $WALKER_ADMIN_TOKEN" http://127.0.0.1:8788/admin/content/ledger
```

从 admin 页发出的请求走 `/api/...`，浏览器不用自己写 token（开发放行；生产靠 Basic）。

## 2. 管理端数据通信

页面禁止直接裸调 `fetch`。
- 查询与资源管理：走 Refine `dataProvider`（`apps/admin/src/api/data-provider.ts`）与专用 queries（`apps/admin/src/api/queries.ts`）。
- 传输底层：`apps/admin/src/api/http.ts` 的 `adminRequest` → shared `fetchJson`。失败统一抛 `AdminApiError(code, message)`。`admin-auth-required` 映射成管理凭据错误文案。
- 流式事件：走 `apps/admin/src/api/execution-stream.ts` 观察运行。

## 3. 建议联调顺序（驾驶舱）

| 步 | 页面 | 调用 | 期望 |
|----|------|------|------|
| 1 | 任意 | `GET /health` | `ok` `db` `aiEnabled` |
| 2 | 内容列表 | `GET /admin/content/ledger` | `items[].stage` 四值之一；`gitAvailable` 诚实 |
| 3 | 内容检查器 | `GET /admin/content/:slug` | `raw` 非空并记录返回的 `hash` |
| 4 | 保存 | `PUT /admin/content/:slug` | 带 `{ raw, expectedHash }`；用读取时的 hash 做 CAS，再 GET 校验；响应前后写审计，公共快照不变、stage 可能仍是 draft |
| 5 | 上线 | `POST .../release/preflight` 再 `POST .../release` | 预检缺字段不写盘；成功有 `runId` |
| 6 | 轨迹 | `GET /runs/:runId/trace` | 可增量 `after` |
| 7 | 计划日历 | `GET /admin/plan/calendar?from&to` | 格子 + overdue |
| 8 | 下一动作 | `GET /admin/plan/next` | 至多 3 条，摘要为人话 |
| 9 | 入池 | `PATCH /clues/:id/pool` `{ poolStatus: "in-pool" }` | 复盘检查器可点 |
| 10 | 主选 | `POST /seeds/:id/promote` 带完整 brief | 缺五问 400 |
| 11 | 交付/检验 | `POST /executions/:id/deliver` · `.../review` | outcome yes/no |
| 12 | 复盘 | `GET /insights/signals?days=30` | 四源 + frequency + gaps |
| 13 | Agent | `GET /agents` → `POST /agents/:id/try` → `GET /runs/:runId/trace` | 无假甘特 |
| 14 | 运营记录 | `GET /ops/conversations?limit=50&keyword=...` → `GET /ops/conversations/:id` | 管理凭据；墓碑/过期会话隐藏；Token null 与 0 显示不同 |
| 15 | 访客对话导出 | `POST /ops/exports` → `GET /ops/exports/:id` → `GET /ops/exports/:id/download` | 管理凭据；冻结筛选/会话 ID/cutoff；最多10,000条；CSV/JSON；15分钟过期 |

## 4. 公开面联调（web）

文章列表不打 API。intake / 助手 / 赞需要 `dev:api`。
`AI_ENABLED≠true` 时助手与卡口仍非空，`aiUsedFlag` 为假。

## 5. 会话日志删除

管理端删除路由受管理凭据保护；浏览器发起 DELETE 时须通过同源校验。服务端先持久化 tombstone 和不含正文的删除审计，再停止关联公开运行并清理已登记副本。

```bash
curl -i -X DELETE \
  -H "x-admin-token: $WALKER_ADMIN_TOKEN" \
  -H "Origin: http://127.0.0.1:5174" \
  http://127.0.0.1:8788/admin/log-resources/conversations/<conversationId>

curl -sS -H "x-admin-token: $WALKER_ADMIN_TOKEN" \
  http://127.0.0.1:8788/admin/log-deletions/<taskId>
```

DELETE 返回任务 ID、会话 ID、状态、尝试次数和安全错误码，不返回正文或路径。`blocked` 表示运行停止未确认或恢复清单/副本/资源清理失败；修复底层问题后再次对同一会话调用 DELETE 可重试。服务启动会重放数据库 tombstone 与恢复清单，并继续未完成删除；备份恢复还会先清到期资源。恢复门标记存在时 API 返回 503，恢复不完整不会监听。备份命令、30 天过期校验和恢复操作见 [`ops/windows/README.md`](../../ops/windows/README.md)。

## 6. 失败不装成成功

| 现象 | 不是 |
|------|------|
| 8788 没起，admin 全红 | 前端 bug |
| 预检 `ok:false` | 已上线 |
| gitAvailable false | 已上线 |
| try 超时走规则/错误 | 假装模型成功 |
| 401 `admin-auth-required` | 业务校验失败 |

## 7. 加一个端点的清单

1. 先定对象还是读模型（对象走 REST 资源；读模型放 `/admin/...` 聚合，且规则在 shared）。
2. controller 薄、service 用例、port/adapter。
3. 若公开：同时改 `app.module.ts` 与 Caddyfile。
4. 扩展 `data-provider.ts` 或 `queries.ts` 方法。
5. 回写本文与 `README.md` 对应行。
6. `pnpm test:api` + 相关 admin 测。

## 8. V21 受控导出联调

创建请求只接受格式和 V20 筛选字段；浏览器 POST 还要求同源 Origin。拿到任务 ID 后轮询状态，`READY` 才能下载：

```bash
curl -sS -X POST \
  -H "x-admin-token: $WALKER_ADMIN_TOKEN" \
  -H "Origin: http://127.0.0.1:5174" \
  -H "Content-Type: application/json" \
  -d '{"format":"csv","filters":{"contentSlug":"post-a","placementKey":"post-detail","from":"2026-09-01","to":"2026-09-25","keyword":"退款"}}' \
  http://127.0.0.1:8788/ops/exports

curl -sS -H "x-admin-token: $WALKER_ADMIN_TOKEN" \
  http://127.0.0.1:8788/ops/exports/<jobId>

curl -fS -H "x-admin-token: $WALKER_ADMIN_TOKEN" \
  -o conversations.csv \
  http://127.0.0.1:8788/ops/exports/<jobId>/download
```

未知筛选字段返回 400，不会静默扩大范围；超过 10,000 个会话返回 422，服务端不静默截断。到期、命中会话删除或本机文件缺失时下载返回 410；下载已保存到外部的副本不承诺远程撤回。CSV 是每会话一行汇总，JSON 是逐轮明细。所有文本二次应用现有脱敏规则；该规则不保证识别所有敏感信息。

## 9. V22 公共路由与 Origin 边界

公网 `Caddyfile` 与 Nest `AdminTokenMiddleware.exclude` 必须是相同的方法+路径集合，当前差异由 `src/public-route-boundary.test.ts` 阻断。Caddy 未匹配请求返回 404；Nest 所有未排除路由默认需要管理凭据。删除/过期等管理接口、`/ops` 导出和 `/admin/content` 写入不能加入公网白名单。

`SameOriginMiddleware` 全局检查 POST/PUT/PATCH/DELETE。浏览器 Origin/Referer 必须与 Nest 收到的 Host 一致，或 host 命中 `WALKER_PUBLIC_ORIGINS`（逗号分隔、无 scheme）；无 Origin/Referer 仅供 curl/服务端调用。Web/Admin Vite `/api` 代理保留浏览器 Host，生产 Vercel 反代请在 API `.env` 配 `WALKER_PUBLIC_ORIGINS=www.iwalk.pro`。Nest 不开全局 CORS；跨源 OPTIONS 不返回 `Access-Control-Allow-Origin`，前台同源 `/api` 代理是浏览器入口。
