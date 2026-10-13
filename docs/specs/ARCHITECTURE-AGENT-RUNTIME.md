---
status: active
type: architecture
title: Agent 运行时架构（2026-09-23 实况）
last_verified: 2026-09-23
ssot: true
applies_to: [api, agent]
---

# Agent 运行时架构（2026-09-23 实况）

> 本文只描述**已经落地并有验证证据**的结构。依据：R21 真实探针通过（`docs/evidence/runtime-probe.json`）、
> R25a–c 提供方改用 dsh 原生管理、R27 SDK 统一为 npm 发布包。
> 相关设计文档：`docs/TECH-DESIGN-AGENT-OPERATIONS.md`、`docs/PRD-AGENT-OPERATIONS.md`。

## 0. 一句话

**AdgaiWalker 自有后端 + 自有数据 + 上游 Harness SDK（npm 发布包）作为唯一模型执行引擎；
站主个人环境（`~/.dsh`、DSH Desktop）与本系统零接触。**

---

## 0.1 部署架构（生产总览图）

![AdgaiWalker 生产部署架构](../assets/deploy-architecture.png)

> 图源：[`docs/assets/deploy-architecture.html`](../assets/deploy-architecture.html)（改文字后重新截图即可）

**两条链**：

| 链 | 路径 | 特点 |
|---|---|---|
| **访客请求链**（居中主链） | 访客浏览器 → Vercel CDN → 盒子网关 Caddy → Nest API :8788 → DeepSeek Harness | 静态资源由 Vercel 直供；只有 `/api/*` 回到盒子 |
| **内容发布链**（右侧） | 站主本地编辑 → `content:publish --push` → GitHub main → 触发 Vercel 构建 | **内容只走 Git**，不进数据库；全链可追溯 |

**关键边界**：盒子只监听回环（`127.0.0.1:8788`），公网入口只有 Caddy；
公开路由白名单在 `app.module.ts` 与 `Caddyfile` **双侧同步**，漏一侧即 401/404。

---

## 1. 总体拓扑

```mermaid
graph TB
    subgraph visitor["访客侧"]
        WEB["apps/web<br/>访客静态站 :5173"]
    end

    subgraph owner["站主侧"]
        ADMIN["apps/admin<br/>工作台 :5174"]
    end

    subgraph core["AdgaiWalker 自有后端（apps/api :8788）"]
        CTRL["Controller 层<br/>公开白名单 + 管理鉴权"]
        SVC["用例服务<br/>assistant / agent / execution / content"]
        PORTS["ports（Symbol 接口）"]
        ADAPTERS["adapters（实现）"]
        CTRL --> SVC --> PORTS --> ADAPTERS
    end

    subgraph data["数据层（本机文件，不进 Git）"]
        SQLITE[("SQLite<br/>apps/api/prisma/data/walker.db<br/>37 张表")]
        CONTENT["content/log/**/*.md<br/>内容唯一真相源"]
        SNAP["已核验公开快照<br/>data/public-snapshots"]
        RUNS["运行痕迹<br/>data/runs/&lt;runId&gt;/trace.jsonl"]
    end

    subgraph harness["上游 Harness（npm 发布包，唯一模型引擎）"]
        SDK["@deepseek-ai/dsh-sdk-client<br/>@deepseek-ai/dsh<br/>0.1.5-rc.3"]
        CORDIS["Cordis 插件框架<br/>+ 63 个 dsh-* 生态包"]
        PROFILE["profile 机制<br/>cordis.yml / bundles / 插件依赖"]
        SDK --> CORDIS --> PROFILE
    end

    subgraph home["AdgaiWalker 自己的 DSH_HOME（与站主 ~/.dsh 无关）"]
        SETTINGS["settings.yaml<br/>提供方接口 / API 网址 / 凭据引用"]
        CREDS[".credentials.yaml<br/>共用凭据（站主手工填）"]
        AGENTHOME["agents/&lt;agentId&gt;/<br/>每 Agent 独立配置"]
    end

    WEB -->|"/api/* 反代"| CTRL
    ADMIN -->|"/api/* 代理"| CTRL
    ADAPTERS --> SQLITE
    ADAPTERS --> CONTENT
    ADAPTERS --> SNAP
    ADAPTERS --> RUNS
    ADAPTERS -->|"进程隔离启动"| SDK
    ADAPTERS -.->|"读配置（只读）"| SETTINGS
    ADAPTERS -.->|"读凭据引用名"| CREDS
    ADAPTERS -.->|"每 Agent 配置"| AGENTHOME
```

