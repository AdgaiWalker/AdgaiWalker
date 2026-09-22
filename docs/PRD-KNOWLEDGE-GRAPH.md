# PRD：知识图谱（Knowledge Graph · Obsidian Graph View 对齐版）

## 0. 文档信息

| 字段 | 内容 |
|---|---|
| 产品名称 | Walker 知识图谱（Knowledge Graph） |
| 文档类型 | 产品需求与架构契约（PRD v1.0） |
| 版本 | **v1.0（Obsidian Graph View 逐条对齐版）** |
| 日期 | 2026-09-14 |
| 核心用户 | 访客（探索内容结构）· 站主（内容结构体检）· 外部 AI（经 MCP 导航引用） |
| 产品形态 | Web 页面 `/graph`（全局图）+ 文章页局部图 + Admin 结构体检清单 + `graph.json` 产物 + MCP `neighbors` 工具 |
| 权威级别 | 规划与设计权威；遵守 `PLAN.md` 宪法/冻结条款、`docs/PRODUCT.md` 边界、`docs/ARCHITECTURE.md` 拓扑、`AGENTS.md` 工程规范 |
| 对齐基准 | ① 官方帮助文档 `en/Plugins/Graph view.md` + `en/Plugins/Search.md`；② **应用源码真值**：`/Applications/Obsidian.app/Contents/Resources/obsidian.asar` → `app.js` / `app.css`（图谱设置面板 `wQ`/`PJ`/`IJ`、渲染器 `AQ`、节点 `xQ`、连线 `TQ`）；③ `github.com/atMiaobo/Obsidian-graph` 的 `sim-original.js` / `graph-reconstructed.js`（该仓库无 LICENSE，本站只按规格重写、不复制代码）。**三者冲突时以实现为准** |

> **本 PRD 的第一原则：照抄 Obsidian 的图谱本体与交互，不发明。** 凡与本站工程约束（GEO 门禁、静态预渲染、只读产物、aiUsePolicy）冲突之处，一律**改造实现方式**而非**裁剪功能**；无法对应的功能在 §8「偏离清单」逐条记账，不许静默省略。

### 0.1 真值层级与「应用 vs 首页」

三份来源的权威性：**应用 `obsidian.asar` > 原始 worker `sim-original.js` > 帮助文档**。冲突时以上位为准。

最强证据：应用渲染器的构造函数里是 `new Worker("/sim.js", { name: "Graph Worker" })` ——
`sim-original.js` **就是应用自用的图谱 worker**，所以物理常数是应用级真值，不是首页特例。

首页（`graph-reconstructed.js`）与应用**共享同一引擎**，但首页是固定设置的定制版本。两者实测差异：

| 项 | 应用（app.js） | 官网首页 | 本站取 |
|---|---|---|---|
| `textFadeMultiplier` | **0** | -2 | 应用 |
| `lineSizeMultiplier` | **1** | 2 | 应用 |
| `nodeSizeMultiplier` | 1 | 1 | 一致 |
| `showTags` | **false** | 无此概念 | 应用 |
| 斥力 | UI **10**，引擎 `10³=1000` | 引擎硬编码 1000 | 应用（两层都照抄） |
| 缩放夹取 | **`[1/128, 8]`** | `[0.25, 1]` | 应用 |
| 边透明度 | `lerp(α, 1 或 .2)` | `× .34 × max(.45, …)` | 应用 |
| 配色 | **按类型语义化（11 键）** | 单一白 + 高亮紫 | 应用 |

### 0.2 面板文案照抄官方中文（v1.3）

**不自译**。站主指令是「直接给我抄」，而文案属于可验收的对照面。来源：`obsidian.asar` → `i18n/zh.txt`（69022 字节），行号可复核。
唯一来源代码：`apps/web/src/components/graph/obsidian/labels.ts`。

| 位置 | 官方中文（行号） | v1.2 曾用 |
|---|---|---|
| 面板标题 | 关系图谱（1226） | 设置 |
| 小节一 | **筛选**（1232） | 过滤器 |
| ├ 输入框 | 搜索文件…（1233） | 搜索 |
| ├ 开关 | 标签（1243）· 附件（1245） | 同 |
| ├ 开关 | **仅显示已创建的笔记**（1246） | 只显示已存在的文件 |
| └ 开关 | **孤立文件**（1248） | 孤立笔记 |
| 局部关系图 | 深度（1234）· **其他节点间的链接**（1236）· **正向链接**（1240）· **反向链接**（1239） | 深度 / 出链 / 反向链接 |
| 小节二 | **颜色组**（1262）· 请输入检索式…（1264）· 删除组（1265）· 新建颜色组（1266） | 分组 |
| 小节三 | **外观**（1250）· 箭头（1251）· **文本透明度**（1253）· 节点大小（1254）· 连线粗细（1255） | 显示 / 文字淡出阈值 |
| 小节四 | **力度**（1256，注意不是「力量」） | 力 |
| ├ | **图谱向心力**（1257） | 中心力 |
| ├ | **节点间的排斥力**（1260） | 斥力 |
| ├ | **相连节点间的吸引力**（1258） | 链接力 |
| └ | **连线长度**（1259） | 链接距离 |
| 按钮 | 恢复默认设置（542）· 播放动画（1270）· 打开局部关系图（1229） | — |

**两条官方提示语同时是行为规格**：

- 箭头（1252）：「**放大后**，显示链接的箭头」——印证 `arrowAlpha = c × clamp(2(scale−0.3), 0, 1)`（缩放 ≤ 0.3 时不可见）。
- 颜色组（1267）：「**点击可更改颜色** · 拖动可对颜色组排序」——即取色器 + 拖拽排序。v1.2 曾据 `app.css` 的 `.color-fill-1..6` 推断成「固定 6 色槽」，**属过度推论**，v1.3 依官方文案改回取色器（那 6 个槽只是默认主题给出的初值）。

---

## 1. 背景与定位

### 1.1 为什么现在做（数据缺口，不是感觉）

`PLAN.md` §0 的北极星是「判断 × 真实需要 = 一次相遇」，心脏是循环。而循环的产出（`content/log`，29 篇）**在结构上从未被看见过**：

