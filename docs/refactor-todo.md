# APoSD 重构执行清单

基于 2026-05-26 设计审查报告（docs/aposd-review.md），按影响/风险比排序。
每项包含：涉及文件、验收标准、影响范围、行为衔接逻辑。

---

## Phase 1：消除信息泄漏（最高收益/最低风险）

### T1. FullscreenLayout 改为包裹 Base
- **文件**: `src/layouts/FullscreenLayout.astro`、`src/layouts/Base.astro`、`src/pages/about.astro`
- **改动**:
  1. `Base.astro` Props 新增 `fullscreen?: boolean`（默认 false）
  2. 当 `fullscreen=true` 时：隐藏 Navigation、Footer、鼠标光晕、噪点叠加、JSON-LD、环境背景
  3. `FullscreenLayout.astro` 改为 `<Base fullscreen title={...} ...><slot /></Base>`，删除独立的 HTML 外壳、HeadCommon 导入、global.css 导入
  4. 保留 FullscreenLayout 的 `fullscreen-back-btn` 浮动按钮
  5. `about.astro` 无需改动（仍使用 `<FullscreenLayout>`）
- **验收标准**:
  - `npm run build` 成功
  - `/about` 页面视觉与改动前完全一致（无导航栏、无页脚、有返回按钮）
  - `/about` 有自定义光标、有主题变量（与 Base 页面一致）
- **影响范围**: 仅 FullscreenLayout + Base。about.astro 通过 FullscreenLayout 间接影响，但接口不变。
- **行为衔接**: Base 内部通过 `fullscreen` flag 条件渲染。Navigation/Foot 等组件不感知此变化。

### T2. 创建 `src/lib/content.ts` 集中查询逻辑
- **文件**: 新建 `src/lib/content.ts`；修改 `src/pages/index.astro`、`src/pages/posts/index.astro`、`src/pages/posts/[slug].astro`、`src/pages/tools/index.astro`
- **改动**:
  1. 新建 `src/lib/content.ts`，导出：
     ```ts
     export async function getPublishedPosts() {
       return (await getCollection('log', ({ data }) =>
         data.published && data.type === 'knowledge'
       )).sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
     }
     export async function getPublishedTools() {
       return (await getCollection('log', ({ data }) =>
         data.published && (data.type === 'tool' || data.type === 'idea')
       )).sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
     }
     ```
  2. 6 处内联过滤替换为函数调用
  3. `posts/[slug].astro` 中 `getStaticPaths` 和侧边栏构建共用一次 `getPublishedPosts()` 调用（通过 props 传递 articleList）
- **验收标准**:
  - `npm run build` 成功，生成页面数量不变
  - `grep -r "data.type === 'knowledge'" src/pages/` 返回 0 结果
  - `grep -r "data.type === 'tool'" src/pages/` 返回 0 结果
- **影响范围**: 所有列表/详情页的查询逻辑。行为不变，只是集中管理。
- **行为衔接**: 查询函数是纯数据层，不影响渲染。`getStaticPaths` 的 props 传递模式不变。

### T3. 从 index.astro 移除重复的主题 CSS
- **文件**: `src/pages/index.astro`（`<style is:global>` 块）
- **改动**:
  1. 删除 index.astro 中 `body.theme-nature`、`body.theme-aurora`、`body.theme-sunset`、`body.theme-mint`、`body.theme-custom` 的 CSS 变量块（约 200 行），保留 `global.css` 中的版本
  2. 保留首页特有的样式：orb 定位、mist-overlay 配色、panel-glass 覆盖、drag cursor、pop-in 动画、spark-meteor 关键帧
  3. 将保留的首页特有样式从 `is:global` 改为 scoped（去掉 `is:global`），用 `:global()` 包裹需要穿透的选择器
- **验收标准**:
  - `npm run build` 成功
  - 首页四套主题切换视觉与改动前一致
  - 首页以外页面的主题不受影响
  - `grep "theme-nature" src/pages/index.astro` 返回 0 结果
- **影响范围**: 仅首页样式。global.css 是唯一主题来源。
- **行为衔接**: 主题切换按钮的 JS 逻辑不变（切换 body CSS 类）。CSS 变量解析来源从两个变为一个。

---

## Phase 2：消除 Pass-through（中收益/低风险）

