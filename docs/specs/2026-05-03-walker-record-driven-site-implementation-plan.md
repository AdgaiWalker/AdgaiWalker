# Walker 记录驱动网站演进 — Implementation Plan

> 对应 spec：`docs/specs/2026-05-03-walker-record-driven-site-spec.md`  
> 原则：不推倒重来，不扩成平台；基于现有结构小步演进。  
> 目标：把 Walker 从“审美强的个人知识空间原型”推进到“记录驱动的 AI 实践知识空间”。

---

## 0. 执行总原则

### 0.1 不做的事

- 不重写整体架构。
- 不新增大量一级栏目。
- 不把首页改成 SaaS 营销页。
- 不把工具库做成全网 AI 工具大全。
- 不一次性改所有内容 frontmatter。
- 不破坏当前 `/log`、`/concept`、文章详情页的可用性。

### 0.2 优先做的事

- 先改语义，再扩数据。
- 先复用现有组件，再新增组件。
- 先让站点定位变准，再做工具库复杂功能。
- 先支持手工少量内容，再自动聚合。
- 每个阶段都能独立构建通过。

### 0.3 验证命令

每个阶段完成后至少执行：

```bash
npm run build
```

如果只是文案和路由改动，也可先执行：

```bash
npx astro check
```

---

## Phase 1：语义校准

**目标：** 不改变底层数据结构，先让站点对外表达变准确。  
**预期效果：** 访客 10 秒内知道 Walker 关注 AI 实践、工具、skills、信息源和生活回流。

### Task 1.1：导航直白化

**Files:**

- Modify: `src/components/Navigation.astro`

**改动：**

将导航从：

```text
港口 / 海域 / 概念 / 提示词
```

改为：

```text
首页 / 日志 / 工具库 / 概念
```

目标路由：

```ts
[
  { label: '首页', href: '/' },
  { label: '日志', href: '/log' },
  { label: '工具库', href: '/tools' },
  { label: '概念', href: '/concept' },
]
```

**验收：**

- 桌面端导航显示新名称。
- 移动端菜单显示新名称。
- `/tools` 高亮逻辑正确。
- `/prompts` 不再作为主导航入口。

---

### Task 1.2：首页 Hero 文案更新

**Files:**

- Modify: `src/components/HeroVideo.astro`
- Optional Modify: `src/pages/index.astro`

**改动：**

保留 `Walker` 品牌标题。

将当前副标题：

```text
行过万里水路，记录每一次停靠
```

调整为主张型文案：

```text
让 AI 承担重复，让人走进生活
```

在 Hero 中增加一行较小副文案：

```text
记录 AI 实战、AIGC 造物、工具与 skills、信息源调查，以及以安全、质量、效率为标准的个人实践。
```

原句可作为更轻的品牌签名保留：

```text
行过万里水路，记录每一次停靠
```

**实现建议：**

- `Walker` 保持最大视觉中心。
- 北极星文案作为主副标题，不要做成按钮区。
- 说明文案在移动端限制宽度，避免过长换行压迫首屏。

**验收：**

- 桌面端首屏仍然保持夜海审美。
- 移动端文案不溢出。
- 首屏能明确表达新定位。

---

### Task 1.3：首页最近内容语义调整

**Files:**

- Inspect/Modify: `src/components/RecentTraces.astro`

**改动：**

将展示语义从“最近痕迹”调整为更中性的：

```text
最近记录
```

或：

```text
最近实践
```

推荐第一版用“最近记录”，因为它能容纳随想、教程、工具、生活等多类型内容。

**验收：**

- 首页最近内容标题更新。
- 卡片结构不改变。
- 不影响 `/log` 路由。

---

## Phase 2：`/tools` 工具库入口

**目标：** 让现有 `/prompts` 自然升级为“工具库”，先复用提示词库能力，不做复杂工具系统。

### Task 2.1：新增 `/tools` 页面

**Files:**

- Create: `src/pages/tools.astro`
- Reuse/Move logic from: `src/pages/prompts.astro`

**改动：**

第一版 `/tools` 直接复用现有 prompts 页面逻辑：

- `buildPromptLibrary(allLogs)`
- `groupPromptsByConcept(prompts, allConcepts)`
- `PromptCard`

但页面文案改为“工具库”。

页面标题：

