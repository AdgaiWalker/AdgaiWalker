# Goal Document: 按优先级拆薄 AGENTS.md

> 本文是 **AGENTS.md 的拆解计划**，不是产品主计划。  
> 产品主计划仍是根 [`PLAN.md`](../PLAN.md)；图面仍是 [`ARCHITECTURE.md`](./ARCHITECTURE.md)。  
> 禁止把本文当成第二套主线，禁止覆盖根 `PLAN.md`。

## Go / No-Go

- **Judgment**: Go after decisions（分类可立即用；动手改 AGENTS.md 须先接受「坑清单迁到 ops」）
- **Reason**: AGENTS.md 把「每轮必守的红线」和「部署时才用的坑」叠在同一份常驻指令里，agent 开场负担过重，且与 `ops/windows/README.md` 互指（ops 第 139 行写「见 AGENTS.md 坑清单」）。分类本身不改生产；真要瘦身，必须先把坑的权威迁走，否则删 AGENTS 段落会丢唯一副本。

## Target Outcome

Agent 开场只读一份短的 `AGENTS.md`（红线 + 指针）。部署坑只在 `ops/windows/README.md`。排期只在根 `PLAN.md`。同一条规则只有一个权威家。

## Goal Definition

- **Type**: quality / operational（文档分层，不改产品行为）
- **Boundary**: 只动文档归属与交叉引用：`AGENTS.md`、`ops/windows/README.md`、`docs/README.md`、必要时 `CLAUDE.md` 一句指针。不改代码、schema、路由、主线排期。
- **Non-goals**:
  - 不重写根 `PLAN.md` 的北极星 / 宪法 / M3 主线
  - 不把 AGENTS 拆成新的产品 TODO 队列
  - 不推进观测 P1、判断代理 A4、MCP HTTP
- **Deferred work**:
  - `CLAUDE.md` 与 `ENGINEERING.md` 的命令表去重（另一份 SSOT，不在本目标）
  - 生产拓扑段与 `STATUS.md` 的时钟去重
- **Verification rule**: 瘦身完成后，AGENTS.md 每一条仍可在「本文或明确指针目标」找到；`ops/windows/README.md` 不再反向依赖 AGENTS 坑清单；根 `PLAN.md` 一字不改其 §0–§6。
- **Evidence source**: 文档 diff + grep（关键短语在权威文件各恰好一处正文，AGENTS 只留指针）
- **Pass criteria**: 下面「优先级表」的 P0 仍在 AGENTS 正文；P1 正文在 ops；AGENTS 全文明显短于现状（约一屏红线 + 指针，不再复制部署逐步命令）
- **Confidence note**: 分类来自现文件逐段阅读，不依赖生产探针
- **Judgment owner**: 站主接受本文件后，agent 才许改 AGENTS.md

## Current State

`AGENTS.md` 六段混在一起，优先级不同，权威家也不同：

| 段 | 现在在哪 | 真正权威应在哪 |
|---|---|---|
| 文档阅读顺序 | AGENTS | AGENTS（P0，开场地图） |
| 仓库结构 / 六边形 / content.json 只读 / 验证链 / 测试库隔离 | AGENTS | AGENTS 留短规则；命令细节 `CLAUDE.md` |
| 生产拓扑 / 白名单双侧 / 凭据 / 盒子目录 | AGENTS 全文复制 | 拓扑事实：`STATUS.md` + `ops/windows/README.md`；AGENTS 只留「漏一侧即 401/404」「密钥不进 Git」 |
| 盒子部署与运维坑（约 16 条） | AGENTS 正文；ops 部署验证清单反向引用 AGENTS | **ops/windows/README.md**（P1，部署时才读） |
| 助手 / AI / 工作站红线 | AGENTS | AGENTS（P0）；与 `PLAN.md` 宪法同向，AGENTS 是执行层，不另写宪法 |
| 腾讯云 SSH / Tailscale | AGENTS | 连接纪律 P0 留 AGENTS（永不输出私钥、未经授权不重装）；IP/主机别名细节已在本机 SSH config，AGENTS 不必重复 |

