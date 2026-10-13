---
status: active
type: specification
title: 代码架构图谱 PRD
last_verified: 2026-09-23
ssot: true
applies_to: [web, shared, agent, scripts]
---

# PRD：代码架构图谱（Code Graph · 把代码库当 vault 看）

## 0. 文档信息

| 项 | 内容 |
|---|---|
| 状态 | 活跃 PRD |
| 第一用户 | **站主本人（用 Agent 驱动开发）**，用于日常开发导航与结构监测 |
| 第二用户 | 访客与 LLM（`/architecture` 公开页，索引收录） |
| 权威产物 | 本文档；实现在 `packages/shared/src/code-*.ts`、`scripts/*code-graph*`、`apps/web/src/components/graph/**` |
| 关系 | 与 [`PRD-KNOWLEDGE-GRAPH.md`](./PRD-KNOWLEDGE-GRAPH.md) 是**同一套引擎、两个领域**；后者是观感与交互的权威 |
| 前置决策 | 站主四问：第一用户=agent 开发与监测；节点粒度=与 Obsidian 一模一样（文件级）；真相=纯机器抽取；形态=全做。第二轮：门禁规则源与处置「你自己决定」；访客页 indexable + HTML 兜底；Tags 用文件类型 |

### 0.1 与知识图谱的关系（一句话）

内容图谱画「文章之间谁引用了谁」；代码图谱画「**文件之间谁 import 了谁**」。
节点与边的**语义名沿用**（`note | ghost | tag | attachment` / `link | embed | tag | attachment`），
于是 web 侧的引擎、渲染器、配色、设置面板、检索语法**零改动复用** —— 这是「一模一样」这条要求带来的最大红利。

## 1. 背景与定位

### 1.1 为什么做（不是感觉，是数据）

| 事实 | 数值 |
|---|---|
| 源文件（`apps/*/src`、`packages/*/src`、`scripts`） | **430** |
| 内部 import 语句（静态 + 动态 + 类型位置 + worker 引用） | **1101 条边** |
| 外部包依赖 | 531 条 —— 照 Obsidian「外链不算边」**不画** |
| `index.ts` barrel | 只有 2 个 → 图上不会出现超级枢纽糊成一团 |
| 目录（`path:` 操作符） | **真实存在**（内容图谱没有目录，当初被迫用 hall/type 顶替） |

内容图谱的边是手写 `[[wikilink]]`，稀疏、有 50% 孤岛；**import 是编译器强制的**，
网络天然连通、零遗漏 —— 这才是 Obsidian 那种「vault 长成一张网」的真实形状。

### 1.2 定位

**不问意图，只报事实。** 每条边都来自一条真实存在的 import 语句；
抽取器是单遍编译器语法树遍历，没有任何人工推断，也没有模型补充。

### 1.3 四个面（站主指令：全做）

| 面 | 载体 | 给谁 |
|---|---|---|
| 门禁 | `pnpm verify:architecture`（构建链上） | 机器（CI / 构建） |
| 访客页 | `/architecture`（indexable + HTML 兜底） | 访客与 LLM |
| 站主视图 | admin `/architecture`（noindex 内部面） | 站主 |
| 机器工具 | MCP 四工具 `dependencies` / `dependents` / `impact` / `architecture_health` | agent |

## 2. 本体定义

### 2.1 节点与边（语义名沿用内容图谱）

| 概念 | 本图谱的对应物 | 节点/边 kind |
|---|---|---|
| 笔记 | **源文件**（`.ts`/`.tsx`/`.mts`/`.cts`） | `note` |
| 内链 | **静态 import / export-from / `import type` / 类型位置 `import('x')`** | `link` |
| 内链（异步） | **动态 `import()`**；`new URL('./x', import.meta.url)`（worker / 资源） | `embed` / `link` |
| 附件 | **非代码文件**（css / json，被真实 import） | `attachment` |
| 标签 | **文件类型**（`.ts` / `.tsx` / `.css` / `.json`） | `tag` |
| 幽灵节点 | **解析不到的 import**（路径写错 / 文件被删 / 从 dist 导入） | `ghost` |

节点 id 方案与内容图谱一致：`note:<相对路径>`、`ghost:<原始说明符>`、`tag:<扩展名>`、`attachment:<相对路径>`。

### 2.2 度数口径（与内容图谱同一套）

