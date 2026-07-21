# Goal Document: React 唯一栈与默认分支真相

> **状态**：可执行草案（/hai-goal）  
> **一句话**：让「代码、默认分支、GitHub 语言条」三者一致为 **React monorepo，零可运行 Astro**；不为复刻旧站全功能。  
> **关联**：PR #39 `feat/dual-entry-tactile-accept` · 对应表 · Astro 残留清点

---

## Go / No-Go

- **Judgment**: **Go after decisions（可先开 Phase 1–2；Phase 3 需你点合并/改默认分支）**
- **Reason**: 目标可验证、阶段清晰。feature 上 Astro 应用树已删（0 个 `.astro`）。**35.2% Astro 来自默认分支 `main` 仍是旧站**——合并 PR 或改默认分支必须由仓库权限方完成；其余源码/文档清理可立即执行。

---

## Target Outcome

当本 Goal 完成时，下列为真：

1. **运行栈唯一**：仓库内无 `.astro` 应用文件、无 `astro.config`、无 `package.json` 依赖 `astro`/`@astrojs/*`；可运行前台仅为 `apps/web` + `apps/admin`（React+Vite），后端 `apps/api`（Nest）。  
2. **默认真相一致**：`main`（或当前 GitHub 默认分支）的树与 feature 一致，**不再是 82 个 `.astro` 的旧站**。  
3. **GitHub 语言条**：默认分支 Linguist 统计中 **Astro ≈ 0%**（允许文档里出现 “Astro” 字样，但不贡献 `.astro` 字节）。  
4. **误导残留清掉**：源码注释/Admin 文案不再写「去 Astro 对照编辑」；历史文档标明归档或不挡默认分支统计。  
5. **双入口小生产不回退**：卡/逛/过程闭环/鉴权/消毒/`pnpm accept` 仍绿。

**不成功** = 只清了 feature 注释但 main 仍是 Astro；或为「去字」而恢复双栈。

---

## Goal Definition

- **Type**: technical + operational（栈真相 + 默认分支）  
- **Boundary**:
  - **含**：合并路径使默认分支 React-only；源码误导文案清理；文档退役条/归档策略；合并后验证命令；可选 `.gitattributes` 文档归类  
  - **Non-goals**:
    - 旧站像素保真、WorkItem/Skill/Match 双轨  
    - 账号/Giscus/TOC 等对应表「壳/延」产品补齐（另 Goal）  
    - 把 MD 正文历史案例名「astro-component-diagnosis」全部改写（内容叙述，非框架）  
  - **Deferred**:
    - 登录/赞赏真做、阅读增强、生产 API 一体部署（对应表 R1–R5）  
- **Verification rule**: 默认分支树 `.astro` 数 = 0；GitHub languages 无 Astro 键或 ≈0；本机 `pnpm typecheck` + `pnpm accept`（环境齐时）通过  
- **Evidence source**: `git ls-tree` / GitHub API `languages` + `git/trees/{branch}?recursive=1` / 验收脚本  
- **Pass criteria**:
  - [ ] `main`（或新默认分支）上 `.astro` 文件数 = 0  
  - [ ] 仓库 `GET /repos/.../languages` 无 `Astro` 或占比 &lt; 0.1%  
  - [ ] 源码路径（apps/packages/scripts）无「请到 Astro 编辑」类误导文案  
  - [ ] 双入口主路径未回退（accept 或等价 curl 闭环）  
- **Confidence note**: 语言条已用 API 验证 = main 的 35.2%；feature 树 API 验证 = 0 个 `.astro`。合并后 Linguist 可能延迟数分钟刷新。  
- **Judgment owner**:
  - 树/命令：系统（git + API）  
  - 合并 main：仓库 owner（你）  
  - 产品不回退：`pnpm accept` / 执行方报告  

---

## Current State

| 面 | 事实 |
|----|------|
| 分支 `feat/dual-entry-tactile-accept` @ `643b41a` | 已推远程；0 个 `.astro`；React monorepo |
| 默认分支 `main` | **仍是旧 Astro 站**（82 个 `.astro`）；GitHub 语言条 Astro **35.2%** |
| PR #39 | `feat → main`，open；合入即解决默认真相 |
| 运行残留 | 无 Astro 依赖；仅注释/文档/剥离脚本 |
| 风险 | 只清注释不合并 → 语言条永不掉；强行改 main 历史需权限 |

---

## Plan Rewrite Notes

相对「Astro 残留清理方案」+ 对应表 + 双入口已交付：

