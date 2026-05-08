# Walker Blog 开发任务清单

## 空间规则

1. 尽量用中文表述
2. 如果没有显性要求，尽量不要写兼容代码
3. 使用 Lucide icon 库，尽量不要使用 Emoji

---

## P0 — 必须修

### 任务 1：创建 404 页面

**目标：** 新建 `src/pages/404.astro`，用户访问不存在的路径时显示友好的错误页面

**验收标准：**
- [ ] 访问任意不存在的路径（如 `/abc`）显示 404 页面
- [ ] 页面包含：错误提示文案 + 返回首页按钮
- [ ] 复用 Base 布局，视觉风格与站点一致
- [ ] 使用 Lucide 图标，不使用 Emoji

---

### 任务 2：修复 coral 颜色未定义

**目标：** 在 CSS `@theme` 中定义 `--color-coral`，使全站 `text-coral`、`bg-coral`、`border-coral` 等样式生效

**验收标准：**
- [ ] `global.css` 的 `@theme` 块中新增 `--color-coral`
- [ ] 首页"喜欢计数"区域、日志标签等使用 coral 色的元素可见颜色
- [ ] 颜色值与站点暖色调主题协调

---

### 任务 3：清理 CSS 重复定义

**目标：** 删除 `#custom-cursor` 的重复定义，合并 `.reading-mode` 重复规则

**验收标准：**
- [ ] `#custom-cursor` 只保留一组定义（圆形版本）
- [ ] `.reading-mode nav` 和 `.reading-mode .panel-glass` 各只保留一组
- [ ] 自定义光标交互正常，阅读模式样式正常

---

## P1 — SEO + 可用性

### 任务 4：更新站点域名配置

**目标：** 将 `astro.config.mjs` 中的 `site` 改为实际域名

**验收标准：**
- [ ] `site` 值改为 `https://iwalk.pro`
- [ ] 构建不报错

---

### 任务 5：字体切换国内镜像

**目标：** 解决国内用户 Google Fonts 加载失败的问题

**验收标准：**
- [ ] `Base.astro` 中 Google Fonts CDN 域名改为 `fonts.googleapis.cn`
- [ ] 页面中 Sora、Noto Sans SC、JetBrains Mono 字体正常渲染
- [ ] 国内网络环境可正常加载

---

### 任务 6：更新社交链接和联系方式

**目标：** 替换所有占位链接为真实地址

**验收标准：**
- [ ] 首页社交区只保留：抖音 + GitHub
- [ ] 全站邮箱统一为 `praxiswalker@gmail.com`
- [ ] 其他组件（SocialLinks、Navigation 侧栏等）中的 B站、小红书、知乎链接更新为真实地址
- [ ] 无残留的 `href="#"` 社交链接

---

### 任务 7：添加 Open Graph + Twitter Card

**目标：** 分享链接到社交平台时展示预览卡片

**验收标准：**
- [ ] Base 布局新增 `ogImage`、`ogTitle`、`ogDescription`、`canonicalUrl` props（`canonicalUrl` 缺省时用 `Astro.url` 自动获取）
- [ ] 所有页面输出 `og:title`、`og:description`、`og:image`、`og:url`（canonical）、`og:type`
- [ ] 所有页面输出 `twitter:card`、`twitter:title`、`twitter:image`
- [ ] `log/[...slug].astro` 显式传入文章的 `title` 作为 `ogTitle`、`summary`（或 `description`）作为 `ogDescription`

---

### 任务 8：添加 RSS 订阅

**目标：** 提供 RSS 订阅源，方便读者用阅读器追踪更新

**验收标准：**
- [ ] 安装 `@astrojs/rss` 依赖
- [ ] 新建 `src/pages/rss.xml.ts`，输出 `log` 集合内容
- [ ] Base 布局 head 中添加 RSS 发现链接
- [ ] 访问 `/rss.xml` 返回有效的 RSS XML
- [ ] Navigation 侧栏中 RSS 链接指向 `/rss.xml`

---

### 任务 9：添加 Sitemap

**目标：** 自动生成站点地图，便于搜索引擎收录

**验收标准：**
- [ ] 安装 `@astrojs/sitemap` 依赖
- [ ] `astro.config.mjs` 中集成 sitemap
- [ ] 构建后在 `dist/` 中生成 `sitemap-index.xml`

---

### 任务 10：添加 robots.txt

**目标：** 引导搜索引擎爬虫正确抓取站点

**验收标准：**
- [ ] `public/robots.txt` 允许所有爬虫
- [ ] 指向 sitemap 地址 `https://iwalk.pro/sitemap-index.xml`

---

## P2 — 点赞功能

### 任务 11：Supabase 点赞系统

**目标：** 实现首页真实点赞计数功能

**验收标准：**
- [ ] Supabase 创建 `likes` 表（`page_path` + `count`）
- [ ] 前端点赞按钮从 Supabase 读取真实计数
- [ ] 点赞后数字 +1 并动画反馈
- [ ] localStorage 记录已点赞状态，防止重复点击
- [ ] 数据加载失败时优雅降级，不显示错误
- [ ] 使用 Lucide 图标替代原有装饰元素

**前置条件：** 需要用户提供 Supabase 项目 URL 和 anon key

---

## P3 — 代码清理

### 任务 12：删除废弃组件

**目标：** 移除 13 个未被任何页面引用的组件文件

**验收标准：**
- [ ] 删除以下文件：ClockWidget、HeroBanner、HeroVideo、SectionCard、ActivityFeed、IdeaTagFilter、DockCategoryFilter、DimensionFilter、PlatformFilter、TagFilter、HarborAbout、DomainEntries、LatestContent
- [ ] 构建不报错
- [ ] 全站功能无回归

---

### 任务 13：补充 summary 字段定义

**目标：** 在内容 schema 中补充 `summary` 字段

**验收标准：**
- [ ] `src/content.config.ts` 的 log schema 中新增可选 `summary` 字段
- [ ] 文章详情页已有读取逻辑，补上定义后正常渲染

---

### 任务 14：修正导航标签文案

**目标：** WalkerProfile 中的导航标签更准确地描述目标页面

**验收标准：**
- [ ] "近期文章" → "航海日志"
- [ ] "推荐分享" → "补给舱"
- [ ] "优秀博客" → "指南针"

---

## 执行顺序

```
P0（1→2→3）→ P1（4→5→6→7→8→9→10）→ P3（12→13→14）→ P2（11，等待 Supabase 信息）
```