- `totalDegree`：全类型边度数
- `linkDegree`：真实依赖边（`link` / `embed` / `attachment`），**不含 `tag`** —— 死文件判定的依据
- 节点半径 = `clamp(3√(无向度数+1), 8, 30)`（引擎内既有公式，未改）

`codeDependencyEdges()` 是唯一口径来源，体检与查询共用它 —— 否则「可达」与「谁依赖我」会互相矛盾。

## 3. 功能规格

### 3.1 与内容图谱逐条一致的部分（复用，不重实现）

四组设置（**筛选 / 颜色组 / 外观 / 力度**）、Obsidian 检索语法、局部关系图（深度 / 正反向链接 /
其他节点间的链接）、右键菜单（打开 / 看局部图 / 以它为起点筛选 / 复制）、Animate 生长动画、
hover 高亮、缩放夹取、配色变量 —— 全部走同一份代码，文案逐字沿用官方中文（见 PRD-KNOWLEDGE-GRAPH §0.2）。

### 3.2 领域差异（只有四处，收在 `components/graph/domains.ts`）

| 差异 | 内容图谱 | 代码图谱 |
|---|---|---|
| 标签怎么取 | 笔记标题 / `#标签` / 附件名 | 节点自带的 `label`（文件名去扩展名，重名用相对路径） |
| 点了去哪 | 跳到文章页 | 代码文件没有站内页 → 展开**详情卡**（路径 / 行数 / 依赖谁 / 被谁依赖） |
| 检索文档怎么投影 | slug / 标题 / 正文 / 标签 | `slug` 与 `path` 都是仓库相对路径；`tags` = 文件类型；`props` = app / 行数 / 度数 / created |
| 哪些操作符可用 | 含 `content:` `line:` `block:` 等正文类 | 正文类**不适用**（产物不含文件内容），面板里如实标注 |

### 3.3 代码图谱可用的检索式

```
a b / "a b" / a OR b / -a / (a OR b) c     布尔
file:engine            文件名或路径（slug + 标题）
path:apps/web/src      仓库相对路径
tag:.tsx               文件类型
[app:apps/api]         所属工作区单元
[lines:>500]           行数比较（< 与 >）—— 图上一眼看不出超大文件，检索能
[created:null]         属性存在但为空
/正则/                  JavaScript 风格正则
match-case:x            区分大小写（默认忽略）
```

### 3.4 结构体检：四条硬伤 + 两条风格项

**硬伤**（机器自证，进基线，新增即失败）：

| # | 项 | 判定口径 |
|---|---|---|
| 1 | **环依赖** | Tarjan 强连通分量，成员数 > 1；身份 = 成员排序后拼接（起点无关） |
| 2 | **解析不到的引用** | 说明符解析不到任何仓库文件；身份 = 说明符本身（引入方会变，不属于身份） |
| 3 | **从入口不可达的死文件** | 从真实入口做前向可达（动态导入也算可达），未触达的代码文件 |
| 4 | **反向依赖** | `packages/**` 依赖 `apps/**`（依赖方向越界） |

**风格项**（只告警，不进基线）：**超级枢纽**（真实依赖度数前 10）、**超大文件**（≥500 行；本仓实测 ≥300 有 25 个、≥400 有 13 个、≥500 有 6 个 —— 取 500 才是信号不是噪声）。

**为什么不写人工规则文件**（站主授权我决定）：一份写着「controller 不得导入 adapter」的规则表，
其实是**重述 `docs/ARCHITECTURE.md` 已声明过的同一件事**，会成为第二个真相源。
上面四条的证据全在代码与清单自身，不需要任何人工意图。若日后要拦越层，
路径是「先出报告、拿数据决定」，而不是预设规则。

### 3.5 入口集合（可达性的根）—— 全部来自事实

| 来源 | 说明 |
|---|---|
| `package.json` 脚本 | `tsx scripts/xxx.ts`（路径**相对该包目录**，不是仓库根） |
| `index.html` | `<script src="/src/main.tsx">`（相对该 html 所在目录） |
| 包根配置文件 | `vite.config.ts` / `vitest.config.ts` 的 import 与按名引用（`setupFiles: ['./src/test/setup.ts']`） |
| 测试命名约定 | `src/**/*.test.ts(x)` —— 测试由运行器按名字发现，并非被谁 import |
| 按名引用 | 非测试文件里「像路径且确实存在」的字符串（`tsx scripts/prerender-web.ts` 这类 spawn） |

