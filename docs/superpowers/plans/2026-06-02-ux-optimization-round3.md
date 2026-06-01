# UX 优化第三轮：全量加减法设计

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以「做加法让该存在的存在，做减法是转化不是删除」为设计哲学，解决 29 个 UX 痛点，让新访客 10 秒内理解站点结构并找到所需内容。

**Architecture:** 四阶段递进 — P0 打通用户动线断裂 → P1 提升信息密度体验 → P2 打磨交互细节 → P3 锦上添花。每阶段内按文件耦合度排序，减少上下文切换。

**Tech Stack:** Astro 6 / Tailwind CSS v4 / GSAP / TypeScript

---

## 设计哲学

### 做加法（让该存在的存在）
- 四柱导航出现在所有内页侧边栏
- 文章详情页阅读进度可视化
- TOC 在首次访问时给一次性引导
- 页脚承载基础导航

### 做减法（转化，不是删除）
- 首页不加导航栏，但让 ghost nav 首次有微动画提示
- QR 码默认收起（转化为 <details> closed）
- 内容宇宙卡片：次要标签 hover 才展示（已有，确认生效）
- 项目页 0 条时不删除页面，转化为「航行规划」预告态

---

## Phase 0: 动线修复（Critical — 断裂的用户旅程）

### Task 0.1: 侧边栏加入四柱导航

**问题：** 内页侧边栏只有 首页/内容/关于 三个链接，四柱（思考/资源/点子/项目）只在首页 Bento 画布中可访问。用户进入内页后无法到达其他核心页面。

**影响范围：** 所有使用 SidebarLayout 和 ArticleLayout 的页面

**行为衔接：**
- 侧边栏分为两组：`站内导航`（首页/内容/关于）+ `内容四柱`（思考/资源/点子/项目）
- 四柱使用小号文字 + 图标，视觉层级低于站内导航
- 当前所在页面高亮，所属柱面也高亮（如文章详情页高亮「思考」）
- 折叠态只显示图标

**Files:**
- Modify: `src/components/Navigation.astro:8-16` — navGroups 增加第二组
- Modify: `src/components/nav/SidebarNav.astro:47-79` — 渲染第二组

**验收标准：**
- [ ] 侧边栏出现「思考」「资源」「点子」「项目」四个链接
- [ ] 当前页面所属柱面高亮（如 /posts/xxx 时「思考」高亮）
- [ ] 折叠态四个柱面只显示图标
- [ ] 移动端菜单同样出现四柱
- [ ] 液态指示器覆盖两组导航

**Steps:**

- [ ] 修改 `Navigation.astro` — 在 navGroups 数组中增加第二组：

```typescript
const navGroups: NavGroup[] = [
  {
    items: [
      { label: '首页', href: HOME, icon: 'lucide:home', hint: 'Home' },
      { label: '内容', href: CONTENT, icon: 'lucide:layout-grid', hint: 'Content' },
      { label: '关于', href: ABOUT, icon: 'lucide:user', hint: 'About' },
    ]
  },
  {
    title: '内容',
    items: [
      { label: '思考', href: POSTS, icon: 'lucide:pen-line', hint: 'Posts' },
      { label: '资源', href: TOOLS, icon: 'lucide:bookmark', hint: 'Tools' },
      { label: '点子', href: IDEAS, icon: 'lucide:lightbulb', hint: 'Ideas' },
      { label: '项目', href: PROJECTS, icon: 'lucide:folder-kanban', hint: 'Projects' },
    ]
  },
];
```

- [ ] 确认 `SidebarNav.astro` 已正确渲染 `group.title`（已有 `nav-section-title` 逻辑，无需改动）
- [ ] 确认路由 import — `Navigation.astro` 顶部增加 `POSTS, TOOLS, IDEAS, PROJECTS` 导入
- [ ] 验证 — `npm run dev` → 任意内页侧边栏应出现两组导航
- [ ] Commit: `feat: add four-pillar navigation to sidebar`

---

### Task 0.2: 文章详情页 TOC 首次引导

**问题：** TOC 默认完全隐身，只有鼠标靠近右边缘或按 T 才出现。不可发现 = 不存在。

**做减法思路：** 不让 TOC 始终可见（破坏沉浸阅读），而是给首次访问者一次性的视觉引导——右边缘提示线做一次脉冲动效，3 秒后回归常态。

**行为衔接：**
- 页面加载后 1.5 秒，右边缘 `ghost-toc-hint` 做一次 0.8s 的脉冲放大动效
- 用 localStorage `walker-toc-hint-seen` 标记，只展示一次
- 已看过的用户不再打扰

