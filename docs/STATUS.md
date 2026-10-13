---
status: active
type: status
title: 生产状态与验证时钟
last_verified: 2026-09-28
ssot: true
applies_to: [web, api]
---

# 状态（权威）

> **2026-09-29 本地后台补项，未部署**：第 26 条 SQLite 迁移新增 `AdminRequestLog`；人工触发的后台管理请求记录开始/结果，自动轮询跳过，运营记录新增“后台日志”查询。Agent 未单独配置模型时使用系统当前默认，并在页面显示配置来源和共享 API 地址。本地开发库先备份后迁移；生产库与站点未更改。

> **2026-09-29 本地修复，未部署**：`conversation.convert` 的事项与审计已合为 SQLite 原子写入，新增审计请求键唯一索引和迁移前重复检查；本地开发库经一致性备份后应用第 25 条迁移，隔离迁移/回退演练通过。后台转事项失败重试、详情状态和小影隐藏/焦点行为已修复。长会话只完成本机测量，不宣称生产性能通过。详见 [本地验收](evidence/LOCAL-CONVERSATION-XIAOYING-FIX-2026-09-29.md) 与 [性能测量](evidence/LOCAL-CONVERSATION-PERFORMANCE-2026-09-29.md)。

> **2026-09-28 本地首页小影，未部署**：开发库新增并启用 `home-xiaoying/site-public` 小影 v1，后台配置模型连通测试、三类权限发布测试及本地真实运行探针通过；浏览器实测 AI 回答和公开文章引用。探针路径与内存门槛 0MB 覆盖只在本机忽略的 `.env` 中，生产默认门槛和 G07/G08 不变。修复 API 重启后旧 SDK 会话冲突、首页事件 404、ACK 409 竞态和失败轮展示旧答。详见 [本地验收](evidence/LOCAL-HOME-XIAOYING-2026-09-28.md)。

> **2026-09-28 本地体验调整，未部署**：访客界面入口改称“提问／文章”并以原有 Dora 卡片为中心调整首页布局；后台内容台账、设置能力提示与发布预检展示修正。`/tools`、`/posts` 和业务接口不变。此为当前工作区变更，生产仍按下方已核验版本记载。

> **2026-09-28 G07 部署前复验，生产仍未部署**：从运行中的生产 SQLite 取得一致快照，8 张非空表 218 行；本地新库应用 24 条迁移并逐行核对，共有列值、完整性、外键和 schema 检查均通过，旧库备份副本可恢复。修复 K6 隔离演练的建库前置后，部署门禁与全仓回归通过。当前线上 API health 仍回显旧版本 `e7493f1`；代码未推送，服务未停、生产库未切换，静态 manifest 与 G08 真实模型启用仍待后续。证据见 [G07 部署前复验](evidence/GOAL-2026-09-28-G07-PREFLIGHT.md)。

> **2026-09-27 本地代码修复，未部署**：七项代码审查问题已纳入 G07 前的回归修正。发布执行改为必须引用批准单并复检版本/授权，API 与手工脚本共用锁；脚本派发后的结果不明保持 `UNKNOWN`，网页版本与问答索引分别显示。内容生成的公开 manifest 只作构建产物。此处仅说明本地代码状态，不代表目标服务器与线上验证通过；完整门禁结果见根 `to-do.md`。

> **2026-09-25 本地更新，未部署**：V17–V19 完成资源登记、可重试删除与备份防复活。V20 新增仅管理员可访问的会话筛选/详情 API 和 Records 回看页；V21 新增受控 CSV/JSON 导出、快照范围、15分钟本机文件过期、鉴权下载及删除联动；V22 对齐 Nest/Caddy 公网白名单并让所有写方法校验 Origin；V23 增加公共位置启用前 readiness；V24 在隔离库完成问答/日志闭环；C01 定义候选/审批/发布合同；C02 已迁移候选/发布持久模型；C03 为文件保存加对象锁与 expectedHash CAS；C04 新增候选 apply/reconcile 与崩溃 hash 核对；C05 让现有人工保存经过管理鉴权、CAS、intent/result audit，保存后不再自动刷新公共索引。候选原文仓储、编辑 UI、新发布执行链仍未完成。当前未配置真实 runtime 探针报告，readiness 阻断启用。V10–V24 与 C01–C05 尚未部署，线上行为继续以实际已部署版本为准。部署/恢复脚本、盒外存储生命周期和生产 Caddy 运行态尚未在目标服务器验证。本地验收证据见根 [`to-do.md`](../to-do.md)。

> **2026-09-21 后台重构状态（优先于下文旧界面说明）**：站主要求清空管理界面。`apps/admin` 仅保留空白开发/构建入口与 API 代理；计划、内容、复盘、设置、旧路由及管理 UI 均已退役。API、数据库、文章与共享规则保留，生产未部署此变更。旧后台页面图与验收记录仅作历史参考，不作为新重构需求。资产清单见 [后台重构前资产清单](evidence/ADMIN-REBUILD-INVENTORY.md)。


> 生产与验收时钟。部署事实细节见 [`ENGINEERING.md`](./ENGINEERING.md) §5。
> 近端产品见 [`PRODUCT.md`](./PRODUCT.md)；远景见 [`VISION.md`](./VISION.md)（不抢验收）。

## 总览（一句话）

**生产双入口已通（2026-09-03 切流）：能逛、能真卡真写、站内助手真答。**
近端重心 = 工作站交付链跑通真实初稿、内容持续增长（历史清单见 `docs/archive/TODO-MAINLINE.md` M3；当前重构唯一原子进度在根 `to-do.md`）。

