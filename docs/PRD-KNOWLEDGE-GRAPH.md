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
| 对齐基准 | Obsidian 官方帮助文档 `en/Plugins/Graph view.md`（permalink `plugins/graph`）+ `en/Plugins/Search.md`（permalink `plugins/search`） |

> **本 PRD 的第一原则：照抄 Obsidian 的图谱本体与交互，不发明。** 凡与本站工程约束（GEO 门禁、静态预渲染、只读产物、aiUsePolicy）冲突之处，一律**改造实现方式**而非**裁剪功能**；无法对应的功能在 §8「偏离清单」逐条记账，不许静默省略。

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
| "The more nodes that reference a given node, the bigger it gets." | **节点半径由入链数决定**（in-degree，非出链数、非字数） |

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

### 2.3 节点颜色

- 默认色 = 未命中任何 Group 的节点用统一默认色。
- 命中 Group → 用该 Group 的颜色（见 §3.2）。
- 节点**描边**用于状态（hover / 选中 / 搜索命中），不占用颜色通道。

---

## 3. 功能规格（逐组照抄，含验收）

### 3.1 Filters（控制显示哪些节点）

| 项 | Obsidian 原文 | 本站实现 | 默认 |
|---|---|---|---|
| **Search files** | "lets you filter notes based on a search term" | 输入框，复用 §4 查询语法 | 空 |
| **Tags** | "toggles whether to show tags in the graph" | 布尔开关：标签节点 + 笔记→标签边 | **开** |
| **Attachments** | "toggles whether to show attachments in the graph" | 布尔开关：非 md 文件节点 | **关** |
| **Existing files only** | "toggles whether to show notes that exists in your vault" | 布尔开关：隐藏幽灵节点 | **关** |
| **Orphans** | "toggles whether to show notes without any links" | 布尔开关：隐藏度为 0 的笔记节点 | **开** |
| **Excluded files** | "Files matching your Excluded files patterns will not appear" | **不适用**：非公开条目在 gen 期就进不了 `content.json`，图天然不含（见 §8-D5） | — |

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

| 项 | Obsidian 原文 | 本站实现 | 默认 |
|---|---|---|---|
| **Arrows** | "toggles whether to show the direction of each link" | 布尔：边上画箭头 | **关** |
| **Text fade threshold** | "controls the text transparency for the name of each note" | 0–1 滑块：节点标签随缩放淡出的阈值 | **0.5** |
| **Node size** | "controls the size of the circle representing each note" | 0.1–2 滑块：半径的全局乘数（基础半径仍由入链数决定） | **1.0** |
| **Link thickness** | "controls the line width for each link" | 0.1–1 滑块：线宽 | **1.0** |
| **Animate** | "starts a [[#Start a time-lapse animation]]" | 按钮：按 `created` 时间顺序让节点依次出现 | 停止 |

**Animate 的 `created` 取值（照抄 Obsidian「创建时间」语义）**：Obsidian 按笔记**创建时间**排序；本站 frontmatter 无创建时间，`date` 是发布时间。忠实解法 = **取该文件在 Git 中的首次提交时间**（`git log --diff-filter=A --format=%aI -- <path>`），取不到时回落 `frontmatter.date`。零内容改动、非编造数据。

> 已知局限（诚实记录）：历史内容存在批量导入，29 篇中多篇共享同一首次提交时间（如 13 篇同为 `2026-07-22T03:55:13+08:00`）→ Animate 会呈现为**一批一批出现**而非逐篇。这是数据的真实形态，不做人为打散。

### 3.4 Forces（力学布局）

| 项 | Obsidian 原文 | 本站实现 | 默认 |
|---|---|---|---|
| **Center force** | "controls how compact the graph is. A higher value creates a more circular graph." | 滑块，越大越紧凑越接近圆形 | **0.5** |
| **Repel force** | "controls how much a node pushes other nodes away from it." | 滑块，节点互斥强度 | **10** |
| **Link force** | "controls the pull on each link. If the link was a rubber band, the link force controls how tight or loose the band is." | 滑块，边的张力 | **1** |
| **Link distance** | "controls the length of the lines between each note." | 滑块，边的目标长度 | **250** |

**标定要求（必须，不可省）**：Obsidian 未公开力模型公式与绝对单位，且其默认值是按 400–4000 节点的库调的（本站 29 节点，差 1–2 个数量级）。因此：

- 滑块**名称、方向、语义逐条对齐** Obsidian；
- 数值以「**29 节点时的观感对齐 Obsidian 的 29 节点观感**」为标定目标；
- 布局必须**规模无关**：节点数变化时不得散架或糊成一坨；
- 布局必须**确定性**（固定随机种子 + 固定迭代次数），保证预渲染/测试可复现。

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

| 维度 | Global（`/graph`） | Local（文章页内嵌 + 文章页首次进入） |
|---|---|---|
| 范围 | 全部节点 | 当前笔记 + N 层邻居 |
| 深度 | 无 | **Depth 滑块 1–5，默认 1**（官方未公开数值区间，此为实现取值，见 §8-D6） |
| 设置面板 | Filters / Groups / Display / Forces | **同样拥有全部四组设置** + Depth |
| 交互 | 同 §3.5 | 同 §3.5 |

> **不做 Incoming/Outgoing 开关**：网络上常见的「局部图 Incoming/Outgoing 过滤」**在 Obsidian 官方文档中不存在**（那是独立的 "Outgoing links" 核心插件）。本 PRD 以实现官方文档为准，不实现该功能（见 §8-D6）。

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

---

## 8. 偏离清单（诚实记账，不许静默省略）

| # | Obsidian 能力 | 处置 | 原因 |
|---|---|---|---|
| D1 | 节点半径 = 入链数 | ✅ 照抄 | — |
| D2 | 四组设置 + 全部开关与默认值 | ✅ 照抄 | — |
| D3 | `[[note#heading]]` / `[[note^block]]` 锚点级链接 | ⚠️ 降级：剥锚点后按整篇建边 | 现有 `expandWikiLinks` 不支持锚点；补齐属独立增强项 |
| D4 | `![[note]]` 嵌入 | ⚠️ 无嵌入语法；若出现 `![[` 按普通内链解析 | 本站正文不使用嵌入 |
| D5 | Excluded files | 不适用 | 非公开条目在 gen 期已被排除 |
| D6 | 局部图 Incoming/Outgoing 开关 | **不实现** | 官方文档中不存在该功能（属 "Outgoing links" 插件，非图谱） |
| D7 | `line:` / `block:` / `section:` / `task:` 操作符 | ⚠️ 视体积预算保留或降级为 `content:` | 需 body 片段索引；若降级，UI 帮助文案同步移除，不做假承诺 |
| D8 | Tags 默认开导致标签节点多于笔记节点 | ✅ 照抄默认值 + 记录数字 | 61 标签 vs 28 笔记，42 个为 degree-1 叶子；开关交由用户 |
| D9 | 历史内容批量导入导致 Animate 成批出现 | ✅ 如实呈现 | `created` 取 Git 首次提交时间，真实但粗糙；不人为打散 |
| D10 | 力参数默认数值 | ⚠️ 名称/方向照抄，数值按 29 节点标定 | Obsidian 未公开力模型公式，且默认值按大库调 |

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