**Files:**
- Modify: `src/layouts/ArticleLayout.astro:324-351` — initGhostToc 函数增加首次引导
- Modify: `src/layouts/ArticleLayout.astro:158-177` — ghost-toc-hint CSS 增加 pulse keyframe

**验收标准：**
- [ ] 首次访问文章页时，右边缘提示线做一次脉冲动效
- [ ] 动效结束后提示线回归常态（opacity: 0.6）
- [ ] 刷新页面不再重复动效（localStorage 标记）
- [ ] 清除 localStorage 后动效重现

**Steps:**

- [ ] 在 `ArticleLayout.astro` 的 `<style>` 中添加 pulse 动画：

```css
@keyframes toc-hint-pulse {
  0% { opacity: 0.6; height: 40px; }
  30% { opacity: 1; height: 80px; }
  60% { opacity: 0.8; height: 60px; }
  100% { opacity: 0.6; height: 40px; }
}

.ghost-toc-hint.is-pulsing {
  animation: toc-hint-pulse 0.8s ease-out;
}
```

- [ ] 在 `initGhostToc` 函数中添加首次引导逻辑：

```typescript
const tocHint = document.getElementById('ghost-toc-hint');
if (tocHint && !localStorage.getItem('walker-toc-hint-seen')) {
  setTimeout(() => {
    tocHint.classList.add('is-pulsing');
    tocHint.addEventListener('animationend', () => {
      tocHint.classList.remove('is-pulsing');
    }, { once: true, signal });
    localStorage.setItem('walker-toc-hint-seen', '1');
  }, 1500);
}
```

- [ ] 验证 — 清除 localStorage → 打开文章页 → 右边缘线应有一次脉冲动效
- [ ] Commit: `feat: add one-time TOC hint pulse for first-time readers`

---

### Task 0.3: 阅读进度条激活确认 + 进度百分比

**问题：** ArticleLayout 中已有阅读进度条代码（`reading-progress-bar`），但审计时 Lighthouse 数据中 `hasReadingTime: false` 且进度条可能视觉太细。需确认功能正常并增加百分比显示。

**行为衔接：**
- 进度条保持 2px 高度（不做加法），但在进度 > 5% 后在进度条末端显示小百分比文字
- 百分比文字用 10px mono 字体，贴在进度条下方

**Files:**
- Modify: `src/layouts/ArticleLayout.astro:237-254` — 进度条 CSS
- Modify: `src/layouts/ArticleLayout.astro:353-366` — initReadingProgress 函数

**验收标准：**
- [ ] 进度条随滚动平滑增长
- [ ] 进度 > 5% 时末端出现百分比数字
- [ ] 到达底部时显示 100%
- [ ] 回到顶部时数字消失

**Steps:**

- [ ] 在 `reading-progress-bar` 旁增加百分比元素：

```html
<div class="reading-progress" id="reading-progress" aria-hidden="true">
  <div class="reading-progress-bar" id="reading-progress-bar"></div>
  <span class="reading-progress-pct" id="reading-progress-pct"></span>
</div>
```

- [ ] CSS 增加百分比样式：

```css
.reading-progress-pct {
  position: fixed;
  top: 4px;
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  font-weight: 700;
  color: var(--color-brand);
  opacity: 0;
  transition: opacity 0.2s ease, left 0.1s linear;
  pointer-events: none;
}
```

- [ ] 更新 `initReadingProgress`：

```typescript
function initReadingProgress(signal: AbortSignal) {
  const bar = document.getElementById('reading-progress-bar');
  const pct = document.getElementById('reading-progress-pct');
  if (!bar) return;

  const update = () => {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress = docHeight > 0 ? Math.min(scrollTop / docHeight, 1) : 0;
    const widthPct = progress * 100;
    bar.style.width = `${widthPct}%`;

    if (pct) {
      if (progress > 0.05 && progress < 0.99) {
        pct.textContent = `${Math.round(widthPct)}%`;
        pct.style.left = `${widthPct}%`;
        pct.style.opacity = '0.7';
      } else {
        pct.style.opacity = '0';
      }
    }
  };

  window.addEventListener('scroll', update, { passive: true, signal });
  update();
}
```

- [ ] 验证 — 打开长文章 → 滚动 → 进度条 + 百分比同步
- [ ] Commit: `feat: add reading progress percentage indicator`

---

### Task 0.4: 首页导航可发现性提升

