# 切流 Runbook 草案（Stage 1）

> 未下令前不执行**运行时**生产切流（API/PG/反代）。本文说明**怎么切**，不代替上线决定。  
> **GitHub→Vercel 发版事实**：[`docs/deploy.md`](./deploy.md)（准读取）。  
> 执行锚：`docs/GOAL-新站完善与生产可用.md`（前序：`docs/GOAL-生产双入口切流.md`）。  
> 探针脚本：`pnpm exec tsx scripts/probe-production.ts`

## 当前生产缺口（2026-07-22 探针）

1. ~~SPA 深链~~：**已缓解** — `/tools` 等返回 SPA 200（`#root`）；`vercel.json` SPA rewrite 排除 `/api/*`。
2. **无 Nest API 反代**：`GET /api/health` → **404**；`/health` 被 SPA 吞成 HTML（勿当作 API）。
3. **无生产 PG / 无公网 Nest 主机**：intake/赞/Admin 写在生产不可用。
4. **本地（非生产）**：`localhost:5432` + Nest 已可全绿（health `db:true`、intake、列线索、写 503）。

> 仅 SPA rewrite **不等于**切流完成——无 `/api` 时「卡」可开壳但提交必挂。

## 组件

| 组件 | 形态 | 端口/路径 |
|------|------|-----------|
| Web | 静态托管（`pnpm build:web` → `apps/web/dist`） | `/` |
| Admin | 静态托管（`pnpm build:admin` → `apps/admin/dist`） | **本地**：独立源 `http://127.0.0.1:5174/`（根路径）；**生产**：子域或同域 `/admin` 反代（**部署时二选一钉死**，本草案不默认） |
| API | 常驻 Node（`pnpm --filter @walker/api start`） | `8788`；对外建议反代为 `/api/*` |
| PG | 托管 PostgreSQL | `DATABASE_URL` 必填 |

仓库内 `vercel.json`：**web** 静态构建 + SPA rewrites（filesystem 优先，故 `/posts/**`、`/assets/**`、`/pagefind/**`、`rss.xml`、`llms.txt` 仍走真实文件；**`/api/*` 不 fallback 到 HTML**）。API/Admin/PG 需另部或反代，**不要**假设 monorepo 自动全栈上 Vercel。

### 生产 `/api` 反代顺序（关键）

仓库 `vercel.json` **当前 rewrites**（顺序固定）：

1. **仅有** SPA fallback：`/((?!api/).*)` → `/index.html`  
   - 含义：`/api/*` **不会**落到 HTML（负向前瞻排除）。  
2. **尚未**配置 `destination` 到公网 Nest（因宿主 URL 未定，**禁止硬编码假域名**）。

部署 Nest 后，在 rewrites **数组最前**插入：

```json
{
  "source": "/api/:path*",
  "destination": "https://<你的-API-主机>/:path*"
}
```

注意：Nest **无**全局 `/api` 前缀 → destination 应转到 Nest 的 `/health`、`/intake` 等。若网关保留 `/api` 前缀，需在 Nest 或网关 strip。本地：Vite proxy `/api` → `8788` 并 strip。

### 生产环境变量清单（禁止把真实密钥提交 git）

| 变量 | 组件 | 说明 |
|------|------|------|
| `DATABASE_URL` | Nest | 生产 PG 连接串 |
| `ADMIN_API_TOKEN` | Nest / Admin | 强随机；**勿**用本地短口令 |
| `AI_ENABLED` | Nest | 默认 `false` |
| `PORT` | Nest | 宿主注入 |
| `CONTENT_LOG_DIR` | Nest | 生产无盘则内容编辑仅本地/Git |
| `VITE_GISCUS_*` | Web 构建 | 可选评论 |
| `SUPPORT_CONFIG_PATH` | Nest | 可选；默认 `content/support-config.json` |

### Admin 连生产 API

- **推荐**：本地 Admin（`5174`）临时把 proxy target 指生产 API，或设环境变量式网关；生产 Admin 静态托管同域 `/admin` 时同源 `/api`。  
- **钉死一句**：生产改文默认 **git 推 monorepo + 重建 web**；Admin 写盘仅开发机有 `content/log` 时可用。

### 管理内容目录

- API 读写 `CONTENT_LOG_DIR`（默认探测 monorepo `content/log`）。
- 生产若无本地磁盘，需把 content 挂卷或改 GitHub 适配器（本版默认 FS）。

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
