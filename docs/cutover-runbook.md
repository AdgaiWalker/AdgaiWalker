# 切流 Runbook 草案（Stage 1）

> 未下令前不执行生产切流。本文说明**怎么切**，不代替上线决定。

## 组件

| 组件 | 形态 | 端口/路径 |
|------|------|-----------|
| Web | 静态托管（`pnpm build:web` → `apps/web/dist`） | `/` |
| Admin | 静态托管（`pnpm build:admin` → `apps/admin/dist`） | `/admin` 或独立子域 |
| API | 常驻 Node（`pnpm --filter @walker/api start`） | `8788`，对外 `/api` 反代 |
| PG | 托管 PostgreSQL | `DATABASE_URL` 必填 |

## 前置检查

1. `pnpm install && pnpm build:shared && pnpm build:web && pnpm build:admin && pnpm build:api`
2. `prisma migrate deploy` 成功
3. `GET /health` → `{ ok: true, db: true, aiEnabled: ... }`
4. 抽查：`/posts` 列表含真实 title；`POST /intake` 进线索列表
5. 生产 **无** 假持久：缺库写接口 503 `storage-unavailable`

## 推荐切流顺序（strangler）

1. **同站反代** `/api/*` → Nest（Cookie `SameSite=Lax`，生产 `Secure`）
2. 先切 **问答** `/tools` 到新 web（或仅 API 被旧页调用）
3. 再切公开内容主路径 `/` `/posts/*`
4. 管理端推进核 `/admin` 指向新 admin
5. 旧 Astro 入口整站 301 或关闭 serverless

## 回滚

1. 反代改回旧入口
2. 保留 PG 数据（不删 migrate）
3. 对照 `docs/redirects.md` 恢复路径

## Cookie

- 会话：`walker-session`（Auth 阶段）
- 游客：`walker-anon`（30d，intake 配额）

## 健康探针

```bash
curl -sS https://<host>/api/health
# 期望 HTTP 200 且 ok===true（db 可为 false 仅探测；写需 true）
```
