# 架构（权威）：当前态 · 最终态 · 演进对照

> 本文件是全项目架构的唯一权威图面；边界规则原文在 [`PLAN.md`](../PLAN.md) §2（五条宪法同在彼处）。
> 更新纪律：拓扑/组件/数据流变更须回写本文件；图中状态标注随部署实况更新。
> 基准：2026-09-06 · HEAD `b45cf40` · 生产已部署并四步核验。

## 一、当前架构（as-built 2026-09-06）

```mermaid
flowchart TB
    subgraph visitors["访客"]
        V1["浏览器"]
    end

    subgraph vercel["www.iwalk.pro · Vercel 静态"]
        WEB["Wiki 阅读 · 小影 /ask · 卡口 /tools<br/>（含共创回执文案）"]
    end

    subgraph box["盒子 · 腾讯云 Windows 2C2G"]
        CADDY["Caddy 公网白名单"]
        subgraph nest["Nest :8788 · 六边形（静态服务面）"]
            GATE["网关：限流 · 配额 · 会话归属 · 观测日志"]
            INTAKE["intake 卡口"]
            ASSIST["assistant 小影"]
            INSIGHT["insights 信号中心<br/>+ 建议转题苗"]
            PIPEAPI["works 作品链 + 发布状态机"]
        end
        DSH["dsh · 唯一 AI 运行时 ✔<br/>小影常驻 + nextStep/配方 per-run/常驻混合<br/>（2026-09-06 统一，codex 已退役）"]
        DB[("SQLite · 过程数据")]
        EV[("FeatureEvent / AssistantRun<br/>+ api.log 降级原因")]
        GOV["dsh 会话治理 ✔<br/>遥测默认关 · 90 天 prune"]
    end

    subgraph owner["站主 · SSH 隧道 + 双 token"]
        ADMIN["admin · 流水线首页 ✔<br/>池→苗→作→品 单页全链"]
    end

    subgraph gitc["内容真相源 · Git"]
        LOG[("content/log · 28 篇")]
        GEN["content:gen"]
        CJ[("content.json")]
    end

    subgraph agentx["apps/agent · Cordis 组合 ✔ 脚手架"]
        K["knowledge（aiUsePolicy fail-closed）"]
        M["mcp · stdio 四工具"]
    end

    EXT["外部 agent（MCP 客户端）"]

    V1 --> WEB
    WEB -->|"/api/* 反代"| CADDY --> GATE
    ADMIN --> CADDY
    GATE --> INTAKE & ASSIST & INSIGHT & PIPEAPI
    INTAKE & ASSIST & INSIGHT & PIPEAPI --> DSH
    GATE --> INTAKE & ASSIST & INSIGHT & PIPEAPI --> DB
    GATE --> EV
    DSH --> GOV
    LOG --> GEN --> CJ --> WEB
    CJ --> K --> M
    EXT -->|"调用（个人 stdio）"| M
    M -->|"带 slug 出处返回"| EXT
```

## 二、最终架构（定稿 · 2026-09-06 论文修订版）

```mermaid
flowchart TB
    subgraph faces["三个面"]
        direction LR
        F_WEB["👤 访客 · Web（骨架不变）"]
        F_ADMIN["🛠 站主 · admin 流水线 + 数据页（数据页=观测 P2，待数据攒够）"]
        F_MCP["🤖 外部 AI · MCP（stdio ✔ / HTTP 公网 v2 按触发）"]
    end

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

## 五、演进对照（当前 → 最终）

| 组件 | 状态 |
|---|---|
| AI 运行时统一（dsh 四用例） | ✔ 生产（小影/卡口 AI 实测真答；配方可用） |
| 卡口/工作站 codex 退役 | ✔ |
| 观测 P0（遥测关闭/会话治理/api.log） | ✔ 生产 |
| 共创显性化 + 周报转题苗 | ✔ 生产（本批） |
| admin 流水线默认首页 | ✔ 生产（本批） |
| 判断代理 v1（Cordis+MCP stdio） | ✔ 脚手架（A0–A3；A4 stub；A5 dogfooding 待站主） |
| 观测 P1（token/延迟/降级原因落库） | 待初稿后 |
| 数据页三标签（观测 P2） | 待数据攒够 |
| 判断代理 v2（HTTP 公网/ask/反向挂载） | 按触发 |
| ★ 站主初稿全链 | **唯一待办（人）** |
| 具身 | 远期（同一 MCP 接口消费） |
