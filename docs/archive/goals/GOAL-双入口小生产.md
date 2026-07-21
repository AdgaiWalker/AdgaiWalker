# Goal Document: 交付 PRD「双入口小生产」（安全优先）

> **归档**：`docs/archive/goals/` · **产品权威**：[`docs/PRD-双入口小生产.md`](../../PRD-双入口小生产.md)  
> **工程底座**：已合入 **`main`**（历史施工分支 `refactor/stack-rewrite` / `feat/dual-entry-tactile-accept`；早期 commit `fa46708` 一带仅为 monorepo 起点）  
> **优先级**：安全 > 质量 > 效率  
> **状态**：工程交付完成（2026-07-21）；请在 `main` 继续，勿再以旧分支为唯一施工面

---

## Go / No-Go

- **Judgment**: **Go completed**
- **Reason**: 工程已交付：卡=`/tools`、过程闭环与 accept 已绿；产品权威见 `docs/PRD-双入口小生产.md`。本文仅追溯。

---

## Target Outcome

当本 Goal 完成时，下列为真：

1. **安全**：详情 Markdown 消毒；管理写（入池/主选/交付/检验）无会话失败；公开写限流/配额/无库 503 仍诚实。  
2. **卡**：访客从一级入口完成 intake，得非空 nextStep，线索入池；关 AI 仍可用；规则与错误人话可见。  
3. **过程**：站主可完成 池→苗→交付→检验 一次可计数闭环（有测/手测记录）。  
4. **逛**：≥3 篇正文可读（底线，非全 ContentShell）。  
5. **心智**：10 秒能分清卡/逛（导航或首页文案）。  
6. **验证盒启动**：写下 14 天起始日；记录线索来源字段或约定。

**不**以「像旧 Astro」为完成条件。

---

## Goal Definition

- **Type**: product delivery + security hardening  
- **Boundary**:
  - **含**：PRD R1–R11 / A1–A9 工程可证部分；A10–A11 启动（站主使用纪律，系统只提供入口与记录位）  
  - **Non-goals**:
    - 视觉保真北极星、WorkItem 巨石、Match 双轨、Ferry/宇宙/Learn 深路由全量  
    - Giscus、账户全量、阅读遥测、生产切流执行  
    - AI 自动 promote/yes  
  - **Deferred**: 阅读增强 PRD（TOC/系列/Giscus…）；账户产品化 PRD  
- **Verification rule**: PRD Acceptance A1–A9 可观察通过 + 安全相关自动化/手测记录  
- **Evidence source**: 测试、curl、浏览器路径、admin 列表、消毒样例  
- **Pass criteria**: 见 Final Validation 表  
- **Confidence note**: A1/A10 含主观与站主行为；工程侧用入口存在 + 闭环可跑代理  
- **Judgment owner**:
  - 安全与 API：测试/curl（系统）  
  - 心智 10 秒：站主  
  - 14 天盒：站主（到期复盘）

---

## Current State

- **有**：pnpm monorepo；web（双入口雏形、tools intake、资源页、阅读粗版）；admin（池/苗/检/指标）；api（Intake/Clue/Seed/Execution/Likes/Feedback）；shared 规则；PRD/GOAL/改造方案已提交  
- **缺/弱**：详情 HTML **未消毒**；管理 API **基本无鉴权**；「卡」未在首页与主导航同级强调；阅读无 TOC 等（本 Goal 不要求）  
- **约束**：一人；安全优先；旧 `src/` Astro 只读对照  
- **风险**：未鉴权写接口若暴露；假完成（只改文案不闭环）；范围回流保真清单

---

## Plan Rewrite Notes

（相对同目录 `GOAL-stage1-整站重构.md` 与「视觉保真主线」）

| Existing item | Decision | Reason |
|---------------|----------|--------|
| Stage1 monorepo/M1–M4 底座 | **keep** 作前提 | 已 commit，不重做 |
| 视觉保真高流量优先 | **remove 作北极星** | PRD/Razor：形式服务过程 |
| 全站页面 parity 清单 | **defer** 绝大部分 | 只保留逛底线 |
| P0 安全（消毒/鉴权） | **reorder 最前** | 安全 > 一切 |
| 推进核闭环 | **keep** | 生产本体 |
| Intake 问答 | **keep + 升为「卡」** | 公开过程接口 |
| 14 天验证 | **keep** | Prove first 入口权重 |
| Match / 巨石 Admin | **remove** | Razor Delete |

## Drift Diagnosis

