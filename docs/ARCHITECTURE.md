# 架构（权威）：当前态 · 最终态 · 演进对照

> **2026-09-22 本地现状更新**：F01–F18 已实现并验收，未部署。新后台 React/Refine 四面通过管理鉴权读取现有内容与 SQLite；R01–R12 新增版本迁移、不可变修订、事项授权、审计/Outbox、执行准入、Harness 环境白名单和只读工具 patch、SDK RuntimePort，以及单槽持久队列、额度预留、确认终止后才释放容量、重启核对、后台执行 API、试跑界面、发布前三类测试，以及旧直调改接统一执行、工作站超时后关闭 SDK 实例和凭据修订失效旧 runtime。公共部署和内容写入仍待后续批次。下文旧生产图面与新目标拓扑分别保留其历史/设计语义。

### 新框架本地已接通链路

```mermaid
flowchart LR
    ADMIN["admin · 概览/内容/Agent/运营记录/设置"] --> AUTH["内存凭据 + Refine authProvider"]
    AUTH --> HTTP["统一 HTTP + dataProvider"]
    HTTP --> GATE["Nest AdminTokenMiddleware"]
    GATE --> LEDGER["既有内容台账/正文只读用例"]
    GATE --> OPS["OperationsController / Service"]
    LEDGER --> FILES["内容文件 / Git"]
    OPS --> PORTS["AgentUnitRepository / OperationsReadPort"]
    PORTS --> DB["SQLite · AgentUnit / AgentRun"]
```

`GET /ops/capabilities` 检查实际读用例；`GET /ops/agents` 不调用自动创建默认角色的旧列表用例；`GET /ops/runs` 和详情仅读同一历史表。新写能力均为未接入。进度只在根 `to-do.md` 维护，[验收证据](ADMIN-FRAMEWORK-ACCEPTANCE.md)。

<a id="agent-operations-target"></a>

## 新后台目标拓扑（2026-09-22，提案）

来源：[PRD v0.2](PRD-AGENT-OPERATIONS.md)、[开源调研](RESEARCH-AGENT-OPS-OPEN-SOURCE.md)、[技术方案 v0.1](TECH-DESIGN-AGENT-OPERATIONS.md)。以下是目标设计，**部分本地实现，尚未部署**；下文历史图中后台页面与“唯一运行时已完成”标记不能用于判断此次重构状态。当前后台已接入框架、Agent 修订编辑与历史；现存后台部分调用仍走 LLM_CLIENT。

```mermaid
flowchart TB
    WEB["现有访客 Web · assistant-ui 适配\n公开位置 / 显式选择 Agent / 只读问答"]
    ADMIN["新 apps/admin · React/Vite + Refine\n概览 / 内容 / Agent / 运营记录"]
    GATE["现有 Caddy + Nest\n公共白名单 / 管理鉴权 / 归属校验"]
    CAT["Agent 修订与部署解析"]
    EXEC["ExecutionService\n授权与配额 / 持久队列 / 生命周期"]
    RUNTIME["RuntimePort → DeepSeek Harness SDK\n固定版本与工具面 / 有界进程 / 确认终止"]
    MUT["ContentMutationService\n候选 / 审批 / CAS / 恢复"]
    REL["ContentReleaseService\n实际发布清单 / Git / 线上版本核验"]
    OPS["Conversation + Operations\n消息 / 交互 / 提醒 / 统计 / 删除"]
    DB[("现有 SQLite 扩展\n修订 / 授权 / run / 会话 / Action / 审计")]
    LOG[("content/log · 内容正本")]
    SNAP[("已核验公开快照\n只读派生产物 + 生效指针")]
    DEPLOY["既有构建发布 → Vercel\n网页内容 hash / 公开 manifest"]
    TRACE[("受控数据目录\n候选 / trace / SDK 会话 / 删除资源登记")]
    WEB & ADMIN --> GATE
    GATE --> CAT & OPS
    CAT --> EXEC --> RUNTIME
    ADMIN -->|"经管理鉴权"| MUT
    MUT --> REL
    MUT --> LOG
    REL --> DEPLOY
    LOG -->|"构建投影"| DEPLOY
    DEPLOY -->|"线上核验后切换"| SNAP
    SNAP -->|"只读上下文"| EXEC
    RUNTIME -->|"候选结果，不直接写正本"| MUT
    EXEC & CAT & MUT & REL & OPS --> DB
    EXEC & OPS --> TRACE
```

