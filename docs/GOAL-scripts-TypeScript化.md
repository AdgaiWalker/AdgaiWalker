# Goal Document: scripts TypeScript 化（语言条去 JS 水）

> **状态**：已完成（2026-07-21）  
> **一句话**：把仓库内**产品构建与验收脚本**从 `.mjs/.cjs` 全部迁成 TypeScript，**不**把 CSS/HTML 硬改成 TS，**不管** Python / 大模型 skill。  
> **关联**：语言占比清点（JS≈scripts；CSS=walker/admin；HTML=Vite 壳）

---

## Go / No-Go

- **Judgment**: **Go**
- **Reason**: 目标可验证；JS 体积来源已钉死为 `scripts/*`；无产品决策阻塞；不改运行时业务状态机。可直接执行。

---

## Target Outcome

当本 Goal 完成时：

1. **`scripts/` 下无业务用 `.mjs` / `.cjs`**（产品构建、生成、验收脚本均为 `.ts`，用 `tsx` 执行）。  
2. **根 `package.json` 脚本全部指向 `.ts`**，且 `pnpm content:gen`、`pnpm build:web` 相关链路、`pnpm accept:dual-entry` 可跑通。  
3. **路径不写死散落**：`content/log`、仓库根、`generated` 等由 `scripts/lib/paths.ts`（或等价单一模块）提供。  
4. **死脚本清理**：确认无用的 `build-mcp.cjs`、过时 workflow 清单等删除或迁 `docs/archive`，不迁 TS 充数。  
5. **CSS / HTML / Python 保持原状**（不强制改写）。  
6. **双入口与 API 行为不回退**（typecheck + accept 或至少 content:gen + typecheck）。

**不成功** = 只改扩展名仍双份保留 mjs；或为 GitHub 好看把 CSS 改成 CSS-in-JS。

---

## Goal Definition

- **Type**: technical / quality（工程纯度与可维护性）  
- **Boundary**:
  - **含**：`scripts/**` 迁 TS；`package.json` 脚本入口；`scripts/lib/*` 路径/共用工具；删除死代码；必要时根 `tsconfig` 覆盖 scripts  
  - **Non-goals**:
    - CSS → TypeScript / CSS-in-JS  
    - 消灭 Vite `index.html`  
    - Python / `.agents/skills` / 大模型接入  
    - 产品壳（登录、Giscus、阅读增强）  
    - 仅为 Linguist 作假的 vendored 全库（可选、非必须）  
  - **Deferred**:
    - `.gitattributes` 把 `.agents/**` 标 vendored（可选 Phase）  
    - accept-deep 与 verify-production-* 的深度类型建模  
- **Verification rule**: 命令通过 + 文件树证明  
- **Evidence source**: `find scripts`、`pnpm content:gen`、`pnpm typecheck`、`pnpm accept:dual-entry`（环境齐时）  
- **Pass criteria**:
  - [x] `find scripts -name '*.mjs' -o -name '*.cjs'` 结果为空（或仅文档说明的例外 0 个）  
  - [x] `package.json` 无指向已删 `.mjs` 的 script  
  - [x] `pnpm content:gen` 写出 content.json  
  - [x] `pnpm typecheck` 退出 0  
  - [x] 环境允许时 `pnpm accept:dual-entry` 退出 0  
- **Confidence note**: 语言条 JS% 会随 Linguist 刷新下降；以文件树与命令为准，不以 GitHub 条即时数字为唯一证明。  
- **Judgment owner**: 命令/系统（typecheck、accept）；执行方汇报  

---

## Current State

| 面 | 事实 |
|----|------|
| 语言条（约） | TS 59% · JS 28% · CSS 9% · PY 4% · HTML 0.2% |
| JS 来源 | **几乎全是** `scripts/*.mjs`（约 15 个）+ `build-mcp.cjs` |
| CSS | `walker.css` + `admin/styles.css`（应保留） |
| HTML | web/admin 的 Vite `index.html`（应保留） |
| 运行栈 | React monorepo 已在 `main`；无 Astro |
| 风险 | 改 script 入口漏改一处 → CI/本地构建断；accept 依赖 puppeteer 路径 |

