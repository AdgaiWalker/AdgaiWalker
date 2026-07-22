# 部署与发布（权威）

> **准读取**：GitHub → Vercel 发版、生产域名、与 API 缺口的**现行事实**以本文为准。  
> 切流细节（PG/Nest/反代步骤）见 [`cutover-runbook.md`](./cutover-runbook.md)；状态时钟见 [`s1-go-live.md`](./s1-go-live.md)。

## 1. 仓库与生产对应关系

| 项 | 值 |
|----|-----|
| GitHub 仓库 | `https://github.com/AdgaiWalker/AdgaiWalker` |
| 默认分支 | **`main`** |
| Vercel 项目名 | **`adgai-walker`**（团队：`praxiswalker-6245s-projects`） |
| 生产域名 | **https://www.iwalk.pro**（apex `iwalk.pro` → www） |
| 部署方式 | **Git 集成自动部署**（push `main` → Vercel Production） |

本地 CLI：`vercel login` 账号 `praxiswalker-6245`；**不必**再 `vercel link` 也能靠 Git 发版。  
Vercel 已连接本仓库时，**push 即部署**，无需每次手动 `vercel --prod`。

## 2. 发版流程（日常）

```text
改代码 → git commit → git push origin main
       → Vercel 拉取 main → 执行构建 → 发布到 www.iwalk.pro
```

构建以仓库根 `vercel.json` 为准：

| 配置项 | 值 |
|--------|-----|
| `installCommand` | `pnpm install` |
| `buildCommand` | `pnpm build:web` |
| `outputDirectory` | `apps/web/dist` |
| 实质产物 | content:gen → Vite 构建 → 预渲染 posts → rss/llms → pagefind |

**当前 Vercel 只构建并托管公开站静态产物（web）**，不在同一项目内跑 Nest。

## 3. 生产已具备 / 未具备（诚实）

### 已具备（静态 + SPA）

- 首页、文章预渲染、`/tools` 等深链 SPA（rewrite 排除裸 404）
- `/rss.xml`、`/llms.txt`、`/pagefind/*`（构建产物随 web 部署）
- 旧中文 slug → 英文 slug 的 301（`vercel.json` redirects）

### 未具备（双入口运行时）

| 能力 | 生产状态 |
|------|----------|
| Nest API | **未部署**（`GET /api/health` → 404） |
| 生产 PostgreSQL | **未挂到公网 Nest** |
| 同源 `/api/*` 反代到 Nest | **未配置 destination** |
| 公网 intake / 点赞写 / Admin 写 | **不可用**（依赖上面三项） |

本地可全绿：`localhost` PG + `pnpm dev:api` + web/admin。详见 `s1-go-live.md` 本地验收与 `cutover-runbook.md`。

> **禁止**在 API 未绿时把「生产切流」写成已完成。

## 4. SPA 与 `/api` 规则（部署配置）

仓库 `vercel.json` **rewrites**：

1. SPA fallback：`/((?!api/).*)` → `/index.html`  
   - **`/api/*` 不会落到 HTML**（负向前瞻排除）。
2. 生产 Nest 上线后，须在 rewrites **最前**增加（`API_HOST` 换成真实主机，**勿硬编码假域名**）：

```json
{
  "source": "/api/:path*",
  "destination": "https://<API_HOST>/:path*"
}
```

Nest **无**全局 `/api` 前缀：反代须落到 `/health`、`/intake` 等裸路径。  
本地开发：`apps/web` Vite 已将 `/api` proxy 到 `8788` 并 strip 前缀。

探针：

```bash
pnpm exec tsx scripts/probe-production.ts
```

## 5. 生产环境变量（清单，不含密钥值）

| 变量 | 用在 | 说明 |
|------|------|------|
| `DATABASE_URL` | Nest | 生产 PG |
| `ADMIN_API_TOKEN` | Nest / Admin | 强随机；勿用本地短口令 |
| `AI_ENABLED` | Nest | 默认 `false` |
| `PORT` | Nest | 宿主注入 |
| `CONTENT_LOG_DIR` | Nest | 无持久盘时内容编辑仅本地/Git |
| `VITE_GISCUS_*` | **Web 构建** | 可选评论；需配在 Vercel 后重新部署 web |
| `SUPPORT_CONFIG_PATH` | Nest | 可选赞赏配置路径 |

真实密钥只放 Vercel / 宿主面板或本机 `.env`（**不进 git**）。

## 6. Admin 与内容发布

| 场景 | 做法 |
|------|------|
| 开发机改文 | Admin 内容页写 `content/log` → 触发 `content:gen` → 本地 dev 可见 |
| **生产改文** | **默认**：改仓库 `content/log` → `git push main` → Vercel 重建 web |
| Admin 指生产 API | 待 Nest 公网后，Admin 同源 `/api` 或本地 proxy 指向生产；见 cutover-runbook |

## 7. 模块关系（部署视角）

| 模块 | 职责 |
|------|------|
| **GitHub main** | 代码与内容真相源 |
| **Vercel adgai-walker** | 构建并托管 web 静态站 |
| **Nest（待部署）** | 双入口写路径与管理 API |
| **PostgreSQL（待挂公网）** | 线索/配额/赞等持久化 |

```
[触发] git push origin main
  → [调用] Vercel Git 集成
  → [实现] pnpm build:web → 发布 www.iwalk.pro

[触发] 访客 POST /api/intake（生产，待就绪）
  → [依赖] Vercel /api rewrite → Nest
  → [依赖] Nest → DATABASE_URL → PG
  → [实现] IntakeService 落 Clue
```

## 8. 相关文档

| 文档 | 用途 |
|------|------|
| 本文 | **部署与 Git→Vercel 事实** |
| [`cutover-runbook.md`](./cutover-runbook.md) | 如何切 API/PG/反代 |
| [`GOAL-新站完善与生产可用.md`](./GOAL-新站完善与生产可用.md) | 生产可用目标与阶段 |
| [`s1-go-live.md`](./s1-go-live.md) | 探针时钟与验证盒 |
| [`api/README.md`](./api/README.md) | Nest 契约 |