边界：所有业务请求经过网关；图中 admin→内容变更箭头表示鉴权后的应用调用。前台 origin 上限不可升级；模型不直接操作正本或 Git。DB 保存业务事实、trace 保存诊断，不互相冒充。公开问答只读取已核验快照，工作区生成物不能提前对外生效。保留单 Nest/SQLite，默认一个模型槽；双槽验证后才开，不部署 Paperclip 或 Langfuse 后端。详细状态机、数据增量、API 与迁移规则仅在配套技术方案维护。

> **2026-09-21 后台重构状态（优先于下文旧界面说明）**：站主要求清空管理界面。`apps/admin` 仅保留空白开发/构建入口与 API 代理；计划、内容、复盘、设置、旧路由及管理 UI 均已退役。API、数据库、文章与共享规则保留，生产未部署此变更。旧后台页面图与验收记录仅作历史参考，不作为新重构需求。资产清单见 [后台重构前资产清单](ADMIN-REBUILD-INVENTORY.md)。


> 本文件是全项目架构的唯一权威图面；边界规则原文在 [`PLAN.md`](../PLAN.md) §2（五条宪法同在彼处）。
> 更新纪律：拓扑/组件/数据流变更须回写本文件；图中状态标注随部署实况更新。
> 基准：2026-09-14 · 本地工作区 as-built（生产基线：2026-09-03 切流 + 2026-09-09 智能体工坊上线）。

## 一、当前架构（as-built 2026-09-14）

### 1.1 运行拓扑（部署视角）

```mermaid
flowchart TB
    subgraph visitor["访客"]
        VB["浏览器"]
    end

    subgraph vercel["www.iwalk.pro · Vercel 静态（push main 自动发）"]
        WEB["预渲染文章 + 独立 SPA 壳<br/>逛 /posts · 卡 /tools（对话式）+ /tools/result<br/>小影 /ask · 资源 /tools/resources · 结构 /graph · 代码结构 /architecture<br/>pagefind / rss / llms.txt"]
    end

    subgraph box["盒子 · 腾讯云 Windows 2C2G（新加坡）"]
        CPUB["Caddy · api.iwalk.pro<br/>公网白名单 8 条<br/>（与 app.module.ts exclude 逐条对齐）"]
        CADM["Caddy · 127.0.0.1:8790<br/>basic_auth + handle_path /api/*（剥前缀）"]
        NEST["Nest :8788（仅绑 127.0.0.1）<br/>RequestId + AdminToken 中间件"]
        subgraph usc["用例层（26 controller / 无 setGlobalPrefix）"]
            INTAKE["intake 卡口"]
            ASSIST["assistant 小影（含 SSE /stream）"]
            INSIGHT["insights 信号中心 + 周报转题苗"]
            PIPE["works 作品链 + 发布状态机"]
            LEDGER["content-ledger 台账读模型"]
            RELEASE["content-release 一键上线"]
            PLAN["plan 日历聚合"]
            TRACE["traces 增量读 jsonl"]
            WORKSHOP["agents · model-providers 智能体工坊"]
        end
        DSH["dsh · 唯一 AI 运行时 ✔<br/>助手常驻 · 卡口短调用 · 配方 per-run"]
        GOV["dsh 会话治理 ✔<br/>遥测默认关 · 90 天 prune"]
        DB[("SQLite<br/>线索 / 题苗 / 执行 / 作品 / 配额 / FeatureEvent")]
        DSKDATA[("data 目录<br/>runs · logs/api.log · admin-basic-auth")]
    end

    subgraph owner["站主"]
        ADMIN["apps/admin（SSH 隧道 :8790）<br/>计划 · 内容 · 复盘 · 设置"]
    end

    subgraph gitc["内容真相源 · Git"]
        LOG[("content/log")]
        GEN["content:gen"]
        CJ[("content.json")]
    end

    subgraph agentx["apps/agent · Cordis 组合 + MCP stdio ✔"]
        K["knowledge（aiUsePolicy fail-closed<br/>含图谱 neighbors 导航）"]
        M["mcp · stdio 五工具"]
    end

    EXT["外部 agent（MCP 客户端）"]

    VB --> WEB
    WEB -->|"/api/* rewrite"| CPUB --> NEST
    ADMIN --> CADM --> NEST
    NEST --> INTAKE & ASSIST & INSIGHT & PIPE & WORKSHOP
    INTAKE & ASSIST & INSIGHT & PIPE & WORKSHOP --> DSH
    INTAKE & ASSIST & INSIGHT & PIPE & LEDGER & RELEASE & PLAN & TRACE & WORKSHOP --> DB
    NEST --> DSKDATA
    DSH --> GOV
    LOG --> GEN --> CJ --> WEB
    CJ --> K --> M
    EXT -->|"调用（个人 stdio）"| M
    M -->|"带 slug 出处返回"| EXT
```

