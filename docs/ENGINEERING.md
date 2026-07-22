# 工程（权威）

> 栈、分层、内容命名、部署、切流就绪。细节契约见 [`api/README.md`](./api/README.md)。  
> 对话默认上下文：根目录 `Claude.md`。

## 1. 栈与目录

```text
apps/web      # 公开站 React+Vite
apps/admin    # 管理端 React+Vite
apps/api      # Nest + Prisma + PG
packages/shared
content/log   # Markdown 真相源
```

**无 Astro。** 内容：`content/log` → `pnpm content:gen` → `apps/web/src/generated/content.json`。

## 2. 常用命令

```bash
pnpm install
pnpm content:gen
pnpm dev:api    # :8788
pnpm dev:web    # :5173
pnpm dev:admin  # :5174
pnpm typecheck
pnpm test:shared && pnpm test:api && pnpm test:web
pnpm accept     # 需三端已起
pnpm exec tsx scripts/probe-production.ts
```

## 3. 前端分层

| 层 | 做什么 |
|----|--------|
| 配置 | dual-entry / nav / routes SSOT |
| 规则 | shared 纯函数、消毒、错误码 |
| 门面 | public-api / admin-api，无 className |
| 页 | 路由编排，调门面 |
| 块/壳 | UI；块仅 props + onXxx |

加功能四问：配置？规则？门面？页+块？  
禁止：块里 fetch 领域规则；页复制第二套校验。

## 4. 内容命名

1. 文件名 = URL slug：`[a-z0-9]+(-[a-z0-9]+)*`  
2. `title` 中文  
3. 主题线用 frontmatter `series` / `seriesOrder` / `related`（无硬编码线名单）  
4. 改已发布 slug 须改 `vercel.json` redirects  

## 5. 部署（GitHub → Vercel）

| 项 | 值 |
|----|-----|
| GitHub | `AdgaiWalker/AdgaiWalker` · **`main`** |
| Vercel | 项目 **`adgai-walker`** → **https://www.iwalk.pro** |
| 触发 | **`git push origin main` 自动 Production** |
| 构建 | `vercel.json`：`pnpm build:web` → `apps/web/dist` |

**现状：** 只托管 **web 静态**。公网 **无 Nest/PG**；`GET /api/health` → 404。本地 API+PG 可绿。  
**禁止** API 未绿时称「生产切流已完成」。

### SPA 与 `/api`

- 现 rewrite：`/((?!api/).*)` → `/index.html`（**排除 `/api`**）  
- Nest 上线后 rewrites **最前**加：`/api/:path*` → `https://<API主机>/:path*`（Nest 无全局 `/api` 前缀）  
- 本地 Vite：`/api` proxy → `8788` 并 strip  

### 生产环境变量（名，不含值）

`DATABASE_URL` · `ADMIN_API_TOKEN`（强随机）· `AI_ENABLED` · `PORT` · `CONTENT_LOG_DIR` · 可选 `VITE_GISCUS_*`

生产改文默认：**改 `content/log` → push → 重建 web**。Admin 写盘仅开发机。

### 切流最短步骤

1. 生产 PG + `migrate deploy`  
2. 部署 Nest，直连 `/health` 且 `db:true`  
3. Vercel 配 `/api` rewrite  
4. 生产 `POST /api/intake` 冒烟  
5. 更新 `docs/STATUS.md`  

## 6. 运行时模块（依赖 / 调用 / 触发 / 实现）

| 模块 | 职责 |
|------|------|
| Web `public-api` | 浏览器同源 `/api/*` 门面 |
| 反代 / Vite proxy | 把 `/api` 转到 Nest |
| Nest Kernel | 注册 intake/clue/… |
| IntakeService | 配额 → nextStep → 落 Clue |
| Prisma/PG | 持久化 |
| AdminAuthGuard | Bearer 管理鉴权 |
| content:gen | log → JSON |

```
[触发] push main → [调用] Vercel → [实现] build:web → www.iwalk.pro
[触发] 卡提交 → [调用] public-api → [依赖] 反代 → Nest Intake → [实现] PG
[触发] 站主列线索 → [调用] Bearer /clues → [依赖] AdminAuthGuard → ClueService
```

页面依赖 HTTP 契约，不依赖 Prisma；Service 依赖 Port。

## 7. 禁止

- 恢复 Astro / Match 双轨 / WorkItem 巨石默认路径  
- 多主题切换  
- 密钥与本地 DB 密码进 git  
