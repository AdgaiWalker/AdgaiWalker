# Goal Document: 新站完善与生产可用

> **角色**：当前「还差什么 → 做成什么」的执行锚。  
> **关联**：`docs/GOAL-生产双入口切流.md`（前序）、`docs/cutover-runbook.md`、`docs/s1-go-live.md`、差距清单（会话 2026-07-22）。  
> **原则**：代码本地已大体齐；**最大缺口是生产运行时**。配置与运维闸门优先于再开功能。

## Go / No-Go

- **Judgment**: **Go after decisions**
- **Reason**:  
  - **可立即做（无决策）**：生产黑盒探针刷新、文档状态对齐、仓库内 `/api` rewrite **模板**、验收清单脚本化。  
  - **必须站主决策后才能宣称完成**：生产 PG 宿主、Nest 托管平台、Vercel 反代 destination、生产 `ADMIN_API_TOKEN` / `DATABASE_URL`、是否部署 Admin、Giscus 四 ID、赞赏码 URL。  
  - 未部署 API 前，**禁止**把 s1「生产切流」标成已完成。

## Target Outcome

在 **`https://www.iwalk.pro`**（apex 跳转后）同时成立：

1. **逛**：`/`、`/posts`、`/posts/{ascii-slug}` 可读；主题线筛选与详情（TOC/邻篇）在 SPA 下可用。  
2. **卡**：`/tools` **200 SPA 壳**；`POST /api/intake` 成功返回非空 `nextStep` + `clueId`；线索可查。  
3. **诚实**：`GET /api/health` → `{ ok, db: true, ... }`；无库写路径 **503** `storage-unavailable`（曾在预发/本地证明）。  
4. **可选但建议同轮收口**：Giscus 四 env 已配则评论出现；support 至少有文案（码可后补）；生产 `/rss.xml` 或 `/llms.txt` 至少一项 200。  
5. **文档**：`s1-go-live` / cutover 与探针一致；验证盒从**卡生产可用日**起算或脚注作废旧窗口。

完成时：**不再是「静态半站」**，而是「双入口在生产可写可读可运营最小集」。

## Goal Definition

- **Type**: operational + delivery  
- **Boundary（In）**:
  - 生产 PG + Nest 部署 + 环境变量  
  - Vercel：`/api/*` → API（rewrite 在 SPA fallback **之前**）；SPA rewrites 保持  
  - 生产探针矩阵 + 一次真实 intake  
  - 文档与验证盒时钟  
  - 可选：Giscus / support-config 填值、Admin 指向生产 API 的用法说明  
- **Non-goals**:
  - 新开 Match / WorkItem / Skill 晋升 / 账号全量 / 多主题（已删）  
  - 旧站视觉 1:1 复刻、Bento/盲盒  
  - 多副本分布式限流  
  - 内容宇宙多维筛选、Learn 深路由大改（可另 Goal）  
  - 未下令时强行改生产计费资源（站主确认宿主后执行）  
- **Deferred**:
  - Auth 真登录  
  - 内容 GitHub 回写（生产无盘时）  
  - AI 真模型增强 intake  
  - A11 权重决策（有 14 天数据后再做）  
- **Verification rule**: **生产域名**黑盒；本地 accept 只作回归网  
- **Evidence source**: curl/HTTP、health JSON、clue 列表、文档字段  
- **Pass criteria**:
  1. `GET /tools` → 200 且 HTML 含 SPA 根（`#root` 或等价）  
  2. `GET /posts` → 200 含真实 title  
  3. `GET /api/health` → 200 且 `ok` 与 `db===true`  
  4. `POST /api/intake` → 2xx + `nextStep` 非空 + `clueId`  
  5. 管理或 API 能列出该线索  
  6. `s1-go-live` 生产状态与拓扑一句与事实一致  
- **Confidence note**: 仅 Vercel 静态 200 ≠ 双入口完成  
- **Judgment owner**: **站主**看过探针证据后接受

## Current State（2026-07-22）

### 代码（main，已大幅齐）

| 域 | 状态 |
|----|------|
| Web | 双入口、主题线、TOC/进度、Ferry、英文 slug、单主题 dianzi |
| API | intake/clues/seeds/executions/likes/feedback/support/admin content |
| Admin | 推进核四面 + 内容编辑 + 令牌（本地 token 可短至 ≥8） |
| 构建 | content:gen、prerender、rss/llms、pagefind |
| 多主题 | **已移除** |

### 生产（2026-07-22 复检）

| 探针 | 结果 |
|------|------|
| `/` `/tools` | **200 SPA**（深链 rewrite 已生效） |
| `/posts`、slug 详情 | **200** 预渲染 |
| `/rss.xml` `/llms.txt` `/pagefind/pagefind.js` | **200** |
| `/api/health` | **404**（无 Nest 反代） |
| 运行时双入口 | **未完成**（仅差公网 API 宿主 + 反代 destination） |

### 本地（2026-07-22）

