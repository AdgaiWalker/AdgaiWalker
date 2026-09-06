# 状态（权威）

> 生产与验收时钟。部署事实细节见 [`ENGINEERING.md`](./ENGINEERING.md) §5。  
> 近端产品见 [`PRODUCT.md`](./PRODUCT.md)；远景见 [`VISION.md`](./VISION.md)（不抢验收）。

## 总览（一句话）

**生产双入口已通（2026-09-03 切流）：能逛、能真卡真写、站内助手真答。**  
近端重心 = 工作站交付链跑通真实初稿、内容持续增长（执行清单见 [`TODO-OPTIMIZATION.md`](./TODO-OPTIMIZATION.md)）。

| 项 | 值 |
|----|-----|
| 工程栈 | monorepo React + Nest + PG/SQLite · **无 Astro** |
| 分支 | **`main`**（push → Vercel 自动 Production web） |
| 生产域名 | https://www.iwalk.pro |
| Vercel | 项目 `adgai-walker`（静态 + `/api/*` rewrites → api.iwalk.pro） |
| 生产 web | **已部署**（SPA 深链、文章、rss/llms/pagefind） |
| 生产 API | **已切流（2026-09-03）**：`/api/health` 200，`ok:true, db:true, aiEnabled:true` |
| 本地双入口 | **可绿**（默认 SQLite + Nest；测试一律走独立测试库 `walker.test.db`） |
| 内容上线 | **Git 为王**：改 content/log → `content:publish --push`；Admin 保存仅本机；拉代码前先 `pnpm check:content-dirty` |
| 远景文档 | [`VISION.md`](./VISION.md) 已落盘（知识→工作站→回灌；点子社区≠NorthStar） |
| 验证盒 | 正式 14 天自 2026-09-03（卡生产可用日）起算 |

## 从远到近（位置）

| 层 | 状态 |
|---|------|
| 远 · 微体站网络 / 点子社区 / 具身 | **仅意图**（VISION + 关于本站「计划」） |
| 中 · 库可调用进决策 + 数字闭环 | **进行中**（需求信号中心已上线，交付回灌待真实初稿全链） |
| 近 · 生产双入口真可用 | **已完成**（2026-09-03：真卡、真写、助手真答） |
| 今 · 内容壳 / 五类 IA / 人·站 / 远景文案 | **已进生产** |

## 生产探针

### 2026-09-05 19:28（北京时间，切流后复检）

| 路径 | 结果 |
|------|------|
| `https://www.iwalk.pro/` | 200 HTML |
| `/api/health`（同源反代） | 200 JSON `ok:true, db:true, aiEnabled:true` |
| `https://api.iwalk.pro/health` | 同上 |
| 匿名 `POST /api/clues` | 404（管理面不裸奔） |
| `/ask` `/llms.txt` | 200 |

历史（切流前，仅存档）：

### 2026-07-31（复检）

| 路径 | 结果 |
|------|------|
| `/` | 200 |
| `/tools` | 200 SPA 壳 |
| `/api/health` | **404**（无 Nest 反代；2026-09-03 起已恢复 200） |

### 2026-07-22（基线）

| 路径 | 结果 |
|------|------|
| `/` `/tools` | 200 SPA |
| `/posts`、slug 详情 | 200 预渲染 |
| `/rss.xml` `/llms.txt` `/pagefind/pagefind.js` | 200 |
| `/api/health` | **404**（2026-09-03 起已恢复 200） |

## 本地（开发机）

| 项 | 典型值 |
|----|--------|
| web | `pnpm dev:web` → :5173 |
| api | `pnpm dev:api` → :8788 · `GET /health` |
| admin | `pnpm dev:admin` → :5174 |
| DB | 默认 SQLite `apps/api`；可选本机 PG；**测试强制独立库**（vitest 改写 `DATABASE_URL` → `walker.test.db`，每次运行重建） |
| 公开内容 | `content:gen` → 28+ 篇（生成内容不变时不再重写 content.json） |
| 探针脚本 | `pnpm exec tsx scripts/probe-production.ts` |

## 公开面 IA（本地已实现 · 进生产靠 push）

侧栏结构：

```text
卡 CTA · 搜索
逛
拿：资源 · 教程
实验：探索 · 札记
探索：全部 · 点子 · 项目
关于：站 · 我 → 硬件 · 支持
```

