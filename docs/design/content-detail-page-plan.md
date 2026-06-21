# 内容详情页完整执行方案

> **历史输入，不再作为执行入口（2026-06-20）**  
> 当前事实、优先级与执行边界以 `后台与内容详情页综合实施方案.md` 和 `后台与内容详情页综合可执行-to-do.md` 为准。本文件保留设计推演背景；其中 localStorage 反馈降级、`src/_archive` 归档和旧验证数字不得直接执行。
>
> 基于多轮设计讨论（geju / hai-idea / hai-goal）与 Phase 1 实施后审查结果制定。
> 本文件不是当前权威执行入口。

---

## 一、设计决策（已定稿）

### 核心架构

**块自声明宽度，无 layoutMode。** 布局是块的涌现，不是容器的决策。

- 内容存 `.mdx`：frontmatter 放文档级元数据，body 放块序列
- `ContentShell` 替代 `ArticleLayout`：只提供阅读基础设施（进度条、TOC、反馈带、评论区），不探测第一块类型
- 文章 `max-width: 700px` 始终居中，TOC 浮在右侧空白区，不挤文章

### 决策依据

| 决策 | 来源 | 验证状态 |
|------|------|---------|
| 杀掉 layoutMode 概念 | geju 格局判断 | ✅ 代码中零匹配 |
| 块自声明宽度（full/normal/narrow） | geju + Codex入门.mdx 验证 | ✅ 三种宽度渲染正确 |
| 走 mdx 存储（body 放块 + fm 放元数据） | hai-idea 评估 + 用户确认 | ✅ Codex入门.mdx 通过 |
| TOC fixed 在文章右侧空白区 | 6 轮迭代后定稿 | ✅ 不挤文章，可折叠 |
| 值得做 | hai-idea verdict: Do | ✅ Phase 1 完成 |

### 不做的事（Non-goals）

- 所见即所得块编辑器（`/` 命令插入块）——独立工作包
- `BlockAiChat`（DeepSeek 嵌入正文）——依赖网关集成
- `BlockGallery` —— gallery form 暂无可发布内容
- `BlockSkillCard` v1 —— skill 数据路由未定
- 拖拽调节 TOC 宽度 —— 阅读场景不需要

---

## 二、当前状态（Phase 1 已完成）

### 已交付文件

| 文件 | 职责 |
|------|------|
| `src/knowledge/block-types.ts` | `BlockWidth` 类型定义 |
| `src/components/blocks/BlockVideo.astro` | 视频块，默认 `width="full"` |
| `src/components/blocks/BlockPrompt.astro` | 提示词块，默认 `width="normal"`，带复制按钮 |
| `src/components/blocks/BlockDialogue.astro` | 对话块，默认 `width="narrow"` |
| `src/layouts/ContentShell.astro` | 统一阅读容器（替代 ArticleLayout） |
| `src/content/log/Codex入门.mdx` | 验证文章（BlockVideo + BlockPrompt + 纯文字） |

### 验证结果

```
npm run build        → ✓ 0 errors
Pagefind             → Indexed 15 pages, 2270 words
Codex入门.mdx        → cs-block--full → cs-block--normal → 纯文字，宽度自然流动
17 篇文章            → 全部走 ContentShell，0 退化
layoutMode 概念      → 代码中零匹配
```

### TOC 定稿方案（6 轮迭代后）

走过的弯路（不要再走）：
- ❌ ghost TOC（hover 右边缘触发）—— 可发现性 = 0
- ❌ sticky 双栏 flex —— 挤占正文
- ❌ 右下角浮动按钮 —— 要滑到底才看见
- ❌ inline 卡片 + sticky 指示条 + 顶部抽屉 —— 三套并行，复杂

**定稿**：`position: fixed; left: calc(50% + 362px)`，钉在文章右边缘外侧空白区。折叠按钮贴在 TOC 标题旁，展开按钮贴在 TOC 原位置。状态存 localStorage。

---

## 三、审查问题修复（立即执行）

### 高优先级（影响功能）

#### 1. TOC 自动滚动失效：选择器过时

- **位置**：`src/scripts/toc-highlight.ts:44`
- **问题**：`toc.closest('.ghost-toc-inner')` —— `.ghost-toc-inner` 已改名 `.toc-sidebar-inner`，选择器匹配不到，fallback 到 `|| toc`，TOC 容器自动滚动可能失效
- **修复**：`.ghost-toc-inner` → `.toc-sidebar-inner`

#### 2. 死代码：`.cs-layout` 和 `.toc-fab` 残留

- **位置**：`src/layouts/ContentShell.astro:245`、`:334`
- **问题**：
  - `.cs-layout { padding: 0 1rem; }` —— `.cs-layout` 类已从模板删除
  - `.toc-fab { bottom: 1rem; right: 1rem; }` —— `.toc-fab` 已删除
- **修复**：删除这两条 CSS 规则

### 中优先级（代码质量）