**接入约定（勿踩）**：`api/` 前缀由接入侧补——生产 Caddy `handle_path /api/*` 与开发期 vite `rewrite` 都会剥掉 `/api` 再转发，因此 **controller 一律不自带 `api/` 前缀**（health 走 `/health`，其余走 `/clues`、`/agents`…）。公网白名单是双侧同步：`apps/api/src/app.module.ts` 的 exclude 表 + `ops/windows/Caddyfile`，漏一侧即 401/404。

### 1.2 代码分层（依赖方向）

```mermaid
flowchart LR
    C["HTTP 薄层<br/>controller：协议进出，不写领域规则"] --> S["用例层<br/>service：编排 + 领域规则"]
    S --> P["端口层<br/>ports：Symbol token 接口"]
    P -. "kernel.module 装配" .-> A["适配层<br/>adapters：Prisma / fs / http / dsh"]
    A --> OUT["SQLite · content 文件 · dsh 运行时 · 远端 HTTP"]
```

- **依赖方向**：controller → service → port ← adapter；新增能力先定 port 再写 adapter，接线只在 `kernel.module.ts`。
- **Nest DI**：接口 token 必须显式 `@Inject(TOKEN)`（`tsx` 下无 `emitDecoratorMetadata`，裸类型参数会注入成 `undefined`）。
- **AI 双实现**：AI 策略（`AiNextStepAdapter` / `HarnessAssistantAdapter`）与规则兜底（`RuleNextStepAdapter` / `RuleAssistantAdapter`）同在适配层；**站主面（`DshAgentRunner` 配方）无兜底，失败如实抛错**。
- **内容真相源唯一**：`content/log` →（`scripts/generate-content.ts`）→ `apps/web/src/generated/content.json`，被 web 打包、api 内容索引、agent 知识库、预渲染与 feeds 共同消费。
- **管理端（2026-09-17）**：工作面计划 / 内容 / 复盘；底部设置（Agent / 观测 / 结构）。系统折叠抽屉已废除。题苗、执行仅深链。流水线、工作台重定向到计划。
- **轨迹层**：`data/runs/<runId>/trace.jsonl` 是运行事实唯一真相源；DB 的 AgentRun / SkillRun / AssistantRun 只做索引。读取走 `after=<seq>` 增量，禁止全量解析进前端。发布与 Agent 共用同一个时间线渲染器。

## 二、最终架构（定稿 · 2026-09-06 论文修订版）