**要点**

- **模型执行只有一条路**：全部经 `ports/runtime.port.ts` → Harness SDK。没有第二条直连通道（技能用的
  `LlmClient` 也从同一份 dsh 目录取提供方与凭据）。
- **自有后端不管模型实现细节**：它只准备「提供方事实 + 凭据引用 + 只读工具策略」，交给上游 runtime。
- **两个 DSH_HOME 物理隔离**：站主个人环境在 `~/.dsh`，本系统在 `apps/api/data/dsh-home`。
  代码里 `resolveModelHomeDir()` **不回落** `~/.dsh`——这是 R26/R27 立的规矩，有测试锁住。

---

## 2. 一次 Agent 执行的时序（后台试跑 / 统一执行）

```mermaid
sequenceDiagram
    autonumber
    participant U as 站主（admin 页面）
    participant A as Nest Controller
    participant E as ExecutionService（单槽调度）
    participant P as RuntimePort 适配器
    participant H as Harness 子进程（dsh）
    participant M as 模型（如 deepseek-flash）

    U->>A: POST /ops/execution-runs<br/>（idempotencyKey / agentRevisionId / input）
    A->>E: 提交（来源固定为站主，不从请求体取 origin）
    E->>E: 幂等键判重 → 授权/额度预留在同一事务
    E->>E: 入队（公共/后台有界公平；全局一个模型槽）

    Note over E: 领取时校验：授权未撤销、未过期、仍在原范围

    E->>P: start（按 provider facts 准备隔离 home）
    P->>P: 写 settings.yaml（接口/网址/模型）到子进程 home
    P->>P: 凭据经环境变量按引用名传入<br/>（写 .credentials.yaml 会让 rc.3 启动失败）
    P->>H: 启动（只读工具 profile，关闭文件/shell/网络/MCP）
    P->>H: run(prompt)
    H->>M: 真实模型请求
    M-->>H: 回答
    H-->>P: 事件流（text-delta / usage）
    P-->>E: 结果（会话 id / 文本 / 用量）
    E->>E: 写 ExecutionRun + ExecutionEvent（审计同事务）
    E-->>A: 返回
    A-->>U: 页面呈现（排队/首字/耗时/用量/降级原因）

    Note over E,H: 停止：先 STOPPING，等 close 返回退出证明才 CANCELLED<br/>close 无证明则 UNKNOWN，槽继续占用
```

**要点**

- **单槽串行**（R12）：全局一个模型槽，一次只跑一个调用；这是 2C2G 盒子上的资源纪律。
- **停止是两阶段**（R13）：页面点停止 ≠ 进程已停；必须拿到退出证明才释放槽。
- **幂等**：`idempotencyKey` 重复提交返回同一运行，不重复扣额度。

---

## 3. 配置隔离结构（同一套代码 + 各自配置）

![Agent 独立配置结构](../assets/agent-config-structure.png)

> 图源：[`docs/assets/agent-config-structure.html`](../assets/agent-config-structure.html)

**三层关系**：

| 层 | 位置 | 作用 |
|---|---|---|
| **站主个人环境** | `~/.dsh` | **不读、不回落**（图中 ✕）；产品配置不得绑到站主个人环境 |
| **共享层** | `dsh-home/settings.yaml` + `.credentials.yaml` | Agent 未覆盖时回落；凭据默认共用一份 |
| **Agent 层** | `dsh-home/agents/<agentId>/` | 各自独立 home：模型、提示词、插件、会话互不串 |

**每个 Agent 的 `profiles/sdk/` 就是它的 Cordis 组合**（与 dsh 同款框架、上游自动生成）：
`package.json` 装**该 Agent 独有**的外部插件，`cordis.patch.yml` 管插件开关与参数覆盖。
装插件走上游原生命令，不自己实现插件系统。

**同一套代码**：所有 Agent 共享 `node_modules` 里同一份 `@deepseek-ai/dsh-base` 等 bundle
（图中紫色块），不复制代码；各自 `node_modules/` 通过 pnpm 硬链接共享 store，磁盘不成倍增长。