- **Goal drift**: 旧 GOAL 成功≈迁站完成；新目标成功≈PRD A1–A9  
- **Phase drift**: 曾按「页面类型」铺开；现按风险→价值切片  
- **Validation drift**: 曾用目录/构建冒充完成；现绑定行为验收  
- **Compatibility drift**: 禁止 Match+Intake 双轨与假鉴权壳  
- **Cleanup drift**: 不进本 Goal 的像素/动效打磨

---

## Priority Rationale

1. **先安全**：未鉴权管理写与 XSS 是真实伤害，优先于一切皮肤。  
2. **再卡入口**：没有一级「卡」，双入口产品不成立。  
3. **再闭环**：证明过程可转（站主价值）。  
4. **再逛底线与文案**：证据库配得上，心智可说清。  
5. **启动 14 天盒**：验证「卡」权重，避免建错教堂。

---

## Assumptions and Open Decisions

| Item | Status | Impact | Owner / Next step |
|------|--------|--------|-------------------|
| 「卡」路由默认 `/tools` | **assumed** | 改路由只影响链与文案 | 你可改；默认开工用 `/tools` |
| Match 不双轨 | **assumed** | 禁止复活旧匹配为主路径 | 改 PRD 才能推翻 |
| 管理鉴权：最小共享密钥或 dev 会话 cookie | **assumed** | 实现形态 | Phase 1 选**最简单可测**：`ADMIN_API_TOKEN` Bearer 或已有 cookie 模式二选一，优先可测 |
| 消毒库：DOMPurify（浏览器）+ 服务端可选 | **assumed** | 详情渲染 | 客户端消毒为底线 |
| 14 天起始 = Phase 3 出口日 | **assumed** | A10–A11 | 写入 `docs/s1-go-live.md` 或新行 |
| PRD 已确认可执行 | **assumed** | 无则停 | 你反对某条再改 PRD |

---

## Phases

### Phase 0: 冻结与默认决策

- **Purpose**: 执行默认与 PRD 对齐，避免边做边争。  
- **Entry**: 本 Goal 交付。  
- **Phase rules**: 只改文档默认表；不写业务大功能。  
- **Todos**:
  - [x] 确认/默认：「卡」=`/tools`；Match 不双轨；鉴权方案最小可测  
    - **Surface**: 本文件 / PRD Open  
    - **Proof**: 表格状态为 assumed 或 confirmed  
    - **Depends on**: none  
  - [x] 若改路由：同步 PRD Open #1 一句  
    - **Surface**: `../../PRD-双入口小生产.md`（docs 根）  
    - **Proof**: 文案与 Goal 一致  
    - **Depends on**: 你的决定  
- **Exit proof**: 默认表可执行  
- **Stop**: 你要求暂停或改产品宪法  

### Phase 1: 安全闸门（P0）

- **Purpose**: 管理写不可匿名；详情不可 XSS；公开写仍诚实。  
- **Entry**: Phase 0 退出。  
- **Phase rules**:
  - 允许：api 鉴权中间件、web 消毒、测试  
  - 禁止：新页面、保真重构、新业务域  
  - 验证：测例 + curl 必须先于宣称完成  
- **Todos**:
  - [x] 管理写 API（clues patch/post、seeds、executions）无凭证 → 401/403  
    - **Surface**: `apps/api`  
    - **Proof**: 自动化或脚本 curl 无 token 失败、有 token 成功  
    - **Depends on**: 鉴权方案  
  - [x] web 详情 `marked` 输出经 DOMPurify（或等价）再进 DOM  
    - **Surface**: `apps/web` PostDetail  
    - **Proof**: 含 `<img onerror>` / `<script>` 的样例不执行；单测或手工  
    - **Depends on**: none  
  - [x] 回归：`STORAGE_UNAVAILABLE` 或无库写 → 503；公开 rate/quota 仍有效  
    - **Surface**: api  
    - **Proof**: 既有路径可复现  
    - **Depends on**: none  
- **Exit proof**: PRD A6、A7、A8 工程可证  
- **Stop**: 为省事用前端藏按钮冒充鉴权  

### Phase 2: 卡入口产品化（一级可见）

- **Purpose**: 双入口心智成立——卡与逛同级可发现。  
- **Entry**: Phase 1 退出。  
- **Phase rules**:
  - 允许：导航/首页 CTA、文案、规则条已有则加固  
  - 禁止：复活 Match；新后台模块  
