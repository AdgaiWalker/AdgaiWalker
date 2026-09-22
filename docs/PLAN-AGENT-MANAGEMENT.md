# 技术方案：Agent 管理系统重设计（Skill 为资产的三层架构）

> 本文是 `/agents` 管理系统的**技术方案与实施计划**，修订 [`PRD-AGENT-WORKBENCH.md`](./PRD-AGENT-WORKBENCH.md) v2.0 的信息架构。
> 继承其产品定位（站主一人使用、Apple Design 交互语言），修正其结构性问题（概念混装、技能分裂、调试错位、无质量门禁）。
> 排期遵守根 [`PLAN.md`](../PLAN.md)；本文不引入第二套主线。

---

## 0. 文档信息

| 字段 | 内容 |
|---|---|
| 名称 | Agent 管理系统重设计 |
| 类型 | 技术方案（IA 重构 + 数据模型修订 + 前端拆分） |
| 日期 | 2026-09-15 |
| 影响面 | `apps/admin`（agents/models 页面）、`apps/api`（agents/skills 模块小幅增补）、`packages/shared`（类型）、`skills/`（文件资产） |
| 前置状态 | Skill Pack P0 已落地（`LLM_CLIENT` 真实执行 + `llm.port` 错误分类）；P1 部分落地（`skills/xiaoying/` 文件资产 + `skill.service` 的 list/selfcheck/export/run） |
| 权威级别 | 实施权威；与 PRD v2.0 冲突处以本文为准（修订处逐条列于 §9） |

---

## 1. 现状诊断（全部经代码核实）

### 1.1 结构性问题

| # | 问题 | 证据 |
|---|---|---|
| 1 | **三个概念挤一页** | `apps/admin/src/pages/AgentWorkbenchPage.tsx`（1419 行）内含 `debug / models / skills` 三个 tab；模型引擎管理（provider/key/ping，`ModelCatalogSection` L306）作为智能体工作台的附属 tab 存在，但引擎是全局资源 |
| 2 | **技能概念分裂** | 提示词存两份：DB `AgentUnitRow.prompt`（`apps/api/src/agents/agent-unit.service.ts`）与文件 `skills/xiaoying/SKILL.md`（`apps/api/src/skills/skill.service.ts` 扫描加载），两套系统互不引用——改一处另一处不知道 |
| 3 | **调试错位** | UI 主入口是 `TraceRunnerSection`（文件直调长任务），而日常验证技能的主力动作「试一句话」（`POST /agents/:id/try`）与「同题对比」（`POST /agents/:id/compare`）API 已存在但 UI 靠边 |
| 4 | **创建无质量门禁** | `NewAgentModal`（L821）填名即建；自检 API（`POST /skills/:id/selfcheck`）存在但不进创建流程，「建了不知道对不对」无流程性解法 |

### 1.2 已有资产（重设计是重组，不是重写）

**API 端点（全部已存在，直接复用）：**

| 端点 | 用途 | 现状 |
|---|---|---|
| `GET/POST/DELETE /agents` | Agent 实例 CRUD | 在用 |
| `POST /agents/:id/try` | 试一句话（runChat，真实 LLM） | 在用，UI 靠边 |
| `POST /agents/:id/compare` | 同题多引擎对比 | 在用，UI 靠边 |
| `POST /agents/:id/run-file` | 文件直调长任务（120s 熔断） | 在用，UI 主角 |
| `GET /agents/:id/runs` · `GET /runs/:runId/trace` | 运行索引 + 轨迹 | 在用 |
| `GET /skills` · `POST /skills/:id/selfcheck` · `GET /skills/:id/export` · `POST /skills/:id/run` | 技能列表/自检/导出/运行 | 已实现，UI 未充分暴露 |

**基建（直接复用）：**
- `apps/api/src/ports/llm.port.ts`：7 类错误码（`llm-no-provider` / `llm-no-credential` / `llm-auth-failed` / `llm-request-rejected` / `llm-upstream-failed` / `llm-timeout` / `llm-bad-response`）→ `AgentRunnerService` 已映射为 HTTP。
- `skills/<id>/` 目录约定：`SKILL.md`（提示词 SSOT）+ `skill.json`（能力需求/契约/版本）+ `cases.json`（考题）+ `binding.example.json`。
- 埋点：`FeatureEventPort`（运行数据统计复用）。

---

## 2. 概念模型（本方案的地基）