| 事实（2026-09-14 · 由 `graph.json` 产物实测，非估算） | 数值 |
|---|---|
| 已发布内容条目（note 节点） | **28** |
| 正文内部链接（唯一符合 Obsidian 语义的边） | **19 条有向边** |
| 被正文内链触及的真实文章 | **14 / 28** |
| 有入链的笔记 / 最大入链数 | **8 / 4**（最高：`ideas-beyond-time`） |
| **孤岛（无任何正文内链）** | **14 / 28 = 50%** |
| 标签节点 | **61**（其中 **42 个只被引用 1 次**） |
| 未解析链接目标（幽灵节点） | 2（`affordable-ai-community`、`nl-programming`） |
| 主题线覆盖 | 24 / 28（11 条线，是「链」不是「网」） |
| 附件节点（零引用孤岛） | 2 |
| `created` 覆盖（Git 首次出现时间） | 28 / 28 |

两个结论驱动立项：

1. **站上已有 14 篇孤岛与 2 个坏链，且没有任何界面能看见它们。** 坏链当前被 `expandWikiLinks` 静默降级为纯文本（`design-for-people.md` 里「自然语言编程心法」的链接其实是失效的），没人发现。
2. **产品叙事已经承诺了这张图。** `future-already-here.md`：「互联，通过**点子互相连接**」。图谱是这个承诺的兑现，不是新增方向。

### 1.2 定位

- **不是**新内容入口、**不是**推荐算法、**不是**向量检索（PLAN §5 明确不做向量检索）。
- **是**内容结构可视化 + 结构诊断 + 机器可导航层。**图的数据 = 内容自身的链接结构，零推断、零模型参与。**
- 对齐 Obsidian 的自我定位：全局图是**诊断工具**（找孤岛与枢纽），局部图是**探索工具**（看当前笔记的上下文）。

### 1.3 三个面（站主指令：都要）

| 面 | 形态 | 理由 |
|---|---|---|
| 访客 | `/graph` 全局图（四组设置全量）+ 文章页局部图（Depth 1–5） | 局部图是日常有用的那个；全局图用于诊断 |
| 站主 | **结构体检清单**（孤岛/坏链/单向链接）+ 复用同一张全局图 | 图给人「看形状」，清单给人「动手」；同一份数据两种视图 |
| 机器 | `graph.json` 产物 + MCP 工具 `neighbors(slug, depth)` | 模型用图做导航与引用扩展，可视化只是顺便 |

**架构口径（关键）：这三个面不是三张图，而是「一份图数据 × 三种消费方式」。** 符合 PLAN §1 宪法 1（真相源分工）与三层中心规则（机器间中心：一盒一份真相源）。

---

## 2. 本体定义（照抄 Obsidian）

### 2.1 节点与边

| Obsidian 原文 | 本站对应 |
|---|---|
| "Circles represent notes, or _nodes_." | 圆圈 = 内容条目（`content/log/*.md`，仅公开条目） |
| "Lines represent [[Internal links]] between two nodes." | 线 = 正文内部链接 |
| "The more nodes that reference a given node, the bigger it gets." | **节点半径 = `clamp(sqrt(weight+1)*3, 8, 30) × 节点大小乘子`**，其中 `weight = |forward ∪ reverse|`（**无向邻居数**）。⚠️ 帮助文档措辞（"reference"）与实践代码不符：`graph-reconstructed.js` 的 `weight` 取 `relatedIds(n)`，即出链∪入链的并集大小。**以实现为准**。 |

**边的确切集合（照抄 Obsidian 语义）**：

| 边类型 | 语法 | 本站处置 |
|---|---|---|
| 内部链接 | `[[slug]]` | ✅ 边 |
| 带别名 | `[[slug\|label]]` | ✅ 边（label 仅影响正文渲染） |
| 标题锚点 | `[[slug#heading]]` | ⚠️ 解析器当前不支持锚点 → 剥掉 `#heading` 后按整篇建边（见 §8-D3） |
| 块锚点 | `[[slug^block]]` | ⚠️ 同上，剥掉 `^block` 后按整篇建边（见 §8-D3） |
| 嵌入 | `![[slug]]` | ❌ 本站无嵌入语法；若正文出现 `![[` 按普通内链处理（见 §8-D4） |
| Markdown 库内链接 | `[text](note.md)` | ⚠️ 本站站内链接写的是**路由**（`/tools/resources`），按 Obsidian 语义**外部/非笔记目标不算边**。仅当 href 形如 `/<browse>/<slug>` 或 `<slug>.md` 且目标命中公开 slug 时计边 |
| 外链 | `[text](https://…)` | ❌ 不是边（与 Obsidian 一致） |

**明确不画的边（照抄的必然结果，必须知情接受）**：

- `related:` frontmatter —— **Obsidian 没有这个边**，站主指令为「严格照抄」，故 **不画**。它是本站策展层，由文章页「相关」块继续承载。
- `series` / `seriesOrder` —— 同上，不画（它是顺序线，Obsidian 里等价于文件夹，不产生边）。
- `previousVersion` —— 同上，不画。
- `tags` —— **不是边，是节点**（见 2.2）。

> **知情声明**：以上口径的代价是 §1.1 的 62% 孤岛会如实呈现。**这是本 PRD 明知且接受的结果**——图的诊断价值正来自它。孤岛不是缺陷，是第一批体检产物。

### 2.2 节点类型（照抄 Obsidian 的四类）

| 类型 | Obsidian | 本站 | 默认可见 |
|---|---|---|---|
| note | 库内笔记 | 公开内容条目（29） | 是 |
| ghost（未解析） | "a note doesn't need to exist to link to it" | 被链接但无对应条目的 slug（当前 2 个） | 是（受 `Existing files only` 控制） |
| tag | Tags 过滤项 | frontmatter `tags`（30 个去重标签） | **是（照抄 Obsidian 默认开）** |
| attachment | Attachments 过滤项 | `content/log/*.png`、`*.jpg` 等非 md 文件 | **否（照抄 Obsidian 默认关）** |