| 项 | 结果 |
|----|------|
| PG `127.0.0.1:5432` + migrate | 绿 |
| `GET /health` | `ok` + `db:true` |
| `POST /intake` + Admin 列线索 | 绿 |
| 写路径 `STORAGE_UNAVAILABLE` | **503** `storage-unavailable` |

### 配置半齐

- Giscus：组件有，**env 未齐则不渲染**  
- Support：JSON/API 有，**二维码 URL 空**  
- Pagefind/RSS：**生产已 200**

## Plan Rewrite Notes

相对 `GOAL-生产双入口切流.md` 与差距清单：

| 项 | 决策 | 理由 |
|----|------|------|
| Phase 0–1 SPA rewrite / 文档诚实 | **keep 为已完成或复检** | 仓库已有 rewrites；需**部署后**再探针 |
| Phase 2 API+PG+反代 | **keep 为本 Goal 主路径** | 仍是唯一阻塞 |
| 主题线/TOC/内容编辑/去多主题 | **remove from scope** | 已交付，不重复开 |
| Giscus/赞赏填值 | **merge 为 Phase 4 可选配置** | 低成本体感 |
| 首页 Bento/Match/WorkItem | **remove** | Razor / 非本轮 |
| 验证盒 07-21 | **rewrite** | 以卡生产可用日重置 |

## Drift Diagnosis

- **Goal drift**：再做 UI 抛光当「做完」→ 禁止；完成定义=生产探针  
- **Validation drift**：本地 accept 绿当上线 → 禁止  
- **假完成**：只 rewrite 不上 API → 明确非 exit  
- **Cleanup drift**：无关脚手架 → 禁止  

## Priority Rationale

1. 生产无 API → 卡/赞/反馈/Admin 公网全废 → **先运行时**  
2. 反代与 Cookie 同源 → 紧随 API  
3. 探针与文档 → 防状态谎言  
4. Giscus/赞赏 → 不阻塞双入口，可同周收口  
5. 体验抛光 → 另 Goal  

## Assumptions and Open Decisions

| Item | Status | Impact | Next |
|------|--------|--------|------|
| 站主下令执行生产 API 部署 | **unresolved** | 无令则只做探针/文档/模板 | Walker 确认 |
| PG 宿主（Neon/Supabase/自建…） | **unresolved** | DATABASE_URL | 选一并建库 |
| Nest 宿主（Fly/Railway/Render/VPS…） | **unresolved** | 反代 destination | 选一并部署 |
| Vercel `/api` destination URL | **unresolved** | 同源契约 | 部署后写入 vercel.json 或项目配置 |
| 生产 ADMIN_API_TOKEN | **unresolved** | Admin 公网 | 强随机 ≥16 建议 |
| Admin 生产形态 | **unresolved** | 子域 / 本地指生产 API | 钉一种写 runbook |
| Giscus 四 ID | **unresolved** | 评论 | 有则配，无则跳过 |
| 赞赏码 URL | **unresolved** | support 图 | 可后补 |

## Phases

### Phase 1: 生产真相复检 + 文档对齐

- **Purpose**: 用当前生产探针刷新事实，避免按过期 404 矩阵施工  
- **Entry**: 本 Goal 被接受  
- **Rules**: 只读生产 + 改 docs；不改计费资源  
- **Todos**:
  - [ ] 探针：`/` `/tools` `/posts` `/api/health` `/rss.xml` `/pagefind/pagefind.js`  
    - **Surface**: 生产 HTTP  
    - **Proof**: 状态表写入本文件附录或 s1-go-live  
  - [ ] 更新 `s1-go-live` / cutover「当前缺口」与日期  
    - **Surface**: docs  
    - **Proof**: 与探针一致  
- **Exit proof**: 文档无「仓库无 rewrite」类过时句（若 rewrites 已部署则改写为 API 缺口）  
- **Stop**: 域名不可达 → 记网络问题，不假装  

### Phase 2: 生产 PG + Nest（站主选定宿主后）

- **Purpose**: 可写后端在公网  
- **Entry**: 宿主与密钥渠道已定；站主允许创建资源  
- **Rules**:
  - migrate deploy 先于写流量  
  - `ADMIN_API_TOKEN` 生产强随机；本地 `duola2049` **不得**用于生产  
  - `CONTENT_LOG_DIR` 生产无盘则标明内容编辑仅本地/后续 Git  
- **Todos**:
  - [ ] 创建 PG；配置 `DATABASE_URL`  
  - [ ] 部署 Nest；`prisma migrate deploy`；`GET /health` 直连 `db:true`  
  - [ ] 配置 `ADMIN_API_TOKEN`、`AI_ENABLED`（默认 false）  
- **Exit proof**: 公网 API 主机 health 绿  
- **Stop**: 支付/账号绑卡失败 → 换宿主或暂停  

### Phase 3: Vercel `/api` 反代 + 生产闭环

- **Purpose**: 浏览器同源 `/api/*` 打到 Nest  
- **Entry**: Phase 2  
- **Rules**:
  - rewrite **优先于** SPA fallback；`/api` **禁止**落到 index.html  
  - 验证 Cookie `walker-anon` 在 HTTPS 下可用  