### 待迁 / 待删清单（代码为真）

| 文件 | 处置 |
|------|------|
| `generate-content.mjs` | **迁 TS**（核心） |
| `build-web.mjs` | **迁 TS** |
| `prerender-web.mjs` | **迁 TS** |
| `accept-dual-entry.mjs` / `accept-deep.mjs` | **迁 TS** |
| `verify-stage1.mjs` | **迁 TS** |
| `check-content-fields.mjs` / `check-production-readiness.mjs` | **迁 TS** 或与 verify 合并 |
| `verify-production-*.mjs`（4） | **迁 TS** 或标废弃后删（与现 monorepo 相关再留） |
| `load-local-env.mjs` | **迁 TS** |
| `workflow-p0-launch-hardening.mjs` | **删或 archive**（旧 Astro 上线流，不迁） |
| `build-mcp.cjs` | **删**（旧 MCP 打包，src/mcp 已随 Astro 移除） |

---

## Plan Rewrite Notes

相对「语言改 TS 想法」对话：

| Existing item | Decision | Reason |
|---------------|----------|--------|
| Phase A：scripts → TS | **keep 为本 Goal 全部** | 唯一高杠杆 |
| CSS/HTML 改 TS | **remove** | 反模式；非目标 |
| Python 处理 | **remove** | 用户明确不管 |
| 大模型接入 | **remove** | 用户明确不管 |
| gitattributes vendored .agents | **defer 可选** | 只改统计，非必须 |
| 双份 mjs+ts 兼容期 | **remove** | 规则：无兼容垫片 |

---

## Drift Diagnosis

- **Goal drift**: 借机写登录/产品壳  
- **Phase drift**: 按「先所有 verify 完美类型」拖死主路径 content:gen  
- **Validation drift**: 只看 GitHub 语言条百分比  
- **Compatibility drift**: 保留 `.mjs` 再 export 到 ts  
- **Cleanup drift**: 大改 walker.css 架构  

---

## Priority Rationale

1. **先 paths + generate-content + package.json** — 构建入口不断  
2. **再 build-web / prerender** — 生产构建链  
3. **再 accept / verify-stage1** — 验收  
4. **再删死脚本 + 剩余 verify** — 减 JS 字节与噪音  
5. **不把 CSS 当目标**  

---

## Assumptions and Open Decisions

| Item | Status | Impact | Owner / Next step |
|------|--------|--------|-------------------|
| 用 **tsx** 跑 scripts（api 已用） | **assumed** | 根 devDependency 可加 tsx | 执行时 `pnpm add -Dw tsx` 若缺 |
| `build-mcp.cjs` 可删 | **assumed** | MCP 未在 monorepo | 若你要恢复 MCP 另 Goal |
| `workflow-p0-*.mjs` 可删/archive | **assumed** | 旧上线清单 | 删优于迁 |
| verify-production-* 仍要对 monorepo 有效 | **assumed** | 过时则删 | 读内容后决定 keep 迁或删 |
| accept 继续依赖本机 puppeteer 路径 | **assumed** | 无 puppeteer 时 accept 浏览器段 skip 或 fail | 保持现行为，迁 TS 不改契约 |

---

## Phases

### Phase 0: 冻结清单与入口表

- **Purpose**: 文件处置表与 package.json script 对照表写清，防漏改。  
- **Entry**: 本 Goal 被接受或开工令。  
- **Phase rules**: 只改本 Goal 文档 / 清单；不改 scripts 行为。  
- **Todos**:
  - [x] 清点 scripts 与语言占比来源  
    - **Surface**: 本文件  
    - **Proof**: 上表  
    - **Depends on**: none  
  - [x] 列出 `package.json` 每个 script → 目标 `.ts` 路径  
    - **Surface**: Goal 附录或 PR 说明  
    - **Proof**: 表完整  
    - **Depends on**: none  
