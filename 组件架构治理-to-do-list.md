# 组件架构治理 To-Do List

> 来源：`全组件架构诊断报告-2026-06-06.md`
> 目标日期：从 2026-06-06 起分阶段治理
> 总原则：先稳定页面生命周期，再拆清数据与交互边界，最后把内容空间演进为 Agent 应用壳。

## 1. 治理目标

当前项目已经从个人内容站向“应用壳 + 工作空间 + 内容宇宙”的结构过渡。下一步如果要承载 Agent 应用，需要先解决三个架构风险：

1. 切换页面后旧脚本、事件监听、计时器继续残留，导致“删除了但切到别的界面又出现”的体验。
2. 搜索、内容筛选、Ideas 翻牌等交互被写在大页面或大组件里，难以复用、测试和扩展。
3. 工作空间、内容空间、未来 Agent 工具入口还没有统一配置层，后续新增模块会继续堆在导航和页面文件里。

最终要达到的状态：

- Astro View Transitions 下所有客户端脚本都有统一初始化和清理策略。
- 内容查询、索引构建、UI 渲染、客户端交互分层清楚。
- `/content`、`/learn`、`/posts`、`/ideas`、未来 `/agent` 可以共享工作空间模型。
- 大页面拆成“数据层 + 组件层 + 行为脚本层”，每个模块都能独立验收。

## 2. 非目标

- 不在本轮直接重写视觉设计。
- 不一次性迁移所有页面到新架构。
- 不为了抽象而抽象；只有影响复用、测试、性能或 Agent 扩展的部分才拆。
- 不在没有验收保护的情况下大规模改 SearchModal、Ideas 页面或导航壳。

## 3. 执行顺序总览

| 阶段 | 优先级 | 主题 | 目标 | 依赖 |
|---|---|---|---|---|
| Phase 0 | P0 | 建立基线 | 确认现状、记录截图、确定路由和交互清单 | 无 |
| Phase 1 | P0 | 生命周期治理 | 消除切页后事件重复注册、timer 残留 | Phase 0 |
| Phase 2 | P0 | SearchModal 边界治理 | 把搜索升级为未来 Command Palette 的可扩展壳 | Phase 1 |
| Phase 3 | P0 | Ideas 页面拆分 | 降低全量 Markdown render 和 1450 行大页面风险 | Phase 1 |
| Phase 4 | P1 | 应用壳与内容模型 | 抽 workspace 配置、图片优化、LikeCounter 清理 | Phase 1 |
| Phase 5 | P2 | 可测试化和长期治理 | 数据迁移、样式边界、smoke 测试 | Phase 2-4 |

建议顺序：`Phase 0 -> Phase 1 -> Phase 4.1 -> Phase 2 -> Phase 3 -> Phase 4 剩余 -> Phase 5`。

原因：生命周期问题会污染所有交互判断，必须先处理；workspace 配置是 Agent 应用的地基，可以尽早抽；SearchModal 和 Ideas 是两个大风险，但都应该在生命周期模式稳定后再动。

## 4. 行为衔接逻辑

### 4.1 当前内容站到 Agent 应用的分层

建议把后续架构拆成四层：

```text
App Shell
  -> Workspace Config
  -> Content / Knowledge / Tool / Agent Domain Data
  -> Page Components
  -> Client Behaviors
```

每层职责：

| 层 | 职责 | 当前对应 | 后续演进 |
|---|---|---|---|
| App Shell | 全局布局、侧栏、移动导航、主题、命令入口 | `Base.astro`、`SidebarNav.astro`、`Navigation.astro` | Agent 工作台壳 |
| Workspace Config | 工作空间、路由组、图标、动作入口 | `SidebarNav.astro` 内部硬编码 | `src/lib/workspaces.ts` |
| Domain Data | 内容集合、工具资源、搜索索引、Agent 动作描述 | `src/lib/content.ts`、页面 frontmatter | `src/lib/search-data.ts`、`src/data/*`、`src/lib/agent-actions.ts` |
| Page Components | 页面结构和展示组件 | `/content`、`/learn`、`/posts`、`/ideas` | 保持薄页面 |
| Client Behaviors | 筛选、命令面板、点赞、动画、复制 | 内联 script | `src/scripts/*` 或小型行为模块 |

