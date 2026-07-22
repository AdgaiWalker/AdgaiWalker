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
content/log   # Markdown/MDX 内容真相源
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

## 部署

`git push origin main` → Vercel 项目 **`adgai-walker`** → **https://www.iwalk.pro**（只构建 web 静态）。

细节与生产缺口见 [`docs/ENGINEERING.md`](docs/ENGINEERING.md) · 时钟见 [`docs/STATUS.md`](docs/STATUS.md)。

## 文档（只这几份）

| 文件 | 用途 |
|------|------|
| [`Claude.md`](Claude.md) | 对话默认上下文 |
| [`docs/PRODUCT.md`](docs/PRODUCT.md) | 产品 |
| [`docs/ENGINEERING.md`](docs/ENGINEERING.md) | 工程 + 部署 |
| [`docs/STATUS.md`](docs/STATUS.md) | 生产状态 |
| [`docs/api/README.md`](docs/api/README.md) | API 契约 |
| [`docs/README.md`](docs/README.md) | 索引 |

历史文稿在 [`docs/archive/`](docs/archive/)。

## 产品心智

- **卡**：带着问题来 → `/tools` intake → nextStep + 线索入池  
- **逛**：读证据 → `/posts`  
- 站主过程：线索 → 题苗 → 交付 → 检验（`apps/admin`）