```text
工具库
```

页面说明：

```text
这里沉淀可复用的 AI 工具、skills、提示词、信息源和流程模板。第一版先从公开记录中的 PromptBlock 自动生成，后续逐步纳入 skills 与工具评测。
```

统计区第一版可保持 3 项：

- 提示词
- 概念组
- 场景标签

后续再扩展为：

- Prompt
- Skills
- 工具 / 信息源

**验收：**

- `/tools` 可访问。
- 现有 PromptCard 正常显示。
- 页面 title 为 `工具库 — Walker`。
- 搜索可索引页面内容。

---

### Task 2.2：`/prompts` 重定向到 `/tools`

**Files:**

- Modify: `src/pages/prompts.astro`

**改动：**

将 `/prompts` 页面改为静态重定向：

```astro
---
return Astro.redirect('/tools');
---
```

或使用 meta refresh 兼容静态场景。

**注意：**

Astro 静态构建下 `Astro.redirect()` 的行为需验证。若生成不符合预期，使用 `compass.astro` 类似 meta refresh。

**验收：**

- 访问 `/prompts` 会跳到 `/tools`。
- 旧链接不 404。

---

## Phase 3：概念体系补齐

**目标：** 将概念图谱核心从领域兴趣转向判断框架。

### Task 3.1：新增核心概念文件

**Files:**

- Create under: `src/content/concepts/`

新增概念：

```text
happiness.md          幸福
safety.md             安全
quality.md            质量
efficiency.md         效率
life-return.md        生活回流
ai-boundary.md        AI 边界
problem-definition.md 问题定义
information-flow.md   信息流
creative-leverage.md  创造力杠杆
```

**建议 frontmatter：**

```yaml
---
title: 安全
type: concept
symbol: "S"
domain: [AI实践]
related: [quality, efficiency, human-sovereignty, ai-boundary]
status: active
---
```

**内容结构：**

每个概念先写短版，不追求完整：

```markdown
一句话定义。

它帮助我判断：……

它反对的误区：……
```

**验收：**

- `/concept` 出现新概念。
- 图谱节点可点击。
- 构建通过。

---

### Task 3.2：概念页摘要更稳定

**Files:**

- Inspect/Modify: `src/pages/concept/[id].astro`
- Inspect/Modify: `src/utils/knowledge.ts`

**目标：**

让新增概念的第一段摘要在概念列表、工具库分组中能清楚显示。

**验收：**

- 新概念摘要不为空。
- 摘要不显示 Markdown 标记。

---

## Phase 4：内容元数据轻扩展

**目标：** 让“记录”能被投影成问题视角、工具视角和判断视角。

### Task 4.1：扩展 content schema

**Files:**

- Modify: `src/content.config.ts`

**新增可选字段：**

```ts
problem: z.string().optional(),
audience: z.array(z.string()).default([]),
assets: z.array(z.string()).default([]),
tools: z.array(z.string()).default([]),
sources: z.array(z.string()).default([]),
score: z.object({
  safety: z.enum(['高', '中', '低']).optional(),
  quality: z.enum(['高', '中', '低']).optional(),
  efficiency: z.enum(['高', '中', '低']).optional(),
  lifeReturn: z.enum(['明显', '一般', '不明显']).optional(),
}).optional(),
verdict: z.string().optional(),
```

**注意：**

全部字段必须可选或有默认值，避免旧内容构建失败。

**验收：**

- 旧内容无需修改即可构建通过。
- 新内容可以添加这些字段。

---

### Task 4.2：选择 2-3 篇内容试点补元数据

**Files:**

- Modify selected files under: `src/content/log/`

建议试点：

- `src/content/log/articles/ai-design-workflow.mdx`
- `src/content/log/dialogues/dialogue-on-subtraction.mdx`
- `src/content/log/articles/design-thinking.md`

示例：

```yaml
problem: 如何用 AI 把模糊的视觉想法推进成可执行方向？
audience: [AI创作者, 独立创作者]
tools: [AI 图片生成, PromptBlock]
score:
  safety: 高
  quality: 中
  efficiency: 高
  lifeReturn: 明显
verdict: 适合低风险风格探索，人仍需保留最终审美判断。
```

**验收：**

- 构建通过。
- 页面暂时不显示也可以。
- 后续组件可以读取这些字段。