### 4.2 切页行为衔接

Astro View Transitions 下，页面不是每次完整刷新。所有客户端脚本都应该遵守：

```text
astro:page-load
  -> 初始化当前页面存在的 DOM
  -> 注册事件监听
  -> 保存 AbortController / timer / observer

astro:before-swap
  -> abort 事件监听
  -> clearTimeout / clearInterval
  -> disconnect observer
  -> 清空模块级状态
```

禁止模式：

- 脚本加载时立即裸调用一次，再在 `astro:page-load` 再调用一次。
- 在组件内直接 `button.addEventListener(...)` 但没有 cleanup。
- 用 `data-ready` 作为唯一防重复机制，却不清理页面生命周期。
- timer 只创建，不在切页前清掉。

### 4.3 搜索到命令面板的衔接

不要把 SearchModal 继续当“搜索弹窗”扩展。它应该演进成 Command Palette：

```text
Command Palette
  -> content search commands
  -> route open commands
  -> workspace actions
  -> future agent actions
```

迁移时保持当前用户行为：

- `Ctrl/⌘ + K` 或现有搜索入口仍打开同一个面板。
- 默认 tab 仍显示内容搜索。
- 现有搜索结果跳转行为不变。
- 新增命令类型时只改数据提供层，不改面板核心交互。

## 5. Phase 0：建立基线与保护网

### T0.1 记录当前可见行为

涉及范围：

- `/content`
- `/learn`
- `/posts`
- `/ideas`
- `/tools`
- `/about`
- `/posts/[slug]`
- `/404`

操作：

- [ ] 启动本地服务：`npm run dev`
- [ ] 逐个访问上面的路由。
- [ ] 记录每个页面的主要交互：导航、筛选、搜索、复制、点赞、主题切换、文章侧栏、移动菜单。
- [ ] 对 `/content`、`/learn`、`/posts`、`/ideas` 各保留桌面和移动截图。
- [ ] 特别记录“切到另一个界面后旧内容重新出现”的复现路径。

验收标准：

- 有一份明确的回归路线，不靠记忆判断改坏没改坏。
- 能说清楚旧内容残留发生在哪个路由切换链路上。

影响：

- 不改代码，只建立基线。

行为衔接：

- 后续每个阶段完成后，都按这条路线回测。

### T0.2 建立脚本风险清单

重点文件：

- `src/components/content/PromptBlock.astro`
- `src/pages/learn/index.astro`
- `src/pages/posts/index.astro`
- `src/layouts/FullscreenLayout.astro`
- `src/pages/404.astro`
- `src/layouts/ArticleLayout.astro`
- `src/components/LikeCounter.astro`
- `src/components/SearchModal.astro`
- `src/pages/ideas/index.astro`

操作：

- [ ] 搜索 `addEventListener`。
- [ ] 搜索 `setTimeout`、`setInterval`、`requestAnimationFrame`、`IntersectionObserver`。
- [ ] 标记是否已有 `astro:page-load`。
- [ ] 标记是否已有 `astro:before-swap`。
- [ ] 标记是否使用 `AbortController`。

验收标准：

- 每个风险脚本都有归属：立即修、随重构修、保留观察。

验证命令：

- `Select-String -Path src/**/*.astro -Pattern "addEventListener|setTimeout|setInterval|requestAnimationFrame|IntersectionObserver" -CaseSensitive`

## 6. Phase 1：P0 生命周期治理

### T1.1 统一脚本生命周期模式

涉及文件：

- 可新增：`src/scripts/lifecycle.ts` 或 `src/lib/client-lifecycle.ts`
- 改造目标：所有 P0 脚本文件

建议动作：