```
┌─────────────┐     引用      ┌─────────────┐     落到      ┌─────────────┐
│  Skill 技能  │ ───────────→ │  Agent 实例  │ ───────────→ │  Engine 引擎 │
│  (文件资产)   │   1 : N      │  (DB 绑定)   │   运行时解析   │  (全局配置)   │
├─────────────┤              ├─────────────┤              ├─────────────┤
│ SKILL.md    │              │ 入口/频道     │              │ provider    │
│ 提示词(SSOT) │              │ 温度/参数覆盖 │              │ model       │
│ IO 契约      │              │ 运行数据归属  │              │ apiKey      │
│ cases 考题   │              │             │              │ 超时预算     │
└─────────────┘              └─────────────┘              └─────────────┘
   可迁移、可 git               「小影」就是一个实例             全局唯一、独立管理
```

**三条铁律：**

1. **提示词的唯一真相源在文件**（`skills/<id>/SKILL.md`）。DB 不再存提示词正本；`AgentUnit.prompt` 降级为快照缓存（用于 trace 审计回看），运行时以文件为准。
2. **Skill : Agent = 1 : N**。「这儿需要一个 A 技能，那儿也需要一个 A 技能」= 多个 Agent 实例引用同一 Skill，各自绑定引擎与入口。
3. **迁移的是 Skill 文件目录**；Agent 绑定（binding）本来就该每项目重写——与 Skill Pack 方案「Skill/Binding 分离」严格一致。

**已定决策**：采用「引用制」（Agent 引用 Skill），不采用「合并制」。理由：保留「同一技能多处部署不同引擎」的能力；迁移单元仍是文件目录。

---

## 3. 目标信息架构

```
/agents（技能库）                          /models（独立页）
┌─────────────────────────────────────┐   ┌──────────────────────┐
│ [＋新建技能]  搜索…  筛选[状态|引擎]    │   │ provider 列表         │
├──────────────┬──────────────────────┤   │  · key 管理（加密存储） │
│ 左栏·技能列表  │ 右栏·详情（四视图 tab） │   │  · 连通性 ping        │
│              │                      │   │  · 模型目录与标签      │
│ ┌──────────┐ │ ① 对话调试（一等公民）  │   │  · 调用统计           │
│ │ xiaoying │ │ ② 考题评测            │   └──────────────────────┘
│ │ ✓92分    │ │ ③ 运行记录            │
│ │ deepseek │ │ ④ 对接导出            │
│ ├──────────┤ │                      │
│ │ 写作助手  │ │ 顶部常驻：skill.json   │
│ │ ⚠草稿    │ │ 元信息 + SKILL.md 编辑 │
│ └──────────┘ │                      │
└──────────────┴──────────────────────┘
```

### 3.1 左栏：技能列表

- 卡片项：名称、描述、状态徽章（✓已验证 / ⚠草稿）、最近自检分数、绑定引擎 chips、最近运行时间。
- 数据源：`GET /skills`（文件扫描）∪ `GET /agents`（实例绑定）；合并为「技能卡片 + 其实例数」。
- 搜索过滤为纯前端（技能数量级 <100，不建索引）。

### 3.2 右栏四视图

**① 对话调试（默认视图）**
- 聊天面板驱动 `POST /agents/:id/try`；多轮会话本地保存于前端 state（不做服务端会话存储，非目标）。
- 顶部「引擎 chips」：点击即以**同题重发**切换引擎（利用 compare 语义，单引擎即时切）。
- 「对比模式」开关：开启后输入一次 → `POST /agents/:id/compare`，2~4 引擎并排展示答案 + 耗时 + token。
- 文件直调收进「长任务」次级入口（低频重操作，复用现 `TraceRunnerSection` 组件整体搬移）。

**② 考题评测**
- 左列：cases 列表增删改（写回 `skills/<id>/cases.json`，经 skill.service）。
- 右列：「运行自检」→ 每条考题一行：期望要点命中/未命中、耗时、token；顶部大号分数 + 通过/未通过徽章。
- 自检结果落库（§4 增补），支撑列表页分数徽章与历史趋势。

**③ 运行记录**
- `GET /agents/:id/runs` 列表 + `GET /runs/:runId/trace` 时间线甘特图（现 debug tab 的逐轮审计组件整体搬移）。
- 按技能聚合其所有实例的 runs。