**问题：** 首页无导航栏，ghost nav（身份条 hover 才出现的「内容」「关于」「主题」链接）不可发现。首次访客不知道往哪走。

**做减法思路：** 不加固定导航栏。给 ghost nav 一个入场提示——身份条加载后延迟 2 秒做一次呼吸动效（border 微闪 + ghost nav 短暂闪现），暗示这里有东西。一次性，localStorage 标记。

**Files:**
- Modify: `src/components/home/HomeCanvas.astro:289-325` — ghost nav CSS 增加呼吸动效
- Modify: `src/scripts/home-entrance.ts` — 在入场动画末尾加入引导

**行为衔接：**
- 首页 Bento 卡片入场动画完成后（~0.5s），延迟 1.5s
- 身份条 border 做 0.6s 的微妙发光脉动
- ghost nav 短暂闪现 0.5s 然后消失
- 用 `walker-home-nav-hint-seen` 标记

**验收标准：**
- [ ] 首次访问首页时，身份条在入场后有一次性微动效提示
- [ ] 刷新不再重复
- [ ] 清除 localStorage 可复现

**Steps:**

- [ ] 在 `HomeCanvas.astro` 的 `<style>` 中添加：

```css
@keyframes directory-hint-breathe {
  0% { box-shadow: 0 0 0 0 rgba(var(--color-brand-rgb, 53, 191, 171), 0); }
  50% { box-shadow: 0 0 0 3px rgba(var(--color-brand-rgb, 53, 191, 171), 0.15); }
  100% { box-shadow: 0 0 0 0 rgba(var(--color-brand-rgb, 53, 191, 171), 0); }
}

.directory-card.is-hinting {
  animation: directory-hint-breathe 0.6s ease-out;
}

.directory-card.is-hinting .directory-ghost-nav {
  opacity: 0.7;
  transform: translateY(0);
  pointer-events: auto;
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.directory-card.hint-done .directory-ghost-nav {
  opacity: 0;
  transform: translateY(-4px);
  pointer-events: none;
  transition: opacity 0.5s ease, transform 0.5s ease;
}
```

- [ ] 在 `home-entrance.ts` 的入场动画回调中添加：

```typescript
// 一次性身份条导航引导
if (!localStorage.getItem('walker-home-nav-hint-seen')) {
  setTimeout(() => {
    const card = document.querySelector('.directory-card');
    if (!card) return;
    card.classList.add('is-hinting');
    setTimeout(() => {
      card.classList.remove('is-hinting');
      card.classList.add('hint-done');
      setTimeout(() => card.classList.remove('hint-done'), 600);
      localStorage.setItem('walker-home-nav-hint-seen', '1');
    }, 800);
  }, 1500);
}
```

- [ ] 验证 — 清除 localStorage → 刷新首页 → 身份条应有一次边框发光 + ghost nav 闪现
- [ ] Commit: `feat: add one-time navigation hint pulse on homepage`

---

### Task 0.5: 移动端搜索修复 + TOC 浮动抽屉

**问题：** 移动端搜索按钮点击无响应；文章详情页在 < 1280px 时 TOC 完全消失且无替代。

**行为衔接：**
- 移动端搜索：修复 MobileMenu 中搜索按钮的 click handler
- 移动端 TOC：在 FAB 按钮点击时弹出底部抽屉式 TOC

**Files:**
- Modify: `src/components/nav/MobileMenu.astro` — 确认搜索按钮 handler
- Modify: `src/layouts/ArticleLayout.astro:267-309` — 移动端 TOC 抽屉

**验收标准：**
- [ ] 移动端 (< 1024px) 点击搜索按钮 → Pagefind 搜索模态框打开
- [ ] 文章页移动端 FAB 点击 → 底部弹出 TOC 抽屉（最多 60vh）
- [ ] 抽屉内点击标题 → 跳转 + 抽屉关闭
- [ ] 点击遮罩 → 抽屉关闭

**Steps:**

- [ ] 检查 `MobileMenu.astro` 中搜索按钮的 `id` 是否与 `Navigation.astro` 中的 `mobileSearchBtn` 匹配。如有偏差，修正 id。
- [ ] 在 `ArticleLayout.astro` 的 FAB 按钮区域增加移动端 TOC 抽屉：

```html
{/* 移动端 TOC 抽屉 */}
{hasToc && (
  <div class="mobile-toc-drawer" id="mobile-toc-drawer">
    <div class="mobile-toc-overlay" id="mobile-toc-overlay"></div>
    <div class="mobile-toc-content">
      <div class="mobile-toc-handle"></div>
      <div class="mobile-toc-header">目录</div>
      <TableOfContents headings={headings} />
    </div>
  </div>
)}
```