- [ ] 先确认项目是否已有客户端脚本工具；有则沿用。
- [ ] 如果没有，建立一个很薄的约定，不追求复杂框架。
- [ ] 每个交互模块暴露 `init()`，返回 cleanup 函数或内部持有 `AbortController`。
- [ ] 入口统一绑定 `astro:page-load`。
- [ ] `astro:before-swap` 统一执行 cleanup。

验收标准：

- 同一个页面来回切换 5 次，点击一次只触发一次行为。
- 没有“立即执行 + page-load 再执行”的双初始化。
- 所有 timer、observer、事件监听都能被 cleanup。

影响：

- 会改变交互初始化时机。
- 若某些脚本依赖首屏同步执行，需要确认 `astro:page-load` 是否满足体验。

行为衔接：

- 视觉和交互结果不变，只改变生命周期管理方式。

### T1.2 修复 PromptBlock 复制按钮

文件：

- `src/components/content/PromptBlock.astro`

诊断证据：

- `PromptBlock.astro:43-58` 直接给 `.copy-btn` 绑定 click，缺少 View Transitions cleanup。

操作：

- [ ] 把复制按钮初始化移动到 `astro:page-load`。
- [ ] 使用 `AbortController.signal` 绑定 click。
- [ ] 在 `astro:before-swap` abort。
- [ ] 保留复制成功后的视觉反馈。

验收标准：

- 多次进入含 PromptBlock 的文章后，点击复制只复制一次。
- 切走页面后不会继续操作旧 DOM。
- 没有控制台报错。

影响：

- 低风险；只影响提示词复制功能。

### T1.3 修复 Learn tab 重复注册

文件：

- `src/pages/learn/index.astro`

诊断证据：

- `learn/index.astro:83-115` 初始化执行一次，又在 `astro:page-load` 执行一次，且没有 cleanup。

操作：

- [ ] 删除双初始化结构。
- [ ] tab click 只在 `astro:page-load` 后绑定。
- [ ] 使用 `AbortController` 管理所有 tab 监听。
- [ ] 切页前 abort。
- [ ] 保留 URL searchParams 或当前 tab 状态逻辑。

验收标准：

- 在 `/learn` 和其他页面之间来回切换 5 次后，点击 tab 状态只变化一次。
- tab 高亮、内容显示和 URL 行为与修改前一致。

影响：

- 中风险；可能影响 tab 初始状态。

行为衔接：

- 初始 tab 仍由 URL 或默认值决定。
- 用户点击 tab 后，页面不刷新也能切换。

### T1.4 修复 Posts 标签筛选重复注册

文件：

- `src/pages/posts/index.astro`

诊断证据：

- `posts/index.astro:204-242` 立即执行 + `astro:page-load`，没有 cleanup。

操作：

- [ ] 删除重复初始化。
- [ ] 标签按钮 click 统一使用 AbortController。
- [ ] 搜索或筛选状态如果存在，统一放在 init 内。
- [ ] 切页前清理监听。

验收标准：

- 多次从 `/posts` 切走再回来后，点击标签只执行一次筛选。
- 标签高亮、列表过滤、空状态显示保持一致。

影响：

- 中风险；影响文章列表筛选。

### T1.5 修复 FullscreenLayout 和 404 的裸监听

文件：

- `src/layouts/FullscreenLayout.astro`
- `src/pages/404.astro`

诊断证据：

- `FullscreenLayout.astro:121-128` 主题按钮监听没有 cleanup。
- `404.astro:71-74` 直接绑定 click。

操作：

- [ ] 将主题按钮或返回按钮监听纳入生命周期。
- [ ] 若功能可以用普通链接或 CSS 完成，优先移除不必要 JS。
- [ ] 保留当前视觉和跳转行为。

验收标准：

- 切换主题不会重复触发。
- 404 返回按钮行为稳定。
- 切页后无旧 DOM 操作报错。

影响：

- 低到中风险；涉及布局级按钮。

### T1.6 修复 ArticleLayout timer cleanup

文件：

- `src/layouts/ArticleLayout.astro`

诊断证据：