| 入口 | 路径 | 说明 |
|------|------|------|
| 资源 | `/tools/resources` | 扁平清单，无赛道筛选；分区「部署」等为锚点 |
| 教程 | `/tutorials` | how-to + 跟学；`/condition` `/kit` 重定向至此 |
| 探索 / 札记 | `/explore` `/lab` | 实验的行动面 / 认识面 |
| 站 / 我 / 硬件 | `/about` `/me` `/gear` | Walker=站名；duola=人；硬件在「我」下二级 |
| 兼容 | `/ideas` `/projects` `/showcase` `/condition` `/kit` `/content` `/ideas/new` | 生产 301 到探索视图 / 教程 / 逛 / 卡 |

公开展示与 frontmatter `hall` 对齐；点子 / 项目由 `type` 明确归属，`status` 只描述推进程度。`affordable-ai-community` 已删，旧链 301→资源页。

## 验证盒记录（摘）

| 日期 | 说明 |
|------|------|
| 2026-07-21 | 本地闭环验收记录（非生产） |
| 2026-07-22 | 本地 PG 双入口工程验收绿 |
| 2026-07-31 | 生产 API 仍 404；本地 web+api 绿；VISION/公开 IA 工作区就绪 |
| 2026-09-03 | **生产切流完成**：api.iwalk.pro + `/api/*` 反代 + 助手真答；正式验证盒自当日起算 |
| 2026-09-05 | 外部完整分析（基线 6b5a5cb）归档 `archive/`；次日据此落地 T0–T4 优化批次 |

生产卡绿后在此续写 A11 分桶与 +14 天复盘勾选。

## 已交付（不再当待办）

主题线 series、英文 slug、TOC/进度、Ferry 页、去多主题、Admin 内容编辑（本地盘）、support API 骨架、构建 rss/llms/pagefind。  
公开面：分型/卡牌/时间线+标签、赞赏静态码、学习深链重定向、ideas/new→卡、404、登录壳诚实。  
Admin：今日下一动作（pickNextActions）、系统读 health；过程四面。  
AI：卡口 nextStep 双策略（规则五桶 + AI 接地可引用，AI 可关）；站内助手已上线（web 对话框 /ask + 浮窗 + SSE 流式 + 多轮会话归属校验，DeepSeek Harness 只读沙箱，Run 合同 fail-closed，2026-09-03 公网真答通过；见 `docs/PRD-SITE-ASSISTANT.md` / `TODO-SITE-ASSISTANT.md`）。
**不迁（产品否决/无真相源）：** Match、WorkItem 巨石、账号邀请 Grants、Skill 链、NorthStar 中台做进本站、canvas、MDX 块组件全量。  
**远景保留、不进近端验收：** 知识→工作站→具身回灌；点子社区与智能微体站；内容分发参照 NorthStar 能力（见 VISION）。

## 未交付（生产运行时）

1. ~~公网 Nest + SQLite 首期~~ → **已完成（2026-09-03）**：腾讯云新加坡 Windows 盒子常驻 Nest :8788（SQLite，只绑 127.0.0.1），Caddy 公网白名单反代 `https://api.iwalk.pro`（Let's Encrypt 自动证书）；站内助手引擎（DeepSeek Harness 只读沙箱）同机部署并真答通过  
2. ~~Vercel `/api` → API 主机~~ → **已完成（2026-09-03）**：vercel.json rewrites `/api/*` → `https://api.iwalk.pro`  
3. ~~生产 intake 探针绿后标切流~~ → 见下方「生产切流」

## 生产切流：已完成（2026-09-03）

- 公开 API 面：`https://api.iwalk.pro`（Caddy 白名单逐条对齐 `apps/api/src/app.module.ts`；管理路由需凭据，双防线）
- 访客链路：www.iwalk.pro（Vercel 静态）→ `/api/*` 反代 → 盒子 Caddy → Nest 8788 → SQLite / DeepSeek Harness
- 站内助手：`POST /api/assistant` 公开（AI 可关、预算 200 问/日熔断、citations fail-closed）；问题池在 admin（SSH 隧道 + basic auth）
- 正式验证盒自 2026-09-03 起算；运行基线见 `ops/windows/README.md`，助手运维见 `docs/PRD-SITE-ASSISTANT.md`
- 上线后修订（同日）：助手提问门槛降为 2 字符（用户实测纯中文被禁发）；盒子运维通道增加腾讯云 TAT「执行命令」（SSH 熔断带外替代）

可选配置：Giscus 四 env、赞赏二维码 URL。

## 下一步（优先级）

1. **工作站真实初稿全链跑通**（创建→加工→刷新→审阅→批准→构建→发布验证）→ 见 [`TODO-OPTIMIZATION.md`](./TODO-OPTIMIZATION.md) T1 收尾度量  
2. **内容增长**：按需求信号中心的内容缺口持续产出  
3. **要推 VISION 中层** → 知识可引用进 nextStep 的最小切片  
