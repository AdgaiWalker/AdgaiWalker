# Walker / iwalk.pro 文档入口

本文档是当前唯一的决策入口。旧 PRD、旧架构设计、旧 Agent 规划和历史讨论将归档到 `archive/`，不再作为当前判断依据。

---

## 1. 当前现状

### 1.1 一句话定位

iwalk.pro 是 Walker 的个人实践场 / 样板节点，用来沉淀内容、点子、工具、方法、生活切片和 AI 协作经验。

更大的长期方向是：

> 用点子连接人与 AI，也连接人与人；独自前行时，人决策，AI 执行；共同前行时，点子让人成为同行者。

### 1.2 三个系统的关系

- **FerrySpec**：演化中的世界协议，不是固定教条。它提供人类主权、熵减命令、蓝图/现实/日志、P0-P4、Skill/Flow/Log 等当前有效的方法论。
- **iwalk.pro**：个人实践场，验证一个人如何组织内容、点子、生活、工具、方法、复盘和 AI 接口。
- **NorthStar / PanGen AI Compass**：社会实践场，未来承载多人个人系统网络与点子共创平台。

三者关系：

```text
Ferry 当前协议
  ↓ 指导
iwalk.pro 个人实践场 / NorthStar 社会实践场
  ↓ 产生阻滞、偏差、数据、反馈
Ferry vNext 方法论更新
```

### 1.3 当前站点技术现状

- 框架：Astro 6
- 部署：Vercel SSR adapter
- 样式：Tailwind CSS v4 + 全局 CSS 变量
- 内容：Astro Content Collections，集合名为 `log`
- 搜索：Pagefind
- 点赞：Upstash Redis（Vercel Marketplace）via `/api/like`
- 评论：Giscus（GitHub Discussions）
- 图标：Lucide via `astro-icon`
- AI 接口：`/llms.txt`、`/walker-style.md`、`/index.json`（已上线）
- 当前主要路由：`/`、`/posts`、`/posts/[slug]`、`/tools`、`/ideas`、`/projects`、`/content`、`/about`

---

## 2. 当前问题

1. **决策文档过多**：PRD、站点架构、技术架构、Agent 架构、新总架构分散在多个文件里，容易互相冲突。
2. **当前路由和长期方向不一致**：现状仍是 `/posts`、`/tools`、`/ideas`、`/projects` 等多入口；新方向是主导航收敛为 `首页 / 内容 / 关于`，由 `/content` 承载内容宇宙。
3. **内容结构不够可扩展**：现有 `type` 不足以表达厨艺、书法、日记、吐槽、视频、图片、点子生命周期、存在价值等内容。
4. **AI 可读接口未落地** ~~已落地（2026-05-31）：`/llms.txt`、`/walker-style.md`、`/index.json` 均已上线且使用 `prerender = true`~~。
5. **数据台未落地** ~~轻量版已上线（2026-05-31）：关于站 → 数据台 section，含内容数量统计和空间分布。完整分析后台待 Plan 4~~。
6. **iwalk.pro 与 NorthStar 边界需要保持**：iwalk.pro 不应过早承担多人平台复杂度；NorthStar 不应替代个人表达与方法沉淀。

---

## 3. 已确认决策

### 3.1 产品与哲学决策

- 人是目的，AI 是工具。
- 人负责目标、判断、审美、选择、责任、意义、是否公开、是否继续。
- AI 负责读取、检索、整理、生成、拆解、提醒、执行、辅助沉淀。
- 点子不是静态灵感箱，而是人对现实“不必如此”的回应。
- 生活内容不是点子的附属品，但生活内容是点子的土壤。
- 内容同时拥有工具价值与存在价值；厨艺、书法、日记、吐槽、迷茫不能被功利化。
- 数据提供现象，不提供目的；公开方向，不公开脆弱。
- 系统帮助人成为自己，不把人系统化。

### 3.2 iwalk.pro 产品决策

- 主导航目标：`首页 / 内容 / 关于`。
- `/content` 是内容宇宙，不是普通文章列表。
- 旧路由 `/posts`、`/tools`、`/ideas`、`/projects` 先保留兼容，不立即删除。
- `/about` 承载关于我、关于站、路线图、数据台、技术与 AI、联系方式。
- 数据台先做轻量公开数据入口，不做完整分析后台。

### 3.3 内容模型决策

内容不只按 `type` 分类，而按多个维度组织：