- `ArticleLayout.astro:433-439`
- `ArticleLayout.astro:452-454`
- `ArticleLayout.astro:519-523`
- cleanup 在 `ArticleLayout.astro:569-575`，但没有清理 timeout。

操作：

- [ ] 梳理所有 timeout 的用途。
- [ ] 把 timeout id 放到同一个数组或作用域。
- [ ] cleanup 时统一 `clearTimeout`。
- [ ] 同步检查是否有 interval、observer、scroll listener。

验收标准：

- 快速从文章页切到其他页面时，不再对旧文章 DOM 做延迟修改。
- 文章目录、侧栏、阅读进度、评论区行为不回退。

影响：

- 中风险；涉及文章阅读体验。

## 7. Phase 2：P0 SearchModal 升级为 Command Palette 边界

### T2.1 定义搜索项和命令项契约

涉及文件：

- 新增建议：`src/lib/search-data.ts`
- 新增建议：`src/types/command.ts`
- 现有：`src/components/SearchModal.astro`

操作：

- [ ] 定义 `SearchItem`：标题、摘要、URL、类型、标签、排序权重。
- [ ] 定义 `CommandItem`：id、label、description、icon、group、keywords、action 类型。
- [ ] 确认内容搜索只是 Command Palette 的一个 group。
- [ ] 明确哪些数据在构建时生成，哪些未来由 Agent 运行时提供。

验收标准：

- SearchModal 不再自己直接 `getCollection`。
- 搜索数据可以独立 import 和测试。
- 新增一种命令类型不需要修改搜索索引构建逻辑。

影响：

- 高价值中风险；会改变 SearchModal 的数据入口。

行为衔接：

- 当前用户看到的搜索结果保持一致。
- 未来新增“运行 Agent”“打开工具”“新建任务”等命令时，走同一契约。

### T2.2 拆分 SearchModal 的服务端数据和客户端交互

诊断证据：

- `SearchModal.astro:3-44` 查询 collection 并注入 JSON。
- `SearchModal.astro:395-448` 拼 HTML、过滤、键盘导航混在一起。

建议结构：

```text
src/lib/search-data.ts
  -> buildSearchItems()
  -> buildCommandItems()

src/components/SearchModal.astro
  -> 只负责壳、输入框、结果容器、JSON 数据注入

src/scripts/search-modal.ts
  -> open/close
  -> filter
  -> keyboard navigation
  -> result rendering
```

操作：

- [ ] 先抽 `buildSearchItems()`，保持输出与当前 JSON 等价。
- [ ] 再抽客户端脚本，不改变 DOM 结构。
- [ ] 最后替换 `innerHTML` 拼接，至少集中 escape；更理想是 DOM API 创建节点。
- [ ] 搜索空状态、分组标题、键盘选中状态保持一致。

验收标准：

- `Ctrl/⌘ + K` 或当前搜索入口可打开面板。
- 输入关键词后结果数量和排序与修改前一致或更合理。
- 上下键、回车、Esc、点击外部关闭行为正常。
- 无 `any` 泄漏到核心数据契约。

影响：

- 高风险；涉及全站入口。

回滚策略：

- 保留旧 SearchModal 的数据结构快照。
- 每一步小提交，先抽数据，不同时改 UI。

### T2.3 为 Agent 命令预留入口

操作：

- [ ] 在 CommandItem 契约中预留 `kind: "route" | "content" | "tool" | "agent"`。
- [ ] Agent 项暂时不实现真实执行，只保留 disabled 或 hidden 数据能力。
- [ ] 命令分组文案先使用中性命名，如“内容”“工具”“工作空间”。

验收标准：

- 未来接入 Agent 时，不需要重写 SearchModal 架构。
- 当前用户不会看到未完成的 Agent 功能入口。

影响：

- 低风险；主要是类型和数据设计。

## 8. Phase 3：P0 Ideas 页面拆分与性能治理

### T3.1 拆出 Ideas 数据准备层

文件：

- `src/pages/ideas/index.astro`
- 新增建议：`src/lib/ideas.ts` 或 `src/data/ideas.ts`