| Existing item | Decision | Reason |
|---------------|----------|--------|
| 双入口小生产主路径 | **keep 为前提** | 已完成，本 Goal 禁止回退 |
| 删 feature 上 Astro 树 | **keep 已完成** | 不重做 |
| 合并 main / 改默认分支 | **reorder 最前** | 唯一消灭 35.2% 的硬手段 |
| 源码误导文案 | **keep 紧随** | 成本低、防开发误读 |
| 文档大归档 | **merge 为 Phase 后段** | 不挡语言条；可与合并并行 |
| 登录/赞赏/阅读增强 | **remove 出本 Goal** | 对应表产品债，另开 Goal |
| 恢复 Astro 对照流 | **remove** | 与目标相反 |

---

## Drift Diagnosis

- **Goal drift**: 把「补全旧站功能」混进「去 Astro 真相」会无限膨胀  
- **Phase drift**: 先改文档再合并 → 语言条仍 35%  
- **Validation drift**: 用「feature 上 0 个 .astro」冒充「仓库已 React」——**默认分支未变则失败**  
- **Compatibility drift**: 禁止为兼容再保留可运行 Astro 入口  
- **Cleanup drift**: 删正文历史词「Astro」不是本 Goal 核心  

---

## Priority Rationale

1. **先默认分支**：语言条与访客第一眼只认 `main`。  
2. **再源码误导**：合并后/合并前都可做，防执行方开错树。  
3. **再文档归档**：降低搜索噪音，不改变 Linguist 主因。  
4. **最后验收**：证明双入口未碎 + 语言条归零。  

---

## Assumptions and Open Decisions

| Item | Status | Impact | Owner / Next step |
|------|--------|--------|-------------------|
| 通过 **合并 PR #39** 更新 main（而非 force 推） | **assumed** | 标准路径 | 你点 Merge 或授权 API merge |
| 合并后默认分支仍叫 `main` | **assumed** | 可不改名 | 可选：Settings 改默认分支 |
| Linguist 刷新延迟 ≤ 24h | **assumed** | 合并后立即查可能仍缓存 | 以 tree 计数 0 为准，语言条次之 |
| 生产 Vercel 跟 main | **unresolved** | 合错构建会挂生产 | 合并前核对 Vercel 项目 Root/Build |
| 产品壳（登录等） | **confirmed 不进本 Goal** | 另 Goal | 见对应表 R1–R5 |

---

## Phases

### Phase 0: 冻结与证据基线

- **Purpose**: 钉死「35.2% 来自 main」证据，防执行中目标漂移。  
- **Entry**: 本 Goal 文档被接受或直接开工令。  
- **Phase rules**:
  - 只读检查 + 写本文件；不改业务行为  
  - 禁止重开双入口大功能  
- **Todos**:
  - [x] 记录 API：`main` 82 `.astro`；`feat` 0；languages Astro 35.2%  
    - **Surface**: 本文件 / 会话证据  
    - **Proof**: 数字可复述  
    - **Depends on**: none  
  - [x] 确认 PR #39 仍 open 且含「删 Astro 树」提交 `643b41a`  
    - **Surface**: GitHub PR  
    - **Proof**: PR 页可见  
    - **Depends on**: none  
- **Exit proof**: 基线表在 Goal 文档中固定  
- **Stop condition**: PR 被关且无替代合并路径  

### Phase 1: 默认分支变为 React 唯一（最高杠杆）

- **Purpose**: 消灭语言条 35.2% 的数据源。  
- **Entry**: Phase 0 退出。  
- **Phase rules**:
  - **允许**：合并 PR #39；或快进 main；或改默认分支到已无 Astro 的分支  
  - **禁止**：在 main 上只 cherry-pick 文档；禁止把 Astro 树加回 main  
  - **验证**：合并后立即 `git ls-tree` / API tree 计数  
- **Todos**:
  - [x] 合并前核对：Vercel/生产是否仍强依赖旧 Astro build（有则先改构或暂缓生产）  
    - **Surface**: Vercel 项目设置  
    - **Proof**: build 命令 = monorepo 或可接受 downtime 窗口  
    - **Depends on**: 你的生产决策  
  - [x] 合并 PR #39 → `main`（推荐）  
    - **Surface**: GitHub  
    - **Proof**: `main` HEAD 含 monorepo + 无 `.astro`  
    - **Depends on**: 上一项不阻塞或已接受风险  
  - [x] 本地：`git fetch && git checkout main && git pull`，确认干净  
    - **Surface**: 本地 git  
    - **Proof**: `git ls-tree -r HEAD --name-only \| grep '\.astro$'` 空  
    - **Depends on**: 合并完成  
- **Exit proof**: 默认分支树上 `.astro` = 0  
- **Stop condition**: 合并冲突涉及未知生产密钥/路径且无法安全解决 → 暂停问 owner  

### Phase 2: 源码误导残留清除

- **Purpose**: 开发者打开代码不会以为还要去 Astro 编辑。  
- **Entry**: Phase 1 完成，或与 Phase 1 并行在 feature 上做再合一次。  
- **Phase rules**:
  - 只改文案/注释/过时脚本说明；**不**改业务状态机  
  - 无兼容垫片  
  - 退出前 typecheck  