已知风险：ops README 第 139 行依赖 AGENTS 坑清单。先迁后删。

## Priority Rationale

按「agent 每一轮是否必须装进上下文」分级，不按篇幅、不按发生过多少次事故。事故越疼越要进 ops 手册，而不是塞进每轮开场。

- P0 不进上下文就会在普通改动里犯规（白名单漏一侧、prompt 进命令行、AI 假装成功）
- P1 只在部署/重启/SSH 时需要，每轮携带会淹没红线
- P2 是事实副本，删 AGENTS 长文不影响生产，只要指针还在

## 优先级表（拆解结果 · 现行有效）

### P0 · 每轮必守（留 AGENTS 正文）

1. 先读根 `PLAN.md` → `CLAUDE.md` → `docs/ARCHITECTURE.md`；改助手先读 `PRD-SITE-ASSISTANT.md`；`docs/archive/` 不当现行契约
2. 新增 API 能力先 port 再 adapter；web 只读 `content.json`
3. 验证链：`typecheck` → 各包测试 → 改 web 再 `build:web && verify:geo`；测试绝不写开发库
4. 放行公开路由：`app.module.ts` exclude **和** `Caddyfile` 同时改
5. 密钥 / 凭据 / 私钥永不进 Git、不进回复
6. AI 可关、引用 fail-closed、公开输入不进命令行、流式只出裁剪文本、PREPARED ≠ PUBLISHED、禁止 AI 自动主选
7. SSH 主路径 `walker-tencent`；未经明确授权不重装、不重置密码、不删服务器数据、不换密钥
8. 改拓扑 / 部署 / 产品行为必须回写对应权威文档

### P1 · 部署时才读（迁到 ops，AGENTS 一行指针）

- 部署逐步命令（check:content-dirty → pull → build → 写 version → End/Run）
- SSH 熔断 / TAT 带外 / 2C2G 打僵 sshd
- PowerShell UTF-8 BOM、`$ErrorActionPreference`、Caddy `basic_auth` 块形式、Windows 保留名、OpenSSH 杀子进程树
- 8788 PID 换血、半重启窗口、`.env` 编码、`api.log`
- dsh 短调用常驻 / 长调用独立、双合同超时、443 核验、`DSH_*` 不从 .env 继承

### P2 · 不排期（已有权威，AGENTS 不复制）

- 主线 M3 / M6 / M7 → 根 `PLAN.md` + 三份 TODO
- 当前态 / 最终架构 / 飞轮 → `docs/ARCHITECTURE.md`
- 生产探针时钟 → `docs/STATUS.md`
- 判断代理工具面 → `apps/agent/README.md` + `TODO-AGENT.md`

### 明确不是 TODO

AGENTS.md 里的坑是**已付过学费的约束**，不是待办。把它们拆成「先修 SSH / 再写 prune 脚本」会和根 `PLAN.md` 抢优先级。本目标只改文档家，不派生新的工程批次。

## Assumptions and Open Decisions

| Item | Status | Impact | Owner / Next step |
|------|--------|--------|-------------------|
| 不覆盖根 `PLAN.md` | confirmed | 本文必须另存 | 本文件已放 `docs/PLAN-AGENTS.md` |
| 坑清单迁 ops 后 AGENTS 只留指针 | assumed | 站主若要 AGENTS 继续当「事故百科」则 Phase 2 不做 | 接受本文件后执行 |
| Tailscale IP 是否继续写在仓库 | unresolved | 安全 vs 可操作性；现状已写入 AGENTS | 不在本目标改；保持现状 |

## Phases

### Phase 1: 分类冻结（本文）