- **Todos**:
  - [ ] 配置 rewrite `/api/:path*` → API  
  - [ ] `POST /api/intake` 冒烟 + 查线索  
  - [ ] `GET /tools` 仍为 SPA；赞/反馈抽测  
- **Exit proof**: Pass criteria 1–5  
- **Stop**: 反代循环或 HTML 冒充 JSON → 回滚 rewrite  

### Phase 4: 配置收口 + 验证盒时钟（可选同轮）

- **Purpose**: 评论/赞赏/文档诚实  
- **Entry**: Phase 3 或并行（Giscus/support 不依赖 API 时 support 需 API）  
- **Todos**:
  - [ ] （可选）VITE_GISCUS_* 构建  
  - [ ] （可选）support 二维码 URL  
  - [ ] s1 验证盒起算日 = 卡生产可用日  
  - [ ] Admin 如何连生产 API 写进 runbook 一句  
- **Exit proof**: 文档齐；可选配置有则可见  
- **Stop**: 无  

### Phase 5: 证据包与宣布

- **Purpose**: 站主可签字  
- **Todos**:
  - [ ] 汇总 curl 证据与日期  
  - [ ] 站主确认后勾本 Goal 完成  
- **Exit proof**: Judgment owner 接受  
- **Stop**: 探针未全绿不得宣布  

## Dry-Run Findings

- 代码侧再开发首页/Match **不**缩小生产 API 缺口  
- 本地 `duola2049` 与生产令牌必须分离  
- 内容 Admin 写盘在 Vercel 无状态盘上不可用 → Phase 2 需写明「生产改文仍走 git」  
- SPA rewrite 与 `/api` rewrite 顺序错误会导致假 API  
- 无环依赖；阻塞全在**宿主选择与密钥**  

## Final Validation

```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://www.iwalk.pro/tools
curl -sS -o /dev/null -w "%{http_code}\n" https://www.iwalk.pro/posts
curl -sS https://www.iwalk.pro/api/health
curl -sS -X POST https://www.iwalk.pro/api/intake \
  -H 'content-type: application/json' \
  -d '{"body":"生产验收：下一步是什么","source":"tools-visitor"}'
# 期望：tools/posts 200；health ok+db；intake clueId+nextStep
```

## First Execution Step

**无需宿主决策即可开始 Phase 1**：对 `www.iwalk.pro` 跑一轮探针，把结果写进 `docs/s1-go-live.md`（或本文件附录），并列出「只差 API」还是「深链仍 404」。

**并行请站主答复（决定 Phase 2）**：

1. PG 用哪家？  
2. Nest 部署在哪？  
3. 是否现在下令生产切流？  

---

## 附录 A：代码已交付、不列入本 Goal 施工

主题线 L1、英文 slug、TOC/进度、Ferry 页、去多主题、Admin 内容编辑（本地盘）、support API 骨架、rss/llms 构建、Pagefind 构建钩子。  
本 Goal **只把它们在生产上点亮**，不再重做。

## 附录 B：双入口运行时核心模块（依赖 / 调用 / 触发 / 实现）

| 模块 | 一句话职责 |
|------|------------|
| **Web public-api** | 浏览器对同源 `/api/*` 的门面 fetch |
| **Vite / 生产反代** | 开发 proxy strip `/api`；生产应由 Vercel rewrite 到 Nest |
| **Nest Kernel** | 注册 intake/clue/… 与健康检查 |
| **IntakeService** | 校验配额 → 生成 nextStep → 落 Clue |
| **Prisma/PG** | 持久化线索与配额（`DATABASE_URL`） |
| **AdminAuthGuard** | Bearer 令牌校验管理读 |
| **ClueController** | 管理列/写线索 |
| **probe-production** | 只读生产 HTTP 矩阵 |

关系：

```
[触发] 访客提交卡口
  → [调用] Web public-api → POST /api/intake
  → [依赖] 反代/proxy 将 /api 转到 Nest（实现：Vite dev 或 Vercel rewrite）
  → [调用] IntakeController → IntakeService
  → [依赖] GuestQuota Port + ClueRepository Port + NextStep 策略
  → [实现] Prisma 适配器写 PG

[触发] 站主打开线索池
  → [调用] Admin Bearer → GET /clues
  → [依赖] AdminAuthGuard（接口：配置 Port 取 token）
  → [实现] ClueService + Prisma

[触发] 运维验收
  → [调用] scripts/probe-production.ts（生产）
  → [调用] 本地 curl health/intake/clues（开发）
```

方向：**页面依赖 HTTP 契约，不依赖 Prisma；Service 依赖 Port，不依赖具体 PG 驱动类名之外的实现细节。**

## 附录 C：2026-07-22 执行结论（诚实）

| 项 | 结论 |
|----|------|
| 生产 SPA / 深链 / RSS / pagefind | **已绿** |
| 生产 `/api/health` + intake | **仍红** — 缺公网 Nest + `/api` destination |
| 本地 PG 双入口 | **全绿**（可复现） |
| 是否可将「生产切流」标已执行 | **否** |
| 剩余唯一硬阻塞 | **选定 API/PG 宿主并配置反代 URL** |
