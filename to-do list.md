# Walker Blog V2 剩余开发任务清单 (To-Do List)

本文档基于 PRD 拆解出的剩余任务，按优先级排列，作为后续开发的执行标准。

## 1. 文章列表虚拟滚动 (Virtual Scrolling)
*优先级：高 | 难度：较高*

*   **目标**：解决文章数量持续增长（>50篇）后的页面渲染性能瓶颈，利用 `Pretext.js` 预计算文章节点高度，实现平滑的虚拟化列表渲染。
*   **执行步骤**：
    1.  在 `src/pages/ai/index.astro` 和 `src/pages/life/index.astro` 中引入虚拟滚动基础逻辑（优先处理 AI 模块）。
    2.  提取单条列表项的 DOM 结构，在客户端使用 `Pretext.js` 或浏览器基础 API 计算卡片高度和垂直坐标。
    3.  建立滚动事件监听器（或 Intersection Observer），控制 DOM 中仅挂载处于当前可视区域及上下缓冲区域的节点。
    4.  处理筛选器交互逻辑：在点击不同标签后，重置已计算的高度列表并重新挂载对应的新节点集合。
*   **验收标准**：
    *   页面 DOM 节点数不会随文章数量无限增加。
    *   快速滚动页面时能维持在 60fps，不出现严重的白屏或卡顿。
    *   标签筛选功能在虚拟滚动架构下依然正常工作。

## 2. 抽离资源链接卡片组件 (ResourceCard.astro)
*优先级：高 | 难度：极低*

*   **目标**：将当前硬编码于 `src/pages/ai/[slug].astro` 的资源卡片代码解耦为独立组件，提高代码复用性与可维护性。
*   **执行步骤**：
    1.  新建文件 `src/components/ResourceCard.astro`。
    2.  将 `resourceStyleMap` 映射表及卡片的 HTML 渲染逻辑迁移至新组件。
    3.  为组件定义明确的 Props 接口：`name`, `url`, `type` (tool/feishu/download/website/github), `description`。
    4.  在文章详情页中引入该组件，通过 `.map` 循环渲染数据集合。
    5.  使用 Lucide Icon 替换可能存在的图片图标，统一图标风格（去除 Emoji 依赖）。
*   **验收标准**：
    *   `src/pages/ai/[slug].astro` 代码缩减，且不再包含内联的复杂资源样式逻辑。
    *   不同类型的链接（飞书文档、下载包、工具）能正确呈现各自定制的强调高亮样式。

## 3. 自动生成双轨 RSS 订阅
*优先级：中 | 难度：低*

*   **目标**：生成符合规范的 RSS XML 文件，并且针对 "AI 探索" 和 "生活记录" 两个子版块提供分离的订阅源。
*   **执行步骤**：
    1.  在项目中安装 `@astrojs/rss` 依赖。
    2.  在 `src/pages/` 目录下创建三个生成脚本：
        *   `rss.xml.js` (全站订阅源)
        *   `ai/rss.xml.js` (仅包含 category === 'ai' 的文章)
        *   `life/rss.xml.js` (仅包含 category === 'life' 的文章)
    3.  将 markdown 内容转换为 HTML 并注入到 RSS feed 中。
    4.  在 `Base.astro` 的 `<head>` 区域，添加全局的 `<link rel="alternate" type="application/rss+xml">` 标签以便浏览器抓取。
*   **验收标准**：
    *   通过浏览器访问上述三个 `/rss.xml` 路由均能返回结构正确且不报错的 XML 文件。
    *   各订阅源中的文章链接指向正确的线上路径，包含完整的摘要信息。

## 4. 移动端全面适配
*优先级：中 | 难度：中*

*   **目标**：保障博客在手机等窄屏设备下，阅读体验与导航操作仍然美观流畅，消除横向滚动条。
*   **执行步骤**：
    1.  **导航栏改造**：在小于 `lg` (1024px) 视口下，隐藏左侧固定侧边栏 (`Navigation.astro`)，在底部或顶部新增一个带有汉堡图标 (Lucide icon: `menu`) 的折叠导航。
    2.  **主体边距**：移除 `Base.astro` 中在小屏幕下的左侧留白 (`lg:pl-64` 等)。
    3.  **阅读区域适配**：优化 `[slug].astro` 的标题字号和内边距，确保长串英文和代码块不会导致容器撑破（应用 `overflow-x-auto`）。
    4.  **搜索功能**：检查 ⌘K 搜索弹窗在触屏设备上的触发机制（保留屏幕点击按钮触发），并调整弹窗在移动端为全屏显示或合适的缩放比例。
*   **验收标准**：
    *   视口收缩至 375px 时，无任何布局错乱和横向溢出。
    *   移动设备上可以通过新的折叠导航无障碍地访问 AI 探索、生活日志和关于页面。

## 5. SEO 补全与性能审计
*优先级：低 | 难度：低*

*   **目标**：补齐各个页面的 TDK (Title, Description, Keywords) 信息，通过本地 Lighthouse 测试，达到性能和 SEO 双 95+ 评分。
*   **执行步骤**：
    1.  完善分类汇总页（如 `ai/index.astro`, `life/index.astro`）的 Meta 标签，向 `Base.astro` 传入特定且有意义的 `ogDescription`。
    2.  审查 Bilibili iframe 视频等外部组件，强制启用懒加载特性 (`loading="lazy"` / `<lite-youtube>` 类似的延迟加载方案)。
    3.  清理无用 CSS，核对构建后资源大小。
    4.  启动本地 `npm run build` 和 `npm run preview`，使用浏览器自带的 Lighthouse 进行跑分。
*   **验收标准**：
    *   每个路由页都有独立、准确的页面标题与抓取描述。
    *   Lighthouse 的 Performance、Accessibility、Best Practices 和 SEO 四个维度跑分均不低于 95 分。