- **Todos**:
  - [x] 侧栏与首页强化一级「卡」指向 `/tools`（或已定路由）  
    - **Surface**: `AppShell` / `HomePage`  
    - **Proof**: 冷启动点击路径 ≤2 步到输入框  
    - **Depends on**: Phase 0 路由默认  
  - [x] 首页或关于一句双入口说明（R10）  
    - **Surface**: web 文案  
    - **Proof**: 站主 10 秒复述通过  
    - **Depends on**: none  
  - [x] 卡页：规则 + 错误人话保持与 shared/api 一致  
    - **Surface**: ToolsPage / rules-ui  
    - **Proof**: 配额/限流文案可触发  
    - **Depends on**: Phase 1 不破坏 intake  
- **Exit proof**: PRD A1、A3、A4  
- **Stop**: 把「卡」藏进三级菜单  

### Phase 3: 过程闭环可演示

- **Purpose**: 站主路径一次可计数闭环，Admin 无死链。  
- **Entry**: Phase 2 退出。  
- **Phase rules**:
  - 允许：修过程 API/UI 缺口；管理端带鉴权调用  
  - 禁止：新业务域页面  
- **Todos**:
  - [x] admin 请求带鉴权凭证  
    - **Surface**: `apps/admin` api client  
    - **Proof**: 浏览器完整：入池→主选→交付→检验  
    - **Depends on**: Phase 1  
  - [x] 固定手测或集成测：A2 全路径  
    - **Surface**: api test 或 scripts  
    - **Proof**: 退出码 0 或 checklist 截图/日志  
    - **Depends on**: 过程 API  
  - [x] Admin 导航仅过程四面 + 未迁说明（A9）  
    - **Surface**: admin App  
    - **Proof**: 目视无巨石死链  
    - **Depends on**: none  
  - [x] 记录 14 天盒起始日  
    - **Surface**: `docs/s1-go-live.md` 或 PRD  
    - **Proof**: 日期写入  
    - **Depends on**: A2 可演示  
- **Exit proof**: A2、A9；A10 时钟启动  
- **Stop**: 为闭环关掉鉴权  

### Phase 4: 逛底线与收口

- **Purpose**: 证据库可读；Goal 可关。  
- **Entry**: Phase 3 退出。  
- **Phase rules**:
  - 允许：阅读底线修复、构建 content 字段若缺 title/body  
  - 禁止：TOC/Giscus/系列全量（属阅读增强 PRD）  
- **Todos**:
  - [x] 抽 3 篇详情 title+正文可读（A5）  
    - **Surface**: web + content.json  
    - **Proof**: 手测清单  
    - **Depends on**: 消毒仍开  
  - [x] 反馈与赞仍分列可用（R5）  
    - **Surface**: web + api  
    - **Proof**: 各提交一次成功  
    - **Depends on**: none  
  - [x] 对照 PRD A1–A9 勾选；缺口只修本 Goal 内  
    - **Surface**: docs  
    - **Proof**: 清单全绿或注明阻塞  
    - **Depends on**: 上列  
- **Exit proof**: Final Validation 表通过  
- **Stop**: 借机做 Ferry/宇宙/像素大改  

---

## Dry-Run Findings

1. **鉴权方案未写死实现**——已 assumed 最小可测，Phase 1 第一刀必须选定，否则停。  
2. **A10/A11 依赖站主行为**——系统只启动时钟与入口，不在本 Goal 包办 14 天结束复盘。  
3. **现 web 已有 tools intake**——Phase 2 主要是 IA 权重与文案，非从零写问答。  
4. **无环依赖**：0→1→2→3→4。  
5. **假完成点**：只改导航文案但管理写仍裸奔；或消毒只做一半。

---

## Final Validation

| # | 检查 | 通过 |
|---|------|------|
| 1 | 安全 | A6 鉴权 + A7 消毒 + A8 503 |
| 2 | 卡 | A1 发现性 + A3 关 AI + A4 配额 |
| 3 | 过程 | A2 可计数闭环 + A9 Admin |
| 4 | 逛 | A5 三篇可读 + 赞/反馈分列 |
| 5 | 文档 | 14 天起始已写；PRD 范围未回流巨石 |
| 6 | 反模式 | 无 Match 双轨；无「像旧站」单独通过 |

---

## First Execution Step

1. 你回复「按本 Goal 开工」或改默认（卡路由 / 鉴权偏好）。  
2. 执行方立即进入 **Phase 1**：为管理写 API 加最小鉴权 + 详情 DOMPurify，并留下可复现证明。

**未听到开工令前：只维护本文档，不写业务代码。**