**不建模这几类，第一份体检报告就会满屏假死文件** —— 这是实测结论，不是推测。

## 4. 数据与产物

### 4.1 产物拆成两份（受众不同 → 物理隔离）

| 产物 | 内容 | 谁读 |
|---|---|---|
| `apps/web/src/generated/codegraph.json` | 只有 `nodes` / `edges` / `seed` / `generatedAt` | web（动态引入）、api、agent |
| `apps/web/src/generated/codegraph-health.json` | 体检明细（entries / cycles / unresolved / unreachable / reverseDependencies / hubs / largeFiles / counts / sourceCommit） | 门禁、api、admin、agent |

**为什么拆**：计划原方案把体检写进同一份产物，而那份产物会被 web 静态引入 →
**体检明细会进公开 bundle**，与「公开面不披露哪里烂」直接冲突。拆成两份后，
`codegraph-health.json` 物理上进不了公开产物。

web 侧**动态 import** 图产物：gzip 约 20KB，静态引入会让全部 27 个页面都背上它，
而只有 `/architecture` 用。引擎 `codegraph-health.json` 类型已在 shared 单一定义（`CodeGraphHealthArtifact`），
scripts / api / agent 三方不各写一遍。

### 4.2 公开面边界（硬规矩）

- **出**：仓库相对路径、依赖边、文件类型、行数、解析不到的引用（它本来就是公开图上的幽灵节点）
- **不出**：文件内容**一个字都不出**（产物不含 body，检索的正文类操作符因此不适用）、
  体检违规明细（环 / 死文件 / 基线）只在门禁输出与 admin 内部面

## 5. 三面落地

### 5.1 访客面 `/architecture`

页头统计 + 图谱（复用组件，高 620）+ **图例**（四类节点 / 三种边型，配色复用 `--graph-*`）+
选中文件详情卡 + **文字版结构**（可折叠：按工作区单元的文件清单、被依赖最多、解析不到的引用、文件类型统计）。

### 5.2 站主面 admin `/architecture`

体检卡片（源文件 / 依赖边 / 四类硬伤计数）+ **基线对账卡片**（已知债务 / 本次新增 / 已还清）+ 四类明细表（新增项标出）+ 风格项表。

### 5.3 机器面 MCP 四工具

| 工具 | 回答 |
|---|---|
| `dependencies(path, depth)` | 它**导入了谁**（沿 import 方向展开） |
| `dependents(path, depth)` | 它**被谁导入**（沿反向展开）—— 与上一条是相反的问题 |
| `impact(path, depth)` | 改动影响面：直接 + 间接依赖者，并按工作区单元归堆 |
| `architecture_health()` | 体检摘要（四项硬伤 + 风格项计数） |

指称解析接受三种写法：完整相对路径、唯一后缀（`kernel.module.ts`）、节点 id。
**后缀命中多个时报 ambiguous 并列出候选，绝不猜** —— 猜错等于回答了另一个文件的问题。

## 6. 门禁策略（分等级 + 基线棘轮）

- **硬伤**计入 `scripts/architecture-baseline.json`；**新增即失败**，要靠 `pnpm verify:architecture --update-baseline` 显式承认
- **风格项**只告警，不进基线（435 文件的老库首日必然一堆，记进基线只会掩盖信号）
- 门禁**重新抽取**而不是读 `codegraph-health.json` —— 读产物的话，产物过期就会静默放行
- 对账口径（谁和谁是同一条债务）在 shared 的 `diffCodeDebt`，门禁与 admin **共用一份**：两边不可能说出不同的结论
- 基线是「**已知债务快照**」，不是「这些东西没问题」，也不是架构真相 —— 它不声明什么是对的，只记下今天已经存在的

## 7. 与现有系统约束的接口