---

## Phase 5：内容页判断块

**目标：** 将“安全 / 质量 / 效率 / 生活回流”变成 Walker 的可见判断语言。

### Task 5.1：新增 `PracticeVerdict` 组件

**Files:**

- Create: `src/components/PracticeVerdict.astro`

**Props：**

```ts
interface Props {
  score?: {
    safety?: string;
    quality?: string;
    efficiency?: string;
    lifeReturn?: string;
  };
  verdict?: string;
}
```

**显示规则：**

- 没有 `score` 且没有 `verdict` 时不渲染。
- 有任意字段时显示一个轻量卡片。
- 保持 Walker 深色细边框风格。

**文案：**

```text
实践判断
安全 / 质量 / 效率 / 生活回流
```

**验收：**

- 组件可独立渲染。
- 空数据不占位。
- 移动端不溢出。

---

### Task 5.2：文章模板接入判断块

**Files:**

- Modify: `src/components/templates/ArticleTemplate.astro`
- Consider other templates later

**位置：**

建议放在正文前、header 后：

```text
标题区
PracticeVerdict
正文
关联概念
返回日志
```

**验收：**

- 有 score 的文章显示判断块。
- 无 score 的文章保持原样。

---

## Phase 6：图谱说明与可读性

**目标：** 让图谱从“氛围化视觉”变成“可理解入口”。

### Task 6.1：首页图谱增加说明

**Files:**

- Modify: `src/components/KnowledgeGraph.astro`

**新增说明：**

在图谱容器上方或下方添加简短图例：

```text
金色节点代表核心判断框架，节点越大表示关联记录越多，连线表示概念之间的相互支撑。
```

**验收：**

- 桌面端不破坏图谱视觉。
- 移动端说明可读。

---

### Task 6.2：提高低对比文字

**Files:**

- Inspect/Modify relevant components:
  - `src/pages/log/index.astro`
  - `src/pages/prompts.astro` or `src/pages/tools.astro`
  - `src/pages/concept/index.astro`
  - `src/components/TraceCard.astro`
  - `src/components/react/LogFilterIsland.tsx`

**目标：**

减少 `text-parchment/30`、`text-mist/40` 在关键说明文本中的使用。

**验收：**

- 移动端日志筛选、摘要、说明更清晰。
- 不破坏整体克制审美。

---

## Phase 7：后续增强

这些不进入第一轮。

### 7.1 工具库独立资产 collection

当 tools 内容变多后，再考虑：

```text
src/content/assets/
```

类型：

- prompt
- skill
- collected-skill
- tool
- source
- workflow

### 7.2 JSON 输出

未来新增：

```text
/concepts.json
/records.json
/tools.json
/llms.txt
```

### 7.3 问题索引

当 `problem` 字段积累足够后，自动生成：

```text
/problems
```

但不作为早期一级导航。

---

## Recommended First PR Scope

第一 PR 只做：

- [ ] 导航改名：首页 / 日志 / 工具库 / 概念
- [ ] Hero 文案改为新北极星
- [ ] 新增 `/tools` 页面，复用提示词库逻辑
- [ ] `/prompts` 重定向到 `/tools`
- [ ] 首页“最近痕迹”改为“最近记录”
- [ ] 构建验证

不做：

- 不新增概念文件
- 不扩 schema
- 不加判断块
- 不改大量样式

理由：

> 第一 PR 只改变站点语义和入口，不改变数据模型。这样风险最低，也能最快看到 Walker 定位变准。

---

## Recommended Second PR Scope

第二 PR 做：

- [ ] 新增幸福、安全、质量、效率、生活回流、AI边界等概念
- [ ] 图谱增加说明
- [ ] 提高关键辅助文本对比度
- [ ] 构建验证

---

## Recommended Third PR Scope

第三 PR 做：

- [ ] 扩展 content schema
- [ ] 选 2-3 篇内容补元数据
- [ ] 新增 `PracticeVerdict`
- [ ] ArticleTemplate 接入判断块
- [ ] 构建验证

---

## 最终判断

这套计划的核心不是让 Walker “变大”，而是让 Walker “变准”：

```text
首页表达北极星
日志记录真实实践
工具库沉淀可复用资产
概念图谱组织判断框架
```

每一步都应保持一个人可维护。