### T4. SEO Props 使用 Rest Props 模式
- **文件**: `src/layouts/SidebarLayout.astro`、`src/layouts/ArticleLayout.astro`、`src/layouts/Base.astro`
- **改动**:
  1. SidebarLayout 和 ArticleLayout 的 Props 接口改为：
     ```ts
     interface Props {
       // 子布局自有 props
       pageTitle?: string;  // SidebarLayout only
       pageSubtitle?: string;
       pageIcon?: string;
       itemCount?: number;
       itemUnit?: string;
       headings?: Heading[];  // ArticleLayout only
       currentSlug?: string;
       articleList?: ArticleEntry[];
     }
     ```
  2. 使用 Astro 的 rest props：`const { pageTitle, ...seoProps } = Astro.props;`
  3. 传递给 Base：`<Base {...seoProps}>`
  4. Base 的 Props 接口不变
- **验收标准**:
  - `npm run build` 成功
  - 所有页面 `<head>` 中的 meta 标签与改动前一致（检查 title、description、og:image）
- **影响范围**: SidebarLayout、ArticleLayout 的接口。调用方（pages/）无需改动——它们传递的 prop 名称不变。
- **行为衔接**: Rest props 透传是 Astro 原生特性。子布局只解构自己需要的 props，其余自动传递。

---

## Phase 3：生命周期统一（中收益/中风险）

### T5. 创建 `src/scripts/with-lifecycle.ts`
- **文件**: 新建 `src/scripts/with-lifecycle.ts`；后续修改所有客户端脚本
- **改动**:
  1. 创建工具函数：
     ```ts
     export function registerLifecycle(init: () => (() => void) | void) {
       let cleanup: (() => void) | void;
       document.addEventListener('astro:page-load', () => { cleanup?.(); cleanup = init(); });
       document.addEventListener('astro:before-swap', () => cleanup?.());
     }
     ```
  2. 先在 `src/scripts/scroll-fade.ts` 中验证（最简单的脚本）
- **验收标准**:
  - `npm run build` 成功
  - 页面滚动淡入效果与改动前一致
  - View Transition 后淡入效果正常重新初始化
- **影响范围**: 仅 scroll-fade.ts。其他脚本在后续迭代中逐步迁移。
- **行为衔接**: registerLifecycle 封装了 astro:page-load/astro:before-swap 对，确保 cleanup 在 swap 前执行。

### T6. 侧边栏折叠改为单属性切换
- **文件**: `src/scripts/sidebar-state.ts`、`src/styles/global.css`、`src/components/Navigation.astro`
- **改动**:
  1. sidebar-state.ts 的 collapse 函数改为只在 `<html>` 上切换 `data-sidebar-collapsed` 属性
  2. global.css 和 Navigation.astro 中的 CSS 规则改为以 `html[data-sidebar-collapsed]` 为条件选择器
  3. 删除 `sidebar-collapsed-nav`、`sidebar-collapsed`（body 上）的类名引用
- **验收标准**:
  - `npm run build` 成功
  - 侧边栏折叠/展开视觉与改动前一致
  - 刷新后折叠状态持久化正常（localStorage）
  - `grep "sidebar-collapsed" src/scripts/sidebar-state.ts` 仅出现 data 属性引用
- **影响范围**: sidebar-state.ts + 两个 CSS 位置。行为不变。
- **行为衔接**: `localStorage` 的 key 和值不变。CSS 选择器从多类名变为单属性，语义更清晰。

---

## Phase 4：提取共享工具（低收益/低风险）

### T7. 提取 `formatDate` 到 `src/lib/format.ts`
- **文件**: 新建 `src/lib/format.ts`；修改 `src/pages/posts/index.astro`、`src/pages/posts/[slug].astro`、`src/components/RecentTraces.astro`
- **改动**:
  1. 创建 `formatDateShort(date)` 和 `formatDateLong(date)`
  2. 三处内联定义替换为导入
- **验收标准**:
  - `npm run build` 成功
  - 文章列表和详情页日期显示格式不变
- **影响范围**: 纯重构，行为不变。

### T8. 提取 `platformIconMap` 到 `src/lib/constants.ts`
- **文件**: 新建 `src/lib/constants.ts`（或扩展现有 routes.ts）；修改 `src/pages/posts/[slug].astro`
- **改动**:
  1. 将 platformIconMap 移至 `src/lib/constants.ts` 导出
  2. [slug].astro 导入使用
- **验收标准**:
  - `npm run build` 成功
  - 文章详情页视频平台图标显示不变
- **影响范围**: 纯重构，行为不变。

### T9. 提取 3D 倾斜效果到 `src/scripts/tilt-effect.ts`
- **文件**: 新建 `src/scripts/tilt-effect.ts`；修改 `src/layouts/Base.astro`、`src/pages/about.astro`
- **改动**:
  1. 创建 `setupTilt(selector, options: { perspective, maxRotation, scale })` 函数
  2. Base.astro 调用 `setupTilt('.panel-glass', { perspective: 1200, maxRotation: 2, scale: 1.008 })`
  3. about.astro 调用 `setupTilt('.postcard', { perspective: 1000, maxRotation: 8, scale: 1.02 })`