- [ ] 添加 CSS：

```css
.mobile-toc-drawer {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 45;
}

.mobile-toc-drawer.is-open {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

.mobile-toc-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  opacity: 0;
  transition: opacity 0.25s ease;
}

.mobile-toc-drawer.is-open .mobile-toc-overlay {
  opacity: 1;
}

.mobile-toc-content {
  position: relative;
  max-height: 60vh;
  background: var(--color-card);
  border-top-left-radius: 1.25rem;
  border-top-right-radius: 1.25rem;
  padding: 0.75rem 1.25rem 1.5rem;
  overflow-y: auto;
  transform: translateY(100%);
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.mobile-toc-drawer.is-open .mobile-toc-content {
  transform: translateY(0);
}

.mobile-toc-handle {
  width: 2rem;
  height: 3px;
  border-radius: 2px;
  background: var(--color-nav-border);
  margin: 0 auto 0.75rem;
}

.mobile-toc-header {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--color-parchment);
  margin-bottom: 0.5rem;
}

@media (min-width: 1280px) {
  .mobile-toc-drawer { display: none !important; }
}
```

- [ ] 更新 `initFabNav` 函数：

```typescript
function initFabNav(signal: AbortSignal) {
  const fabNav = document.getElementById('article-fab-nav');
  const drawer = document.getElementById('mobile-toc-drawer');
  const overlay = document.getElementById('mobile-toc-overlay');

  if (fabNav && drawer) {
    fabNav.addEventListener('click', () => {
      drawer.classList.toggle('is-open');
    }, { signal });

    overlay?.addEventListener('click', () => {
      drawer.classList.remove('is-open');
    }, { signal });

    // 点击目录链接后关闭抽屉
    drawer.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        drawer.classList.remove('is-open');
      }, { signal });
    });
  } else if (fabNav) {
    // 非 TOC 场景，打开导航菜单
    fabNav.addEventListener('click', () => {
      document.getElementById('menu-toggle')?.click();
    }, { signal });
  }
}
```

- [ ] 验证 — 移动端宽度 → 文章页 → 点击 FAB → 底部弹出 TOC
- [ ] Commit: `feat: add mobile TOC drawer + fix mobile search trigger`

---

## Phase 1: 信息密度优化（High — 体验降级显著）

### Task 1.1: 资源页 QR 码默认收起

**问题：** 所有 `<details>` 的 `open` 属性默认展开，页面极长，QR 码信息压人。

**做减法：** 移除 `open` 属性，让用户按需展开。

**Files:**
- Modify: `src/pages/tools/index.astro:37` — `<details class="qr-details" open>` → `<details class="qr-details">`

**验收标准：**
- [ ] 页面加载时所有 QR 码区域处于收起状态
- [ ] 点击「扫码加入」展开对应 QR 码
- [ ] 展开后可正常收起

**Steps:**

- [ ] 全局搜索 `tools/index.astro` 中所有 `<details` + `open` 组合
- [ ] 移除所有 `open` 属性
- [ ] 验证 — 打开资源页 → 所有 QR 区域默认收起
- [ ] Commit: `refactor: collapse QR codes by default on tools page`

---

### Task 1.2: 资源页章节锚点导航

**问题：** 5 个 section（信息源/AI工具/Skill/基础设施/博主推荐）线性堆叠，无快速跳转。

**做加法：** 在页面顶部 intro 下方添加一个粘性 Tab 栏，点击跳转到对应 section。

**Files:**
- Modify: `src/pages/tools/index.astro` — 添加粘性锚点栏

**行为衔接：**
- Tab 栏在 intro 区域滚动出视口后变为 sticky
- 点击跳转到对应 section 的 id
- 当前 section 高亮（IntersectionObserver）

**验收标准：**
- [ ] 页面顶部出现 5 个分类 Tab
- [ ] 点击跳转到对应 section
- [ ] 滚动时当前 section 的 Tab 高亮
- [ ] 移动端 Tab 栏横向滚动

**Steps:**

- [ ] 在 `tools/index.astro` 的 intro div 之后添加锚点导航栏：

