# 工程（权威）

> 栈、分层、内容命名、部署、切流就绪。细节契约见 [`api/README.md`](./api/README.md)。  
> 对话默认上下文：根目录 `Claude.md`。

## 1. 栈与目录

```text
apps/web      # 公开站 React+Vite
apps/admin    # 管理端 React+Vite
apps/api      # Nest + Prisma（本地默认 SQLite；未来生产 PG）
packages/shared
content/log   # Markdown 真相源（进 Git → Vercel）
```

**无 Astro。**  
**两条数据管线（勿混）：**

| 管线 | 真相源 | 上线 |
|------|--------|------|
| 文章/配置 | `content/log`、`support-config.json` | `pnpm content:publish --push` 或 git push |
| 过程（线索等） | 本地 SQLite / 未来 PG | **不进** Vercel；需公网 Nest |

内容：`content/log` → `pnpm content:gen` → `apps/web/src/generated/content.json`。

## 2. 常用命令

```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # 默认 file:./data/walker.db
pnpm db:generate && pnpm db:push         # 本地 SQLite
pnpm content:gen
pnpm dev:api    # :8788
pnpm dev:web    # :5173
pnpm dev:admin  # :5174

# 内容上线（Admin 保存后必做，否则生产不变）
pnpm content:publish           # gen + 看状态
pnpm content:publish --push    # commit 内容路径并 push → Vercel

pnpm typecheck
pnpm test:shared && pnpm test:api && pnpm test:web
pnpm accept
pnpm exec tsx scripts/probe-production.ts
```

### 数据库切换

| 环境 | 配置 |
|------|------|
| 本地 / 2GB 单机首期 | `WALKER_DB_PROVIDER=sqlite` · `DATABASE_URL=file:…` · `schema.prisma` · `db:push` |
| 多进程或高可用阶段 | `WALKER_DB_PROVIDER=postgresql` · 托管 PG URL · `schema.postgresql.prisma` · `db:migrate` |

选择逻辑：`scripts/prisma-env.ts`（依赖 URL / WALKER_DB_PROVIDER）。

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

### 腾讯云 2C2G Windows 首期边界

目标运行面见 [`../ops/windows/README.md`](../ops/windows/README.md)：

- Vercel 继续托管公开 Wiki；腾讯云只承载一个 Nest + 一个 Caddy。
- Nest 默认绑定 `127.0.0.1:8788`；公网只经 Caddy 的方法+路径白名单进入。
- Admin 只监听回环地址，经 `ssh -N -L 5174:127.0.0.1:8790 walker-tencent` 使用。
- 首期过程库使用 SQLite；当前 2GB Windows 不安装 Docker、Redis 或本机 PostgreSQL。
- 两个以上写进程、写锁等待、数据库高可用或恢复要求出现时，再迁托管 PostgreSQL。

### SPA 与 `/api`

- 构建期为首页、内容枢纽和文章输出独立静态 HTML；已知客户端路由显式 rewrite 到 `/index.html`  
- 未知路径与 `/api/*` 不进 SPA fallback，返回真实 404，避免 soft-404 / API HTML 伪响应  
- Nest 上线后 rewrites **最前**加：`/api/:path*` → `https://<API主机>/:path*`（Nest 无全局 `/api` 前缀）  
- 本地 Vite：`/api` proxy → `8788` 并 strip  

### 静态索引与 GEO

`pnpm build:web` 使用同一份公开内容集合生成语义文章 HTML、canonical/OG/JSON-LD、`sitemap.xml`、RSS、JSON Feed、`llms.txt`、`llms-full.txt` 与逐篇 Markdown alternate；随后执行 `verify:geo`，最后建 Pagefind 索引。

- `content/log` 仍是唯一内容真相源；GEOFlow 如启用完整后台，只能隔离作为草稿/审核工具，审核结果经 Git 写回这里。
- `aiUsePolicy.readable` 决定是否生成机器可读稿；`citable` / `actionable` 会原样写进 AI 使用边界，不能在下游擅自放宽。
- `robots.txt` 只指向 `https://www.iwalk.pro/sitemap.xml`；sitemap、feeds 与文章预渲染共用同一筛选集合。
- `pnpm check:content-fields` 与 `pnpm verify:geo` 是生产构建门禁。