- **Purpose**: 先把优先级写成可执行表，停止把 AGENTS 当待办扫
- **Entry condition**: 无
- **Phase rules**: 只写本文；不改 AGENTS 正文
- **Todos**:
  - [x] 按 P0/P1/P2 拆 AGENTS 六段
    - **Surface**: `docs/PLAN-AGENTS.md`
    - **Proof**: 上表覆盖 AGENTS 全部二级标题
    - **Depends on**: none
- **Exit proof**: 本文存在且根 `PLAN.md` 未改 §0–§6
- **Stop condition**: 站主要求覆盖根 `PLAN.md` → 拒绝，改解释本文定位

### Phase 2: 坑清单迁入 ops（站主接受后）

- **Purpose**: 让部署手册成为 P1 的唯一正文
- **Entry condition**: 站主接受「AGENTS 不再保留坑的长文」
- **Phase rules**: 先把 AGENTS「盒子部署与运维坑」整段迁入 `ops/windows/README.md`（可作「事故与核验」小节）；ops 删除「见 AGENTS.md 坑清单」反向引用；AGENTS 该节改成 3–5 条硬规则 + 指向 ops。允许改文档，不许改脚本行为。
- **Todos**:
  - [ ] 迁写 ops 坑小节，覆盖 AGENTS 第 29–44 行全部条目
    - **Surface**: `ops/windows/README.md`
    - **Proof**: grep 关键短语（半重启、双合同、UTF-8 BOM、`DSH_*`、8788 PID）在 ops 有正文
    - **Depends on**: Phase 1
  - [ ] AGENTS 部署段改为指针 + 仍留 P0 短规则（content-dirty、密钥不进 Git）
    - **Surface**: `AGENTS.md`
    - **Proof**: AGENTS 不再出现逐步 `schtasks` 命令块
    - **Depends on**: 上一条
- **Exit proof**: ops 不再引用 AGENTS 坑清单；AGENTS 部署段可在一屏内读完
- **Stop condition**: 迁写时发现某条坑只存在于 AGENTS → 停下补 ops，禁止先删

### Phase 3: 拓扑段收束（可选）

- **Purpose**: AGENTS「生产拓扑」不再复制 STATUS/ops 长文
- **Entry condition**: Phase 2 完成
- **Phase rules**: 白名单双侧、密钥不进 Git 必须留 AGENTS（P0）；盒子目录与反代链改指针
- **Todos**:
  - [ ] AGENTS 拓扑段压成红线 + 指针
    - **Surface**: `AGENTS.md`
    - **Proof**: 访客→Vercel→Caddy→Nest 的逐步拓扑在 STATUS 或 ops 仍完整
    - **Depends on**: Phase 2
- **Exit proof**: `docs/README.md` 注明 AGENTS 是红线，ops 是部署手册
- **Stop condition**: 指针目标缺「漏一侧即 401/404」→ 先补目标再删 AGENTS 句

## Dry-Run Findings

- 根 `PLAN.md` 已占用 `PLAN.md` 这个名字；本文件必须叫 `PLAN-AGENTS.md`，否则破坏主计划 SSOT。
- Phase 2 有真实依赖：ops 现在把 8788 僵尸进程说明外包给 AGENTS。先迁后删。
- 本目标与产品主线 M3 无依赖、无冲突；但 **不得** 插进根 `PLAN.md` §3 变成 M9。
- 不在本计划里给 OBS P0 补勾或删 AGENT 重复空框——那是 TODO 诚实性，另一件事。

## Final Validation

1. 根 `PLAN.md` §0–§6 与归档前一致（本目标不碰主线）
2. grep `半重启|双合同|schtasks /End`：正文在 `ops/windows/README.md`，AGENTS 若出现则仅为指针
3. AGENTS 仍包含：白名单双侧、AI 可关、fail-closed、公开输入不进命令行、禁止自动主选、私钥红线
4. `docs/README.md` 现行表不把本文列为与 `PLAN.md` 同级的权威

## First Execution Step

停在 Phase 1。下一动作是站主拍板：是否把 AGENTS 的坑长文迁到 ops。未拍板前不改 `AGENTS.md`。