- **Exit proof**: 处置表无「未定」项  
- **Stop condition**: 发现某 script 被 CI/文档硬编码且无法改 → 记下后仍迁并改引用  

### Phase 1: 基础设施（paths + tsx + tsconfig）

- **Purpose**: 所有后续脚本可统一用 TS 跑。  
- **Entry**: Phase 0 退出。  
- **Phase rules**:
  - 允许：加 `tsx`、`scripts/tsconfig.json` 或根配置 include scripts  
  - 禁止：业务应用代码大改  
  - 无 mjs 双轨  
- **Todos**:
  - [x] 根或 scripts 可解析的 TS 配置（module nodenext / bundler，类型严格适度）  
    - **Surface**: `scripts/tsconfig.json` 或根 tsconfig  
    - **Proof**: `tsx scripts/...` 能启动  
  - [x] 新增 `scripts/lib/paths.ts`：`repoRoot`、`contentLogDir`、`webGenerated` 等  
    - **Surface**: scripts/lib  
    - **Proof**: 被 generate-content 引用  
  - [x] 确保 `tsx` 在 workspace 可用  
    - **Surface**: package.json  
    - **Proof**: `pnpm exec tsx --version`  
- **Exit proof**: 空脚本或 paths 自检可 `tsx` 运行  
- **Stop condition**: 无  

### Phase 2: 构建主链迁 TS（最高价值）

- **Purpose**: 日常开发/构建不依赖 mjs。  
- **Entry**: Phase 1 退出。  
- **Phase rules**:
  - 直接改名/重写为 `.ts`，删旧 `.mjs`  
  - 行为与现网一致（生成条数、输出路径）  
- **Todos**:
  - [x] `generate-content.mjs` → `.ts`，保留 strip 旧组件 import 逻辑  
    - **Surface**: scripts  
    - **Proof**: `pnpm content:gen` 写出 json，条数合理  
  - [x] `build-web.mjs` → `.ts`  
    - **Surface**: scripts + package.json  
    - **Proof**: `pnpm build:web` 或等价步骤不报「找不到 mjs」  
  - [x] `prerender-web.mjs` → `.ts`  
    - **Surface**: scripts  
    - **Proof**: 被 build-web 调用成功  
  - [x] `load-local-env.mjs` → `scripts/lib/env.ts`  
    - **Surface**: scripts  
    - **Proof**: 引用方更新  
- **Exit proof**: content:gen + typecheck 绿  
- **Stop condition**: prerender 依赖浏览器 API 类型错误 → 补最小 DOM 类型或 `//` 边界，禁止 any 泛滥  

### Phase 3: 验收与检查脚本迁 TS

- **Purpose**: accept / verify / check 与主链同语言。  
- **Entry**: Phase 2 退出。  
- **Phase rules**: 迁 TS，不改变验收断言语义。  
- **Todos**:
  - [x] `accept-dual-entry` / `accept-deep` → `.ts`，更新 package.json  
    - **Surface**: scripts + package.json  
    - **Proof**: `pnpm accept:dual-entry`（服务齐时）  
  - [x] `verify-stage1`/`check-content-fields` → `.ts`；`check-production-readiness` 删（Redis 过时）  
    - **Surface**: scripts  
    - **Proof**: 对应 pnpm script 可跑或已从 package.json 移除  
  - [x] `verify-production-*.mjs`：删除（Upstash/Blob 与 monorepo Postgres 无关）  
    - **Surface**: scripts  
    - **Proof**: 无悬空引用  
- **Exit proof**: package.json scripts 无 `.mjs`  
- **Stop condition**: production verify 与 monorepo 完全无关 → 删除而非迁  

### Phase 4: 死代码清除与收尾

