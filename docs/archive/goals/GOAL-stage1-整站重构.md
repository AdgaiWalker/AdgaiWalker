> **历史文档**：本文描述的是已退役的 Astro 单应用时代方案/记录。  
> **当前运行栈**见 `README.md`、`docs/architecture-modules.md`（React monorepo）。  
> 请勿按本文路径（`src/pages/*.astro`、`npx astro check`）施工。

# Goal Document: Walker 站 Stage 1 整站重构（保真前台 + 推进核）

> **关联方案：** [`整体改造方案.md`](../整体改造方案.md)（历史标准源，同 archive）  
> **本文角色：** Stage 1 可执行目标与阶段闸门（先 Goal，再 Go）  
> **状态：** Stage 1 工程交付完成（2026-07-21）；生产切流待站主下令

---

## Go / No-Go

- **Judgment**: **Go executed · Stage1 engineering complete**
- **Reason**: monorepo + Nest/PG + 推进核已交付（见 `docs/stage1-retro.md`）。下文「仓库仍是 Astro / 无 apps/*」为**起草时**背景，不是现状；`整体改造方案.md` 已归档于 `docs/archive/整体改造方案.md`。

---

## Target Outcome

本仓在**不丢 git 历史**的前提下长成 **pnpm monorepo（web / admin / api / shared）**；公开前台**默认体验保真**（除认定改造区外交互与信息架构对等）；嵌入可计数的推进核 **线索 → 题苗 → 执行/检验**；写权威唯一在 **Nest + PostgreSQL**；达到方案 §6 毕业条件或 56 天 + 复盘文档后，可切主流量。

**用户可感知的完成态：**

1. 首页 → 读文 → 搜索 → 换主题：**不觉得换了产品**。
2. tools 问答去雾（Checklist 6/6），提交后 admin 线索列表可见。
3. 至少 1 次真实可计数闭环；观测能指出冷热与主失败码。

---

## Goal Definition

- **Type**: technical + product delivery（技术重构整体 + 局部产品改造）
- **Boundary**:
  - **含**：本仓 monorepo 骨架；React/Vite 前台保真迁移；Nest/Prisma/PG API；`src/content/log` 构建期读 + 预渲染；改造区（问答/线索/题苗/执行）；Admin 首迁默认名单 + 推进核导航；站内功能观测（feature 事件 + fail_code）；长分支施工、M2+M3 齐后再切流。
  - **不含 / Non-goals**:
    - 新开空仓；把历史文章 bulk 进 PG 当唯一内容源
    - 整包复刻 WorkItem 全家桶 / Skill 晋升全链 / ObjectGrant / NorthStar 订单中台
    - 用工作台替换内容站主导航；点子广场 / 建站 SaaS
    - 首版 Redis 必依赖、多实例限流
    - 施工期在 Astro 树新增推进核业务
  - **Deferred**:
    - AI 侦察灌库、薄平台 listed、阅读深度 50%/90%、第三方分析、真实支付商
    - tools 资源分类大改；Admin 长尾页；Nest 全文 ContentModule
- **Verification rule**: 分阶段 exit proof 全绿 + Final Validation 全过；毕业满足方案 §6 **或** 上线后 56 天 + `docs/stage1-retro.md`（须引用至少 1 条观测结论）
- **Evidence source**: 命令（health/tsc/test/build/curl）、E2E、artifact（monorepo 目录/migrate/预渲染 HTML）、行为对照（parity 主路径）、业务计数（可计数闭环）、观测（feature 冷热 + fail_code）
- **Pass criteria**（整目标）:
  1. `apps/web|admin|api` + `packages/shared` 存在；`pnpm` workspace 可装可测
  2. 保真主路径可完成且路径心智不变（偏差有 `docs/redirects.md`）
  3. 改造区：intake→线索可见；主选无线索→400；关 AI 时 nextStep 非空
  4. 生产无 `DATABASE_URL` 时写接口 **503** `storage-unavailable`（无假持久）
  5. 毕业条件满足或 56 天复盘通过
- **Confidence note**: 方案 §5.18 / §6–§9 / §14 已给可验证标准；parity「不感到换产品」含主观判断，用主路径清单 + 抽样对照降风险，最终以站主体感验收为准。
- **Judgment owner**:
  - 工程门禁：命令/测试退出码（系统）
  - 保真主观：站主对主路径的体感验收
  - 毕业：§6 计数（系统）或 56 天复盘文档站主签字

---

## Current State

> **以下为 Goal 起草时的施工起点（历史快照），不是 2026-07-21 之后的仓库现状。**  
> **现状**：`main` 已是 pnpm monorepo（`apps/web|admin|api` + `packages/shared`）；内容在 **`content/log`**；无 Astro 应用树。详见根 `README.md`。

- **（历史）起草时存在**：Astro 6 站点、`src/content/log`、WorkItem 后台、尚无 monorepo 骨架  
- **（历史）约束**：一人可养；施工期双栈；公开 URL 尽量不变  
- **（现行）内容路径**：`content/log` → `pnpm content:gen`  
- **（现行）管理鉴权**：`ADMIN_API_TOKEN` Bearer（非 walker-session 管理面）

---

## Plan Rewrite Notes

（相对 `整体改造方案.md` M0–M8 的执行层重锚定）

| Existing item | Decision | Reason |
|---------------|----------|--------|
| M0 方案冻结 | **keep + 补** Goal Document | 方案仍是标准源；Goal 补「可执行裁决与分支策略」 |
| M1 monorepo 骨架 | **keep，升为 Phase 1 第一刀** | 无骨架后续全空转 |
| M2 保真高流量 | **keep，紧接骨架** | 除改造区外尽量还原；先可见保真降「换站」风险 |
| M3 问答+线索 | **keep，第一改造垂直切片** | 卡点→入库是推进核入口 |
| M4 题苗+执行 | **keep** | 可计数闭环价值点 |
| M5 保真补全+观测看板 | **reorder 内聚** | 保真补全与观测 P1 同阶段，避免「半站 + 无数字」 |
| M6 Admin 在用页 | **keep，缩默认名单** | 推进核导航优先；长尾不首迁 |
| M7 毕业 | **keep** | 停止条件清晰 |
| M8+ 延后 | **keep as deferred** | 防未毕业做平台 |
| 直接改 main / 新空仓 | **remove 为选项** | 效率与安全：长分支 + 本仓旁路 |
| 旧 Astro 并行大改业务 | **remove / 禁止** | 方案 F18；只读对照 |
| WorkItem 整迁 | **remove from Stage 1** | 语义落到题苗+执行 |

---

## Drift Diagnosis

- **Goal drift**: 方案中 Admin/观测/延后能力若被当成「同时做完」，会冲淡「保真 + 推进核闭环」；Goal 把 Stage 1 钉死在这两点。
- **Phase drift**: 原 M 按主题清楚，但缺**分支策略与双栈纪律**作为 Phase 0；补上。
- **Validation drift**: 部分条目易滑成「目录建了就算」；每阶段强制 command/E2E/行为 proof。
- **Compatibility drift**: 双栈期若两边都写推进核会永久双改；规则：**推进核只进 Nest，Astro 不加**。
- **Cleanup drift**: 删旧 Admin、美化无关 CSS、重构现网 services **不进** Stage 1 阶段 todo。

---

## Priority Rationale

1. **先骨架（可跑 API/DB/包边界）**——否则保真与改造都无处挂。
2. **先保真高流量**——兑现「除改造区外尽量还原」，尽早暴露预渲染/路由/主题风险。
3. **再 intake 垂直切片**——最短路径证明「问题→线索池」。
4. **再闭环**——题苗+检验才是价值检验。
5. **补全与观测、Admin 导航**——可养、可复盘，再毕业切流。

高杠杆前置：共享解析函数唯一、错误码合同、无假持久、关 AI 规则 nextStep。

---

## Assumptions and Open Decisions

| Item | Status | Impact | Owner / Next step |
|------|--------|--------|-------------------|
| `整体改造方案.md` + 本 Goal 为执行权威 | **confirmed** | 无权威则标准漂移 | 站主书面确认 |
| 施工分支名 `refactor/stack-rewrite` | **confirmed** | 可改名，不影响结构 | 开工时创建；站主可改名 |
| 旧 Astro 施工期只读对照、不删不迁业务 | **confirmed** | 违反则双改 | 阶段规则强制 |
| Admin「每周在用页」完整清单 | **confirmed** | 仅影响 Phase 6 宽度 | 默认用方案 §5.17；站主可附录覆盖 |
| 切流时间点 = M2+M3 关键路径 + 站主下令 | **confirmed** | 过早切流伤现网 | 毕业/验收前不切生产主入口 |
| 方案文件路径：根目录 vs `docs/` | **confirmed** | 文档治理 | 建议收进 git 并正式跟踪 |
| 允许在确认后开分支并做 Phase 1 | **confirmed** | 无下令不写代码 | 站主一句「按本 Goal 从 Phase 1 开工」 |

---

## Phases

### Phase 0: 冻结与开工闸门

- **Purpose**: 权威、分支、双栈纪律就位，避免边跑边定。
- **Entry condition**: 本 Goal Document 已交付审阅。
- **Phase rules**:
  - 允许：确认文档、建分支、把方案纳入 git（若站主同意）
  - 禁止：业务实现、改 Astro 产品行为、新建推进核到旧树
- **Todos**:
  - [x] 站主确认：本 Goal + `整体改造方案.md` 为 Stage 1 执行权威
    - **Surface**: 决策
    - **Proof**: 聊天明确「确认」或勾选方案 M0
    - **Depends on**: none
  - [x] 创建长分支 `refactor/stack-rewrite`（或站主指定名）并基于 `main`
    - **Surface**: git
    - **Proof**: `git branch --show-current` 为目标分支
    - **Depends on**: 上一项确认 + 开工令
- **Exit proof**: 权威确认 + 分支存在（或站主明确「就在 main 干」的书面例外）
- **Stop condition**: 权威未确认；或要求先改产品范围

### Phase 1: Monorepo + Nest 骨架（≈ M1）

- **Purpose**: 可安装、可 typecheck、可 health、可 migrate 的空跑道。
- **Entry condition**: Phase 0 退出。
- **Phase rules**:
  - 允许：`apps/web|admin|api`、`packages/shared`、Prisma、docker-compose PG:54329、README dev 命令、shared 纯规则测试
  - 禁止：保真页大迁、推进核完整 UI、引 Redis 必依赖、删/大改 Astro 业务
  - 兼容：旧 `npm run dev` 仍可对照；新栈用 pnpm 三条命令
  - 验证：health + tsc + shared tests 绿才退出
- **Todos**:
  - [x] 根 `pnpm-workspace.yaml` + `packageManager`；四包目录就位
    - **Surface**: repo layout
    - **Proof**: 目录存在；`pnpm install` exit 0
    - **Depends on**: Phase 0
  - [x] Nest `GET /health` 符合方案 §5.15；无 DB 时进程仍 200 且 `db` 可 false
    - **Surface**: `apps/api`
    - **Proof**: curl JSON 字段齐全
    - **Depends on**: 骨架
  - [x] Prisma schema + ≥1 migrate 进 git；compose 暴露 54329
    - **Surface**: api/prisma + docker
    - **Proof**: migrate 文件在 git；本地可连
    - **Depends on**: 骨架
  - [x] `packages/shared`：闭环/主选/外部来源等纯函数测试 ≥8 绿
    - **Surface**: shared tests
    - **Proof**: `pnpm --filter @walker/shared test` exit 0
    - **Depends on**: 骨架
  - [x] 结构化 error 日志 + requestId（底线）
    - **Surface**: api
    - **Proof**: 任意请求响应头/日志可见 requestId
    - **Depends on**: Nest 启动
  - [x] README：web 5173 / admin 5174 / api 8788 三条 dev 命令 + 单实例限流说明
    - **Surface**: docs
    - **Proof**: README 可照做
    - **Depends on**: 端口约定落地
- **Exit proof**: 方案 M1 清单可勾选；Node engines ≥20
- **Stop condition**: 引入 Redis 必依赖、或在 api 外写业务状态机

### Phase 2: 保真高流量前台（≈ M2）

- **Purpose**: 公开主路径「看起来、用起来仍是原站」。
- **Entry condition**: Phase 1 退出。
- **Phase rules**:
  - 允许：壳/导航/主题、首页、`/posts` 列表+详情（TOC 若有）、构建期扫 MD、预渲染
  - 禁止：改文案 bulk、改 tools 问答产品（属 Phase 3）、分类大改、为「更好看」重做 IA
  - 兼容：路径不一致必须写 `docs/redirects.md`；解析 frontmatter **只一处**
  - 验证：预渲染 HTML 含 title；主路径人工/脚本对照
- **Todos**:
  - [x] ContentReadModel：扫描 `src/content/log`，解析函数唯一
    - **Surface**: shared 或 web 构建脚本
    - **Proof**: 单测或抽查 3 篇 title/slug 正确
    - **Depends on**: Phase 1
  - [x] 导航/主题/基础壳 parity
    - **Surface**: `apps/web`
    - **Proof**: 换主题可用；路由心智不变
    - **Depends on**: web 骨架
  - [x] 首页 + `/posts` 列表/详情 parity（含 TOC 若有）
    - **Surface**: web UI
    - **Proof**: 主任务路径完成；抽查 3 篇预渲染 HTML 含 title
    - **Depends on**: ContentReadModel
  - [x] 路径偏差表（若有）
    - **Surface**: `docs/redirects.md`
    - **Proof**: 文件存在且源→目标→301 完整
    - **Depends on**: 路由实现时发现偏差
- **Exit proof**: 「首页→读文→换主题」站主或指定对照人验收通过
- **Stop condition**: 为保真页引入运行时 Nest 拉全文；或生产路由仅 CSR 空壳

### Phase 3: 问答改造 + 线索池（≈ M3）— 第一改造垂直切片

- **Purpose**: 问题导向 intake；线索入库；游客/限流/关 AI 诚实可用。
- **Entry condition**: Phase 2 退出（至少 posts 可读，避免无站可对照）。
- **Phase rules**:
  - 允许：Intake/Clue 模块、web 问答 UI（方案 §7 6/6）、admin 线索列表、进程内限流、规则 nextStep 五桶、feature 事件 `match.intake`
  - 禁止：无线索主选、假持久、平台 listed、复刻 Match 黑话主信息条
  - 写权威：仅 Nest；生产无 PG → 写 503
- **Todos**:
  - [x] Nest Clue + Intake；校验 body trim≥4；来源枚举
    - **Surface**: api
    - **Proof**: 单测/请求 201；非法 4xx
    - **Depends on**: Phase 1 schema 扩展
  - [x] web 问答 UI 满足方案 §7 Checklist 6/6
    - **Surface**: web `/tools` 问答区
    - **Proof**: Checklist 逐项可勾
    - **Depends on**: intake API
  - [x] admin 线索列表：一次刷新可见刚提交
    - **Surface**: admin
    - **Proof**: E2E 或手测：提交→列表
    - **Depends on**: clue list API
  - [x] 游客 1 次 + 限流；错误码 `guest-quota-exceeded` / `rate-limited`
    - **Surface**: api + cookie
    - **Proof**: 第二次完整问答 401；超限 429
    - **Depends on**: anon cookie
  - [x] `AI_ENABLED≠true` 时五桶+default nextStep 非空
    - **Surface**: shared/api
    - **Proof**: 每桶 1 样例 201 且 `aiUsedFlag===false` 且 nextStep.length≥4
    - **Depends on**: RuleNextStepAdapter
  - [x] feature 字典初版 + `match.intake` 漏斗事件
    - **Surface**: api observability
    - **Proof**: success/fail+code 可查
    - **Depends on**: intake
  - [x] 记录 S1 上线日（观测/56 天时钟）
    - **Surface**: docs 或 metrics 备注
    - **Proof**: 日期写下
    - **Depends on**: 本阶段功能可演示
- **Exit proof**: 方案 M3 清单 + ≥1 条 E2E「问答→admin 可见」
- **Stop condition**: 只改皮列表不可见；或关 AI 仍空 nextStep

### Phase 4: 题苗 + 执行检验 + 热记（≈ M4）

- **Purpose**: 可计数闭环与真实一次闭环。
- **Entry condition**: Phase 3 退出。
- **Phase rules**:
  - 允许：Seed/Execution、主选规则、交付/检验、metrics、≤3 步热记
  - 禁止：promote 跳过 in-pool 线索；未毕业做平台；Application 绑死具体 LLM SDK
- **Todos**:
  - [x] Seed：挂 in-pool、primary 全局 1、两问、无线索 promote→400 `missing-clue`
    - **Surface**: api + shared
    - **Proof**: 单测 ≥ 主选/闭环相关 case
    - **Depends on**: clue in-pool
  - [x] Execution：deliver/review；no 须证据≥4；`isCountableLoop`
    - **Surface**: api + shared
    - **Proof**: 单测 + 1 次真实数据闭环
    - **Depends on**: seed primary
  - [x] metrics（闭环计数；可与冷热同口或分口）
    - **Surface**: api
    - **Proof**: 接口返回可计数进度
    - **Depends on**: execution
  - [x] 快捷热记 ≤3 步
    - **Surface**: admin UI
    - **Proof**: 手测 <30s 可记
    - **Depends on**: seed/execution API
  - [x] seed.promote / execution.review 的 success/fail 事件
    - **Surface**: observability
    - **Proof**: 事件可查
    - **Depends on**: 对应 API
- **Exit proof**: ≥1 次真实可计数闭环；相关 spec 绿
- **Stop condition**: 闭环定义被 UI 私自改写

### Phase 5: 保真补全 + 观测看板（≈ M5）

- **Purpose**: 前台长尾 parity + 能回答「冷热/为何失败」。
- **Entry condition**: Phase 4 退出（默认串行更稳；不得阻塞闭环定义）。
- **Phase rules**:
  - 允许：tools 资源列表 parity、learn/ideas/projects/content/about/support、Pagefind、点赞、Giscus 行为对等、page_view/搜索无结果/内容反馈、admin 冷热+失败码页
  - 禁止：资源分类大改；用点赞断言「有用」；默认上第三方分析
- **Todos**:
  - [x] 其余前台页 + tools 列表 parity
    - **Surface**: web
    - **Proof**: 各主路径可达
    - **Depends on**: Phase 2 壳
  - [x] Pagefind 进 `build:web`；⌘K 可搜到 ≥1 标题
    - **Surface**: build
    - **Proof**: 产物含 `pagefind/`
    - **Depends on**: 预渲染
  - [x] 点赞/评论/内容反馈 parity（反馈与点赞分列）
    - **Surface**: web + api Engagement
    - **Proof**: 行为对等；存储无假持久
    - **Depends on**: PG likes 等
  - [x] admin：功能冷热榜 + 失败码 Top（方案 §14.5）
    - **Surface**: admin
    - **Proof**: 有数据时能指出最热/最冷/主失败码
    - **Depends on**: feature 事件
- **Exit proof**: 方案 M5 清单可勾；观测页可演示
- **Stop condition**: 观测写入拖垮主请求（必须失败隔离）

### Phase 6: Admin 在用页 + 推进核导航（≈ M6）

- **Purpose**: 管理端可日常使用；长尾不拖死。
- **Entry condition**: Phase 5 或推进核三页已可用（可与 5 部分重叠，导航验收在本阶段）。
- **Phase rules**:
  - 允许：登录、线索/题苗/执行/metrics、内容列表编辑（若仍用）、AI Gateway（若在用）
  - 禁止：WorkItem 全家桶整迁；资产/Skill/NorthStar/Grants 首迁；死链无说明
- **Todos**:
  - [x] 推进核挂主导航；未见迁页不装死链（或标明未迁）
    - **Surface**: admin nav
    - **Proof**: 导航可见「线索/题苗/执行」
    - **Depends on**: Phase 3–4 UI
  - [x] 在用页按方案 §5.17 默认名单 React 保真迁（清单可被站主附录覆盖）
    - **Surface**: admin
    - **Proof**: 在用路径可完成主任务
    - **Depends on**: 站主可选附录
- **Exit proof**: 站主用新 admin 完成「看线索→主选→检验」不依赖旧巨石
- **Stop condition**: 范围膨胀到整包旧 Admin

### Phase 7: 毕业与切流准备（≈ M7）

- **Purpose**: 证明 Stage 1 可结束；准备主流量切换（切换本身需站主下令）。
- **Entry condition**: Phase 6 退出；观测有连续数据或已有复盘素材。
- **Phase rules**:
  - 允许：毕业判定、复盘文档、redirects/runbook 草案
  - 禁止：未下令切生产；未毕业上架平台当完成
- **Todos**:
  - [x] 检查方案 §6 毕业条件 **或** 写 `docs/stage1-retro.md`（含 ≥1 观测结论）
    - **Surface**: metrics + docs
    - **Proof**: 条件满足或文档存在且引用数字
    - **Depends on**: Phase 4–5
  - [x] 切流 runbook 草案（静态托管 + api + PG；health；旧入口 301）
    - **Surface**: docs
    - **Proof**: 文档可照做
    - **Depends on**: 部署形态确认
- **Exit proof**: 毕业条件满足；站主接受「可切流」
- **Stop condition**: 关键路径仍依赖旧 Astro 写路径

---

## Dry-Run Findings

1. **闸门未关**：权威确认与开工令仍缺 → 故 Go after decisions，First Step 不是写 Nest。
2. **Phase 2 与 3 顺序**：先保真高流量再改问答，避免改造时还没有对照站；若强要先闭环，可把 Phase 2 缩成「壳+空路由」但**违背还原优先**，不推荐。
3. **Prisma schema 演进**：Phase 1 只需最小 schema；Clue/Seed/Execution 表在 3–4 迁移加入——避免 M1 一次画完宇宙。
4. **Admin 在用清单未知**：Phase 6 默认方案 §5.17，不阻塞 1–5。
5. **方案文件若未进 git**：影响「唯一方案」可追溯；建议 Phase 0 一并跟踪。
6. **无循环依赖**：0→1→2→3→4→5→6→7 单向；5 与 6 可部分重叠但不反向依赖 7。
7. **假完成陷阱已写进 stop**：只改皮、假持久、空 nextStep、CSR 空壳。

---

## Final Validation

| # | 检查 | 通过标准 |
|---|------|----------|
| 1 | 工程 | monorepo 可 install；api health；shared+api 相关 test 绿；typecheck 绿 |
| 2 | 保真 | 主路径清单通过；≥3 篇预渲染 HTML 含 title；站主体感「没换产品」 |
| 3 | 改造 | 方案 §7 6/6；线索可见；主选规则；≥1 可计数闭环 |
| 4 | 诚实 | 无 PG 写 503；关 AI nextStep 非空；错误码固定 |
| 5 | 观测 | 能指出 1 热 1 冷 1 主失败码（有 7 天数据时）或复盘引用事件 |
| 6 | 毕业 | 方案 §6 或 56 天 + retro |
| 7 | 防偷工 | 方案 §9 表无失败项 |

---

## First Execution Step

站主回复三句确认（可合并一句）：

1. 确认本 Goal + `整体改造方案.md` 为 Stage 1 执行权威；
2. 同意长分支 `refactor/stack-rewrite`（或给出分支名）；
3. 下令「按本 Goal 从 Phase 1 开工」。

收到后的**第一个具体动作**：从 `main` 拉分支 → 跟踪方案/本 Goal 文档（若允许）→ 搭 `pnpm-workspace` + 四包空壳 + Nest health + Prisma 最小 migrate（Phase 1 开工，不碰保真业务页）。

---

## 一句话

目标已写成可执行 Stage 1；技术上旁路 monorepo、产品上保真优先、价值上推进核闭环；**Stage 1 工程已交付；切流需站主下令。详见 docs/stage1-retro.md。**
