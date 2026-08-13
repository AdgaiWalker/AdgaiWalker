# 状态（权威）

> 生产与验收时钟。部署事实细节见 [`ENGINEERING.md`](./ENGINEERING.md) §5。  
> 近端产品见 [`PRODUCT.md`](./PRODUCT.md)；远景见 [`VISION.md`](./VISION.md)（不抢验收）。

## 总览（一句话）

**本地：双入口可跑，内容壳与远景已写清。生产：能逛、卡页是壳，真写入未通。**  
近端主缺口仍是公网 Nest + 持久化 + Caddy 白名单 + `/api` 反代。

**腾讯云基线（2026-08-10）：** Windows 2C2G 已建立 SSH 公钥连接；确认 Node/Git/Caddy/数据库运行时尚未安装。目标已收敛为单 Nest + SQLite + Caddy 公共白名单，Admin 经 SSH 隧道私用；尚未部署、尚未切流。

| 项 | 值 |
|----|-----|
| 工程栈 | monorepo React + Nest + PG/SQLite · **无 Astro** |
| 分支 | **`main`**（push → Vercel 自动 Production web） |
| 生产域名 | https://www.iwalk.pro |
| Vercel | 项目 `adgai-walker` |
| 生产 web | **已部署**（SPA 深链、文章、rss/llms/pagefind） |
| 生产 API | **未切**（`/api/health` **404**） |
| 本地双入口 | **可绿**（默认 SQLite + Nest；可选 PG） |
| 内容上线 | **Git 为王**：改 content/log → `content:gen` → commit/push；Admin 保存仅本机 |
| 远景文档 | [`VISION.md`](./VISION.md) 已落盘（知识→工作站→回灌；点子社区≠NorthStar） |
| 验证盒 | **正式 14 天自「卡生产可用日」起算**（旧 07-21 窗口作废） |

## 从远到近（位置）

| 层 | 状态 |
|----|------|
| 远 · 微体站网络 / 点子社区 / 具身 | **仅意图**（VISION + 关于本站「计划」） |
| 中 · 库可调用进决策 + 数字闭环 | **未做透** |
| 近 · 生产双入口真可用 | **未完成**（API 未切） |
| 今 · 内容壳 / 五类 IA / 人·站 / 远景文案 | **本地已搭**；进生产须 push main |

## 生产探针

### 2026-07-31（复检）

| 路径 | 结果 |
|------|------|
| `/` | 200 |
| `/tools` | 200 SPA 壳 |
| `/api/health` | **404**（无 Nest 反代） |

### 2026-07-22（基线）

| 路径 | 结果 |
|------|------|
| `/` `/tools` | 200 SPA |
| `/posts`、slug 详情 | 200 预渲染 |
| `/rss.xml` `/llms.txt` `/pagefind/pagefind.js` | 200 |
| `/api/health` | **404** |
| `/health` | 200 HTML（SPA 吞掉，**非** Nest） |

**诚实结论（仍成立）：** 能逛；公网不能真卡/真写，直到 Nest+PG+`/api` 反代。

## 本地（开发机）

| 项 | 典型值 |
|----|--------|
| web | `pnpm dev:web` → :5173 |
| api | `pnpm dev:api` → :8788 · `GET /health` |
| admin | `pnpm dev:admin` → :5174 |
| DB | 默认 SQLite `apps/api`；可选本机 PG |
| 公开内容 | `content:gen` → 约 **19** 篇（hall：condition / kit / showcase / lab） |
| 探针脚本 | `pnpm exec tsx scripts/probe-production.ts` |

## 公开面 IA（本地已实现 · 进生产靠 push）

侧栏结构：

```text
卡 CTA · 搜索
逛
拿：资源 · 教程
实验：点子 · 项目 · 札记
关于：站 · 我 → 硬件 · 支持
```

| 入口 | 路径 | 说明 |
|------|------|------|
| 资源 | `/tools/resources` | 扁平清单，无赛道筛选；分区「部署」等为锚点 |
| 教程 | `/tutorials` | how-to + 跟学；`/condition` `/kit` 重定向至此 |
| 点子 / 项目 / 札记 | `/ideas` `/projects` `/lab` | 实验三态 |
| 站 / 我 / 硬件 | `/about` `/me` `/gear` | Walker=站名；duola=人；硬件在「我」下二级 |
| 兼容 | `/showcase` | → 项目或点子 |

内容五类与 frontmatter `hall` 对齐；`affordable-ai-community` 已删，旧链 301→资源页。

## 验证盒记录（摘）

| 日期 | 说明 |
|------|------|
| 2026-07-21 | 本地闭环验收记录（非生产） |
| 2026-07-22 | 本地 PG 双入口工程验收绿 |
| 2026-07-31 | 生产 API 仍 404；本地 web+api 绿；VISION/公开 IA 工作区就绪 |

生产卡绿后在此续写 A11 分桶与 +14 天复盘勾选。

## 已交付（不再当待办）

主题线 series、英文 slug、TOC/进度、Ferry 页、去多主题、Admin 内容编辑（本地盘）、support API 骨架、构建 rss/llms/pagefind。  
公开面：分型/卡牌/时间线+标签、赞赏静态码、学习深链重定向、ideas/new→卡、404、登录壳诚实。  
Admin：今日下一动作（pickNextActions）、系统读 health；过程四面。  
**不迁（产品否决/无真相源）：** Match、WorkItem 巨石、账号邀请 Grants、Skill 链、NorthStar 中台做进本站、canvas、MDX 块组件全量。  
**远景保留、不进近端验收：** 知识→工作站→具身回灌；点子社区与智能微体站；内容分发参照 NorthStar 能力（见 VISION）。

## 未交付（生产运行时）

1. 公网 Nest + SQLite 首期（达迁移条件后转托管 PG）  
2. Vercel `/api` → API 主机  
3. 生产 intake 探针绿后：本页标「生产切流：已完成」+ 验证盒正式起算  

可选配置：Giscus 四 env、赞赏二维码 URL。管理面已去令牌。

## 下一步（优先级）

1. **要对齐 PRODUCT** → 上 Nest+PG+`/api`，公网真卡  
2. **要上线本轮公开面** → commit + push `main`（Vercel 发 web）  
3. **要推 VISION 中层** → 样板站「知识可引用进 nextStep」最小切片（API 通后更有意义）  