> **已知代价（照抄 Obsidian 默认值的后果，记录在案）**：本站 61 个标签节点 **是笔记节点（28）的两倍多**，且 42 个标签只被引用 1 次（degree-1 叶子）。开启 Tags 后画布上标签节点占多数。这不是 bug，是「照抄默认值」的必然结果；站主可像在 Obsidian 里一样在 Filters 面板关掉。PRD 记录此数字，保证这是**知情选择**而非疏漏。

### 2.3 节点颜色（应用是**按类型语义上色**，不是单一色）

应用把颜色拆成 11 个语义键，每个映射到一个 CSS 类再由主题给最终色（`app.css`）：

| 语义键 | CSS 类 | 应用映射到的主题变量 | 本站映射 |
|---|---|---|---|
| `fill` | `.color-fill` | `--graph-node` (= `--text-muted`) | 站点 `--color-parchment-dim` |
| `fillFocused` | `.color-fill-focused` | `--graph-node-focused` (= `--text-accent`) | `--color-brand` |
| `fillTag` | `.color-fill-tag` | `--graph-node-tag` (= `--color-green`) | `#15803d` |
| `fillAttachment` | `.color-fill-attachment` | `--graph-node-attachment` (= `--color-yellow`) | `#b45309` |
| `fillUnresolved` | `.color-fill-unresolved` | `--graph-node-unresolved` (= `--text-faint`) | `#94a3b8` |
| `line` | `.color-line` | `--graph-line` (= `--color-base-35`) | 混合 `--color-parchment` 22% |
| `lineHighlight` / `fillHighlight` | `.color-line-highlight` / `.color-fill-highlight` | `--interactive-accent` | `--color-brand` |
| `arrow` / `text` | `.color-arrow` / `.color-text` | `--text-normal` | `--color-parchment` |
| `circle` | `.color-circle` | `--graph-node-focused` | `--color-brand` |

**取色优先级（应用 `xQ` 的 getColor）**：分组自定义色 > 类型语义色（tag / unresolved / attachment）> `fill`；
高亮节点的填充用 `fillHighlight`、外圈用 `circle`。

**分组色是固定 6 个色槽**（`.graph-view.color-fill-1` … `-6`），不是任意取色 —— 本站同样只存槽位号，
由 `--graph-group-1..6` 给色（应用默认主题里 6 个槽同为 `--text-muted`，需主题覆盖才分色）。

---

## 3. 功能规格（逐组照抄，含验收）

### 3.1 Filters（控制显示哪些节点）

| 项 | Obsidian 原文 | 应用选项名（app.js） | 本站默认（= 应用默认） |
|---|---|---|---|
| **Search files** | "lets you filter notes based on a search term" | （搜索框） | 空 |
| **Tags** | "toggles whether to show tags in the graph" | `showTags` | **关**（应用默认 false；帮助文档未写默认值，v1.1 曾按「开」实现，已更正） |
| **Attachments** | "toggles whether to show attachments in the graph" | `showAttachments` | 关 |
| **Existing files only** | "toggles whether to show notes that exists in your vault" | `hideUnresolved`（反义） | 关（= 幽灵节点可见） |
| **Orphans** | "toggles whether to show notes without any links" | `showOrphans` | 开 |
| **Excluded files** | "Files matching your Excluded files patterns will not appear" | — | **不适用**：非公开条目在 gen 期就进不了 `content.json`（见 §8-D5） |

> **`showTags` 默认关这件事很重要**：本站有 61 个标签节点（§1.1），默认关正好避开了「标签淹没画布」。这与 v1.0 的担心一致，而 Obsidian 本身就是这么默认的。

**验收**：六个开关逐项可独立生效并可组合；`Restore default settings` 一键恢复 §3.1–§3.4 全部默认值。

### 3.2 Groups（用颜色分组）

| Obsidian 原文 | 本站实现 |
|---|---|
| "Create groups of notes to distinguish them from each other using color." | 分组列表：`{ query, color }` |
| "In the search box, type a search term for the notes you want to add to the group." | query 用 §4 查询语法 |
| "Click the colored circle to give the group a color." | 颜色取自站内主题调色板 |
| 列表顺序即优先级（命中多个组时取最上面的） | 同 |

- 支持 `New group` 新增、逐组编辑 query 与颜色、删除组。
- **验收**：新增 3 个组（如 `hall:showcase` / `tag:AI` / `series:Ferry`）后颜色正确生效；命中多组时取列表最上方；删除组后节点回落默认色。

### 3.3 Display（怎么画）

| 项 | Obsidian 原文 | 应用选项名 | 默认 | 区间（应用 `setLimits` 实测） |
|---|---|---|---|---|
| **Arrows** | "toggles whether to show the direction of each link" | `showArrow` | **关** | 布尔 |
| **Text fade threshold** | "controls the text transparency for the name of each note" | `textFadeMultiplier` | **0**（首页为 -2） | **[-3, 3] step .1** |
| **Node size** | "controls the size of the circle representing each note" | `nodeSizeMultiplier` | **1** | **[0.1, 5]** |
| **Link thickness** | "controls the line width for each link" | `lineSizeMultiplier` | **1**（首页为 2） | **[0.1, 5]** |
| **Animate** | "starts a [[#Start a time-lapse animation]]" | — | 停止 | 按钮（**局部图不显示**，应用 `t.view instanceof EJ` 判断） |

标签透明度公式逐字照抄应用的 `AQ.setScale`：`textAlpha = clamp(log2(scale) + 1 - fTextShowMult, 0, 1)`。

**其余逐帧规则（源码核对，全部照抄）**：

| 规则 | 值 |
|---|---|
| 世界缩放 | `nodeScale = sqrt(1/scale)`：缩小时节点与字号相对变大，保持视觉"实" |
| 边透明度 | `link.alpha × 0.34 × max(0.45, clamp((scale-0.3)×2, 0, 1))` |
| 淡出 | 非相关元素目标 `0.2`、相关元素目标 `1`，逐帧 `a×0.9 + b×0.1` 缓动 |
| 边端点 | 两端各按节点显示半径内缩，避免线穿进圆 |
| 标签位置 | `y + (nodeSize + 5) × nodeScale + textOffset/scale`；字号 `(14 + nodeSize/4) × nodeScale` |
| 选中状态 | 填充换成高亮色、标签下移 `15` 世界单位、外描边 `max(1, 1/scale)` |
| 反向重复边 | 物理层**两条都保留**，视觉上反向对只画一条（按 id 字典序抑制） |
| 命中测试 | `nodeSize × nodeScale + 3/scale` 内取**最近**的圆 |

