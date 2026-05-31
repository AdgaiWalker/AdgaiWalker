# /ideas 页面重做 — 交接文档

> 日期：2026-05-31
> 状态：待实施
> 目标：将 /ideas 从列表页改造为卡牌桌风格的点子展示页

---

## 一、背景

Walker 的个人站点 (iwalk.pro) 有一个 /ideas 页面，目前是一个简单的列表，展示 `type: idea` 的内容。需要重做为"卡牌桌"风格——页面本身就是一个点子的原型演示。

## 二、已完成的工作

### 2.1 Schema 状态枚举更新

`src/content.config.ts` 第 30 行，status 枚举已从：
```ts
status: z.enum(['thinking', 'practicing', 'verified', 'archived']).optional()
```
改为：
```ts
status: z.enum(['thinking', 'validating', 'building', 'verified', 'archived']).optional()
```

### 2.2 所有引用 `practicing` 的代码已更新

以下文件已完成修改，无需再动：

| 文件 | 变更内容 |
|------|---------|
| `src/content.config.ts` | status 枚举更新 |
| `src/pages/ideas/index.astro` | statusLabel 映射更新 |
| `src/pages/projects/index.astro` | statusLabel 映射更新 |
| `src/components/content-universe/ContentUniverseCard.astro` | statusLabels 映射更新 |
| `src/lib/content-model.ts` | `itemBelongsToSpace` 中 `practicing` → `validating \|\| building` |
| `src/pages/llms.txt.ts` | AI 规则文案 `practicing` → `validating` |

### 2.3 两个 idea 内容文件已创建

| 文件 | 说明 |
|------|------|
| `src/content/log/cli-command-panel.md` | CLI 命令面板的点子（status: thinking） |
| `src/content/log/card-table-ideas-page.md` | 卡牌桌页面设计本身的点子（status: building） |

## 三、状态生命周期

新的状态流：

```
💡 thinking → 🔬 validating → ⚡ building → ✅ verified
                                           ↘ 📁 archived
```

| 状态 | 中文 | 含义 | 触发条件 |
|------|------|------|---------|
| thinking | 构思中 | 想出来了，写下来了 | 自己想的 |
| validating | 验证中 | 有人在看了，在验证 | 有人联系你 |
| building | 实现中 | 动手做了 | 验证通过开始做 |
| verified | 已完成 | 做出来了 | 产出落地 |
| archived | 已归档 | 放弃或被取代 | 不再推进 |

## 四、页面设计方案：卡牌桌

### 4.1 核心概念

**页面本身就是一个点子。** 不只是展示点子列表，而是演示"卡牌式技能加载器"的交互概念。点子以卡牌形式散落在桌面上，状态决定牌的视觉表现。

### 4.2 卡牌状态视觉

| 状态 | 牌面表现 | CSS 实现 |
|------|---------|---------|
| thinking | 牌背朝上，模糊轮廓 | `filter: blur(3px)` + 半透明遮罩，hover 时轻微减淡 |
| validating | 翻开了，有雾气 | 内容可见，边框有微光（`box-shadow` 蓝色光晕） |
| building | 发光/燃烧 | 光晕效果（`box-shadow` 紫色/金色光晕 + 轻微脉冲动画） |
| verified | 完全展示，清晰 | 正常显示，有完成标记 ✅ |
| archived | 褪色 | `opacity: 0.5` + `saturate(0.3)` |

### 4.3 卡牌交互

- **悬停**：牌微微抬起（`transform: translateY(-4px) scale(1.02)`），桌面有微弱阴影变化
- **点击**：翻开牌，展开完整内容（可以用 CSS transition 做 3D flip，或简单展开详情面板）
- **筛选**：顶部状态标签栏，点击筛选对应状态的牌（URL query 驱动 `?status=thinking`，与 `/content` 页面模式一致）

### 4.4 页面结构

