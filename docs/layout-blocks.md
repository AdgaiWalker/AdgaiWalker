# 布局组块设计规格

> 本文档定义博客的可复用布局组块系统。开发时按需拼装即可。

## 设计原则

1. **三层抽象**：导航层 → 展览层 → 详情层，按内容需要自由组合
2. **组块自治**：每个组块独立可用，不依赖其他组块的内部实现
3. **统一壳体**：所有页面共享 `Base.astro` 根壳（SEO、装饰层、全局导航）
4. **中文优先**：注释、文档、commit message 用中文

---

## 壳体层

### BaseShell

已有的 `Base.astro`，作为所有页面的根容器。

**职责**：HTML 壳、SEO meta、OG、JSON-LD、装饰层（粒子/光晕/噪点）、全局导航栏。

**开关**：
- `pureMode` — 关闭装饰层，用于阅读型页面
- `theme` — 色彩主题（nature/blue/emerald/charcoal）

**插槽**：
- `nav-extension` — 向 Navigation 侧边栏注入扩展内容
- 默认 slot — 页面主体内容

**不改动**，后续所有组块都在其内部拼装。

---

## 导航层

导航层的职责是**跳转**——从一个面板跳到下一个面板、跳到某篇文章、跳到某个图片墙。

### NavSidebar（已有）

即现有 `Navigation.astro`。常驻左侧，260px，可折叠至 68px。

- 桌面：固定左侧竖栏
- 移动：顶部栏 + 下拉菜单
- 快捷键 `[` 折叠，`⌘K` 搜索
- 支持 `nav-extension` slot 注入页面专属导航

### CategoryPanel

紧贴 Navigation 右侧的分类导航面板。

**用途**：在 DockLayout、资源页等需要二级分类的场景中使用。

**属性**：
| 属性 | 类型 | 说明 |
|------|------|------|
| `categories` | `{ id, label, icon, count }[]` | 分类列表 |
| `activeId` | string | 当前选中分类 |
| `collapsible` | boolean | 是否可折叠 |

**行为**：
- 竖向排列的分类项，每项含 Lucide 图标 + 标签 + 计数
- 选中项高亮（品牌色左边框 + 浅色背景）
- 宽度可拖拽调整（复用 `column-resize.ts` 机制）

### TabBar

水平标签导航，用于页面内的视图切换。

**属性**：
| 属性 | 类型 | 说明 |
|------|------|------|
| `tabs` | `{ id, label, icon? }[]` | 标签列表 |
| `activeId` | string | 当前选中 |
| `sticky` | boolean | 是否 sticky 吸顶 |

**行为**：
- 水平排列，选中项底部品牌色下划线
- 可选 sticky 吸顶

---

## 展览层

展览层的职责是**展示**——把一批内容以最合适的形式铺开，让用户快速扫览。

### CardGrid

响应式卡片网格。

**属性**：
| 属性 | 类型 | 说明 |
|------|------|------|
| `items` | `Item[]` | 数据列表 |
| `columns` | 2 \| 3 \| 4 | 列数（响应式降级） |
| `cardType` | `'tool' \| 'article' \| 'project'` | 卡片样式变体 |
| `renderCard` | slot | 自定义卡片渲染 |

**卡片变体**：
- `tool` — 名称 + 一句描述 + 评分 + 标签（用于 Dock 资源）
- `article` — 标题 + 摘要 + 日期 + 标签（用于文章列表）
- `project` — 预览图 + 标题 + 状态 + 链接（用于项目展示）

**已有参考**：`DockItemCard.astro`、`cards/ArticleCard.astro`

### ContentList

竖向列表，密度可调。

**属性**：
| 属性 | 类型 | 说明 |
|------|------|------|
| `items` | `Item[]` | 数据列表 |
| `density` | `'compact' \| 'comfortable' \| 'spacious'` | 行间距 |
| `showDate` | boolean | 是否显示日期 |
| `renderItem` | slot | 自定义行渲染 |

**密度模式**：
- `compact` — 单行，标题 + 日期，用于侧边栏文章列表
- `comfortable` — 两行，标题 + 摘要，用于列表页
- `spacious` — 带缩略图，标题 + 摘要 + 标签，用于首页推荐

**已有参考**：`ArticleSidebar.astro` 的列表视图

### ImageWall

图片墙/瀑布流。

**属性**：
| 属性 | 类型 | 说明 |
|------|------|------|
| `images` | `{ src, alt, href? }[]` | 图片列表 |
| `columns` | 2 \| 3 \| 4 | 列数 |
| `layout` | `'grid' \| 'masonry'` | 布局方式 |
| `gap` | number | 间距(px) |
| `lightbox` | boolean | 点击放大 |

**行为**：
- `grid` — 等高等宽网格，适合封面图
- `masonry` — 瀑布流，高度自适应，适合照片流
- 点击可触发 lightbox 全屏查看

### Timeline

时间线/流水账。

**属性**：
| 属性 | 类型 | 说明 |
|------|------|------|
| `items` | `{ date, content, tag? }[]` | 时间线条目 |
| `groupBy` | `'day' \| 'month' \| 'year'` | 时间分组粒度 |
| `renderItem` | slot | 自定义条目渲染 |