```mermaid
graph LR
    subgraph upstream["上游同一套代码（node_modules 里一份）"]
        BASE["@deepseek-ai/dsh-base"]
        SDKAPP["@deepseek-ai/dsh-sdk-app"]
        LLM["@deepseek-ai/dsh-llm-deepseek"]
    end

    subgraph home2["apps/api/data/dsh-home"]
        SHARED["settings.yaml（共享层）<br/>apiKeyEnv: DEEPSEEK_API_KEY<br/>baseURL: api.deepseek.com"]
        CREDS2[".credentials.yaml<br/>refs: DEEPSEEK_API_KEY"]
        subgraph a["agents/consultant"]
            A1["settings.yaml<br/>model: deepseek-v4.1-flash"]
            A2["profiles/sdk/package.json<br/>可加外部插件"]
            A1 --- A2
        end
        subgraph b["agents/engineer"]
            B1["settings.yaml<br/>model: gpt-5.6"]
            B2["profiles/sdk/package.json<br/>装各自的插件"]
            B1 --- B2
        end
    end

    BASE --> A2
    BASE --> B2
    SDKAPP --> A2
    SDKAPP --> B2
    LLM --> A2
    LLM --> B2
    SHARED -.->|"未覆盖时回落"| A1
    SHARED -.->|"未覆盖时回落"| B1
    CREDS2 -.->|"共用一份凭据"| A1
    CREDS2 -.->|"共用一份凭据"| B1
```

**要点**

- **同一套代码**：两个 Agent 共享上游同一个 bundle（不复制代码）。
- **配置隔离**：模型、系统提示词、插件各写各的。
- **凭据默认共用**（站主决定），但每个 Agent 可单独指定自己的引用名（`apiKeyEnv`）。
- **外部插件**：装在各自 profile 的 `package.json`，互不影响。

> **状态（2026-09-23 R26 已完成）**：`resolveSessionHome` 支持 agentId、`syncProviderHome` 改保留式合并、
> `RuntimeOwner.agentId` 打通执行链路（零迁移）、adapter 按 Agent 切换实例、站内助手小影同样用 `agents/xiaoying/`。
> 每个 Agent 的 `profiles/sdk/`（含外部插件依赖）由 dsh 在该 home 内自动生成；
> **首次启动会初始化 profile（装依赖，较慢）**，之后常驻复用。

---

## 4. 分层架构（六边形 / Ports & Adapters）

### 4.1 全栈分层总览

```mermaid
graph TB
    subgraph L0["① 接入层 — 客户端"]
        W["apps/web<br/>访客静态站 :5173<br/>只读 content.json"]
        AD["apps/admin<br/>站主工作台 :5174<br/>React + Vite"]
    end

    subgraph L1["② 传输层 — HTTP 进出"]
        MW["中间件<br/>AdminTokenMiddleware 管理鉴权<br/>SameOriginMiddleware 同源/CSRF校验"]
        WH["公开白名单<br/>app.module.ts exclude<br/>↔ Caddyfile 双侧同步"]
        GC["全局契约<br/>错误码 / requestId / 限流"]
    end

    subgraph L2["③ 接口层 — Controller（薄）"]
        C1["公开面<br/>intake / assistant / likes<br/>content-feedback / search-events"]
        C2["管理面<br/>ops/* / admin/* / ops/agents<br/>ops/execution-runs / skills"]
    end

    subgraph L3["④ 应用层 — Service（用例编排）"]
        S1["assistant<br/>会话准入 · 幂等 · 预算熔断"]
        S2["execution<br/>单槽调度 · 额度 · 停止 · 核对"]
        S3["agents / deployments<br/>修订 · 授权 · 位置绑定"]
        S4["content-*<br/>台账 · 编辑 · 发布"]
    end

    subgraph L4["⑤ 领域层 — ports（Symbol 契约，46 个）"]
        P1["22 个能力端口<br/>runtime / model-directory<br/>llm / skill / rate-limit ..."]
        P2["24 个仓储端口<br/>assistant / execution / agent<br/>conversation / deployment ..."]
    end

    subgraph L5["⑥ 适配层 — adapters（可替换实现，69 个）"]
        A1["harness-*（2）<br/>上游 Harness 进程"]
        A2["prisma-*（19）<br/>SQLite 持久化"]
        A3["fs-*（14）<br/>文件系统"]
        A4["rule-*（2）<br/>AI 关闭时的规则兜底"]
        A5["其它<br/>http / memory / pnpm<br/>unavailable / node-* ..."]
    end

    subgraph L6["⑦ 基础设施层"]
        I1[("SQLite<br/>37 张表")]
        I2["content/log/**/*.md<br/>内容唯一真相源"]
        I3["data/runs/&lt;runId&gt;/trace.jsonl"]
        I4["data/public-snapshots<br/>已核验公开快照"]
        I5["Harness SDK（npm）<br/>+ Cordis 运行时"]
    end

    W -->|"/api/*"| MW
    AD -->|"/api/*"| MW
    MW --> WH --> C1
    MW --> C2
    MW --> GC
    GC -.->|"横切每条路由"| C1
    GC -.->|"横切每条路由"| C2
    C1 --> S1
    C2 --> S2
    C2 --> S3
    C2 --> S4
    S1 --> P1
    S2 --> P1
    S2 --> P2
    S3 --> P2
    S4 --> P2
    P1 --> A1 --> I5
    P1 --> A4
    P2 --> A2 --> I1
    P2 --> A3
    A3 --> I2
    A3 --> I3
    A3 --> I4
    A5 -.->|"实现同端口"| P1
```