- **Purpose**: 去掉 JS 字节与历史噪音。  
- **Entry**: Phase 3 主链稳定。  
- **Phase rules**: 删除优先于迁移。  
- **Todos**:
  - [x] 删除 `scripts/build-mcp.cjs`（及 package 中引用若有）  
    - **Surface**: scripts / package.json  
    - **Proof**: 无引用  
  - [x] 删除或移至 `docs/archive/`：`workflow-p0-launch-hardening.mjs`  
    - **Surface**: scripts / docs  
    - **Proof**: 不在 scripts 执行路径  
  - [x] `find scripts \( -name '*.mjs' -o -name '*.cjs' \)` 为空  
    - **Surface**: 仓库  
    - **Proof**: 命令输出空  
  - [x] `pnpm typecheck`；可选 `pnpm accept:dual-entry`  
    - **Surface**: monorepo  
    - **Proof**: 退出 0  
- **Exit proof**: Final Validation 表  
- **Stop condition**: 无  

---

## Dry-Run Findings

1. **无环依赖**：0 → 1 → 2 → 3 → 4。  
2. **假完成**：只把文件改后缀却仍 `node script.mjs`。  
3. **accept 依赖三端服务**：Phase 3 浏览器段可在 API/web/admin 未起时先保证 typecheck + content:gen，再补 accept。  
4. **verify-production-*** 可能整段过时：应删优先，避免无效 TS 债。  
5. **CSS/HTML 不进阶段**，防止目标漂移。  

---

## Final Validation

| # | 检查 | 通过 |
|---|------|------|
| 1 | scripts 无 mjs/cjs | ✓ |
| 2 | package.json 脚本均 `.ts` + tsx | ✓ |
| 3 | content:gen 成功 | ✓ |
| 4 | typecheck 0 | ✓ |
| 5 | accept:dual-entry（环境齐） | ✓ |
| 6 | 未引入 CSS-in-JS / 假兼容 mjs | ✓ |

---

## First Execution Step

1. 执行方从 **Phase 1**：`scripts/lib/paths.ts` + tsx/tsconfig。  
2. 立即 **Phase 2**：`generate-content.ts` 替换 mjs 并改 `package.json` 的 `content:gen`。  
3. 每步跑 `pnpm content:gen` 与 `pnpm typecheck`。  

**说「按此 Goal 开工」即可开始写代码。**

---

## 附录：package.json 脚本对照（Phase 0 填全）

| 现 script | 目标（已落地） |
|-----------|----------------|
| `content:gen` | `tsx scripts/generate-content.ts` |
| `build:web` | `tsx scripts/build-web.ts` |
| `accept:dual-entry` / `accept:deep` / `accept` | `tsx scripts/accept-*.ts` |
| `verify:stage1` | `tsx scripts/verify-stage1.ts` |
| `check:content-fields` | `tsx scripts/check-content-fields.ts` |
| `typecheck` | 含 `tsc -p scripts/tsconfig.json` |
| 删除 | build-mcp.cjs、workflow-p0、verify-production-*×4、check-production-readiness |

### 核心模块（脚本）

| 模块 | 一句话职责 |
|------|-----------|
| `lib/paths` | 仓库路径 SSOT |
| `lib/run` | 子进程执行 |
| `lib/env` | 本地 env / ADMIN token（不打印密钥） |
| `lib/report` | 验收 pass/fail 与落盘 |
| `lib/puppeteer-launch` | 浏览器启动抽象 |
| `generate-content` | content/log → content.json |
| `build-web` | gen → vite → prerender → pagefind |
| `prerender-web` | dist 可索引 HTML |
| `accept-*` | 双入口/深度验收 |
| `verify-stage1` | Stage1 工程门禁 |

**关系**：package.json **触发** generate/build/accept；build-web **调用** content:gen + prerender；accept **依赖** env/report/puppeteer 接口；generate **依赖** paths，**不**直连业务 app 运行时。