**Animate 的 `created` 取值（照抄 Obsidian「创建时间」语义）**：Obsidian 按笔记**创建时间**排序；本站 frontmatter 无创建时间，`date` 是发布时间。忠实解法 = **取该文件在 Git 中的首次提交时间**（`git log --diff-filter=A --format=%aI -- <path>`），取不到时回落 `frontmatter.date`。零内容改动、非编造数据。

> 已知局限（诚实记录）：历史内容存在批量导入，29 篇中多篇共享同一首次提交时间（如 13 篇同为 `2026-07-22T03:55:13+08:00`）→ Animate 会呈现为**一批一批出现**而非逐篇。这是数据的真实形态，不做人为打散。

### 3.4 Forces（力学布局）

**物理层不是推测的，是按源码逐行重写的。** 来源：`sim-original.js`——从 obsidian.md 首页图谱提取的**原始 worker**（含 WASM 快速路径与 d3-force 回退分支），参数与语义均已逐项核对。

| 项 | Obsidian 原文 | 应用选项名 / 面板区间 | 面板默认 | 写入引擎的值 |
|---|---|---|---|---|
| **Center force** | "controls how compact the graph is. A higher value creates a more circular graph." | `centerStrength` · `setLimits(0,1)` step .01 | **0.1** | `forceX(0, s)` + `forceY(0, s)`，s = 面板值 |
| **Repel force** | "controls how much a node pushes other nodes away from it." | `repelStrength` · `setLimits(0,20)` | **10** | **`forceManyBody(-(面板值³))`** → 10³ = 1000 |
| **Link force** | "controls the pull on each link. If the link was a rubber band, the link force controls how tight or loose the band is." | `linkStrength` · `setLimits(0,1)` step .01 | **1** | 乘子 × d3 默认度数强度 `1/min(度数src, 度数tgt)` |
| **Link distance** | "controls the length of the lines between each note." | `linkDistance` · `setLimits(30,500,1)` | **250** | `forceLink.distance` |

> **斥力要看两层**：应用 `IJ` 里 `repelStrength: 10`，面板回调是
> `setForces({ repelStrength: e*e*e })` —— **UI 10 → 引擎 1000**。
> 这解释了「帮助文档说 10、worker 里却是 1000」的表观冲突：两个数都对，只是层级不同。
> 本站面板照应用的 UI 值（0–20 / 默认 10）暴露，写入引擎时立方。

**硬编码在 worker 里、面板不暴露的常数（照抄）**：

| 项 | 值 | 出处 |
|---|---|---|
| `alpha` 起点 / 下限 / 目标 | `1` / `0.001` / `0` | worker 变量 `Q` / `.001` / `y` |
| `alphaDecay` | `1 - 0.001^(1/300)` ≈ 0.02276 | worker 的 `B` |
| 速度积分 | 每 tick `vx *= 0.6`（d3 的 `velocityDecay` 默认 0.6，**直接相乘**） | worker 的 `*.6` |
| tick 间隔 | `16.666666666666668 ms` | worker 的 `setTimeout` 实参 |
| many-body `distanceMin` / `theta` | `30` / `0.9` | WASM 入口实参 |
| collide 半径 / 强度 / 迭代 | `60` / `0.5` / `1` | WASM 入口实参 + d3 默认 |
| 拖拽 | `{alpha: 0.3, alphaTarget: 0.3, forceNode:{id,x,y}}`；释放 `{alphaTarget: 0, forceNode:{id,x:null,y:null}}` | 主线程 postMessage |
| 初始布点 | 邻居均值 + `(rand-.5)×sqrt(n×60²)` 抖动；无邻居则按环形区域取点 | `graph-reconstructed.setData` |
| 视口 | `targetScale *= 1.5^(-delta/120)`；每帧 `scale = scale×0.85 + target×0.15` | `graph-reconstructed` 的 wheel / `updateZoom` |

**⚠️ 已核出的两处二手资料错误（本 PRD 早期版本据此写错，已更正）**：

1. 早期版本写的「Center force 约 0.5 / Repel force 约 10」**是错的**（来自帮助文档页的二手归纳）。源码真值是 `0.1 / 1000`。
2. `sim-readable.js`（同一逆向仓库的可读版）写了 `.velocityDecay(0.4)` 并注释「× (1-0.4) = × 0.6」——d3 的 `velocityDecay` 是**直接相乘**，原始 worker 明确是 `vx *= .6`。**以原始 worker 为准。**

**规模无关性**：Obsidian 用**绝对单位**（linkDistance 250、collide 60、jitter `sqrt(n×60²)`），不做 sqrt(n) 归一——因此节点越多，世界越大，由**视口缩放**承担适配。本站照抄这一机制。

### 3.5 交互（照抄）

| Obsidian 原文 | 本站实现 |
|---|---|
| "Hover over each circle to highlight that note's connections." | hover 节点 → 高亮其全部连接边 + 邻居节点，其余降透明度（不是删除） |
| "Click a note in the graph to open that note." | click 笔记节点 → 跳 `/posts/<slug>`；click 幽灵节点 → 跳 `/posts/<slug>`（由该页呈现空态）；click 标签节点 → 把该标签作为 Search 词填入（等价于 Obsidian 的 tag 节点点开搜索）；click 附件节点 → 打开文件 |
| "Right-click a note to open a context menu with the actions available for that note." | 右键笔记节点 → 上下文菜单（打开、在新标签打开、复制链接、只看局部图、以此为起点过滤） |
| "Zoom in and out using the scroll wheel on your mouse, or using the `+` and `-` keys." | 滚轮 + `+`/`-` |
| "Move the graph around by dragging it with your mouse cursor, or using the arrow keys." | 拖拽 + 方向键平移 |
| "You can hold Shift while using the keyboard to speed up the movements." | Shift 加速 |
| 拖拽单个节点（Obsidian 内建） | 长按拖拽节点，松开后按当前 Forces 重新收敛 |