| 约束 | 处置 |
|---|---|
| **SSOT 宪法**（`docs/ARCHITECTURE.md` 是唯一权威架构图面） | 机器抽取的图**不自称架构权威**，只作结构事实与体检；本次在 ARCHITECTURE.md 里增补「代码图」小节时只**增补不夺权** |
| web 运行时禁止 fs | 产物在 gen 期落盘，web 只读 `generated/*.json` |
| `verify:geo` 硬门禁 | `/architecture` 登记进 `INDEXABLE_STATIC_ROUTES`（sitemap 与路由表须严格相等）；页面有 canonical / robots / og / twitter / JSON-LD / 静态正文；预渲染 HTML 无 `[[ ]]` |
| agent `aiUsePolicy` fail-closed | 代码图谱不涉及内容权限（它描述代码，不是内容），但工具输出沿用既有 fail-closed 形态：**查不到回 error 而不是抛错** |
| 动效规范 | 生长动画可中断、减弱动效保留淡入、按压反馈复用站点 token |

## 8. 偏离清单（诚实记账，不许静默省略）

| # | 偏离 | 理由 |
|---|---|---|
| D1 | **admin 不做可拖拽图谱** | 图谱引擎在 `apps/web`，两个应用之间没有共享 UI 包；照搬一份就是**第二份引擎**（SSOT 违反）。要在 admin 也画图，正确路径是把引擎提成 `packages/graph-engine` —— 那是独立决定，不在本 PRD 范围。admin 的职责（监测）由卡片与清单完整承担 |
| D2 | 产物拆两份文件 | 见 §4.1：同份产物会让体检明细进公开 bundle |
| D3 | 排除 `.d.ts` | 环境声明按定义无人 import，不排除会成批变假死文件 |
| D4 | 包根配置文件**不进图面**（只作入口事实来源） | 否则「vault 边界」无限扩张（tsconfig / eslint / prisma / public 各算不算？）。节点范围钉死在三类源码目录 |
| D5 | 生成产物（`generated/*.json`）保留为 attachment 节点 | 它们被真实 import，可视化「单一真相源的消费者」有价值 |
| D6 | 解析目标池 = 仓库内文件（排除 `dist` 等构建产物与依赖） | 于是 `../packages/shared/dist/mvp-acceptance.js` 被**如实**报为解析不到（现存量 1 条，已进基线）：从产物目录导入是真实的脆弱点，不该被静默原谅 |
| D7 | 生长动画**总时长优先**（大规模时不再守 30ms 下限） | 435 个节点按 30ms 是 **13 秒的等待**，按 7ms 是一道 3.3 秒长起来的波。规范要求总时长有上界，故总预算成为硬预算 |
| D8 | 影响面列表上限 60 条 + **如实回传总数** `transitiveTotal` | 枢纽文件会波及 184 个文件，全量塞给 agent 只会淹掉答案；截断但绝不静默丢信息（总数与 byApp 仍全量算） |
| D9 | 正文类检索式（`content:`/`line:`/`block:`/`section:`/`task*`）在代码图谱不适用 | 产物不含文件正文（公开面边界）。面板的检索式帮助里**如实标注**，不假装可用 |
| D10 | 文件类型统计含附件（css / json） | 与图上的类型标签节点同口径；只数代码文件会让页面说「2 种类型」而图上明明挂着 4 个标签 |
| D11 | 「按名引用」只从**非测试文件**取 | 测试里的路径字符串多是夹具，不是执行依据；否则入口清单会被夹具灌满 |
| D12 | 真实浏览器**像素截图未能取得** | 环境侧 `Page.captureScreenshot` 持续超时（对照页 `/graph` 同样失败，非本页缺陷）。改用 DOM 尺寸、计算样式、交互返回值与零错误作为证据 |

## 9. 验收标准（可证）