### 4.2 依赖方向（硬规则）

```mermaid
graph LR
    T["传输 / Controller"] -->|"只调用例"| AP["Service"]
    AP -->|"只依赖接口"| PO["ports（Symbol 契约）"]
    PO -.->|"kernel.module 接线注入"| AD2["adapters（具体实现）"]
    AD2 --> IN["基础设施<br/>SQLite / 文件 / Harness"]
    PO -.->|"❌ 反向依赖禁止"| T
```

**四条禁止**（review 时逐条核）：
1. Controller 直接调 adapters —— 绕过用例，规则失守
2. Service 直接用 prisma 客户端 —— 端口形同虚设
3. ports 反向 import adapters —— 契约被实现绑死
4. adapters import Controller —— 依赖倒挂

| 层 | 可以有 | 不可以有 |
|---|---|---|
| **Controller** | 解析请求、调 Service、组响应 | 领域规则、直接读库、直接起进程 |
| **Service** | 编排、业务规则、事务边界 | `new PrismaClient()`、`fs` 直读、spawn 进程 |
| **ports** | `interface` + Symbol token | 任何 import 具体实现、import React |
| **adapters** | 实现端口、碰外部系统 | 被 Service 直接 import（只经 token 注入） |
| **shared** | 纯函数、契约、DTO | React、Nest 装饰器、fs、网络 |

### 4.3 一个具体例子：模型执行如何穿过各层

```mermaid
graph TD
    U["站主点「试跑」<br/>admin :5174"] -->|"POST /ops/execution-runs"| M["AdminTokenMiddleware"]
    M --> C["ExecutionRunsController<br/>（只解析请求）"]
    C --> S["AgentExecutionService<br/>幂等 · 授权 · 额度 · 单槽入队"]
    S -->|"注入 RUNTIME_PORT"| P["ports/runtime.port.ts<br/>interface RuntimePort"]
    P -.->|"kernel.module 接线"| A["adapters/harness-runtime.adapter.ts"]
    A --> R["runtime/harness-launch.ts<br/>（隔离 home · 只读工具 · env 白名单）"]
    R --> H["Harness 子进程（dsh）"]
    H --> M2["模型"]
    S -->|"注入执行仓储"| P2["ports/execution.repository.ts"]
    P2 -.-> A2["adapters/prisma-execution.repository.ts"]
    A2 --> DB[("SQLite ExecutionRun<br/>+ ExecutionEvent")]
```

**换实现只动一层**：
- 换模型引擎 → 只改 `adapters/harness-*.ts` + kernel 一行接线
- 换配置来源 → 只改 `adapters/fs-model-directory.ts`
- 换数据库 → 只改 `adapters/prisma-*.ts`

### 4.4 前端分层（admin）