### 3.6 全局图 vs 局部图（照抄）

| 维度 | Global（`/graph`） | Local（文章页内嵌） |
|---|---|---|
| 范围 | 全部节点 | 当前笔记 + N 跳邻域 |
| 深度 | 无 | `localJumps`：**滑块 1–5，默认 1**（应用 `setLimits(1,5,1)`） |
| 方向 | 无 | **`localForelinks` 默认开 · `localBacklinks` 默认开**（沿出链 / 反向链接展开） |
| 设置面板 | Filters / Groups / Display / Forces | 同上 + 局部图一组（深度与方向） |
| Animate | 有 | **不显示**（应用判断 `t.view instanceof EJ` 时跳过该按钮） |
| 交互 | 同 §3.5 | 同 §3.5 |

> **更正 v1.0 的一处误判**：v1.0 曾写「局部图的 Incoming/Outgoing 开关在官方文档中不存在，故不实现」。
> 应用源码里确实有 `localForelinks` / `localBacklinks` / `localInterlinks`，且前两者**默认为 true** —— 功能是真实存在的。
> 本站实现了前两者（语义明确）；`localInterlinks` 语义未验证、应用默认也是关，
> 故**不实现**并在此记账（见 §8-D6）。

---

## 4. 查询语法（照抄 Obsidian Search）

Filters 的 `Search files` 与 Groups 的 query **复用 Obsidian 搜索语法**（官方 `en/Plugins/Search.md`）。逐条映射：

| Obsidian 操作符 | 语义 | 本站映射 |
|---|---|---|
| `file:xxx` | 文件名匹配 | 匹配公开条目的 **slug + title** |
| `path:xxx` | 路径匹配 | 匹配**内容路径** `content/log/<slug>.md`（本站内容平铺无目录，`path:` 主要按 slug 子串筛，语义一致） |
| `content:"x"` | 正文内容匹配 | 匹配 `body` 全文 |
| `tag:#work` | 标签匹配 | 匹配 frontmatter `tags`（本站标签扁平，无嵌套 `#a/b` 语义） |
| `line:(a b)` | 同一行内匹配 | 匹配 `body` 同一行 |
| `block:(a b)` | 同一块内匹配 | 匹配 `body` 同一段落 |
| `section:(a b)` | 同一节内匹配 | 匹配 `body` 同一 heading 区间（两个 heading 之间） |
| `task:` / `task-todo:` / `task-done:` | 任务匹配 | 匹配 `body` 的 `- [ ]` / `- [x]` 行；本站正文任务罕见，但语法照抄 |
| `[prop]` / `[prop:val]` / `[prop:null]` | 属性存在 / 取值 / 为空 | 匹配 frontmatter 任意字段（`hall`、`type`、`domain`、`intent`、`valueMode`、`form`、`series`、`seriesOrder`、`status`、`date`、`updated`、`level`…） |
| `[prop:<5]` / `[prop:>5]` | 数值比较 | 同上，数值字段支持 `<` / `>` |
| `a b` | 同时包含 | 同 |
| `"a b"` | 精确短语（含 `\"` 转义） | 同 |
| `a OR b` | 任一 | 同 |
| `-a` | 否定 | 同 |
| `( )` | 分组优先级 | 同 |
| `/regex/` | 正则（JavaScript 风格） | 同 |
| `match-case:` / `ignore-case:` | 大小写控制 | 同（默认 ignore-case） |

**验收**：给定 10 条覆盖各操作符的查询，解析结果与匹配集合有单测锁定；非法语法不得抛异常崩溃画布，退化为「无匹配 + 输入框报错提示」。

> **Scope 限制（诚实标注）**：`line:` / `block:` / `section:` / `task:` 在纯前端消费 graph.json 的实现下需要携带 body 片段索引；若体积超预算，按 §8-D7 降级为 `content:` 全文匹配并**在 UI 上不做假承诺**（即把不可用操作符从帮助文案中移除，而非静默返回空）。

---

## 5. 数据与产物

### 5.1 图数据契约（`graph.json`）

gen 期由 `scripts/generate-content.ts` 一并产出，落在 `apps/web/src/generated/graph.json`：

```ts
type GraphNode =
  | { id: string; kind: 'note';       slug: string; title: string; date: string; updated: string;
      created: string; hall: string; type: string; form: string; domain: string;
      series: string; seriesOrder: number | null; tags: string[]; inDegree: number; outDegree: number;
      summary: string }
  | { id: string; kind: 'ghost';      slug: string; inDegree: number; outDegree: number }
  | { id: string; kind: 'tag';        tag: string; inDegree: number; outDegree: number }
  | { id: string; kind: 'attachment'; path: string; inDegree: number; outDegree: number };

type GraphEdge =
  | { source: string; target: string; kind: 'link' }      // 正文内部链接
  | { source: string; target: string; kind: 'tag' }        // 笔记 → 标签
  | { source: string; target: string; kind: 'attachment' } // 笔记 → 附件
  | { source: string; target: string; kind: 'embed' };     // 预留（当前无嵌入语法）

type KnowledgeGraph = {
  generatedAt: string;
  seed: number;               // 布局随机种子（确定性）
  nodes: GraphNode[];
  edges: GraphEdge[];
};
```

**不变式**：

- 节点 id = `note:<slug>` / `ghost:<slug>` / `tag:<tag>` / `attachment:<path>`，全局唯一。
- `inDegree` = 指向该节点的边数（**节点半径依据**）；`outDegree` = 该节点发出的边数。
- 边不得自环（`[[自己]]` 跳过）；同一对 (source,target,kind) 去重。
- 图只由**公开条目**构建；非 public 内容永不出现。
- 幽灵节点的 slug **不得**与任何 note 的 slug 相同。

### 5.2 消费方