```html
<nav class="section-nav" id="section-nav">
  <a href="#info-source" class="section-nav-tab active" data-section="info-source">
    <Icon name="lucide:users" width={14} height={14} /> 信息源
  </a>
  <a href="#ai-tools" class="section-nav-tab" data-section="ai-tools">
    <Icon name="lucide:wrench" width={14} height={14} /> AI 工具
  </a>
  <a href="#skills" class="section-nav-tab" data-section="skills">
    <Icon name="lucide:cpu" width={14} height={14} /> Skill
  </a>
  <a href="#infra" class="section-nav-tab" data-section="infra">
    <Icon name="lucide:server" width={14} height={14} /> 基础设施
  </a>
  <a href="#bloggers" class="section-nav-tab" data-section="bloggers">
    <Icon name="lucide:heart" width={14} height={14} /> 博主推荐
  </a>
</nav>
```

- [ ] 为各 section 添加 id 属性（已有 `info-source`，补充其余）
- [ ] 添加 CSS（sticky + 横向滚动 + 高亮态）
- [ ] 添加 IntersectionObserver 脚本跟踪当前 section
- [ ] 验证 — 点击各 Tab → 平滑跳转 + 高亮切换
- [ ] Commit: `feat: add sticky section navigation to tools page`

---

### Task 1.3: 内容宇宙 Tab 激活态修复 + 卡片精简

**问题：**
1. ContentFilterTabs 审计中 `tabs` 没有 `active: true`（实际上 `is-active` class 和 `aria-current="page"` 都在代码中，可能是测试脚本误判）
2. 内容宇宙卡片信息过载（10+ 标签/属性）

**确认：** ContentFilterTabs.astro 的 `is-active` class 和 `aria-current` 逻辑正确。问题可能在视觉对比度。

**做减法：** 降低次要标签视觉权重——`card-topline` 中的 meta-pill 从 3 个减为 1 个（只保留 form），domain 和 intent 移到 hover 展开的 `card-details` 中。

**Files:**
- Modify: `src/components/content-universe/ContentUniverseCard.astro:34-57` — 调整标签布局

**验收标准：**
- [ ] 卡片默认只显示：日期 + 形式标签 + 标题 + 摘要 + 底部标签
- [ ] Hover 时展开：价值模式 + 状态 + AI 等级
- [ ] 卡片高度减少约 20%

**Steps:**

- [ ] 修改 `ContentUniverseCard.astro` 的 `card-topline`：

```astro
<div class="card-topline">
  <span class="date">{formatDateCompact(item.date)}</span>
  <span class="meta-pill">{formLabels[item.form]}</span>
  {item.isExternal && (
    <span class="external-indicator" aria-label="外部链接">
      <Icon name="lucide:external-link" width={15} height={15} />
    </span>
  )}
</div>
```

- [ ] 将 domain 和 intent 标签移入 `card-details`（hover 才显示区域）：

```astro
<div class="card-details" aria-label="内容属性">
  <span class="detail-chip">{domainLabels[item.domain]}</span>
  <span class="detail-chip">{intentLabels[item.intent]}</span>
  <span class="detail-chip value-mode">{valueModeLabels[item.valueMode]}</span>
  <span class="detail-chip">{statusLabel}</span>
  <span class="detail-chip ai-level">{item.aiUseLevel}</span>
</div>
```

- [ ] 验证 — 内容宇宙卡片默认更简洁，hover 展开更多信息
- [ ] Commit: `refactor: simplify content universe card — move secondary tags to hover`

---

### Task 1.4: 文章列表标签筛选

**问题：** 文章列表中标签（#设计 #AI #产品）存在但不可点击、不可筛选。

**做加法：** 在文章列表页顶部添加标签筛选栏，点击标签过滤文章。

**Files:**
- Modify: `src/pages/posts/index.astro` — 添加标签筛选 UI + 客户端脚本

**行为衔接：**
- 收集所有文章的 tags，去重，生成标签按钮
- 默认「全部」选中
- 点击某标签 → 只显示含该标签的文章，其余加 `hidden` class
- 支持多标签 OR 筛选

**验收标准：**
- [ ] 文章列表顶部出现标签筛选按钮组
- [ ] 点击标签过滤文章
- [ ] 再次点击取消筛选
- [ ] 筛选后数量更新
- [ ] URL 不变（纯客户端筛选）

**Steps:**

- [ ] 在 `posts/index.astro` 的文章列表前添加标签栏
- [ ] 为每篇文章的容器添加 `data-tags` 属性
- [ ] 添加客户端筛选脚本
- [ ] 验证 — 点击「#AI」→ 只显示 AI 标签的文章
- [ ] Commit: `feat: add tag filtering to posts list`

---

### Task 1.5: 项目页空状态转化