**行为**：
- 左侧日期轴 + 右侧内容卡片
- 按时间分组（年/月/日），组头标签
- 适合随想、更新日志、学习记录

---

## 详情层

详情层的职责是**沉浸**——用户已选定目标，进入深度消费。

### ArticleReader

文章阅读视图。

**属性**：
| 属性 | 类型 | 说明 |
|------|------|------|
| `headings` | `Heading[]` | 目录数据 |
| `pureMode` | boolean | 阅读模式（暖色背景） |
| `showTOC` | boolean | 是否显示侧栏目录 |

**行为**：
- 三栏：NavSidebar + TOC + 正文
- TOC sticky 跟随滚动，高亮当前标题
- `pureMode` 切换暖色羊皮纸背景
- 宽屏三栏，中屏隐藏 TOC，窄屏单栏

**已有参考**：`ArticleLayout.astro` + `TableOfContents.astro`

### DetailPanel

侧栏详情面板，用于非文章类内容的快速浏览。

**属性**：
| 属性 | 类型 | 说明 |
|------|------|------|
| `title` | string | 标题 |
| `metadata` | `{ label, value }[]` | 元数据行（评分、链接、标签等） |
| `content` | slot | 详情内容 |

**行为**：
- 右侧固定面板，配合 CategoryPanel + 展览层使用
- 顶部标题 + 元数据区，下方 slot 填充内容
- 用于工具详情、资源详情等非长文内容

### Lightbox

全屏图片/媒体查看器。

**属性**：
| 属性 | 类型 | 说明 |
|------|------|------|
| `src` | string | 图片地址 |
| `alt` | string | 替代文本 |
| `showNav` | boolean | 是否显示前后翻页 |

**行为**：
- 全屏遮罩 + 居中大图
- ESC 或点击遮罩关闭
- 可选前后翻页（配合 ImageWall 使用）

---

## 组合模式

以下是用组块拼装出的常见页面模式。

### 模式 A：导航 → 展览 → 详情（三层层递进）

```
[NavSidebar]  [CategoryPanel]  [CardGrid / ContentList]  [DetailPanel]
   全局导航        分类筛选           展览选择                  深入查看
```

**适用**：Dock 资源库、工具箱、装备清单

**已有实现**：`DockLayout`（需重构为组块组合）

### 模式 B：展览 → 详情（两层直通）

```
[NavSidebar]  [CardGrid / ContentList]
   全局导航         展览 → 点击 → ArticleReader / DetailPanel
```

**适用**：文章列表页（/ai、/life）、项目展示

**已有实现**：`SidebarLayout` + `ArticleLayout`

### 模式 C：纯展览（无详情层）

```
[NavSidebar]  [ImageWall / Timeline / CardGrid]
   全局导航         展览即终态，无需下钻
```

**适用**：照片墙、随想流、想法墙

### 模式 D：卡片导航（卡片即入口）

```
[NavSidebar]  [CardGrid as Nav → 跳转]
   全局导航      卡片同时承担导航和展览功能
```

**适用**：首页、分类首页（卡片点击跳转到对应展览或详情）

### 模式 E：全文阅读（单层沉浸）

```
[NavSidebar]  [ArticleReader]
   全局导航        纯阅读，无展览层
```

**适用**：文章详情页

**已有实现**：`ArticleLayout`

---

## 响应式策略

所有组块遵循统一断点：

| 断点 | 行为 |
|------|------|
| `≥ 1280px` | 完整多栏体验 |
| `1024-1279px` | 隐藏 TOC、CategoryPanel 折叠为 TabBar |
| `768-1023px` | Navigation 变为移动端顶栏，三栏变两栏或单栏 |
| `< 768px` | 单栏流式，卡片网格降为 1-2 列 |

---

## 设计令牌引用

组块使用 `global.css` 中已定义的令牌，不新建：

| 用途 | 令牌 |
|------|------|
| 品牌色 | `--color-brand` (#35bfab) |
| 卡片背景 | `--color-card` (#ffffff80) |
| 边框 | `--color-border` (#ffffffcc) |
| 主文字 | `--color-parchment` (#1a2325) |
| 次文字 | `--color-parchment-dim` (#7a8a92) |
| 玻璃态 | `.panel-glass` 类 |
| 标签 | `.tag-pill` 类 |
| 导航宽 | `--walker-nav-width` (260px) |
| 标题字体 | `--font-heading` (Sora) |
| 正文字体 | `--font-body` (Inter + Noto Sans SC) |
| 代码字体 | `--font-mono` (JetBrains Mono) |

---

## 实施优先级

按实际页面需要分批开发：

**第一批（已有页面重构）**：
1. CategoryPanel — 从 DockLayout 中抽取
2. CardGrid（tool 变体）— 从 DockItemCard 演进
3. DetailPanel — 从 DockLayout 详情区抽取

**第二批（展览层补全）**：
4. ContentList（三种密度）— 从 ArticleSidebar 演进
5. CardGrid（article 变体）— 从 ArticleCard 演进
6. TabBar — 新建

**第三批（扩展组块）**：
7. ImageWall — 新建
8. Timeline — 新建
9. Lightbox — 新建
