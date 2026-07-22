# AdgaiWalker / iwalk.pro

Walker 个人站与「双入口小生产」系统。

**技术栈（唯一）**：pnpm monorepo · **React + Vite**（公开站 / 管理端）· **NestJS + Prisma + PostgreSQL**（API）· TypeScript。

**不再使用 Astro。** 旧 Astro 应用树已从仓库移除。

## 结构

```text
apps/web      # 公开站 React
apps/admin    # 管理端 React
apps/api      # Nest API
packages/shared
content/log   # Markdown/MDX 内容真相源（非 Astro）
```

## 本地运行

要求：Node ≥ 20，pnpm。

```bash
pnpm install

# 可选：PostgreSQL
docker compose up -d
export DATABASE_URL="postgresql://walker:walker@127.0.0.1:54329/walker"
pnpm db:generate
pnpm db:migrate

# 三端
pnpm dev:api    # :8788
pnpm dev:web    # :5173（会先 content:gen）
pnpm dev:admin  # :5174
```

环境变量见 `apps/api/.env.example`（含 `ADMIN_API_TOKEN`）。

## 验收

```bash
pnpm typecheck
pnpm test:shared && pnpm test:api && pnpm test:web
pnpm accept          # 双入口 + 深度浏览器（需三端已起）
```

## 部署（GitHub → Vercel）

**准读取**：[`docs/deploy.md`](docs/deploy.md)

- 仓库 `main` → Vercel 项目 **`adgai-walker`** → **https://www.iwalk.pro**（push 自动生产部署）
- 当前只部署 **web 静态**；公网 Nest/PG/`/api` 见该文档 §3–§4

## 产品与工程文档

- `docs/README.md` — **文档路由**（现行 / 资料 / 归档）
- `docs/deploy.md` — **部署与发版（权威）**
- `docs/api/README.md` — Nest API 契约
- `docs/architecture-modules.md` — 模块与依赖关系
- `docs/PRD-双入口小生产.md` / `docs/PRD-双入口触感.md`
- `docs/s1-go-live.md` / `docs/cutover-runbook.md` / `docs/stage1-retro.md`
- 已完成 Goal 与历史设计：`docs/archive/`

## 产品心智

- **卡**：带着问题来 → `/tools` intake → nextStep + 线索入池  
- **逛**：读证据 → `/posts`  
- 站主过程：线索 → 题苗 → 交付 → 检验（`apps/admin`）