**问题：** 0 个项目时页面是死胡同，只有"还没有项目"+ 跳转链接。

**做减法（转化）：** 不删除页面，而是将空状态转化为「航行规划」预告——展示点子库中 status 为 building/validating 的点子，预告它们正在成为项目。

**Files:**
- Modify: `src/pages/projects/index.astro:70-80` — 空状态重设计

**行为衔接：**
- 如果有项目：正常展示（现有逻辑不变）
- 如果 0 项目 + 有活跃点子：显示「正在路上」预告卡，引用点子名称和状态
- 如果 0 项目 + 0 活跃点子：显示基础空状态 + 引导

**验收标准：**
- [ ] 0 项目时不再显示冷冰冰的"还没有项目"
- [ ] 展示正在推进的点子作为预告
- [ ] 每个预告卡可跳转到对应点子详情

**Steps:**

- [ ] 修改 `projects/index.astro`，导入 `getPublishedIdeas`：

```typescript
import { getPublishedIdeas } from '@/lib/content';

const ideas = await getPublishedIdeas();
const activeIdeas = ideas.filter(i =>
  ['validating', 'building'].includes(i.data.status || 'thinking')
);
```

- [ ] 替换空状态区域：

```astro
{projects.length === 0 && activeIdeas.length > 0 && (
  <div class="preview-section">
    <h2 class="preview-heading">正在路上</h2>
    <p class="preview-hint">这些点子正在变成项目</p>
    <div class="preview-grid">
      {activeIdeas.map(idea => (
        <a href={`/ideas#${idea.id}`} class="preview-card panel-glass">
          <span class="preview-status">{statusLabel[idea.data.status || 'thinking']}</span>
          <h3>{idea.data.title}</h3>
          <p>{idea.data.summary}</p>
        </a>
      ))}
    </div>
  </div>
)}
```

- [ ] 添加对应 CSS
- [ ] 验证 — 项目页展示正在推进的点子
- [ ] Commit: `feat: transform empty projects page into upcoming preview`

---

### Task 1.6: 点子页卡牌交互简化

**问题：** 一张牌上「查看详细构想」/「返回正面」/「返回牌面」三个按钮语义重叠。

**做减法：** 统一为单一翻转——卡牌点击即翻转，翻回同理。正面只有标题+状态，背面是详细构想。底部「阅读全文」链接保留。

**Files:**
- Modify: `src/pages/ideas/index.astro` — 卡牌按钮简化

**验收标准：**
- [ ] 点击卡牌正面 → 翻转到背面
- [ ] 点击背面「返回牌面」按钮 → 翻回正面
- [ ] 移除「查看详细构想」和「返回正面」冗余按钮
- [ ] 背面保留「阅读全文」链接

**Steps:**

- [ ] 审查 `ideas/index.astro` 中卡牌背面的按钮区域，移除冗余按钮
- [ ] 确保点击卡牌本身触发翻转
- [ ] 背面只保留一个「返回牌面」按钮 + 「阅读全文」链接
- [ ] 验证 — 卡牌交互流畅，无语义混淆
- [ ] Commit: `refactor: simplify idea card flip interaction`

---

## Phase 2: 交互细节打磨（Medium — 润色体验）

### Task 2.1: 关于页 Tab 激活态修复

**问题：** 「关于我」/「关于站」按钮没有视觉区分当前激活状态。

**Files:**
- Modify: `src/pages/about/index.astro` — Tab 按钮增加 active 样式

**验收标准：**
- [ ] 当前 Tab 有明显激活态（下划线/背景色/字重变化）
- [ ] 切换 Tab 时激活态跟随

**Steps:**

- [ ] 检查 Tab 按钮的 CSS，添加 `.is-active` 样式
- [ ] 确认 JS 切换逻辑中同步更新 active class
- [ ] Commit: `fix: add active state to about page tabs`

---

### Task 2.2: 关于页章节锚点 + 返回顶部

**问题：** 关于站 Tab 文档高度 4621px，无快速导航。

**Files:**
- Modify: `src/pages/about/index.astro` — 添加章节导航 + 返回顶部按钮

**验收标准：**
- [ ] 关于站 Tab 有章节锚点导航
- [ ] 右下角返回顶部按钮在滚动 > 300px 后出现
- [ ] 点击平滑回到顶部

**Steps:**

- [ ] 添加返回顶部 FAB（固定右下角，z-index 高于其他元素）
- [ ] JS: 滚动 > 300px 时 FAB 显示，< 300px 隐藏
- [ ] 关于站 Tab 内的 section 添加 id，顶部增加锚点链接
- [ ] Commit: `feat: add section anchors and back-to-top on about page`

---

### Task 2.3: 数据台「0 条记录」修复

**问题：** 「航行至今，留下 0 条记录」让数据台看起来是坏的。

**Files:**
- Modify: `src/components/about/AboutSiteTab.astro` — 数据台文案调整
- Modify: `src/data/site-stats.json` — 确认数据源

**做减法：** 如果确实 0 条，将文案从「留下 0 条记录」改为有意义的表述——显示总内容量而非某单一指标。

**验收标准：**
- [ ] 数据台显示有意义的数字（如内容总数而非 0）
- [ ] 或文案改为「数据正在积累中」

**Steps:**

- [ ] 检查 `site-stats.json` 中数据台的数据源
- [ ] 确认「0 条记录」对应什么字段
- [ ] 修正为显示有意义的内容或改写文案
- [ ] Commit: `fix: update dashboard empty state messaging`

---

### Task 2.4: 页脚导航增强

**问题：** 页脚只有版权文字，无任何导航链接。

**做加法：** 在版权文字上方添加一行基础导航链接（四柱 + 关于 + RSS）。

**Files:**
- Modify: `src/components/Footer.astro` — 增加导航链接

**验收标准：**
- [ ] 页脚出现 首页/思考/资源/点子/关于 链接
- [ ] 链接水平居中排列
- [ ] 保持低视觉权重（opacity 与现有版权文字一致）
- [ ] hover 提升可读性

**Steps:**

- [ ] 修改 `Footer.astro`：

```astro
<footer class="py-10 flex flex-col items-center justify-center gap-3 opacity-30 hover:opacity-60 transition-opacity duration-500">
  <nav class="flex items-center gap-4 text-[11px] font-body tracking-wide text-parchment">
    <a href="/">首页</a>
    <span class="opacity-30">·</span>
    <a href="/posts">思考</a>
    <span class="opacity-30">·</span>
    <a href="/tools">资源</a>
    <span class="opacity-30">·</span>
    <a href="/ideas">点子</a>
    <span class="opacity-30">·</span>
    <a href="/about">关于</a>
    <span class="opacity-30">·</span>
    <a href="/rss.xml">RSS</a>
  </nav>
  <div class="text-[11px] font-body tracking-widest text-parchment uppercase">
    &copy; {new Date().getFullYear()} Walker · 行过万里水路
  </div>