#### 3. 魔法数字：TOC 定位 `362px` 硬编码

- **位置**：`src/layouts/ContentShell.astro:154`、`:212`
- **问题**：`left: calc(50% + 362px)` 出现两次，362 = 350（正文一半）+ 12（间距），无注释。正文宽度改了要手动改两处。
- **修复**：用 CSS 变量
  ```css
  .reading-space {
    --cs-toc-offset: calc(var(--cs-width-normal) / 2 + 0.75rem);
  }
  .toc-sidebar { left: calc(50% + var(--cs-toc-offset)); }
  .toc-expand-btn { left: calc(50% + var(--cs-toc-offset)); }
  ```

#### 4. DRY：折叠/展开状态切换逻辑重复

- **位置**：`src/layouts/ContentShell.astro:405-423`
- **问题**：三处都在写同样的四行（classList.toggle + 两个 hidden + localStorage）
- **修复**：抽 `setCollapsed(collapsed: boolean)` 函数

#### 5. 未使用常量：`BLOCK_WIDTH_STYLES`

- **位置**：`src/knowledge/block-types.ts:6-10`
- **问题**：定义了但无人引用，实际宽度在 ContentShell CSS 变量里——两套真相源
- **修复**：删除 `BLOCK_WIDTH_STYLES`（CSS 是宽度唯一真相源）

### 低优先级（可选）

#### 6. `BlockDialogue` class 拼接风格不统一

- **位置**：`src/components/blocks/BlockDialogue.astro:15-23`
- **问题**：用字符串插值拼 class，其他两个 Block 用 `class:list`
- **修复**：统一改 `class:list`

#### 7. 注释与代码不符

- **位置**：`ContentShell.astro:11, 67, 148-149`
- **问题**：Phase 命名跟 hai-goal 文档不一致；间距注释说 1.5rem 但实际 0.75rem
- **修复**：统一 Phase 命名，修正间距注释

---

## 四、后续 Phase（既定路线，未启动）

### Phase 2 — 规模交付

**目标**：所有文章统一由 ContentShell 渲染；反馈带就位，接 hit-rate 系统。

| 任务 | 产出 |
|------|------|
| `BlockLike.astro` | 从 `LikeCounter` 收拢，嵌入反馈带 |
| `BlockFeedback.astro` | 「有用吗」三按钮（有用/需补充/已过时），POST 到 hit-rate API |
| ContentShell 反馈带集成 | 点赞 + 有用吗定位在固定反馈带位置 |
| 16 篇 `.md` → `.mdx` 迁移 | 仅重命名 + 验证渲染（不插组件） |
| Pagefind re-index 验证 | 确认搜索结果包含所有 17 篇 |
| frontmatter `videos`/`resources` 清理 | 确认无引用后从 schema 标记 deprecated |
| `ArticleLayout` 退役 | 确认 ContentShell 覆盖所有文章后删除 |

**Stop condition**：任何文章在 ContentShell 下出现视觉退化，且需回退 ArticleLayout 才能恢复。

### Phase 3 — 杠杆加速

**目标**：增加块类型，让作者能更自由组合内容形态。

| 任务 | 产出 |
|------|------|
| `BlockCallout.astro` | 高亮提示块（笔记/警告/引用，飞书式） |
| `BlockResource.astro` | 资源链接块（替代 frontmatter `resources` 字段） |
| `BlockStep.astro` | 步骤块（教程用，编号 + 完成态） |
| 新块在新文章中使用 | 至少一篇公开文章使用新增块类型 |

**规则**：新 block 必须遵循宽度协议（`width: 'full' | 'normal' | 'narrow'`），不要求修改 ContentShell。

---

## 五、执行顺序

```
现在 → 三、审查问题修复（高+中，约 30 分钟）
       ↓
效果稳定 → 四、Phase 2（按需启动）
       ↓
Phase 2 完成 → Phase 3（按需启动）
```

---

## 六、关键文件索引

| 文件 | 职责 |
|------|------|
| `src/layouts/ContentShell.astro` | 统一阅读容器 |
| `src/components/blocks/*.astro` | Block 组件库 |
| `src/knowledge/block-types.ts` | `BlockWidth` 类型 |
| `src/scripts/toc-highlight.ts` | TOC 滚动高亮 |
| `src/pages/posts/[slug].astro` | 详情页入口（调用 ContentShell） |
| `src/content/log/Codex入门.mdx` | 验证文章 |

---

## 七、设计原则（不可动摇）

1. **文章始终居中** —— TOC 开关、块宽度变化都不影响文章 700px 居中
2. **块自声明宽度** —— 容器不探测、不决策布局
3. **一套 UI 通吃桌面和移动端** —— 不做响应式分支（除非屏幕物理放不下）
4. **可发现性 > 简洁** —— TOC 必须第一眼能看见，不再做 ghost 隐藏式
5. **不挤占阅读** —— 任何侧边元素都用 fixed/absolute 放在空白区，不进 flex 流
