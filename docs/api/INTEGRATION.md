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

## 2. 管理端门面

唯一入口：`apps/admin/src/api/admin-api.ts`。  
页面禁止直接 `fetch`。新端点：先 shared 类型（若跨端）→ controller → `admin-api.ts` → 页。

传输：`apps/admin/src/api/http.ts` 的 `adminRequest` → shared `fetchJson`。失败抛 `AdminApiError(code, message)`。`admin-auth-required` 映射成管理凭据错误文案。

## 3. 建议联调顺序（驾驶舱）

| 步 | 页面 | 调用 | 期望 |
|----|------|------|------|
| 1 | 任意 | `GET /health` | `ok` `db` `aiEnabled` |
| 2 | 内容列表 | `GET /admin/content/ledger` | `items[].stage` 四值之一；`gitAvailable` 诚实 |
| 3 | 内容检查器 | `GET /admin/content/:slug` | `raw` 非空 |
| 4 | 保存 | `PUT /admin/content/:slug` | 再 GET 一致；stage 可能仍是 draft |
| 5 | 上线 | `POST .../release/preflight` 再 `POST .../release` | 预检缺字段不写盘；成功有 `runId` |
| 6 | 轨迹 | `GET /runs/:runId/trace` | 可增量 `after` |
| 7 | 计划日历 | `GET /admin/plan/calendar?from&to` | 格子 + overdue |
| 8 | 下一动作 | `GET /admin/plan/next` | 至多 3 条，摘要为人话 |
| 9 | 入池 | `PATCH /clues/:id/pool` `{ poolStatus: "in-pool" }` | 复盘检查器可点 |
| 10 | 主选 | `POST /seeds/:id/promote` 带完整 brief | 缺五问 400 |
| 11 | 交付/检验 | `POST /executions/:id/deliver` · `.../review` | outcome yes/no |
| 12 | 复盘 | `GET /insights/signals?days=30` | 四源 + frequency + gaps |
| 13 | Agent | `GET /agents` → `POST /agents/:id/try` → `GET /runs/:runId/trace` | 无假甘特 |

## 4. 公开面联调（web）

文章列表不打 API。intake / 助手 / 赞需要 `dev:api`。  
`AI_ENABLED≠true` 时助手与卡口仍非空，`aiUsedFlag` 为假。

## 5. 失败不装成成功

| 现象 | 不是 |
|------|------|
| 8788 没起，admin 全红 | 前端 bug |
| 预检 `ok:false` | 已上线 |
| gitAvailable false | 已上线 |
| try 超时走规则/错误 | 假装模型成功 |
| 401 `admin-auth-required` | 业务校验失败 |

## 6. 加一个端点的清单

1. 先定对象还是读模型（对象走 REST 资源；读模型放 `/admin/...` 聚合，且规则在 shared）。  
2. controller 薄、service 用例、port/adapter。  
3. 若公开：同时改 `app.module.ts` 与 Caddyfile。  
4. 写 `admin-api.ts` 方法。  
5. 回写本文与 `README.md` 对应行。  
6. `pnpm test:api` + 相关 admin 测。
