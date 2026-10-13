# AdgaiWalker / iwalk.pro

> **2026-09-22 本地框架已完成**：新后台 F01–F18 已通过验收，默认概览，含内容、Agent、运营记录和设置只读入口。详见 [框架验收与隔离启动](docs/evidence/ADMIN-FRAMEWORK-ACCEPTANCE.md)。业务写入和部署尚未接通，生产状态不变；下文9月21日空白入口说明为此前状态。

> **2026-09-21**：后台旧界面已清空，`pnpm dev:admin` 现在启动空白重构入口；API、数据库和文章保留。旧浏览器验收脚本仍保留，但依赖旧后台页面，重构期间不适用。见 [后台资产清单](docs/evidence/ADMIN-REBUILD-INVENTORY.md)。


Walker 个人站与「双入口小生产」系统。

**技术栈**：pnpm monorepo · **React + Vite**（web / admin）· **NestJS + Prisma**（API）· TypeScript。  
**过程库统一 SQLite**；开发、测试、生产使用不同文件。
**生产公开站**：GitHub `main` → Vercel 只部署 **web 静态**。

**不再使用 Astro。**

## 结构

```text
apps/web      # 公开站 React
apps/admin    # 管理端 React
apps/api      # Nest API
apps/agent    # 判断代理 Cordis + MCP
packages/shared
content/log   # 文章 Markdown 真相源（进 Git → Vercel）
```

## 本地运行

要求：Node ≥ 20，pnpm。

```bash
pnpm install

# 过程库：SQLite 独立文件（免 Docker）
cp apps/api/.env.example apps/api/.env   # 若还没有
export DATABASE_URL="file:$(pwd)/apps/api/data/walker.db"
pnpm db:generate
pnpm db:migrate  # 仅新空库；旧库先备份并检查 schema 与迁移历史

# 三端
pnpm dev:api    # :8788，不隐式改 schema
pnpm dev:web    # :5173（会先 content:gen）
pnpm dev:admin  # :5174
```

迁移命令要求 `DATABASE_URL=file:` 后接绝对路径。新空库执行 `pnpm db:migrate`；旧库先备份，只有 schema 与基线完全一致才执行 `pnpm db:baseline`。当前生产旧库不符合基线，按 [G07 生产库迁移路径](ops/windows/README.md)重建搬迁。不同环境不要复用同一文件。

## 内容上线（网站改 ≠ 自动进 GitHub）

| 步骤 | 命令 / 动作 |
|------|-------------|
| 本机改文 | 编辑 `content/log` 或 Admin「保存到 content/log」 |
| 生成 | `pnpm content:gen`（显式生成公共内容投影；Admin 人工保存不自动刷新） |
| 同步 Git / Vercel | `pnpm content:publish --push` |

- **只 gen + 看状态**：`pnpm content:publish`  
- **只 commit**：`pnpm content:publish --commit`  
- **commit + push**（触发 Vercel）：`pnpm content:publish --push`

## 验收

```bash
pnpm typecheck
pnpm test:shared && pnpm test:api && pnpm test:web && pnpm test:agent
pnpm accept          # 需三端已起
```

## 部署

`git push origin main` → Vercel **`adgai-walker`** → **https://www.iwalk.pro**（仅 web）。  
过程 API 单独部署 Nest + SQLite；与 Vercel 静态分离。

## 文档

| 文件 | 用途 |
|------|------|
| [`CLAUDE.md`](CLAUDE.md) | 对话默认上下文 |
| [`docs/PRODUCT.md`](docs/PRODUCT.md) | 产品 |
| [`docs/ENGINEERING.md`](docs/ENGINEERING.md) | 工程 + 部署 |
| [`docs/STATUS.md`](docs/STATUS.md) | 状态 |
| [`docs/api/README.md`](docs/api/README.md) | API 契约 |