### 2026-09-15 内容运营后台（一人驾驶舱 · 历史）

本地已按旧后台 PRD（已归档至 `docs/archive/PRD.md`）落地内容分栏、今日并进计划、信号并进复盘，并按 **PRD-D** 拆掉系统抽屉。API 契约见 `docs/api/README.md`。`GET /admin/plan/next` 与 signals.intake `poolStatus` 已落地。Prisma schema 零变更。待盒子部署后才算生产可用。

| 项 | 值 |
|----|-----|
| 工程栈 | monorepo React + Nest + SQLite 单库 · **无 Astro / 无 PG** |
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

### 2026-09-14（发布 `e7493f1` 后复检）

| 路径 / 项 | 结果 |
|------|------|
| `https://api.iwalk.pro/health` | 200 `ok:true, db:true, aiEnabled:true, version:"e7493f1"`（`WALKER_BUILD_VERSION` 回显一致） |
| 盒子 8788 归属 | 单进程 LISTENING（清掉僵尸旧进程后 `/Run`，PID 与 health 同源） |
| 盒子 443 归属 | Caddy 网关 LISTENING（含 IPv6/UDP） |
| 匿名 `https://www.iwalk.pro/api/clues` | 404；`/api/health` 200（路由隔离未破） |
| `POST /api/admin/events`（带 `x-admin-token`，未登记键） | 400 `unknown-feature-key`（新端点在线 + 字典门禁生效）；无 token → 401 |
| `GET /api/admin/usage/stats` · `/ai/stats` | 均 200（读新列成功 → `db push` 已落 SQLite） |
| `POST /api/intake`（正文过短） | 400 `clue-body-too-short`（校验边界在线，未写库） |
| `https://www.iwalk.pro/tools` · `/tools/result` | 均 200；新页壳标题「下一步 · Walker」+ `noindex, follow` |
| 内容改名 | `/posts/dorazoom` 等已显示 `Dora`（27 篇作者名由 `duola` 改齐） |

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
| 2026-09-14 | 发布 `e7493f1` 上生产：卡口对话化 + `/tools/result`、观测三标签、判断代理埋点接线、controller 路由前缀修复；web/API 两条链分别核验绿（探针见上） |

生产卡绿后在此续写 A11 分桶与 +14 天复盘勾选。

## 已交付（不再当待办）

主题线 series、英文 slug、TOC/进度、Ferry 页、去多主题、Admin 内容编辑（本地盘）、support API 骨架、构建 rss/llms/pagefind。
公开面：分型/卡牌/时间线+标签、赞赏静态码、学习深链重定向、ideas/new→卡、404、登录壳诚实。
Admin：今日下一动作（pickNextActions）、系统读 health；过程四面。
AI：卡口 nextStep 双策略（规则五桶 + AI 接地可引用，AI 可关）；站内助手已上线（/ask 整页 + 右下 AskBar 合并搜索面板 + SSE 流式 + 多轮会话归属校验，DeepSeek Harness 只读沙箱，Run 合同 fail-closed，2026-09-03 公网真答通过；见 `docs/PRD-SITE-ASSISTANT.md`；执行实录 `docs/archive/TODO-SITE-ASSISTANT.md`）。
卡口对话化与观测三标签：已上线（2026-09-14，`e7493f1`）。`/tools` 由单页表单改为对话式（首步选卡点类型只做前端引导，不污染线索正文；提交后逐字呈现 nextStep，折叠区只展示真实判定依据——规则桶语义 / AI 或规则来源 / 命中的站内证据，不编造思维链），配套 `/tools/result` 独立结果页（`noindex`，结果仅在本机会话可还原）。后台「观测」页三标签：使用排行（`/admin/usage/stats`）、AI 状态（`/admin/ai/stats`，含 token 用量与降级原因四分类）、旅程回放（`/admin/journey`）。判断代理经 `POST /admin/events` 回写 `agent.mcp` 事件（`FEATURE_KEYS` 字典门禁 + props 上限，失败不阻断工具调用）。
智能体工坊与文件直调：已上线（2026-09-09）。实体智能体角色管理、小影 403 硬核防线、1:1 DSH 供应商模型池配置与 Ping 连通性探测、单次短命直调 `content/log/*.md` 跑完即焚、时序三色甘特图 100% 数据驱动、4 格硬核遥测账单、逐轮审计卡片与独立 `trace.jsonl` 管道（AES-256-GCM 强加密保护，全仓测试全绿；详见 `docs/archive/PRD-AGENT-WORKBENCH.md`；新后台重构见 `docs/PRD-AGENT-OPERATIONS.md`）。
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

1. **工作站真实初稿全链跑通**（创建→加工→刷新→审阅→批准→构建→发布验证）→ 见 `docs/archive/TODO-MAINLINE.md` M3（现行见根 `to-do.md`）
2. **内容增长**：按需求信号中心的内容缺口持续产出
3. **要推 VISION 中层** → 知识可引用进 nextStep 的最小切片
# 2026-09-11 本地增量：小影网页桌宠

- 用户授权将现有影鳐接到首页，并要求做成有生命感的网页桌宠：闲置/工作两态，搜索框即宠物本身。
- 已接：小影是卡片上方的可拖拽图层；对它说话即检索，对话泡进出；它用对话泡回答站内结果。加载失败时静态形象，说话仍可用。
- 未接：音效、承接与表达道具；未发布生产。原始 Blender 文件未改写。
- 细节见 `public/xiaoying/README.md`。旧生产快照继续保留于下文，不以本地试装覆盖生产状态。
