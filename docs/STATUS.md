# 状态（权威）

> 生产与验收时钟。部署事实细节见 [`ENGINEERING.md`](./ENGINEERING.md) §5。

## 总览

| 项 | 值 |
|----|-----|
| 工程栈 | monorepo React + Nest + PG · **无 Astro** |
| 分支 | **`main`** |
| 生产域名 | https://www.iwalk.pro |
| Vercel | 项目 `adgai-walker` · **push main 自动部署 web** |
| 生产 web | **已部署**（SPA 深链、文章、rss/llms/pagefind） |
| 生产 API | **未切**（`/api/health` 404） |
| 本地双入口 | **可绿**（PG + Nest：health/intake/列线索/写 503） |
| 验证盒 | **正式 14 天自「卡生产可用日」起算**（旧 07-21 窗口作废） |

## 生产探针（2026-07-22）

| 路径 | 结果 |
|------|------|
| `/` `/tools` | 200 SPA |
| `/posts`、slug 详情 | 200 预渲染 |
| `/rss.xml` `/llms.txt` `/pagefind/pagefind.js` | 200 |
| `/api/health` | **404** |
| `/health` | 200 HTML（SPA 吞掉，**非** Nest） |

**诚实结论：** 能逛；公网不能真卡/真写，直到 Nest+PG+`/api` 反代。

## 本地验收备忘

- PG：`127.0.0.1:5432`，库 `walker`，用户常见 `postgres`（密码仅本机 `.env`）  
- `pnpm dev:api` · `dev:web` · `dev:admin`  
- 探针：`pnpm exec tsx scripts/probe-production.ts`

## 验证盒记录（摘）

| 日期 | 说明 |
|------|------|
| 2026-07-21 | 本地闭环验收记录（非生产） |
| 2026-07-22 | 本地 PG 双入口工程验收绿 |

生产卡绿后在此续写 A11 分桶与 +14 天复盘勾选。

## 已交付（不再当待办）

主题线 series、英文 slug、TOC/进度、Ferry 页、去多主题、Admin 内容编辑（本地盘）、support API 骨架、构建 rss/llms/pagefind。

## 未交付（生产运行时）

1. 公网 Nest + PG  
2. Vercel `/api` → API 主机  
3. 生产 intake 探针绿后更新本页「生产切流：已完成」

可选配置：Giscus 四 env、赞赏二维码 URL、生产强随机 `ADMIN_API_TOKEN`。