| # | 标准 | 证据 |
|---|---|---|
| A1 | `pnpm code:gen` 产出两份产物，且**幂等**（二次运行不改文件） | 实测两次运行均「未变，保留原文件」 |
| A2 | 产物形状正确且公开面干净 | `codegraph.json` 顶层只有 `generatedAt/seed/nodes/edges`；体检字段只出现在 `codegraph-health.json` |
| A3 | `pnpm verify:architecture` 在无新增时通过、有新增时**非零退出并点名** | 实测：造一个带坏引用的临时文件 → exit 1 且两条分类都被点出；删除后恢复通过 |
| A4 | 基线棘轮**不误报** | `code-debt.test.ts`：成员换序、引入方增减都不算新增；不同分类同名互不干扰 |
| A5 | `/architecture` 通过 `verify:geo`（canonical/robots/og/twitter/JSON-LD/静态正文/sitemap 严格相等） | `pnpm verify:geo` 通过；静态 HTML 含全部要件 |
| A6 | 预渲染 HTML 无未解析 `[[ ]]` | 实测 `grep -c '[[' dist/architecture/index.html` = 0 |
| A7 | 真实浏览器：0 控制台错误、画布宽 ≥600、配色跟随主题变量 | 实测：`/architecture` 与 `/graph` 均 0 错误；画布 795×620；`--graph-text` = `#111` |
| A8 | 点节点出详情卡，内容是真实事实 | 实测：`IntakeComposer.tsx · 62 行 · 依赖 0 个 · 被 1 个依赖` |
| A9 | 生长动画总时长在预算内 | 实测按钮从「播放动画」→「停止动画」→ 复位共 **3.65s**（重标定前约 13s） |
| A10 | MCP 四工具在真实产物上可用，且查不到时回 error | 实测端到端：9 个工具（5 旧 + 4 新）注册成功；`impact(graph.ts)` 返回 184 条传递依赖并如实截断 |
| A11 | 内容图谱**未被接缝重构改坏** | 既有 187 项 web 测试全绿；`/graph` 页头数据与重构前一致（28 篇 / 19 条互引 / 14 孤岛 / 61 标签 / 2 坏链） |
| A12 | 全部测试与门禁 | typecheck 0 错误；shared 183 / api 158 / agent 25 / web 212；`verify:geo`、`verify:architecture` 通过 |

## 10. 排期

一次性交付（本次）。后续若要扩展，优先级建议：

1. 把图谱引擎提成 `packages/graph-engine`，admin 也能画图（D1 的正解）
2. 若门禁稳定一段时间且误报为零，可考虑把风格项也纳入棘轮
3. 若「越层」真的成了事故来源，再用数据驱动地定规则（而不是现在预设）

## 11. 变更记录

| 版本 | 日期 | 变更 |
|---|---|---|
| v1.0 | 2026-09-15 | 立项。四问定调（第一用户=agent 开发与监测 / 文件级节点 / 纯机器抽取 / 四形态全做）。确立：语义名沿用内容图谱以零改动复用引擎；四条机器自证硬伤 + 两条风格项；基线棘轮（新增即失败）；产物拆两份以隔离公开面；门禁不写人工规则文件（理由是 SSOT）。落地实测：435 文件 / 1102 边 / 1 坏引用 / 7 不可达 / 0 环 / 0 反向依赖；MCP 四工具端到端可用；生长动画由 13s 重标定为 3.3s；视图层接缝重构后**内容图谱既有 187 项测试全部保持通过**（web 现共 212 项）。偏离 D1–D12 全部记账 |
| v1.1 | 2026-09-15 | **门禁首日还债**（站主指令「删除」）。据体检结果删掉 5 个真死代码（逐个做过全仓引用核实）：`HeroSearchBar.tsx`（已被 `XiaoyingHome` 取代的旧首页组件）、`useHomeCanvas.ts`、`packages/shared/src/content-load.ts`（api 已自建 `fs-site-content-index`）、`scripts/lib/env.ts`、`apps/api/src/database/database.module.ts`（自身注释即写「Database DI 已并入 KernelModule」，唯一提及者是基线文件自身）。**门禁把这次删除报为「已还清」而不是报错** —— 棘轮「只惩罚新增、不惩罚减少」的设计在第一次真实还债时就验证了；基线由 8 条收敛到 **3 条**（1 坏引用 + 2 手动脚本）。同时删掉 146 行死 CSS（`.hero-search*`，含其媒体查询）：先用「代码里零引用 + DOM 里 `[class*="hero-search"]` 命中 0 个元素」双重确证它不是在看样式，再删。另清掉 `packages/shared/dist` 里 `content-load.*` 与更早那次 `graph-layout.*` 删除留下的陈旧产物：否则 `@walker/shared/content-load` 这类已不存在的模块在本地**仍能解析**（本地绿、干净构建崩）。规模随之更新为 430 文件 / 1101 边 / 2 不可达。残留未动：`output/xiaoying/homepage-design-v1/` 那份设计文档把 `HeroSearchBar.tsx` 列为「首页推荐词」来源，现成悬空引用 —— 它是**版本化的时点记录**（`-v1`），改写会篡改记录，故保留并在此记账 |