| 消费方 | 读法 |
|---|---|
| web | `apps/web/src/generated/graph.json`（构建期打包，运行时只读，禁 fs） |
| api | 复用内容索引（如需服务端局部图查询） |
| agent / MCP | 同一份 `graph.json` |

### 5.3 aiUsePolicy 边界（PLAN §1 宪法 3，不可绕过）

- 图结构本身来自公开条目，**不含模型推断**（无 AI 生成的边、无向量相似度边）。
- **MCP `neighbors` 与任何机器消费路径必须 fail-closed**：只返回 `aiUsePolicy.citable === true` 的节点；命中不可引用节点时返回该节点**存在与位置**（用于导航）但**不返回其摘要/正文**。与 `apps/agent` knowledge 插件口径一致。
- 访客面：图只含公开条目，`summary` 只用于 tooltip/兜底正文，不做 AI 加工。

---

## 6. 三面落地

### 6.1 访客面

**A. `/graph` 全局图（indexable）**

- 路由：`WEB_ROUTES.graph = '/graph'`，登记进 `scripts/lib/site.ts` 的 `INDEXABLE_STATIC_ROUTES`。
- 首屏：静态 HTML **兜底正文**（§6.1-C），JS 加载后挂载画布并在同位置替换/叠加。未启用 JS 的爬虫与用户都能读到结构。
- 入口：`/posts`（逛）页面顶部加「结构 / 图谱」入口；不新增主导航（PRODUCT §原则 4「一人可养」）。

**B. 文章页局部图**

- 位置：`PostDetailPage` 内，与现有「相关」块相邻的独立区块（「图谱」）。
- 默认 Depth = 1，可在图内调至 5；拥有全部四组设置（与全局图同一套组件）。
- 无任何连接的笔记：显示诚实空态（「这篇文章在正文里还没有与任何文章互相引用」+ 指向 `/graph` 看全局孤岛）。

**C. HTML 兜底（GEO 必需）**

canvas 对爬虫不可见，故 `/graph` 的静态正文必须是**语义化的结构清单**：

- 每条笔记一个条目：标题 + 摘要 + 出链列表（真实 `<a>` 指向 `/posts/<slug>`）+ 归属主题线；
- 幽灵节点单独列出（「被引用但尚不存在的笔记」）；
- 不使用 `[[ ]]` 残留语法（`verify-geo` 会 fail）。

### 6.2 站主面：结构体检清单

在 admin 增加**结构体检**视图（与图同一份数据，形式是清单不是第二张图）：

| 检查项 | 定义 | 当前基线（产物实测） |
|---|---|---|
| 孤岛 | `note.linkDegree = 0` | **14 篇**（50%） |
| 坏链 | `ghost` 节点及其入边 | 2 个（`affordable-ai-community`、`nl-programming`） |
| 单向链接 | A→B 有边但 B→A 无边 | 19 条 link 边中单向者 |
| 只有主题线没有互引的线 | `series` 内条目之间无正文内链 | 11 条线中不互引者 |
| 附件孤岛 | `attachment.totalDegree = 0` | 2 张 |

每项给出**可点击的清单**（点进文章直接补链接）。这是「图给人看形状、清单给人动手」的分工。

### 6.3 机器面

- 新增 MCP 工具 `neighbors(slug, depth)`：返回该节点在 `depth` 跳内的邻居与边（受 §5.3 约束）。
- `apps/agent` 的 knowledge 插件与 mcp 插件消费同一份 `graph.json`；发布刷新时图随之刷新（复用现有协效应：发布 → 知识刷新）。

---

## 7. 与现有系统约束的接口（不可绕过）

| 约束 | 出处 | 处置 |
|---|---|---|
| web 运行时只读生成产物、禁 fs | AGENTS.md / ARCHITECTURE | 图数据全部在 gen 期产出于 `graph.json` |
| GEO 门禁：sitemap 与 `INDEXABLE_STATIC_ROUTES` 逐条严格相等 | `scripts/verify-geo.ts` | `/graph` 必须登记进 `scripts/lib/site.ts`，否则构建失败 |
| indexable 路由必须有 canonical / robots / og:title / twitter:card / JSON-LD / Vite 资源 | `scripts/verify-geo.ts` | 按现有 indexable 页同款实现 |
| 预渲染 HTML 禁止残留 `[[ ]]` | `scripts/verify-geo.ts` | 幽灵节点以节点/文字呈现，不输出语法 |
| 主计划与图面改动须回写 | AGENTS.md | 本 PRD + `PLAN.md` 排期 + `docs/README.md` 索引 + `ARCHITECTURE.md` 图面 |
| 禁止硬编码 `'/posts'`、`'/tools'` | PRODUCT 词汇表 | 一律走 `WEB_ROUTES` / `dualEntry` |
| 不引入第二实例 / 向量库 / 新基础设施 | PLAN §1 宪法 2、§5 | 纯前端 + 构建期产物，无新服务 |
| 引擎不依赖 d3 / pixi 等外部库 | 本项目依赖从简 | 力集与四叉树按 d3-force / d3-quadtree 语义**自行实现**（`obsidian/forces.ts`），只有 `packages/shared` 的纯函数被复用 |

---

## 8. 偏离清单（诚实记账，不许静默省略）

