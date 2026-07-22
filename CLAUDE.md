# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 技术栈（唯一）

- **pnpm monorepo**：`apps/web` · `apps/admin` · `apps/api` · `packages/shared`
- **前端**：React + Vite + TypeScript（**无 Astro**）
- **后端**：NestJS + Prisma（**本地默认 SQLite**；未来生产过程库 **PostgreSQL**）
- **内容真相源**：`content/log/**/*.{md,mdx}` → `pnpm content:gen` → `apps/web/src/generated/content.json`（**进 Git 才上 Vercel**；Admin 保存≠自动 push）

## 常用命令

```bash
pnpm install

# 内容生成（改 content/log 后或切换分支后必跑）
pnpm content:gen

# 库 + 三端（本地 SQLite 默认）
cp apps/api/.env.example apps/api/.env   # 首次
pnpm db:generate && pnpm db:push
pnpm dev:api    # :8788
pnpm dev:web    # :5173（自动先 content:gen）
pnpm dev:admin  # :5174

# 内容上线 → GitHub → Vercel
pnpm content:publish --push

# 类型检查（内部先 build:shared）
pnpm typecheck

# 测试（test:api 内部先 build:shared）
pnpm test:shared && pnpm test:api && pnpm test:web

# 验收（需三端已起）
pnpm accept

# 数据库（需要 Docker 或本地 PG）
pnpm db:generate
pnpm db:migrate

# 维护
pnpm check:content-fields   # 校验所有 MD frontmatter
pnpm verify:stage1           # Stage1 迁移校验
```

## 内容管道（构建与运行时的核心）

```
content/log/**/*.{md,mdx}  →  scripts/generate-content.ts  →  apps/web/src/generated/content.json
```

- `content/log` 是内容**唯一真相源**；该 JSON 是 WebApp 的只读内容模型（文章、元数据、「逛」所需的一切）
- `dev:web` 和 `build:web` 自动运行 `content:gen`
- 如果你在未重启 `dev:web` 的情况下手动编辑 `content/log`，需运行 `pnpm content:gen` 使更改生效

## 构建依赖顺序

`build:shared` 是隐式前置条件——`packages/shared` 必须先编译，`apps/api` 和 `apps/web` 才能使用它：

- `pnpm typecheck` — 内部先运行 `build:shared`
- `pnpm test:api` — 内部先运行 `build:shared`
- 修改 `packages/shared` 后，运行 `pnpm build:shared` 使更改对其他包可见

## 领域词汇（SSOT）

同一概念只用一个词；不同概念禁止同名。全文见 [`docs/PRODUCT.md`](docs/PRODUCT.md)。

| 术语 | 含义 | 出现位置 |
|------|------|----------|
| **卡** | "带着问题来" — `/tools` 入口，接收问题 | `dualEntry.ask`、`ToolsPage`、`IntakeApplication` |
| **逛** | "读证据" — `/posts` 入口，阅读内容 | `dualEntry.browse`、`PostsPage` |
| **线索** (Clue) | 用户提交的原始问题 | `ClueApplication`、`/clues` 端点、`CluesPage` |
| **题苗** (Seed) | 从线索升级而来的潜在主题 | `SeedApplication`、`/seeds`、`SeedsPage` |
| **执行** (Execution) | 有效交付——可追踪的工作单元 | `ExecutionApplication`、`/executions` |
| **主选** | 将一条线索选为题苗的主线索 | `POST /seeds/:id/promote` |
| **两问** | 严重性 + 自身兴趣——选题门控 | `POST /seeds/:id/two-questions` |
| **闭环** | 可计数的完成指标 | `MetricsApplication`、`/metrics` |
| **交付** | 完成执行卡的工作产出 | `POST /executions/:id/deliver` |
| **检验** | 审查交付物；可计数判定 | `POST /executions/:id/review` |
| **池** | 线索状态（待处理 / 进行中 / 已关闭等） | `PATCH /clues/:id/pool` |
| **nextStep** | 下次该做什么——由规则或 AI 生成 | `NextStepStrategy`、intake 响应 |

**禁止在页面中硬编码路径字符串**（如 `'/tools'`、`'/posts'`）——始终从 `dualEntry` 或 `WEB_ROUTES` / `ADMIN_ROUTES` 读取。