```mermaid
flowchart TB
    subgraph faces["三个面"]
        direction LR
        F_WEB["👤 访客 · Web（骨架不变）"]
        F_ADMIN["🛠 站主 · admin 流水线 + 数据页（数据页=观测 P2，待数据攒够）"]
        F_MCP["🤖 外部 AI · MCP（stdio ✔ / HTTP 公网 v2 按触发）"]
    end

    PERM["权限宪法 · aiUsePolicy<br/>readable / citable / actionable<br/>决定一切 AI 面能碰什么（无例外出口）"]

    subgraph static["静态服务面 · Nest 单实例 —— 状态的持久正确"]
        GATE2["网关 + 观测采集<br/>（token/延迟/降级原因落库 = 观测 P1，初稿后）"]
        PIPE["流水线用例 ✔<br/>手工时间可组合性：预留-补偿 · 条件终态 · PREPARED 链"]
        DSH2["dsh · 唯一 AI 运行时 ✔<br/>小影 · 卡口 nextStep · 工作站配方 · 周报"]
        OBS[("观测真相源 ✔（api.log 先行）<br/>FeatureEvent / AssistantRun / Budget")]
        GOV2["dsh 会话治理 ✔"]
        DB2[("SQLite · content/log · 原稿+hash")]
    end

    subgraph dynamic["动态组合面 · Cordis（apps/agent）—— 能力的动态正确"]
        CORE["Cordis 核心 ✔<br/>可逆效应 + 响应式协效应"]
        KP["knowledge ✔"]
        PP["persona ✔"]
        MP["mcp 工具 ✔"]
        TP["telemetry（stub → P1 接 FeatureEvent）"]
        FUT["未来组件<br/>ask 工具 · 检索后端 · 具身接口<br/>（热装卸 · 不腐化状态）"]
    end

    EXT2["他人的 agent"]
    subgraph git2["Git 真相源（不变）"]
        CJ2[("content.json")]
    end
    FAR["具身智能 · 远期"]
    DRAFT["★ 站主初稿（唯一待办：循环第一次转动）"]

    F_WEB & F_ADMIN --> GATE2
    GATE2 --> PIPE --> DB2
    PIPE --> DSH2 --> GOV2
    GATE2 --> OBS
    DSH2 -. "step/end usage" .-> OBS
    CJ2 -->|"协效应：发布→知识反应式刷新（v2 兑现）"| KP
    KP & PP --> MP
    EXT2 -->|"调用"| MP
    MP -->|"带出处返回"| EXT2
    TP -->|"效应：事件写入"| OBS
    FUT -.->|"热装卸"| CORE
    CJ2 -->|"知识 / citable 引用"| PIPE
    DRAFT -->|"走完全链并发布"| PIPE
    MP -. "v2/v3 · 同一扇门" .-> FAR
    PERM -. "授权边界" .-> PIPE & DSH2
    PERM -. "授权边界" .-> KP & MP
```

## 三、循环飞轮（最终架构的心脏）

```mermaid
flowchart LR
    A["访客提问 / 卡点<br/>搜索 miss / 反馈"] --> B["四源信号 ✔"]
    B --> C["洞察周报 ✔"]
    C -->|"一键转题苗 ✔（仅 write·幂等）"| D["题苗 · 人工主选五问 ✔"]
    D --> E["工作站八阶段加工 ✔（dsh）"]
    E --> F["人工审阅 · 按候选 hash 批准 ✔"]
    F --> G["发布 ✔<br/>PREPARED → 线上验证 PUBLISHED"]
    G --> H["content/log → content.json ✔"]
    H --> I["小影 · 卡口 · 判断代理<br/>知识与引用自动更新 ✔"]
    I -->|"更准的回答与推荐"| A
    J["外部 agent 经 MCP 查询 ✔"] -. "新信号源（P1 接线后计入）" .-> B
```

**循环状态：全链每一环都已建成并通过测试/生产验证——只差第一次真实转动（★站主初稿）。**

## 四、边界规则与不变式（原文见 PLAN §1/§2）

- **两面**：静态服务面（Nest·状态的持久正确：预留-补偿/条件终态/PREPARED 链）｜动态组合面（Cordis·能力的动态正确：可逆效应+反应式协效应）。
- **三层中心规则**：进程内去中心（组件平等）；机器间中心（一盒一份真相源）；访问层去中心（Web/llms.txt/MCP 开放协议）。
- **骨架不换**：现有服务迁移 Cordis 已否决；Cordis 只以 `apps/agent` 新建组合进入。
- **权限宪法不可绕过**：`aiUsePolicy`（readable / citable / actionable）是所有 AI 面（小影、卡口、判断代理、远期具身）的唯一授权来源；判断的定价权在人（主选/审批/发布永远是站主点击），AI 只起草和建议。

## 五、演进对照（当前 → 最终）

