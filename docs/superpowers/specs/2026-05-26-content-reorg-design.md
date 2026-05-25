# Walker 站点内容重组设计

日期：2026-05-26
状态：待实施

## 目标

解决 iwalk.pro 内容组织混乱的问题。当前内容按"话题"（ai/life/utopia）分类，实际需求是按"用途"组织——知识、工具（含点子）、项目。重组后让访客和 Walker 自己都能快速找到对应内容。

## 核心原则

- **按用途组织，不按话题组织**。type 是唯一的内容分类依据。
- **点子属于工具**。idea 是 tool 的一种子类型，共享 /tools 页面。
- **最小改动**。不改视觉、不改布局系统，只改内容分类、schema 和路由。
- **旧链接不 break**。/ai/*、/explore/* 做 301 跳转。

## 内容模型变更

### log 集合（保留，重新定义）

```typescript
type: z.enum(['knowledge', 'tool', 'idea', 'project'])
```

- `knowledge`：知识（文章、思考、复盘、方法论、世界观）
- `tool`：工具（实际使用的工具、模型、工作流、Skill）
- `idea`：点子（探索过程中冒出的想法，作为工具的一种类型）
- `project`：项目（做出来的产品、站点、框架）

**其他字段变更：**

- `category`：从 `z.enum(['utopia', 'ai', 'life'])` 改为 `z.string().optional()`，降级为可选标签，不再驱动页面结构
- `status`：扩展为 `z.enum(['thinking', 'practicing', 'verified', 'archived']).optional()`，适用所有 type
- 保留：title, date, tags, published, summary, description, cover, videos, resources
- 移除：claimInfo（idea 专属字段，用 status + description 替代）

### dockItem 集合 → 合并进 log

将现有 dockItem 内容迁移为 `type: tool` 的 log 条目。dockItem 集合从 content.config.ts 中移除。

迁移映射：
| dockItem 字段 | log 字段 |
|---|---|
| name | title |
| description | summary |
| category | tags（转为标签） |
| rating | 新增 rating 字段（可选） |
| url | resources（转为 link 类型 resource） |
| qrCode | 保留为可选字段 |
| communities | 保留为可选字段 |

## 现有内容迁移

### log 文件（4 篇）

| 文件 | 旧 type | 新 type | 说明 |
|---|---|---|---|
| code-and-philosophy.md | article | knowledge | |
| dialogue-on-subtraction.mdx | article | knowledge | |
| ferry-theory-construction.md | article | knowledge | Ferry 理论文章 |
| hello-walker.md | thought | knowledge | |

### dock 文件（2 篇）

| 文件 | 目标 | 说明 |
|---|---|---|
| cheap-communities.md | 迁移为 log，type: tool | 省钱资源 |
| dianzi-gongcu.md | 迁移为 log，type: tool | 点子共促社群 |

## 页面与路由

### 新页面结构

| 路径 | 内容 | 数据源 |
|---|---|---|
| `/` | 展示：我在做什么 + 项目卡片 + 最新内容 | log (type: project) + 最近 log |
| `/tools` | 工具 + 点子，支持 type 筛选 | log (type: tool, idea) |
| `/posts` | 知识文章 | log (type: knowledge) |
| `/about` | 个人故事（保留现有） | — |

### 导航更新

顶部/侧边导航改为：首页 | 工具 | 知识 | 关于

### 旧路由处理

| 旧路由 | 处理方式 |
|---|---|
| `/ai/learn` | 301 → `/posts` |
| `/ai/sources` | 301 → `/tools` |
| `/ai/toolkit` | 301 → `/tools` |
| `/ai/ideas` | 301 → `/tools`（idea 筛选） |
| `/explore` | 301 → `/tools` |
| `/explore/[slug]` | 301 → `/tools` 或对应新 slug |
| `/ai/[slug]` | 保留 301 → `/posts/[slug]` |
| `/life/[slug]` | 保留 301 → `/posts/[slug]` |

## 首页改动

保留现有 Bento Box 视觉框架，内容模块调整：

1. **左栏**：最新内容（所有 type 的最新 3-5 篇）
2. **中栏**：Walker 状态 + "用点子连接人与AI" + 社交入口
3. **右栏**：项目卡片（type: project 的内容）

最小改动：不重写首页结构，只调整数据源和卡片内容。

## 工具页 /tools（新建）

- 展示所有 `type: tool` 和 `type: idea` 的内容
- 顶部筛选：全部 / 工具 / 点子
- 每个条目显示：名称、描述、标签、状态、评分（工具）、外部链接
- 复用现有 SidebarLayout 或 ArticleLayout 的列表模式

## 知识页 /posts（调整）

- 数据源从"所有 log"改为 `type: knowledge` 过滤
- 其他保持不变（列表、标签、搜索、阅读模式）

## 实施顺序

1. 修改 content.config.ts — 重新定义 log schema，移除 dockItem
2. 迁移 dock 内容到 log 目录
3. 更新现有 4 篇 log 的 frontmatter
4. 新建 /tools 页面
5. 修改 /posts 页面过滤逻辑
6. 修改首页数据源，添加项目模块
7. 更新导航组件
8. 添加旧路由 301 跳转
9. 清理 /ai/* 和 /explore/* 页面文件
10. 测试构建和所有路由