诊断证据：

- `ideas/index.astro` 约 1450 行。
- `ideas/index.astro:26-32` 对所有 ideas 执行 `render(entry)`。

操作：

- [ ] 把分类、标签、统计、排序逻辑抽到独立函数。
- [ ] 页面 frontmatter 只保留数据调用和少量组合。
- [ ] 为每个 idea 生成轻量 card 数据。
- [ ] 判断背面 Markdown 内容是否必须首屏全量渲染。

验收标准：

- 页面 frontmatter 显著变薄。
- 不影响现有 idea 数量、分类、排序、标签统计。
- 可以独立验证 ideas 数据转换函数。

影响：

- 中风险；先动数据层，不动视觉。

### T3.2 拆出 Ideas 展示组件

建议组件：

- `src/components/ideas/IdeaCard.astro`
- `src/components/ideas/IdeaFilterTabs.astro`
- `src/components/ideas/IdeasStats.astro`
- `src/components/ideas/IdeasBoard.astro`

操作：

- [ ] 先拆无状态展示组件。
- [ ] 每个组件 Props 必须明确。
- [ ] 不把页面级 Astro 对象传入组件。
- [ ] 保持现有 class 名，降低 CSS 回归。

验收标准：

- `/ideas` 视觉不明显变化。
- 页面主文件长度明显下降。
- 每个组件职责能一句话说清。

影响：

- 中风险；主要是结构迁移。

### T3.3 抽出 Ideas 客户端行为

建议文件：

- `src/scripts/ideas-board.ts`

操作：

- [ ] 把筛选、翻牌、深链定位、动画状态从 `.astro` 内联脚本抽出。
- [ ] 使用生命周期清理模式。
- [ ] GSAP 动画只接受 DOM 引用和状态，不负责数据筛选。
- [ ] 对筛选计算抽纯函数，方便测试。

验收标准：

- 筛选、翻牌、深链定位、统计显示行为不变。
- 多次切换页面后，不重复绑定 click。
- 动画结束后状态 class 正确。

影响：

- 高风险；涉及页面核心交互。

### T3.4 降低全量 Markdown render

可选方案：

| 方案 | 做法 | 优点 | 风险 |
|---|---|---|---|
| A | 卡片只渲染摘要，详情跳转独立页面 | HTML 最轻，结构清楚 | 行为变化较大 |
| B | 背面内容按需展开，通过预生成摘要替代全文 | 保留翻牌体验 | 需要设计展开逻辑 |
| C | 保留当前全文，但拆分和延迟非关键交互 | 行为最稳 | 性能收益有限 |

建议：

- 第一阶段选 C，先结构治理。
- 第二阶段评估 A 或 B。

验收标准：

- 构建时间和 HTML 体积有记录。
- 若改为摘要或详情页，用户仍能访问完整 idea 内容。

## 9. Phase 4：P1 应用壳、图片、LikeCounter

### T4.1 抽取 Workspace 配置

文件：

- `src/components/nav/SidebarNav.astro`
- 新增建议：`src/lib/workspaces.ts`
- 可能涉及：`src/lib/routes.ts`

诊断证据：

- `SidebarNav.astro:15-24` 内部硬编码 `workspaces`。

建议数据结构：

```ts
type Workspace = {
  id: string;
  label: string;
  icon: string;
  routes: string[];
  primaryHref: string;
  groups: WorkspaceNavGroup[];
  actions?: WorkspaceAction[];
};
```

操作：

- [ ] 把 workspace 列表迁到 `src/lib/workspaces.ts`。
- [ ] 让 SidebarNav 只消费配置，不拥有业务判断。
- [ ] 兼容当前 `/content`、`/learn`、`/posts` 等路由。
- [ ] 为未来 `/agent` 预留 workspace id，但不显示未完成入口。

验收标准：

- 侧栏视觉和高亮行为不变。
- 新增 workspace 只需要改配置文件。
- `SidebarNav.astro` 不再硬编码 workspace 数据。

影响：

- 中风险；影响导航高亮。