| 组件 | 状态 |
|---|---|
| AI 运行时统一（dsh 四用例） | ✔ 生产（小影/卡口 AI 实测真答；配方可用） |
| 卡口/工作站 codex 退役 | ✔ |
| 观测 P0（遥测关闭/会话治理/api.log） | ✔ 生产 |
| 共创显性化 + 周报转题苗 | ✔ 生产（本批） |
| admin 流水线默认首页 | ✔ 生产（本批） |
| 智能体工坊（agents + model-providers + 文件直调） | ✔ 生产（2026-09-09 上线；2026-09-13 修正 controller 路由前缀与 Nest DI 显式注入） |
| 卡口形态：向导 → 对话式 | ✔ 本地（`/tools` 一问一答 + `/tools/result` 深链，noindex） |
| 判断代理 v1（Cordis+MCP stdio） | ✔ 脚手架（A0–A3；A4 stub；A5 dogfooding 待站主） |
| **知识图谱**（访客 `/graph` + 文章页局部图 + 站主结构体检 + MCP `neighbors`） | ✔ 建成（2026-09-14；待盒子部署 + 线上验证） |
| **代码架构图谱**（门禁 `verify:architecture` + 访客 `/architecture` + admin 体检 + MCP 四工具） | ✔ 建成（2026-09-15；同一引擎的第二个领域，见 §六） |
| 观测 P1（token/延迟/降级原因落库） | 待初稿后 |
| 数据页三标签（观测 P2） | 待数据攒够 |
| 判断代理 v2（HTTP 公网/ask/反向挂载） | 按触发 |
| ★ 站主初稿全链 | **唯一待办（人）** |
| 具身 | 远期（同一 MCP 接口消费） |

## 六、代码图（增补：结构事实，**不是**架构权威）

> 本节是**增补**，不改本文件作为「唯一架构图面」的地位。
> 上面的图与表说的仍是**意图与拓扑**（为什么这样分层）；本节说的是**结构事实**
> （用编译器语法树抽出来的真实 import）。二者冲突时：**架构以本文件为准，事实以抽取结果为准**，
> 冲突本身就是值得知道的信息（说明声明与代码已经漂移）。

| 项 | 内容 |
|---|---|
| 抽取实现（唯一） | `scripts/lib/code-extract.ts`（解析规则在 `packages/shared/src/code-resolve.ts`，语法抽取在 `code-imports.ts`） |
| 产物（公开面） | `apps/web/src/generated/codegraph.json` —— 只有节点与边，被 `/architecture` 动态引入 |
| 产物（内部面） | `apps/web/src/generated/codegraph-health.json` —— 体检明细，只有门禁 / api / admin / agent 读 |
| 门禁 | `pnpm verify:architecture`（`build:web` 链上，紧随 `code:gen`）；硬伤新增即失败，基线在 `scripts/architecture-baseline.json` |
| 消费方 | 访客 `/architecture`（indexable）· admin `/architecture`（noindex）· MCP `dependencies`/`dependents`/`impact`/`architecture_health` |
| 规格与偏离 | [`PRD-CODE-GRAPH.md`](./PRD-CODE-GRAPH.md) |

**规模实测（2026-09-15）**：430 个源文件 / 1101 条内部依赖边 / 0 个环 / 1 个解析不到的引用 /
2 个从入口不可达的文件 / 0 个反向依赖；风格项：6 个超大文件、10 个超级枢纽（最大是 `apps/api/src/kernel.module.ts`，107 度）。

### Agent 基础本地接线（2026-09-22）

Admin → `/ops/agents` → AgentCatalogService → AgentRevisionRepository → SQLite；修订与审计同事务。Admin → `/ops/grants` → AuthorizationService → OperationsJournal → grant + audit 同事务。AgentExecutionService.preflight → revision / grant / ExecutionObjectPolicy → shared 策略交集；当前没有接运行调度。ExecutionRun 持久保存资源范围，父子范围只收窄。OutboxDispatcher 仅处理注册的数据库事务消费者，未配置业务派发时钟。真实运行、部署与内容写入仍由后续批次接通，见 [验收边界](AGENT-CORE-ACCEPTANCE.md)。