- **验收标准**:
  - `npm run build` 成功
  - 首页和关于页卡片倾斜效果不变
- **影响范围**: Base.astro 和 about.astro 的内联脚本。视觉效果不变。

### T10. LikeCounter 魔法数字提取为常量
- **文件**: `src/components/LikeCounter.astro`
- **改动**:
  1. 脚本顶部定义 `const FALLBACK_COUNT = 17861;`
  2. 5 处 `17861` 替换为 `FALLBACK_COUNT`
- **验收标准**:
  - `grep "17861" src/components/LikeCounter.astro` 返回 0 结果（只出现在常量定义中）
- **影响范围**: 纯重构，行为不变。

---

## Phase 5：单体拆分（高收益/高风险——建议最后执行）

### T11. Navigation.astro 拆分为三个子组件
- **文件**: `src/components/Navigation.astro`（拆分）；新建 `src/components/nav/TopNavBar.astro`、`src/components/nav/SidebarNav.astro`、`src/components/nav/MobileMenu.astro`
- **改动**:
  1. 提取首页顶部胶囊栏到 `TopNavBar.astro`
  2. 提取桌面侧边栏到 `SidebarNav.astro`
  3. 提取移动端汉堡菜单到 `MobileMenu.astro`
  4. Navigation.astro 变为协调器：根据 `isHome` 条件渲染对应子组件
  5. 主题切换逻辑保留在 Navigation.astro 或提取到 `src/scripts/theme-switcher.ts`
- **验收标准**:
  - `npm run build` 成功
  - 首页导航栏视觉不变（顶部胶囊）
  - 内页导航栏视觉不变（左侧边栏）
  - 移动端汉堡菜单正常
  - 主题切换正常
- **影响范围**: Navigation.astro 被 Base.astro 引用。接口不变（`<Navigation>`），仅内部拆分。
- **行为衔接**: Navigation 的 `transition:persist` 保持不变。子组件通过 props/slots 通信。

### T12. index.astro 拆分首页组件
- **文件**: `src/pages/index.astro`（拆分）；新建多个子组件
- **改动**:
  1. 提取 Spark-box modal → `src/components/home/SparkBoxModal.astro`
  2. 提取调色板面板 → `src/components/home/CustomPalette.astro`
  3. 提取 Canvas 缩放控件 → `src/components/home/CanvasZoomControls.astro`
  4. 提取拖拽/缩放/主题 JS → `src/scripts/home-canvas.ts`
  5. index.astro 精简为组合层（查询 + 布局 + 子组件组装）
- **验收标准**:
  - `npm run build` 成功
  - 首页所有交互（拖拽、缩放、主题切换、spark-box、调色板）与改动前一致
  - index.astro 行数 < 150
- **影响范围**: 仅首页。其他页面不受影响。
- **行为衔接**: 拖拽和缩放脚本需要共享 DOM 引用。通过 `data-*` 属性或 ID 约定衔接。View Transition 生命周期由 `with-lifecycle` 管理。

---

## 执行顺序与依赖

```
T1 (FullscreenLayout) ──→ 无依赖，可独立执行
T2 (content.ts)       ──→ 无依赖，可独立执行
T3 (主题CSS)           ──→ 无依赖，可独立执行
T4 (rest props)       ──→ 建议 T1 之后（Base Props 已改动）
T5 (with-lifecycle)   ──→ 无依赖，可独立执行
T6 (侧边栏折叠)        ──→ 无依赖，可独立执行
T7 (formatDate)       ──→ 无依赖，可独立执行
T8 (constants)        ──→ 无依赖，可独立执行
T9 (tilt-effect)      ──→ 建议 T5 之后（可使用 registerLifecycle）
T10 (LikeCounter)     ──→ 无依赖，可独立执行
T11 (Navigation拆分)   ──→ 建议 T3 + T6 之后（CSS 已清理）
T12 (index拆分)        ──→ 建议 T2 + T3 + T5 + T9 之后（依赖最多，最后执行）
```

**推荐执行批次**:
- **批次 1**: T1 + T2 + T3（并行，消除三个高严重性信息泄漏）
- **批次 2**: T4 + T5 + T6（消除 pass-through 和统一生命周期）
- **批次 3**: T7 + T8 + T9 + T10（提取共享工具）
- **批次 4**: T11 + T12（单体拆分，风险最高放最后）

---

## 每项完成后的通用验收

```bash
npx astro check   # 0 errors
npm run build     # 成功
```

并在浏览器中检查改动涉及的页面视觉无回归。