行为衔接：

- 当前“内容宇宙 / 学习 / 文章”等入口保持原路径。
- Agent 工作台未来作为 workspace 加入，而不是临时塞进组件。

### T4.2 统一图片优化策略

文件：

- `src/pages/tools/index.astro`
- 参考：`src/pages/posts/[slug].astro`

诊断证据：

- `tools/index.astro:56-85`
- `tools/index.astro:168-183`

操作：

- [ ] 梳理工具页所有本地图片和远程图片。
- [ ] 本地图片优先改 Astro `<Image>`。
- [ ] 无法改 `<Image>` 的外部图片至少补 `width`、`height`、`loading`、`decoding`。
- [ ] 保持二维码、头像、工具图标比例稳定。

验收标准：

- 工具页无明显 CLS。
- 图片不变形、不裁切错位。
- 构建通过。

影响：

- 中风险；图片 import 方式可能影响构建。

### T4.3 LikeCounter 生命周期 cleanup

文件：

- `src/components/LikeCounter.astro`

诊断证据：

- `LikeCounter.astro:156-205` 使用 `data-ready` 防重复，但没有完整 cleanup。

操作：

- [ ] 保留 `data-ready` 作为同页防重复。
- [ ] 增加 AbortController 清理监听。
- [ ] 切页前清理局部状态。
- [ ] 检查 API 请求中的 pending 状态是否会操作旧 DOM。

验收标准：

- 点赞按钮重复切页后不重复触发。
- API 成功/失败提示行为不变。
- 断网或请求失败时无旧 DOM 报错。

影响：

- 中风险；涉及用户交互和远程 API。

### T4.4 整理 ArticleLayout 与全局侧栏契约

文件：

- `src/layouts/ArticleLayout.astro`
- `src/layouts/SidebarLayout.astro`
- `src/components/nav/SidebarNav.astro`
- `src/styles/global.css`

诊断证据：

- `ArticleLayout.astro:497-499` 直接改全局 `html[data-sidebar-*]`。

操作：

- [ ] 明确文章页是否有权控制全局侧栏状态。
- [ ] 如果有权，封装成清楚的 layout contract。
- [ ] 如果无权，改为组件内状态或 props。
- [ ] 检查移动端文章页侧栏行为。

验收标准：

- 文章页阅读体验不变。
- 离开文章页后不会遗留全局 sidebar 状态。
- Sidebar 相关状态来源可追踪。

影响：

- 中到高风险；涉及全局布局。

## 10. Phase 5：P2 数据、样式与测试治理

### T5.1 页面静态数据迁移

文件：

- `src/pages/tools/index.astro`
- `src/pages/about/index.astro`
- 新增建议：`src/data/tools.ts`
- 新增建议：`src/data/about.ts`

操作：

- [ ] 把工具资源列表迁到数据文件。
- [ ] 把 about 时间线、社交入口、技能列表等迁到数据文件。
- [ ] 页面只负责布局和组合。
- [ ] 数据类型从数据文件导出。

验收标准：

- 页面文件长度下降。
- 修改工具或 about 内容不需要碰页面结构。
- 数据字段有 TypeScript 类型保护。

影响：

- 低到中风险；主要是搬迁。

### T5.2 统一 SidebarNav 与 global.css 样式边界

文件：

- `src/components/nav/SidebarNav.astro`
- `src/styles/global.css`

操作：

- [ ] 标记所有 `app-*`、`#main-nav` 相关样式。
- [ ] 决定哪些是应用壳全局样式，哪些是 SidebarNav 局部样式。
- [ ] 全局只放 layout contract 和主题变量。
- [ ] 组件内放局部视觉、hover、active 样式。

验收标准：

- 没有同一选择器在两个地方互相覆盖。
- 侧栏暗色、亮色、移动端表现一致。
- 后续新增 workspace 不需要补全局 hack。

影响：

- 中风险；CSS 容易出现视觉回归。

### T5.3 增加 smoke 测试

建议工具：

- 如果不引入测试依赖：先写手动回归清单。
- 如果引入自动化：增加 Playwright。

