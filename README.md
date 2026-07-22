# AdgaiWalker / iwalk.pro

Walker 个人站与「双入口小生产」系统。

**技术栈**：pnpm monorepo · **React + Vite**（web / admin）· **NestJS + Prisma**（API）· TypeScript。  
**本地过程库默认 SQLite**；未来生产过程库用 **PostgreSQL**（`schema.postgresql.prisma`）。  
**生产公开站**：GitHub `main` → Vercel 只部署 **web 静态**。

**不再使用 Astro。**

## 结构

```text
apps/web      # 公开站 React
apps/admin    # 管理端 React
apps/api      # Nest API
packages/shared
content/log   # 文章 Markdown 真相源（进 Git → Vercel）
```

## 本地运行

要求：Node ≥ 20，pnpm。

```bash
pnpm install

# 过程库：默认 SQLite（免 Docker）
cp apps/api/.env.example apps/api/.env   # 若还没有
pnpm db:generate
pnpm db:push

# 三端
pnpm dev:api    # :8788（会先 db:push）
pnpm dev:web    # :5173（会先 content:gen）
pnpm dev:admin  # :5174
```

可选本机 PostgreSQL（未来/对齐生产）：

```bash
docker compose up -d
# apps/api/.env:
# WALKER_DB_PROVIDER=postgresql
# DATABASE_URL=postgresql://walker:walker@127.0.0.1:54329/walker
pnpm db:generate
pnpm db:migrate
```

## 内容上线（网站改 ≠ 自动进 GitHub）

| 步骤 | 命令 / 动作 |
|------|-------------|
| 本机改文 | 编辑 `content/log` 或 Admin「保存到 content/log」 |
| 生成 | `pnpm content:gen`（Admin 保存会尝试自动 gen） |
| 同步 Git / Vercel | `pnpm content:publish --push` |

- **只 gen + 看状态**：`pnpm content:publish`  
- **只 commit**：`pnpm content:publish --commit`  
- **commit + push**（触发 Vercel）：`pnpm content:publish --push`

## 验收

```bash
pnpm typecheck
pnpm test:shared && pnpm test:api && pnpm test:web
pnpm accept          # 需三端已起
```

## 部署

`git push origin main` → Vercel **`adgai-walker`** → **https://www.iwalk.pro**（仅 web）。  
过程 API（卡口写库）需另外部署 Nest + 未来 PG；与 Vercel 静态分离。

## 文档

| 文件 | 用途 |
|------|------|
| [`Claude.md`](Claude.md) | 对话默认上下文 |
| [`docs/PRODUCT.md`](docs/PRODUCT.md) | 产品 |
| [`docs/ENGINEERING.md`](docs/ENGINEERING.md) | 工程 + 部署 |
| [`docs/STATUS.md`](docs/STATUS.md) | 状态 |
| [`docs/api/README.md`](docs/api/README.md) | API 契约 |
