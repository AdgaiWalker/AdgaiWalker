# CLAUDE.md / 仓库约定

## 技术栈（唯一）

- **pnpm monorepo**：`apps/web` · `apps/admin` · `apps/api` · `packages/shared`
- **前端**：React + Vite + TypeScript（**无 Astro**）
- **后端**：NestJS + Prisma + PostgreSQL
- **内容真相源**：`content/log/**/*.{md,mdx}` → `pnpm content:gen` → `apps/web/src/generated/content.json`

## 前端分层（必读）

**Component ≠ 只有 UI/UX。** 按责任分层，详见 `docs/frontend-layers.md`。

| 层 | 做什么 |
|----|--------|
| **配置** | dual-entry / nav 等产品语义 SSOT |
| **规则** | shared 纯函数、消毒、错误码与限流数字 |
| **门面** | `public-api` / `admin-api` / token-store，无 className |
| **页** | 路由任务编排，调门面、组块 |
| **块/壳** | 可复用 UI+UX；壳只布局 |

禁止：块里写领域规则；页复制第二套校验；规则 import React；壳办 intake/主选业务。

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
架构：`docs/architecture-modules.md` · 前端分层：`docs/frontend-layers.md` · API：`docs/api/README.md`。