首批覆盖路由：

- `/content`
- `/learn`
- `/posts`
- `/ideas`

操作：

- [ ] 打开页面，无控制台 error。
- [ ] 侧栏或顶部导航可跳转。
- [ ] 搜索面板可打开、输入、关闭。
- [ ] `/content` 空间筛选可用。
- [ ] `/learn` tab 可切换。
- [ ] `/posts` 标签筛选可用。
- [ ] `/ideas` 筛选和翻牌可用。
- [ ] 每个路由切走再回来一次，重复执行同一交互。

验收标准：

- smoke 测试能捕获重复监听、旧 DOM 操作和主要交互失效。
- 自动化测试如果加入，必须能在本地稳定运行。

验证命令：

- 基础构建：`npm run build`
- 类型检查：`npx astro check`
- 如引入 Playwright：`npx playwright test`

## 11. 回归矩阵

| 路由 | 必测行为 | 生命周期重点 | 验收口径 |
|---|---|---|---|
| `/content` | 空间筛选、卡片跳转、侧栏高亮 | 筛选监听 cleanup | 切页回来筛选只触发一次 |
| `/learn` | tab 切换、URL 状态、导航 | tab click cleanup | 多次切页无重复切换 |
| `/posts` | 标签筛选、文章跳转 | 标签 click cleanup | 标签高亮和列表一致 |
| `/posts/[slug]` | 目录、阅读进度、点赞、评论 | timer、scroll、like cleanup | 离开文章页无旧 DOM 操作 |
| `/ideas` | 筛选、翻牌、深链定位 | GSAP、click、状态 cleanup | 动画不叠加，筛选准确 |
| `/tools` | 图片加载、工具卡片、导航 | 图片 CLS、observer cleanup | 无布局跳动 |
| `/about` | 动画、复制邮箱、计时 | interval、typing cleanup | 离开页面后不继续更新 |
| `/404` | 返回按钮、主题或导航 | 裸监听 cleanup | 无重复点击副作用 |

## 12. 影响评估

### 高影响区域

- `SearchModal.astro`：全站入口，任何回归都会影响导航效率。
- `ideas/index.astro`：文件大、行为多、动画多，拆分时容易丢状态。
- `ArticleLayout.astro`：文章阅读体验和全局布局有隐式耦合。

### 中影响区域

- `SidebarNav.astro`：影响工作空间高亮和未来 Agent 入口。
- `posts/index.astro`、`learn/index.astro`：影响筛选和 tab。
- `LikeCounter.astro`：影响 API 状态和用户反馈。

### 低影响区域

- `PromptBlock.astro`：复制功能单点。
- `404.astro`：独立页面。
- 静态数据迁移：只要字段类型正确，行为风险较低。

## 13. 完成定义

一个阶段完成必须同时满足：

- [ ] `npm run build` 通过。
- [ ] `npx astro check` 通过，或记录清楚无法通过的既有原因。
- [ ] 相关路由手动回归通过。
- [ ] 多次切页后没有重复监听导致的多次触发。
- [ ] 控制台没有旧 DOM、null reference、未清理 timer 相关错误。
- [ ] 没有引入与本阶段无关的视觉大改。
- [ ] 如果修改了全局布局或搜索，必须补充截图或 smoke 测试记录。

## 14. 详细执行清单

### 第一批：必须先做

- [ ] T0.1 记录当前路由和交互基线。
- [ ] T0.2 建立脚本风险清单。
- [ ] T1.1 确定统一生命周期模式。
- [ ] T1.2 修复 PromptBlock。
- [ ] T1.3 修复 Learn tab。
- [ ] T1.4 修复 Posts 标签筛选。
- [ ] T1.5 修复 FullscreenLayout 和 404。
- [ ] T1.6 修复 ArticleLayout timer cleanup。
- [ ] 执行 `/content -> /learn -> /posts -> /ideas -> /posts/[slug]` 切页回归。
- [ ] 执行 `npm run build`。

