# 切流 Runbook 草案（Stage 1）

> 未下令前不执行**运行时**生产切流（API/PG/反代）。本文说明**怎么切**，不代替上线决定。  
> 执行阶段与验收：`docs/GOAL-生产双入口切流.md`。

## 当前生产缺口（2026-07-21 探针）

1. **SPA 深链**：无 fallback 时 `/tools` 等客户端路由 → Vercel `NOT_FOUND`（Phase 1：`vercel.json` rewrites → `/index.html`，**排除** `/api/*`）。
2. **无 Nest API**：`/api/health`、`/api/intake` → 404；双入口 intake 不可用。
3. **无生产 PG**：无可写持久；不得假装已切双入口。

> 仅完成 SPA rewrite **不等于**切流完成——无 API 时「卡」可开壳但提交必挂。

## 组件

| 组件 | 形态 | 端口/路径 |
|------|------|-----------|
| Web | 静态托管（`pnpm build:web` → `apps/web/dist`） | `/` |
| Admin | 静态托管（`pnpm build:admin` → `apps/admin/dist`） | **本地**：独立源 `http://127.0.0.1:5174/`（根路径）；**生产**：子域或同域 `/admin` 反代（**部署时二选一钉死**，本草案不默认） |
| API | 常驻 Node（`pnpm --filter @walker/api start`） | `8788`；对外建议反代为 `/api/*` |
| PG | 托管 PostgreSQL | `DATABASE_URL` 必填 |

仓库内 `vercel.json`：**web** 静态构建 + SPA rewrites（filesystem 优先，故 `/posts/**`、`/assets/**`、`/pagefind/**` 仍走真实文件；**`/api/*` 不 fallback 到 HTML**）。API/Admin/PG 需另部或反代，**不要**假设 monorepo 自动全栈上 Vercel。

## 前置检查

1. `pnpm install && pnpm build:shared && pnpm build:web && pnpm build:admin && pnpm build:api`
2. `pnpm --filter @walker/api exec prisma migrate deploy`（或 `pnpm db:migrate` 于 dev）
3. 健康探针（见下）`ok === true` 且写路径前 `db === true`
4. 抽查：`/posts` 列表含真实 title；`POST /intake`（或经网关 `POST /api/intake`）进线索列表
5. 生产 **无** 假持久：缺库写接口 **503** `storage-unavailable`
6. 管理面：`ADMIN_API_TOKEN` ≥ 16 字符；无令牌请求管理 API → **401**

## 健康探针（路径不要混用）

| 探测对象 | URL | 期望 |
|----------|-----|------|
| **直连 Nest**（本机或 API 主机） | `GET http://<api-host>:8788/health` | 200，`{ ok, db, aiEnabled }` |
| **经同站 `/api` 反代**（或 Vite 开发代理） | `GET https://<host>/api/health` | 反代须 strip `/api` 后转到 Nest `/health` |

```bash
# 直连 API
curl -sS http://127.0.0.1:8788/health

# 仅当已配置 /api 反代时
curl -sS https://<host>/api/health
```

## 推荐切流顺序（strangler）

1. 部署 PG + Nest，配置 `DATABASE_URL`、`ADMIN_API_TOKEN`
2. **同站反代** `/api/*` → Nest 裸路径（Cookie：`walker-anon` 需跨路径可用；生产 HTTPS 下注意 Secure）
3. 先切公开「卡」`/tools` 与 intake
4. 再切内容主路径 `/` `/posts/*`
5. 管理端指向新 `apps/admin` 构建产物
6. 确认旧部署单元（若仍有独立托管）下线——**本仓库已无 Astro 可运行入口**，回滚不是「切回仓内 Astro」

## 回滚

1. 反代/托管切回**上一版** web 静态 + API 镜像（保留镜像与 dist 产物）
2. 保留 PG 数据（不删 migrate）
3. 对照 `docs/redirects.md` 检查路径

## Cookie / 鉴权

| 名 | 用途 | 状态 |
|----|------|------|
| `walker-anon` | 游客 intake 配额（30d，HttpOnly） | **已实现** |
| `walker-session` | 用户登录会话 | **Auth 阶段后置**，当前无登录 API |
| `Authorization: Bearer` | 管理 API | **已实现**（`ADMIN_API_TOKEN`） |

## 限流与配额（生产）

- 游客配额：PostgreSQL，与 `walker-anon` 绑定  
- 请求限流：当前 **进程内内存**，**单实例有效**；多副本水平扩展前必须换分布式限流适配器，否则可被绕过  

## 契约与验收

- 端点表：`docs/api/README.md`  
- 本地/预发：`pnpm accept:dual-entry`（需 api/web/admin 已起）