## 前端分层（必读）

**Component ≠ 只有 UI/UX。** 按责任分层；展开见 [`docs/ENGINEERING.md`](docs/ENGINEERING.md)。

| 层 | 做什么 |
|----|--------|
| **配置** | dual-entry / nav 等产品语义 SSOT |
| **规则** | shared 纯函数、消毒、错误码与限流数字 |
| **门面** | `public-api` / `admin-api`，无 className |
| **页** | 路由任务编排，调门面、组块 |
| **块/壳** | 可复用 UI+UX；壳只布局 |

禁止：块里写领域规则；页复制第二套校验；规则 import React；壳办 intake/主选业务。

## 禁止

- 重新引入 Astro / `.astro` 组件 / `@astrojs/*`
- 在 React 正文里保留对 `.astro` 的 import（生成脚本会剥离）
- 把旧 WorkItem 巨石后台、Match 双轨当默认路径

## Admin 鉴权

**当前无管理令牌。** Admin UI 与 `/clues` 等过程 API 直接可访问。  
公网暴露 Nest 时须用防火墙 / 内网 / 反向代理隔离，勿依赖已删除的 Bearer。

## 功能开发清单

添加任何功能时，按顺序确认：

1. **配置？** — 新 path / 文案 / 导航项 → `dual-entry` / `nav`
2. **规则？** — 新校验 / 纯计算 → `packages/shared`
3. **门面？** — 新 HTTP 调用 → `public-api` / `admin-api`，并同步 `docs/api/README.md`
4. **页 + 块？** — UI 编排：页调门面 + 组合块；UI 块仅 `props + onXxx`，能测补测

## 产品与文档（只这几份）

双入口：卡（`/tools`）/ 逛（`/posts`）。

| 文件 | 用途 |
|------|------|
| [`docs/PRODUCT.md`](docs/PRODUCT.md) | 产品权威 |
| [`docs/ENGINEERING.md`](docs/ENGINEERING.md) | 工程 + 部署 + 切流就绪 |
| [`docs/STATUS.md`](docs/STATUS.md) | 生产状态时钟 |
| [`docs/api/README.md`](docs/api/README.md) | Nest API 契约 |
| [`docs/README.md`](docs/README.md) | 索引 |

历史 PRD/Goal/切流长文 → `docs/archive/`（**不**当现行权威）。

## 部署与发版（对话默认须知）

**发版链路（已接好，勿重复问「要不要 link」）：**

| 项 | 事实 |
|----|------|
| GitHub | `https://github.com/AdgaiWalker/AdgaiWalker` · 分支 **`main`** |
| Vercel 项目 | **`adgai-walker`**（账号/团队 `praxiswalker-6245`） |
| 生产域名 | **https://www.iwalk.pro**（`iwalk.pro` → www） |
| 触发方式 | **`git push origin main` → Vercel 自动 Production 部署** |
| 构建 | 根 `vercel.json`：`pnpm build:web` → `apps/web/dist`（含 content:gen、预渲染、rss/llms、pagefind） |

```text
改代码 → commit → push main → Vercel 构建 web → 发布 www.iwalk.pro
```

**当前生产诚实状态（勿假称双入口已切流）：**

- **有**：web 静态 SPA、深链 rewrite（`/tools` 等 200 壳）、文章预渲染、rss/llms/pagefind  
- **无**：公网 Nest、生产 PG、同源 `/api/*` 反代 destination  
- 因此公网 **intake / 点赞写 / Admin 写** 仍不可用；本地 `dev:api` + PG 可全绿  
- `GET /api/health` 生产 **404**；裸 `/health` 可能被 SPA 吞成 HTML——**不是** Nest health  

**`vercel.json` 规则：**

- SPA：`/((?!api/).*)` → `/index.html`（**排除 `/api/*`，禁止把 API 落到 HTML**）  
- 上 Nest 后须在 rewrites **最前**加：`/api/:path*` → `https://<真实-API-主机>/:path*`（Nest 无全局 `/api` 前缀）  
- 旧中文 slug → 英文 slug 的 301 在 `redirects`  

**本地默认（勿把密码写进 git）：** 本机 PG 常见 `postgresql://postgres:…@127.0.0.1:5432/walker`。

**探针：** `pnpm exec tsx scripts/probe-production.ts`