</footer>
```

- [ ] Commit: `feat: add navigation links to footer`

---

### Task 2.5: 面包屑导航

**问题：** 内页无法感知自己在站点结构中的位置。

**做加法：** 在 ArticleLayout 和 SidebarLayout 的页面头部添加面包屑。

**Files:**
- Modify: `src/layouts/ArticleLayout.astro` — 文章详情页面包屑
- Modify: `src/layouts/SidebarLayout.astro` — 列表页面包屑（可选）

**行为衔接：**
- 文章详情页：`思考 > 设计为人与内容搭桥`
- 列表页：不需要面包屑（已经在柱面下）

**验收标准：**
- [ ] 文章详情页标题上方出现面包屑
- [ ] 「思考」可点击跳转到 /posts
- [ ] 面包屑用小号字体，视觉层级低于标题

**Steps:**

- [ ] 在文章页的 `reading-content` 顶部 slot 之前确认是否已有面包屑。审计快照显示有 `文章 / 2026年6月1日`，这已经部分充当面包屑。确认「文章」链接指向 /posts（已确认存在）。
- [ ] 如果已有面包屑逻辑，确认视觉可读性。如需优化，增强样式。
- [ ] Commit（如有修改）: `feat: enhance breadcrumb styling on article pages`

---

### Task 2.6: 系列导航上浮

**问题：** 文章底部的系列导航（「设计思考 2/2」）和「继续阅读」区域容易错过。

**Files:**
- Modify: `src/pages/posts/[slug].astro` — 系列导航视觉增强

**验收标准：**
- [ ] 系列信息有独立背景卡片
- [ ] 当前文章在系列中的位置更明确
- [ ] 「继续阅读」卡片有更明显的视觉分隔

**Steps:**

- [ ] 检查 `[slug].astro` 中系列导航和继续阅读的模板
- [ ] 如系列信息只是纯文本，包装为 panel-glass 卡片
- [ ] 增加上下篇箭头图标
- [ ] Commit: `feat: enhance series navigation visual prominence`

---

### Task 2.7: 点子页空状态过滤器隐藏

**问题：** 「已归档 (0)」展示零值选项。

**Files:**
- Modify: `src/pages/ideas/index.astro:66-69` — 条件隐藏零值 Tab

**验收标准：**
- [ ] count 为 0 的状态 Tab 不显示
- [ ] 「全部」Tab 始终显示

**Steps:**

- [ ] 给 filter-tab 按钮添加条件渲染，跳过 count === 0 的非「全部」Tab
- [ ] Commit: `fix: hide zero-count status filter tabs on ideas page`

---

## Phase 3: 锦上添花（Low — 品质感提升）

### Task 3.1: 内容宇宙网格布局

**问题：** 11 张卡片单列排列，滚动距离长。

**Files:**
- Modify: `src/pages/content/index.astro` — 卡片容器改为双列网格

**验收标准：**
- [ ] 桌面端（≥ 1024px）双列网格
- [ ] 平板/移动端保持单列
- [ ] 卡片高度一致（grid stretch）

**Steps:**

- [ ] 为卡片容器添加 `grid grid-cols-1 md:grid-cols-2 gap-4`
- [ ] 验证 — 桌面端双列，移动端单列
- [ ] Commit: `feat: add two-column grid to content universe on desktop`

---

### Task 3.2: 页面切换加载反馈

**问题：** View Transition 有微动效但无 loading 状态。

**Files:**
- Modify: `src/scripts/page-transitions.ts` — 添加加载指示器

**验收标准：**
- [ ] 页面切换时顶部进度条闪烁
- [ ] 切换完成后隐藏

**Steps:**

- [ ] 在 `page-transitions.ts` 中监听 `astro:before-preparation` 和 `astro:after-swap`
- [ ] `before-preparation` 时在 body 顶部添加 2px 进度条
- [ ] `after-swap` 时移除
- [ ] Commit: `feat: add page transition loading indicator`

---

### Task 3.3: 推荐内容视觉增强（首页）

**问题：** 「推荐 未来已经在来了」链接太小，淹没在 Bento 画布中。

**Files:**
- Modify: `src/components/home/HomeCanvas.astro:46-52` — directory-trace 区域

**验收标准：**
- [ ] 推荐卡有微妙背景渐变
- [ ] 标题字号略大
- [ ] 整体视觉层级高于普通「最近」条目

**Steps:**

- [ ] 为 `featured` 状态的 trace 区域添加额外样式（左边框 + 渐变背景）
- [ ] Commit: `feat: enhance featured article visual prominence on homepage`

---

## 优先级总览

| Phase | 任务数 | 预计工时 | 核心目标 |
|-------|--------|----------|----------|
| P0 | 5 | 3-4h | 打通用户动线 |
| P1 | 6 | 4-5h | 信息密度优化 |
| P2 | 7 | 3-4h | 交互细节打磨 |
| P3 | 3 | 1-2h | 品质感提升 |
| **合计** | **21** | **11-15h** | |

## 依赖关系

```
Task 0.1 (四柱导航) ← 无依赖，最先做
Task 0.2 (TOC引导) ← 依赖 ArticleLayout 结构
Task 0.3 (进度条) ← 与 0.2 同文件，合并处理
Task 0.4 (首页引导) ← 依赖 home-entrance.ts
Task 0.5 (移动端) ← 依赖 ArticleLayout，可与 0.2/0.3 合并
Task 1.1 (QR码) ← 独立
Task 1.2 (资源页锚点) ← 独立
Task 1.3 (卡片精简) ← 独立
Task 1.4 (标签筛选) ← 独立
Task 1.5 (项目页) ← 依赖 content.ts 查询
Task 1.6 (卡牌简化) ← 独立
Task 2.x ← 均独立
Task 3.x ← 均独立
```

## 风险与注意事项

1. **localStorage 标记** — Task 0.2/0.4 都用 localStorage 做一次性标记，key 名需唯一不冲突
2. **Astro View Transition** — 所有客户端脚本必须用 `astro:page-load` / `astro:before-swap` 生命周期，避免内存泄漏
3. **折叠态适配** — Task 0.1 的四柱导航在侧边栏折叠时只显示图标，需确认 `data-sidebar-collapsed` CSS 兼容
4. **移动端断点** — 项目使用 1024px 和 1280px 两个关键断点，所有响应式修改需同时测试
5. **预渲染页面** — posts/tools/ideas/projects/about 均为 `prerender = true`，客户端筛选（Task 1.4）用 JS 实现，不影响 SEO