**④ 对接导出**
- 三张卡（数据全部来自已有 `GET /skills/:id/export`）：
  1. **复制对接提示词**（主按钮）：自包含 prompt（接口地址/契约/3 条测试用例/binding 填写指引），贴给任何 AI 即完成对接；
  2. **下载技能包**：`skills/<id>/` 目录（zip）；
  3. **复制接口 JSON**：契约 + 示例请求响应。

### 3.3 创建流程（强制质量门禁）

```
新建 → 选起点（空白 / 复制现有技能 / 从 SKILL.md 导入）
     → 填提示词 + 绑引擎
     → 【强制】生成或手填 ≥3 条考题 → 跑自检
     → 绿：状态=verified，入库上架
     → 红：状态=draft，回编辑（可保存草稿，不出现在默认列表筛选）
```

- 「从 SKILL.md 导入」= 迁移闭环入口：粘贴/拖入外部技能包 → 契约校验（沿用 `code-artifact.ts` 的 `{ok, reason}` 解析守卫范式）→ 自检 → 入库。

---

## 4. 数据模型与迁移

### 4.1 Skill（文件，SSOT）

`skills/<id>/skill.json` 契约字段（与已认可方案一致）：

| 字段 | 说明 |
|---|---|
| `schemaVersion` / `version` | 格式版本 / 技能版本 |
| `name` / `description` | 展示元信息 |
| `prompt.ref: "SKILL.md"` | 提示词引用，不复制进 JSON |
| `model.requirement` | **能力需求**（chat / 上下文 / 结构化输出），不写死模型名 |
| `model.params` | temperature / maxTokens / 流式 |
| `io.input` / `io.output` | IO 契约 |
| `status` | `draft \| verified`（自检通过才可置 verified） |
| `lastSelfcheck` | `{ at, score, passed }`（自检结果回写） |

校验：`packages/shared/src/skill-pack.ts` 新增 `parseSkillPack` 解析守卫（沿用 `code-artifact.ts` 范式：不抛错、返回 `{ok, value} | {ok:false, reason}`、版本位必查）。

### 4.2 AgentUnit（DB，绑定层）

| 字段 | 现状 | 目标 |
|---|---|---|
| `id` / `name` / `icon` | 有 | 保留 |
| `prompt` | **正本** | **快照缓存**（运行时读 SKILL.md；审计回看用） |
| `providerId` / `modelId` / `temperature` | 有 | 保留（实例级引擎覆盖） |
| `skillId` | 无 | **新增**（引用 `skills/<id>`；xiaoying 迁移时回填 `xiaoying`） |

### 4.3 迁移步骤（一次性，向后兼容）

1. shared 新增 `parseSkillPack`；`skill.service` 加载时经它校验，坏文件报 `skill-malformed` 而非静默跳过。
2. `AgentUnitRow` 增 `skillId`（sqlite 轻量迁移）；存量 `xiaoying` 行回填。
3. `AgentRunnerService` 的 `agent.prompt` 读取点改为：`skillId ? readSkillPrompt(skillId) : agent.prompt`（文件优先，DB 快照兜底）；成功运行后回写快照。
4. admin 不再提供 DB prompt 编辑入口——编辑一律落到 SKILL.md（skill.service 提供 `PUT /skills/:id/prompt`）。

---

## 5. API 增补清单（增量，不推翻）

| 端点 | 方法 | 说明 | 复用 |
|---|---|---|---|
| `/skills/:id/prompt` | PUT | 编辑 SKILL.md 正文（写回文件） | 新增 |
| `/skills/:id/cases` | GET/PUT | cases.json 读写 | 新增（selfcheck 内部已读） |
| `/skills/:id/selfcheck` | POST | 已有；**增补**：结果回写 skill.json `lastSelfcheck` 与 status | 修改 |
| `/skills/import` | POST | 导入技能包（校验→落盘→返回 skillId） | 新增 |
| `/skills/:id/export` | GET | 已有；增补 `?format=integration-prompt\|bundle\|json` 三形态 | 修改 |
| `/agents` 创建 | POST | 增补：`skillId` 必填（或走「从技能建实例」） | 修改 |

错误分类沿用 `llm.port` / `code-health.port` 范式：`skill-malformed`（文件坏）、`skill-not-found`、`selfcheck-failed`（非错误，是状态）。

---

## 6. 前端拆分

`AgentWorkbenchPage.tsx`（1419 行）拆分为：