- `form`：文章、笔记、日记、吐槽、图集、视频、菜谱、书法、资源、项目、点子、教程。
- `domain`：AI、编程、产品、哲学、生活、厨艺、书法、阅读、旅行、情绪、社群。
- `intent`：思考、记录、教学、分享、验证、展示、复盘、连接、表达。
- `valueMode`：工具价值、存在价值、二者兼有。
- `aiUsePolicy`：AI-0 不可读，AI-1 可读作背景，AI-2 可引用，AI-3 可推荐，AI-4 可执行任务。

点子生命周期映射 Ferry P0-P4：

| Ferry 阶段 | 产品状态 | 前端显示 |
| --- | --- | --- |
| P0 Chaos | 混沌显影 | 想法中 |
| P1 Blueprint | 蓝图成型 | 规划中 |
| P2 Reality | 执行造物 | 实践中 |
| P3 Dialectic | 偏差修正 | 修正中 |
| P4 Synthesis | 复盘沉淀 | 已沉淀 |

---

## 4. 整体路线

### Plan 1：iwalk.pro 第一阶段落地

目标：先让个人系统成为可理解、可扩展、可读取的样板。

范围：

- `/content` 内容宇宙
- 内容模型字段扩展
- 主导航收敛为 `首页 / 内容 / 关于`
- `/about` 轻量数据台
- `llms.txt`
- `walker-style.md`
- `index.json`
- 旧路由兼容

当前详细执行计划：

- `docs/superpowers/plans/2026-05-30-ai-era-idea-co-creation-implementation.md`

### Plan 2：内容迁移与治理

目标：把现有内容逐步补成新内容模型。

范围：

- 给现有内容补 `form`、`domain`、`intent`、`valueMode`、`aiUsePolicy`、`related`、`updated`、`summary`
- 建立厨艺、书法、日记、吐槽、点子、项目、工具、教程的写作规范
- 明确哪些内容可被 AI 引用，哪些只能作为背景

### Plan 3：内容宇宙 UI/UX

目标：把 `/content` 从功能可用升级成真正的内容宇宙。

范围：

- 时间线 / 网格 / 图集 / 点子流等多视图
- 内容卡片视觉体系
- 生活切片展示
- 作品展示
- 点子状态卡
- 移动端适配

### Plan 4：反馈数据台 v1

目标：形成真实内容反馈闭环。

范围：

- 访问统计
- 点赞聚合
- 评论聚合
- 搜索无结果记录
- 热门内容
- 内容表现矩阵
- 公开数据台
- 私有分析视图

### Plan 5：AI 可读接口 v2

目标：让 AI 更稳定地读取和理解 iwalk.pro。

范围：

- 自动生成 `llms.txt`
- `graph.json`
- `index.json` 增强
- JSON-LD 增强
- related graph
- `walker-style.md` 半自动维护

### Plan 6：个人 Agent / MCP

目标：让 Walker 自己的 Agent 能调用个人知识系统。

范围：

- `walker_search`
- `walker_get_content`
- `walker_get_style`
- `walker_get_methodology`
- `walker_get_tools`
- `walker_graph`
- `walker_recommend`

### Plan 7：NorthStar 产品架构

目标：在 `C:\Users\26296\Desktop\NorthStar` 单独推进多人个人系统网络与点子共创平台。

范围：

- 个人系统模型
- 点子发布
- 点子协作
- 角色与能力
- 贡献记录
- 协作空间
- 平台数据台
- 审核与权限

---

## 5. 下一步

当前马上执行：**Plan 1：iwalk.pro 第一阶段落地**。

详细执行文件：

- `docs/superpowers/plans/2026-05-30-ai-era-idea-co-creation-implementation.md`

执行完成标准：

- `/content` 可访问并展示内容卡片
- 主导航显示 `首页 / 内容 / 关于`
- 旧路由仍可访问
- `/about` 有轻量数据台入口
- `/llms.txt`、`/walker-style.md`、`/index.json` 可访问
- `npx astro check` 通过
- `npm run build` 通过

---

## 6. 归档规则

旧 PRD、旧架构设计、旧 Agent 规划和历史讨论统一归档到 `docs/archive/`。

归档文档只用于追溯“当时怎么想”，不再作为当前决策依据。当前判断以本 README 为准。

本次架构讨论的视觉草稿保存在本地：

```text
.superpowers/brainstorm/7146-1780128339/
```

如需长期保留视觉稿，可后续精选关键文件放入 `docs/archive/visual/`。当前不新增该目录，避免继续增加实体。