- **Todos**:
  - [x] `apps/admin/.../ContentPage.tsx`：去掉「Astro 对照」  
    - **Surface**: admin UI 文案  
    - **Proof**: grep apps 无「现网 Astro」  
  - [x] `apps/web/src/data/tools-data.ts` 注释改为 React 页  
    - **Surface**: web  
    - **Proof**: 注释可读  
  - [x] `scripts/verify-production-media-storage-local.mjs` 等注释去 astro/vitest 过时描述  
    - **Surface**: scripts  
    - **Proof**: grep scripts 无「项目用 astro」  
  - [x] 保留 `generate-content.mjs` 的 strip 逻辑（防御）  
    - **Surface**: scripts  
    - **Proof**: 文件仍含 strip 函数  
  - [x] `pnpm typecheck`  
    - **Surface**: monorepo  
    - **Proof**: 退出码 0  
- **Exit proof**: apps/packages 内无「请用 Astro 编辑」类指令  
- **Stop condition**: 无  

### Phase 3: 文档噪音降级（可选但推荐）

- **Purpose**: 搜索「astro」不再淹没设计真相。  
- **Entry**: Phase 1 完成。  
- **Phase rules**:
  - 可移 `docs/design/*` 旧稿、`docs/cycles/*` 到 `docs/archive/` 或文首加「历史·基于已删 Astro」  
  - 不删 ADR 历史价值；可加 header  
  - 禁止借机改产品范围  
- **Todos**:
  - [x] 为仍含大量 `.astro` 路径的 `docs/design`、`docs/GOAL-stage1-*` 加退役 header 或迁 archive  
    - **Surface**: docs  
    - **Proof**: 文首可见「非当前栈」  
  - [x] 更新 `docs/architecture-modules.md` 一句：运行入口仅 apps/*  
    - **Surface**: docs  
    - **Proof**: 与 README 一致  
- **Exit proof**: README + CLAUDE + architecture 三处栈描述一致为 React monorepo  
- **Stop condition**: 无  

### Phase 4: 最终验证

- **Purpose**: 证明目标 Outcome 全真。  
- **Entry**: Phase 1 + 2 完成；Phase 3 可未做完但须声明。  
- **Phase rules**:
  - 验证优先于新功能  
- **Todos**:
  - [x] `GET .../languages`：以 tree 为准 `.astro`=0；Linguist 条可能延迟刷新（已记录）  
    - **Surface**: GitHub API  
    - **Proof**: 记录 JSON  
  - [x] `main` tree：`.astro` = 0  
    - **Surface**: git/API  
    - **Proof**: 命令输出空  
  - [x] `pnpm typecheck`；环境允许时 `pnpm accept`  
    - **Surface**: 本地  
    - **Proof**: 退出码 0  
  - [x] 更新 `docs/s1-go-live.md` 一行：默认分支已 React-only、日期  
    - **Surface**: docs  
    - **Proof**: 文件有记录  
- **Exit proof**: Final Validation 表全勾  
- **Stop condition**: 语言条 24h 后仍显示 Astro 且 tree 确有 `.astro` → 回 Phase 1  

---

## Dry-Run Findings

1. **Phase 1 依赖你的合并权**：执行方无法代替你在网页点 Merge 时，Goal 只能停在 Phase 0/2 的 feature 清理。  
2. **Vercel 风险**：若生产仍 `framework: astro` 或 build 旧命令，合并后部署会挂——必须在 Phase 1 前看一眼。  
3. **无环依赖**：0 → 1 → 2/3 → 4；2 可与 1 并行在 feature。  
4. **假完成点**：只推 feature 清注释、不合并 main，对外仍 35% Astro。  
5. **产品对应表壳页**不进本路线，避免目标漂移。  

---

## Final Validation

| # | 检查 | 通过 |
|---|------|------|
| 1 | 默认分支 `.astro` = 0 | |
| 2 | GitHub languages 无实质 Astro 字节 | |
| 3 | apps 依赖无 astro 包 | |
| 4 | 源码无「去 Astro 编辑」误导 | |
| 5 | typecheck +（可选）accept 绿 | |
| 6 | 双入口主路径未回退 | |

---

## First Execution Step

1. **你**：打开 [PR #39](https://github.com/AdgaiWalker/AdgaiWalker/pull/39)，确认可合并；看一眼 Vercel 是否仍绑旧 Astro build。  
2. **合并 PR #39 进 main**（或授权执行方用 API merge）。  
3. 合并后通知执行方：跑 Phase 1 验证 + Phase 2 文案清理 + Phase 4。  

**未合并 main 前**：可先做 Phase 2 文案清理并推到 `feat/dual-entry-tactile-accept`，但 **不得宣称「仓库已不是 Astro」**。