```
apps/admin/src/pages/
├── SkillLibraryPage.tsx        # /agents 主页：左栏列表 + 右栏四视图壳
├── skill-views/
│   ├── ChatDebugView.tsx       # ① 聊天 + 引擎 chips + 对比模式
│   ├── CasesView.tsx           # ② 考题编辑 + 自检
│   ├── RunsView.tsx            # ③ runs 列表 + trace 甘特图（搬自现 TraceRunnerSection）
│   └── ExportView.tsx          # ④ 三卡导出
├── skill-views/shared/
│   ├── SkillHeaderCard.tsx     # skill.json 元信息 + SKILL.md 编辑器（常驻顶部）
│   └── NewSkillWizard.tsx      # 创建向导（含强制自检）
└── ModelSettingsPage.tsx       # /models：ModelCatalogSection 整体搬出
```

- 交互语言沿用 PRD v2.0：胶囊画廊、触觉反馈、灵动岛 HUD toast——组件级复用（`AgentCapsuleBar` 等随拆分迁移）。
- 路由：`ADMIN_ROUTES` 增 `models: '/models'`；侧边栏「站」分类下「智能体」保持 `/agents`，新增「模型设置」入口。

---

## 7. 实施阶段（每步独立可验收）

| 阶段 | 内容 | 验收 |
|---|---|---|
| **R1 拆分**（纯搬移，零行为变化） | `/models` 独立页；`/agents` 改「列表 + 详情」布局；组件文件拆分 | 两页功能与现等价；typecheck/lint/tests 绿 |
| **R2 对话一等公民** | ChatDebugView + 引擎 chips + 对比模式；文件直调收进长任务入口 | 新建测试技能，对话/对比/切换引擎全程真实模型输出 |
| **R3 评测闭环** | parseSkillPack + skill.json status/lastSelfcheck + CasesView + 创建向导强制自检 + prompt 归一迁移 | 手写一个坏 skill.json → 明确报 `skill-malformed`；自检红的技能无法置 verified；xiaoying 迁移后行为不变 |
| **R4 导出闭环** | ExportView 三卡 + `/skills/import` + 从 SKILL.md 导入 | 导出 xiaoying 包 → 拷到 `skills/` 新 id → 导入 → 自检全绿（可迁移验收标准） |

依赖关系：R2/R3 依赖 R1 的布局壳；R4 依赖 R3 的 parseSkillPack。P3（技能运行数据统计）并入 R3 的 runs 视图顺带交付；harness 更新（原 P4）不进本方案关键路径。

---

## 8. 风险与不做清单

**风险：**

| 风险 | 缓解 |
|---|---|
| prompt 归一迁移期 DB 与文件不一致 | 迁移一次性完成（§4.3），运行时文件优先 + 快照兜底；trace 仍记录 promptSnapshot 保审计 |
| skill.json 手改坏文件 | parseSkillPack 守卫 + 加载期报错说清文件与原因（沿用契约层纪律） |
| 1419 行拆分引入回归 | R1 纯搬移不改逻辑；`AgentWorkbenchPage.test.ts` 同步拆分，先跑绿再动 |

**不做（Non-goals）：**

- 不做服务端多轮会话存储（对话历史仅前端 state）。
- 不做技能市场/多人协作（单人站主）。
- 不把 harness 纳入技能执行引擎（直连为主，harness 留作可选重任务引擎）。
- 不动 `/assistant`（小影链路）——其 bad-output 降级修复是独立事项。
- 不建技能搜索索引（数量级不需要）。

---

## 9. 对 PRD v2.0 的修订声明

| PRD v2.0 原设计 | 本方案修订 | 理由 |
|---|---|---|
| 「智能体工坊」单页三 tab（debug/models/skills） | 拆为 `/agents` 技能库 + `/models` 独立页 | 引擎是全局资源，不该是 agent 的附属 tab |
| Agent 即「角色」（prompt 存 DB） | Skill 为提示词 SSOT（文件），Agent 为引用实例 | 可迁移目标要求资产可拷贝、可 git、可 review |
| 文件直调为主视图 | 对话调试为一等公民，文件直调收进长任务入口 | 日常验证技能的主力动作是对话与对比 |
| 填表即建角色 | 创建强制考题自检，verified/draft 状态门禁 | 「建了不知道对不对」需要流程性门禁 |
| Apple Design 交互语言 | **继承不变** | 产品定位与既有投入保留 |