| # | Obsidian 能力 | 处置 | 原因 |
|---|---|---|---|
| D1 | 节点半径 = `clamp(sqrt(weight+1)*3,8,30)`，`weight` 为**无向度数** | ✅ 照抄（以实现为准，非帮助文档措辞） | — |
| D11 | 渲染器：Obsidian 用 **PIXI.js / WebGL**（首页 SVG 只是占位/回退） | ⚠️ 本站用 **Canvas2D**，公式与缓动逐条照抄 | 规模（≤ 数百节点）下 2D 已足够；引 WebGL 会为这点数据量换一个渲染栈。若节点数上到数千再评估 |
| D12 | 物理跑在 **Worker + WebAssembly 快速路径** | ⚠️ Worker 照抄；**不引入 WASM** | 用 JS 版力集（与 WASM 路径同参数同语义）。WASM 是为数千节点准备的速度路径，本站规模无收益 |
| D13 | 主线程↔worker 用 **SharedArrayBuffer**（带版本号防撕裂） | ⚠️ 用**可转移 ArrayBuffer** | SAB 需要 COOP/COEP 响应头，会打断本站既有的第三方嵌入（评论/统计）。原始 worker 在同场景下也走可转移分支 |
| D14 | 随机源为 `Math.random`（每次打开布局不同） | ⚠️ 改为**定种子 PRNG**（同内容同布局） | 本站要求可测试、可复现、刷新不跳；分布与算法不变 |
| D15 | 缩放上下限 | ✅ 照抄应用 `clamp(1/128, 8)`（v1.1 曾猜 `[0.05, 8]`）；**初值按内容包围盒适配** | 应用打开图谱时会适配视口，本站用同一语义由包围盒反算初值 |
| D2 | 四组设置 + 全部开关与默认值 | ✅ 照抄 | — |
| D3 | `[[note#heading]]` / `[[note^block]]` 锚点级链接 | ⚠️ 降级：剥锚点后按整篇建边 | 现有 `expandWikiLinks` 不支持锚点；补齐属独立增强项 |
| D4 | `![[note]]` 嵌入 | ⚠️ 无嵌入语法；若出现 `![[` 按普通内链解析 | 本站正文不使用嵌入 |
| D5 | Excluded files | 不适用 | 非公开条目在 gen 期已被排除 |
| D6 | 局部图方向开关（`localForelinks` / `localBacklinks`） | ✅ 实现（v1.2 更正：v1.0 曾误判为「官方无此功能」） | 应用源码确认存在且默认都开 |
| D18 | 局部图 `localInterlinks`（其他节点间的链接） | ✅ **已实现**（v1.3 更正：v1.2 曾以「语义未能确证」为由不实现） | 官方中文说明（zh.txt:1237）「显示其他节点之间的链接」即其语义；实现为「关闭时只画逐层走出来用到的边」 |
| D19 | 首页专属的边样式（`×0.34`、`max(.45, zoomFade)` 下限） | **不采用** | 那是官网首页图谱的定制样式；应用是 `lerp(alpha, 1 或 .2)`，本站按应用 |
| D7 | `line:` / `block:` / `section:` / `task:` 操作符 | ⚠️ 视体积预算保留或降级为 `content:` | 需 body 片段索引；若降级，UI 帮助文案同步移除，不做假承诺 |
| D8 | Tags 默认开导致标签节点多于笔记节点 | ✅ 照抄默认值 + 记录数字 | 61 标签 vs 28 笔记，42 个为 degree-1 叶子；开关交由用户 |
| D9 | 历史内容批量导入导致 Animate 成批出现 | ✅ 如实呈现 | `created` 取 Git 首次提交时间，真实但粗糙；不人为打散 |
| D10 | 力参数默认数值 | ✅ 照抄源码（0.1 / 1000 / 1 / 250） | 早期版本曾按帮助文档二手描述写成 0.5 / 10，已更正 |
| D16 | 滑块区间 | ✅ 全部照抄应用 `setLimits` 实参 | v1.1 曾按默认值取「对称区间」，v1.2 换成实测值 |
| D17 | Arrows 的箭头几何 | ⚠️ 本站最小实现 | 取到了 `arrow` 颜色与透明度曲线，但未取到箭头路径绘制代码 |
| D20 | 颜色组取色 | ✅ 照抄（取色器 + 拖拽排序） | v1.2 曾据 CSS 推断成「固定 6 色槽」，v1.3 依官方文案（zh.txt:1267）更正；`.color-fill-1..6` 仅作新建时的初值 |
| D21 | 视口剔除 | ⚠️ 近似实现 | 应用逐元素矩形相交测试；本站按「中心 + 半径」近似，视觉等价 |
| D22 | 应用图谱的配色真值链 | ✅ 照抄语义键 + 映射 | 应用映射到它自己的主题变量，本站映射到站点主题变量（见 §2.3），语义键逐字一致 |

---

## 9. 验收标准

**功能验收**

1. `/graph` 四组设置逐项可用，`Restore default settings` 可恢复默认。
2. 六个 Filter 开关可独立与组合生效；`Tags` 默认开、`Attachments` 默认关、`Existing files only` 默认关、`Orphans` 默认开。
3. 新增/编辑/删除 Group 后颜色正确；多组命中取最上方。
4. Display 五项（Arrows / Text fade threshold / Node size / Link thickness / Animate）逐项生效。
5. Forces 四项滑块生效，且 29 节点下观感对齐 Obsidian。
6. 交互全齐：hover 高亮、click 打开、右键菜单、滚轮/±缩放、拖拽/方向键平移、Shift 加速、节点拖拽。
7. 局部图 Depth 1–5 生效，拥有全部四组设置。
8. 节点半径由入链数决定（`ferry-theory` 应明显大于 `lobster-core-value`）。
9. 幽灵节点存在且可被 `Existing files only` 隐藏；2 个坏链可见。

**数据验收**

10. `graph.json` 满足 §5.1 全部不变式（唯一 id、无自环、无重复边、无私有内容）。
11. 用真实内容校验（`pnpm content:gen` 的产物为准）：note 28 / ghost 2 / tag 61 / attachment 2；link 边 19 条、tag 边 107 条、attachment 边 0 条；`created` 覆盖 28/28。
12. 布局确定性：同输入两次生成坐标一致。

**工程验收（门禁）**

13. `pnpm typecheck` 通过。
14. `pnpm test:shared && pnpm test:web` 通过（新增图与查询语法单测）。
15. `pnpm build:web && pnpm verify:geo` 通过——`/graph` 进 sitemap、canonical/og/JSON-LD/静态正文齐备、无 `[[ ]]` 残留。
16. 主计划/图面/索引回写完成（PLAN §3 排期、`docs/README.md`、`ARCHITECTURE.md`）。

**机器面验收**

17. MCP `neighbors(slug, depth)` 可用；对 `citable: false` 的节点返回存在性但不返回摘要（fail-closed）。

**引擎验收（源码级）**