### 第二批：为 Agent 应用壳铺路

- [ ] T4.1 抽取 Workspace 配置。
- [ ] 检查 SidebarNav 高亮和移动端导航。
- [ ] 明确未来 `/agent` workspace 的配置字段，但不暴露未完成入口。
- [ ] 回归 `/content`、`/learn`、`/posts` 侧栏高亮。

### 第三批：搜索升级

- [ ] T2.1 定义 SearchItem 和 CommandItem 契约。
- [ ] T2.2 抽 `src/lib/search-data.ts`。
- [ ] T2.2 抽 `src/scripts/search-modal.ts`。
- [ ] T2.2 替换或集中治理 `innerHTML`。
- [ ] T2.3 预留 Agent command 类型。
- [ ] 回归搜索打开、输入、键盘导航、跳转、关闭。
- [ ] 执行 `npm run build` 和 `npx astro check`。

### 第四批：Ideas 拆分

- [ ] T3.1 抽 ideas 数据准备层。
- [ ] T3.2 拆展示组件。
- [ ] T3.3 抽客户端行为。
- [ ] T3.4 评估 Markdown 全量 render 替代方案。
- [ ] 记录 `/ideas` 构建前后 HTML 体积或构建耗时。
- [ ] 回归筛选、翻牌、深链定位。

### 第五批：中低风险收口

- [ ] T4.2 统一工具页图片优化。
- [ ] T4.3 LikeCounter cleanup。
- [ ] T4.4 整理 ArticleLayout 与 Sidebar 契约。
- [ ] T5.1 静态数据迁移到 `src/data`。
- [ ] T5.2 统一 SidebarNav 和 global.css 样式边界。
- [ ] T5.3 增加 smoke 测试或手动回归脚本。

## 15. 自主决策规则

如果执行中遇到分歧，按下面规则自行决定：

1. 用户可见行为优先于内部重构完整度。
2. 生命周期 cleanup 优先于组件拆分。
3. 类型契约优先于临时 `any`。
4. 能用配置表达的工作空间，不写死在组件里。
5. 能在服务端准备的数据，不交给客户端 DOM 反推。
6. 一次只改变一个风险面：数据、结构、样式、交互不要同时大改。
7. 如果方案 A 性能收益高但行为变化大，先选行为更稳的方案 B 或 C。
8. 如果自动化测试引入成本过高，先落手动 smoke 清单，但不能省略回归。

## 16. 建议里程碑

### Milestone 1：页面切换不残留

包含：

- T1.2 到 T1.6

验收：

- `/learn`、`/posts`、`/content`、`/ideas` 来回切换后无重复点击。
- 文章页离开后无 timer 操作旧 DOM。

### Milestone 2：应用壳可扩展

包含：

- T4.1
- T4.4 初步契约整理

验收：

- workspace 数据从配置驱动。
- 后续添加 Agent workspace 不需要改 SidebarNav 内部结构。

### Milestone 3：命令面板成型

包含：

- T2.1 到 T2.3

验收：

- 搜索和命令共享统一 item 契约。
- SearchModal 不直接查询内容集合。
- 当前搜索体验不回退。

### Milestone 4：大页面瘦身

包含：

- T3.1 到 T3.4
- T5.1

验收：

- Ideas、Tools、About 页面职责更薄。
- 数据、展示、行为分层清楚。

## 17. 最终验收清单

- [ ] 所有 P0 文件完成生命周期 cleanup。
- [ ] SearchModal 拆成数据、壳、交互三层。
- [ ] Ideas 页面不再由单文件承担数据、组件、动画、筛选四类职责。
- [ ] Workspace 配置外置，能承载未来 Agent workspace。
- [ ] 工具页关键图片有尺寸和优化策略。
- [ ] LikeCounter 与 ArticleLayout 不在切页后操作旧 DOM。
- [ ] 至少有 `/content`、`/learn`、`/posts`、`/ideas` 的 smoke 回归。
- [ ] `npm run build` 通过。
- [ ] 项目没有新增未解释的全局 CSS 覆盖。