```
SidebarLayout (保留现有布局框架)
├── page-header: "点子" / "Ideas" + 计数
├── 简短说明
│   "冒出来的想法，开放给所有人。感兴趣就联系我，一起做。"
├── 状态筛选标签栏
│   [全部] [💡 构思中] [🔬 验证中] [⚡ 实现中] [✅ 已完成] [📁 已归档]
├── 卡牌桌区域
│   背景：微妙的桌面纹理（可以用 CSS 渐变模拟木质/毡布质感）
│   卡牌网格：CSS Grid，2-3 列，响应式
│   每张卡：
│     - 状态决定视觉效果（见 4.2）
│     - 标题
│     - summary（line-clamp-3）
│     - 状态徽章（颜色区分）
│     - 标签（最多 4 个）
│   空状态："还没有点子。冒出来就会放上来。"
└── 底部 CTA
    panel-glass 面板："看中了哪张牌？来组队。"
    → 邮箱/社交链接
```

### 4.5 技术要求

- **框架**：Astro 组件，保留 `SidebarLayout`
- **样式**：`<style>` scoped CSS，使用站点 CSS 变量（`--color-brand`、`--color-surface-rgb`、`--color-border-rgb` 等）
- **图标**：`astro-icon` + `lucide` 图标
- **筛选**：纯客户端 JS（`<script>` 标签），URL query 驱动，参考 `/content` 页面的 `ContentFilterTabs` 实现
- **响应式**：桌面 2-3 列，平板 2 列，手机 1 列
- **prerender**：`export const prerender = true`
- **数据源**：`getPublishedIdeas()` from `@/lib/content`，返回 `CollectionEntry<'log'>[]`
- **卡牌 flip 效果**：优先用 CSS 3D transform（`perspective` + `rotateY`），不引入新依赖

### 4.6 关键 CSS 变量参考

从站点 `global.css` 中继承的变量：
```css
--color-brand: #c4704a;
--color-brand-rgb: 196, 112, 74;
--color-surface-rgb: 255, 255, 255;
--color-border-rgb: 121, 85, 72;
--color-shadow-rgb: 75, 54, 42;
--color-muted-rgb: 63, 48, 39;
--color-text: #3f3027;
--color-heading: var(--color-text);
--color-text-muted: rgba(63, 48, 39, 0.64);
--font-heading: Averia Gruesa Libre, Outfit;
--font-body: Outfit;
--font-mono: JetBrains Mono;
```

面板样式使用 `.panel-glass`：
```css
background: rgba(var(--color-surface-rgb), 0.4-0.6);
border: 1px solid rgba(var(--color-border-rgb), 0.08-0.12);
backdrop-filter: blur(8-12px);
border-radius: 1rem;
```

## 五、需要修改的文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/pages/ideas/index.astro` | **重写** | 从列表改为卡牌桌 |
| `src/content/log/card-table-ideas-page.md` | **更新** | 实现完成后 status 改为 `verified` |

其他文件不需要修改。数据查询（`getPublishedIdeas`）、schema、statusLabel 映射都已就绪。

## 六、现有参考文件

| 文件 | 参考价值 |
|------|---------|
| `src/pages/content/index.astro` | 客户端筛选标签 + URL query 驱动的实现模式 |
| `src/pages/tools/index.astro` | SidebarLayout 内嵌复杂分区的样式参考 |
| `src/components/content-universe/ContentUniverseCard.astro` | 卡片样式参考 |
| `src/layouts/SidebarLayout.astro` | 布局框架 |
| `src/lib/content.ts` | `getPublishedIdeas()` 数据查询 |
| `src/content.config.ts` | Schema 定义 |

## 七、验收标准

1. `/ideas` 页面展示卡牌网格，状态视觉区分明显
2. 状态筛选功能正常（点击标签 → URL query 变化 → 卡牌过滤）
3. 构思中的点子有模糊/遮罩效果，验证中有光晕，实现中有脉冲，已完成清晰
4. 底部 CTA 可见，有联系方式入口
5. 空状态优雅（目前有 2 条 idea 内容，不会触发空状态）
6. 响应式：桌面 ≥2 列，手机 1 列
7. `npm run build` 构建成功
8. 完成后更新 `card-table-ideas-page.md` 的 status 为 `verified`

## 八、完成后

将 `src/content/log/card-table-ideas-page.md` 的 `status: building` 改为 `status: verified`。