```mermaid
graph TB
    subgraph FE0["配置层（产品语义 SSOT）"]
        CFG["shared/routes.ts<br/>ADMIN_ROUTES · LEGACY_REDIRECTS"]
    end
    subgraph FE1["规则层（与后端共用同一份）"]
        RULE["@walker/shared<br/>纯函数 · DTO 契约 · 消毒"]
    end
    subgraph FE2["门面层（无 className）"]
        FAC1["api/http.ts<br/>错误码 · 取消 · 超时 · requestId"]
        FAC2["api/queries.ts<br/>Refine + TanStack Query"]
        FAC3["api/auth-provider.ts<br/>内存凭据 · 401 清缓存"]
        FAC4["api/execution-stream.ts<br/>SSE 拆帧"]
    end
    subgraph FE3["页层（路由任务编排）"]
        P1["pages/overview"]
        P2["pages/content"]
        P3["pages/agents<br/>含 deployments"]
        P4["pages/records"]
        P5["pages/settings"]
    end
    subgraph FE4["块/壳（可复用 UI+UX）"]
        B1["components/States.tsx<br/>Loading / Error / Empty"]
        B2["components/ContentTable · RunTable<br/>MarkdownPreview"]
        B3["app/AdminShell.tsx<br/>app/SessionGate.tsx"]
    end
    CFG --> P1
    RULE --> P1
    RULE --> P3
    FAC1 --> FAC2
    FAC2 --> P1
    FAC3 --> FAC2
    FAC4 --> P4
    P1 --> B1
    P2 --> B2
    P4 --> B2
    P5 --> B1
    P3 --> B3
    FAC2 -.->|"HTTP /api/*"| BE["Nest API :8788"]
```

**分层纪律**（与后端同构，越界即 review 打回）：

| 层 | 可以有 | 不可以有 |
|---|---|---|
| 配置 | `routes.ts` 的路径常量 | 组件、请求 |
| 规则 | `@walker/shared` 纯函数 | `import React`、`fetch`、`fs` |
| 门面 | HTTP 调用、错误归一、缓存 | `className`、JSX |
| 页 | 调门面、组合块、路由参数 | 复制第二套校验、直连 fetch |
| 块/壳 | `props + onXxx`、布局 | 领域规则、intake/主选业务 |

---

## 5. 环境隔离边界（硬规则）

| 边界 | 规则 | 依据 |
|---|---|---|
| 站主个人环境 | 代码**不读** `~/.dsh`、不读 `DSH_HOME`；只读 `WALKER_MODEL_HOME` 或 `apps/api/data/dsh-home` | R26/R27，有测试锁住 |
| 子进程环境 | 白名单变量 + **凭据值经环境变量按引用名传入**；写 `.credentials.yaml` 会让 rc.3 启动失败 | R10 实测 |
| 工具权限 | 只读：关闭文件/shell/网络/MCP，沙箱 `read-only` | R10，探针验证 |
| 后台/前台会话 | 目录分开（`.dsh-admin` / `.dsh-assistant`），会话不可跨受众复用 | R10/V08 |
| 密钥 | 不进 Git、不进日志、不进接口响应（目录只暴露**引用名**与有无） | R25a/c |
| SDK 来源 | 只用 npm 发布包（GitHub 官方产物），不用本地 clone | R27 |

---

## 6. 与"旧体系"的区别（已删除的东西）

```mermaid
graph LR
    subgraph old["旧（已删除）"]
        O1["ModelProvider 表<br/>AES-256-GCM 密文"] --> O2["ModelProviderService"] --> O3["OpenAiCompatibleLlm<br/>取密钥"]
        O4["/model-providers<br/>8 个路由"] --> O2
    end

    subgraph new["新（现在）"]
        N1["dsh settings.yaml<br/>凭据引用名"] --> N2["fs-model-directory<br/>（只读投影）"]
        N2 --> N3["RuntimePort<br/>（Agent 执行）"]
        N2 --> N5["LlmClient<br/>（技能执行）"]
        N2 --> N4["/ops/agent-models<br/>（后台页面）"]
        N6[".credentials.yaml<br/>共用凭据"] -.->|"仅读引用名"| N2
    end
```

- 删除了 `ModelProvider` / `Credential` 表（迁移 `20260923110000_...`）、AES 加密模块、8 个 `/model-providers` 路由。
- 提供方与凭据现在**只有一份真相源**：dsh 原生设置。
- 附带修正：`AgentUnit.providerId` 指向本地表的外键已移除（否则无法写 dsh 路由名）。