### 生产环境变量（名，不含值）

`DATABASE_URL` · `AI_ENABLED` · `PORT` · `CONTENT_LOG_DIR` · 可选 `VITE_GISCUS_*`  
（管理面**无** `ADMIN_API_TOKEN`；公网须靠网络隔离。）

生产改文默认：**改 `content/log` → `pnpm content:publish --push`（或手动 push）→ Vercel 重建 web**。  
Admin 写盘仅本机；**不会**自动同步 GitHub。

### 切流最短步骤

1. 腾讯云 SQLite 初始化 + 备份恢复演练  
2. 部署 Nest/Caddy，回环 `/health` 且 `db:true`，公网只开放白名单路由  
3. API 域名与 HTTPS 就绪后，Vercel 配 `/api` rewrite  
4. 生产 `POST /api/intake` 冒烟，并确认管理端点公网 404  
5. 更新 `docs/STATUS.md`  

## 6. 运行时模块（依赖 / 调用 / 触发 / 实现）

### 6.1 双入口与 API

| 模块 | 一句话职责 |
|------|------------|
| Web `public-api` | 浏览器同源 `/api/*` 写路径门面（intake/赞/反馈） |
| 反代 / Vite proxy | 把 `/api` 转到 Nest 裸路径 |
| Nest Kernel | 注册 intake/clue/seed/execution… |
| IntakeService | 配额 → nextStep → 落 Clue |
| Prisma/PG | 过程对象持久化 |
| 管理 API | 过程读写（当前无令牌） |
| content:gen | `content/log` → `content.json` |

```
[触发] push main → [调用] Vercel → [实现] build:web → www.iwalk.pro
[触发] 卡提交 → [调用] public-api → [依赖] 反代 → Nest Intake → [实现] PG
[触发] 站主列线索 → [调用] /clues → [依赖] ClueService → [实现] Prisma
```

页面依赖 HTTP **契约**（门面），不依赖 Prisma；Service **依赖 Port 接口**，不绑具体适配器。

### 6.2 公开面与 Admin 今日

| 模块 | 一句话职责 |
|------|------------|
| `content.ts` | 查询门面：`getPublishedPosts`（逛）/ `getPublishedContentItems`（宇宙含 tool） |
| `content-spaces` / `tools-sections` / `constants` | **配置**：分型、分区、外链、Ferry 线名 |
| `posts-timeline` / `idea-status` / `pickNextActions` | **规则**：筛选、点子状态、下一动作（无路由） |
| `json-request.fetchJson` | **传输**：统一 JSON fetch |
| `space-icons` / `tools-section-icons` | **展示映射**：icon 键 → Lucide |
| `public-api` / `admin-api` | **门面**：过程 HTTP |
| `pages/*` | **页**：编排；路径只读 `WEB_ROUTES` / `ADMIN_ROUTES` |
| `ContentCard` / `ItemList` / `ResourceCard` | **块**：props + onXxx |

```
[触发] /content
  → [调用] ContentUniversePage
  → [依赖] getPublishedContentItems + content-spaces
  → [实现] 分型列表/网格（含 tool）

[触发] Admin 今日
  → [调用] pickNextActions（无 href）
  → [依赖] admin-api；页内 KIND_HREF → ADMIN_ROUTES
  → [实现] 动作列表

[触发] PUT /support
  → [调用] SupportService.save(partial)
  → [依赖] SupportConfigRepositoryPort
  → [实现] 合并当前配置再写盘
```

**倒置：** 规则不绑 React/路由；门面依赖 `fetchJson`；页映射路径 SSOT。

## 7. 禁止

- 恢复 Astro / Match 双轨 / WorkItem 巨石默认路径  
- 多主题切换  
- 密钥与本地 DB 密码进 git  