18. 节点半径 `clamp(sqrt(weight+1)*3, 8, 30) × 乘子`，`weight` 为无向邻居数——单测锁定边界（weight 0 → 8、weight 100 → 30）。
19. 力集逐项锁定：`forceLink` 的度数强度 `1/min(度数)` 与 `bias` 分摊、**同趟内逐边就地更新**的顺序语义；`forceManyBody` 的 `distanceMin` 夹取与斥力方向；`forceCollide` 的分离；tick 的 `alpha += (target-alpha)*alphaDecay` 与 `vx *= 0.6`；`fx/fy` 钉住。
20. 初始布点：同种子同输入 → 同坐标；有已知邻居取均值 + jitter。
21. 物理跑在独立 Worker（构建产物中单独成块，不进主包）。
22. 默认值逐项等于应用：`showTags=false`、`textFadeMultiplier=0`、`lineSizeMultiplier=1`、`repelStrength=1000`（UI 10 的三次方）。
23. 滑块区间等于应用 `setLimits` 实参（含斥力 `[0,20]`、链接距离 step 1、文字淡出 `[-3,3]`、深度 `[1,5]`）。
24. 缩放夹取 `[1/128, 8]`；`textAlpha = clamp(log2(scale)+1-fTextShowMult, 0, 1)` 有单测锁定。
25. 局部图方向开关生效：关掉出链后只沿反向链接展开，反之亦然。

---

## 10. 排期

| # | 事项 | 量级 | 验收锚点 |
|---|---|---|---|
| K1 | 图数据内核（shared 图模型 + 抽边 + 查询语法 + 单测） | 1d | §9-12 / §9-14 |
| K2 | 构建期 `graph.json` 产物 | 0.5d | §9-10 / §9-11 |
| K3 | `/graph` 全局图（四组设置 + 交互 + HTML 兜底 + GEO） | 2d | §9-1~9-6 / §9-15 |
| K4 | 文章页局部图（Depth 1–5） | 0.5d | §9-7 |
| K5 | 站主面结构体检清单 | 0.5d | §6.2 五项可点击 |
| K6 | 机器面 MCP `neighbors` | 0.5d | §9-17 |

总计约 5 人日，按 `PLAN.md` §3 主线顺序插入：**K1–K3 优先**（访客面是主证明点），K4–K6 随后。

---

## 11. 变更记录

| 版本 | 日期 | 变更 |
|---|---|---|
| v1.0 | 2026-09-14 | 首版：照抄 Obsidian Graph View 全部功能；三面立项；产物实测基线（28 note / 19 link 边 / 14 孤岛 / 2 坏链 / 61 标签 / 107 tag 边 / 2 附件）入档 |
| v1.1 | 2026-09-14 | **引擎按源码重写**（站主指令：先去 GitHub 找源码）。据 `sim-original.js` 更正三处实质错误：力参数默认值 `0.1/1000/1/250`（原按帮助文档写成 `0.5/10/1/250`）、节点大小依据为**无向度数**（原写成入链数）、`velocityDecay` 为 `×0.6` 直接相乘。补全四叉树 Barnes–Hut、`bias` 分摊、逐边就地更新、初始布点、视口缓动与全部逐帧渲染公式；物理移入 Worker。新增偏离 D11–D17 |
| v1.2 | 2026-09-14 | **逆向应用本体**（站主指令：找 Obsidian 的知识图谱长什么样、逆向）。逐层剥离 `obsidian.asar`，定位图谱设置面板（`wQ`/`PJ`/`IJ`）、渲染器（`AQ`）、节点（`xQ`）、连线（`TQ`）与配色（`app.css`），并确认应用 worker 即 `/sim.js`。据此更正五处：`showTags` 默认**关**（v1.1 按「开」错）、Display 默认 `0/1/1`（v1.1 用首页的 `-2/1/2` 错）、斥力是 **UI 10 三次方→引擎 1000**（解开「10 vs 1000」表观冲突）、缩放夹取 **`[1/128, 8]`**（v1.1 猜 `[0.05,8]` 错）、配色是**按类型语义化 11 键**（v1.1 用单一色错）。补齐应用实测滑块区间、6 色槽分组、局部图方向开关（v1.0 曾误判其不存在）。新增 §0.1 真值层级与 §2.3 配色表、偏离 D18–D22 |
| v1.3 | 2026-09-14 | **照抄官方中文文案**（站主以 Obsidian 本体截图 + `i18n/zh.txt` 为据）。面板文案改为官方逐字译名：筛选 / 颜色组 / 外观 / **力度** / 图谱向心力 / 节点间的排斥力 / 相连节点间的吸引力 / 连线长度 / 文本透明度 / 仅显示已创建的笔记 / 孤立文件（新增 §0.2 对照表 + `obsidian/labels.ts` 带行号出处的唯一来源）。**撤回 v1.2 两处过度推论**：① 颜色组从「固定 6 色槽」改回官方交互「点击改色 + 拖动排序」（D20）；② `其他节点间的链接` 依官方说明实现（D18）。箭头官方提示「放大后显示」印证了既有 alpha 曲线。小节改为官方可折叠分组，生长动画按钮移入「外观」 |
| v1.4 | 2026-09-14 | **动效评审与重构**（按 `animate` 规范逐条过）。修掉一处结构缺陷：生长动画原先**每帧 setState** 驱动，导致 `setData` 每秒重跑 60 次、连带重启物理模拟与重设视口 → 时间轴移入引擎（`engine.setReveal`），React 只持有「是否在播」。补齐入场规格：单节点淡入 280ms 强 ease-out（起始尺寸 0.94，**不用 scale(0)**）、逐个出现间隔 30–80ms 且由 3s 总预算反推、连线在两端出现后才可见。**补齐 `prefers-reduced-motion`**（原先只有 CSS 兜底能拦，JS 动画拦不住）：保留淡入、去掉逐个出现的运动。动画改为**可中断**的播放/停止（原先 `disabled` 把人锁死 8.4s）。另修：图谱按钮补上站点既有 `--press-ms` 按压过渡（原先只有 scale 无过渡，是瞬跳）、右键菜单 140ms 从光标原点缩放淡入、hover 高亮按指针类型门控（修触摸后高亮卡住）。新增 `obsidian/reveal.test.ts` 锁住时序 |
