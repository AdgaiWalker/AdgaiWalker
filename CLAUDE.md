# CLAUDE.md / 仓库约定

## 技术栈（唯一）

- **pnpm monorepo**：`apps/web` · `apps/admin` · `apps/api` · `packages/shared`
- **前端**：React + Vite + TypeScript（**无 Astro**）
- **后端**：NestJS + Prisma + PostgreSQL
- **内容真相源**：`content/log/**/*.{md,mdx}` → `pnpm content:gen` → `apps/web/src/generated/content.json`

## 禁止

- 重新引入 Astro / `.astro` 组件 / `@astrojs/*`
- 在 React 正文里保留对 `.astro` 的 import（生成脚本会剥离）
- 把旧 WorkItem 巨石后台、Match 双轨当默认路径

## 常用命令

```bash
pnpm install
pnpm content:gen
pnpm dev:web / dev:admin / dev:api
pnpm typecheck
pnpm accept
```

## 产品

双入口：卡（`/tools`）/ 逛（`/posts`）。PRD 见 `docs/PRD-双入口小生产.md`、`docs/PRD-双入口触感.md`。
