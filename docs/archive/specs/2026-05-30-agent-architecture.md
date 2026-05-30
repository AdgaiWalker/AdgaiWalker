> Archived: This document has been superseded by `docs/README.md`. It is kept only for historical context.

# iwalk.pro Agent 架构

日期：2026-05-30
性质：渐进式路线图，从阶段零到阶段四全程可用
原则：每阶段可独立交付价值，不依赖后续阶段

---

## 终极架构

```
┌──────────────────────────────────────────────────────────────────┐
│                        iwalk.pro 知识系统                         │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────────┐ │
│  │ 内容层       │  │ 理解层       │  │ 服务层                   │ │
│  │             │  │             │  │                          │ │
│  │ log 集合     │  │ 知识图谱     │  │ MCP Server（自己用）     │ │
│  │  · thinking │→ │  · 文章关系   │→ │ REST API（公开）         │ │
│  │  · tool     │  │  · 概念映射   │  │ 站内 AI 助手（访客用）   │ │
│  │  · learn    │  │  · 方法论链   │  │ 推荐引擎                 │ │
│  │  · learning │  │             │  │                          │ │
│  │             │  │ 风格模型     │  └──────────────────────────┘ │
│  │ walker-     │  │  · 世界观    │                               │
│  │ style.md    │  │  · 决策原则  │  ┌──────────────────────────┐ │
│  │             │  │  · 方法流程  │  │ 反哺层                   │ │
│  │ llms.txt    │  │  · 工具偏好  │  │  · AI 自动关联新内容     │ │
│  │             │  │             │  │  · AI 标记过时内容       │ │
│  └─────────────┘  └─────────────┘  │  · 好问题沉淀为素材     │ │
│                                     │  · 方法论迭代建议       │ │
│                                     └──────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### 使用场景

**场景 1：你自己用 Agent 干活**
1. 你在做新项目，让 Agent 帮你分析需求
2. Agent 通过 MCP 读取 `walker-style.md`，用你的方法论拆解
3. Agent 搜索你过去做过的类似案例和验证过的工具
4. 输出符合你行事风格的分析报告，附引用来源

**场景 2：扔一个链接，AI 自己读懂**
1. 你把 `iwalk.pro` 给任何 AI
2. AI 读 `llms.txt`，知道你有什么内容
3. AI 顺着阅读顺序和 `related` 关联，把零碎思想串成体系
4. AI 用你的方法论和世界观去理解和回答问题

**场景 3：别人的 AI 来取**
1. 某人的 AI 助手收到"怎么开始学 AI"
2. 调用 `/api/v1/recommend?level=入门`
3. 返回你的入门教程 + 毕业任务 + 安全坎
4. 用户按你的体系学习

**场景 4：访客在站内提问**
1. 用户在 `/ask` 输入"Walker 怎么做需求分析"
2. RAG 检索到 Ferry 理论 + 做减法对话
3. 用 Walker 风格生成回答，附引用文章链接
4. 好问题自动沉淀为 FAQ 或新文章素材

**场景 5：系统自己生长**
1. 你写了一篇新文章，推到 GitHub
2. AI 自动分析文章与已有内容的关系，补全 `related`
3. AI 发现新的方法论片段，建议更新 `walker-style.md`
4. 访客的好问题被收集，你决定是否写成正式内容

---

## 阶段零：静态 AI 接口

**何时做：今天**
**改动：零代码，手写 3 个文件**
**目标：任何 AI 拿到你的链接就能读懂你的站**

### 做什么

#### 1. `/llms.txt`（站点根目录）

AI 索引文件。当 AI 访问 `iwalk.pro/llms.txt` 时，看到整个站点的目录和阅读顺序。

```plain
# Adgai Wiki — Walker 的个人前进系统

> 用点子连接人与 AI，把想法摆渡成真实结果。
> Walker 不是一个人名，是一种状态：准备出发、正在出发、歇会再出发。

## AI 先读这个
- /walker-style.md — Walker 的世界观、方法论、决策原则

## 阅读顺序（从理念到方法到实践）
1. /posts/personal-progress-system — 三样东西自然积累成前进系统
2. /posts/ideas-transcend-time — 点子是时间的存款
3. /posts/future-vision — 想象力是最后的壁垒
4. /posts/ferry-theory-construction — f(x)=y，差距驱动行动
5. /posts/dialogue-on-subtraction — 做减法不是少做，是想清楚再做

## 教程
- /learn — AI 赋能生活（入门→学徒→专家→大师）

## 资源
- /tools — 验证过的工具库

## 关于
- /about — Walker 是一种状态
```

构建时通过 Astro 集成自动生成（阶段一），阶段零先手写。
阶段零：放在 `public/llms.txt`，Astro 会原样复制到输出目录。
阶段一：移除 `public/llms.txt`，改为 `src/pages/llms-txt.ts`（`prerender = true`）动态生成，避免与 `public/` 冲突。

#### 2. `/walker-style.md`（站点根目录或独立页面）

Walker 的行事风格说明。Agent 读完这个文件就知道你怎么想问题、怎么做决定。

```markdown
# Walker 风格说明

## 我是谁
Walker 是秋知（AdgaiWalker）的个人前进状态。
不是人名，是一种状态：带着目标，准备出发、正在出发、歇会再出发。

## 世界观
- AI 的意义不是提效，是减少重复劳动
- 人应该把更多时间从重复劳动中释放出来，去追求真正的幸福
- 点子不是空想，点子需要在行动中验证
- 普通人也可以借助 AI，把自己的想法做成真实结果
- 人负责目标、判断和责任，AI 负责执行

## 做事方法
探索环境 → 需求分析 → 验证需求 → 设计方案 → 拆分任务 → 锚定目标 → 达成结果 → 整理沉淀

对应三种前进状态：
- 准备出发：观察、收集、判断、定目标
- 正在出发：行动、验证、拆解、交付结果
- 歇会再出发：复盘、整理、沉淀、再次出发

## 决策原则
- 因为需要所以存在——不先设计再填内容，先确认需求再让形式生长
- 先验证再公开——网站是沉淀层不是草稿箱，未验证内容留在 Obsidian
- 开始比想清楚更重要——时间比 token 更贵，不干就不会偏，偏差是学习的原材料
- 如无必要勿增实体——做减法不是少做，是想清楚再做
- 人决策，AI 执行——该你判断、选择、拍板的事不能交出去

## 工具偏好
- 便宜、好用、能解决问题
- 不收藏，只留验证过的
- 按需求选工具，不限死某一个厂商

## 三样东西
前进系统由三样东西组成：
- 工具库——对效率和性价比的追求
- 点子库——好奇心驱动，新旧交替中冒出来
- 思考——做完回头看，为了下次走更远

## 内容使用规则
- 内容状态：thinking → practicing → verified → archived
- 只公开 verified 及以上的内容
- 每篇内容解决一个具体的需要
```

#### 3. 文章 frontmatter 加 `related` 字段

在现有 md/mdx 文件的 frontmatter 中增加：

```yaml
# ferry-theory-construction.md
related:
  - /posts/personal-progress-system
  - /posts/dialogue-on-subtraction
  - /tools  # 相关工具
```

AI 读一篇文章，顺着 `related` 跳到下一篇，零碎文章串成体系。

### 效果

| 能力 | 实现 |
|------|------|
| 把链接扔给 AI，AI 自己读懂 | `llms.txt` |
| AI 预装你的方法论 | `walker-style.md` |
| AI 把零散文章串成体系 | `related` 字段 |
| 外部 AI 可访问 | 任何能读 URL 的 AI 都能用 |

### 局限

- `llms.txt` 和 `walker-style.md` 需手动维护
- 没有语义搜索，只能按关键词和关联跳转
- 外部 AI 需要逐个读取页面，无法批量查询

---

## 阶段一：自动生成 + 结构化输出

**何时做：站点重构时一并完成**
**改动：构建流程增加自动生成逻辑，文章详情页增加相关文章**
**目标：内容更新后 AI 接口自动同步，不需要手动维护**

### 做什么

#### 1. `llms.txt` 自动生成

Astro 构建时从 `log` 集合自动生成 `/llms.txt`：

- 读取所有已发布内容
- 按 type 分组
- 输出标题 + summary + URL
- 阅读顺序按 related 字段和 type 排序

#### 2. `/api/index.json` 结构化内容索引

```json
{
  "site": "iwalk.pro",
  "version": "1.0",
  "style": "/walker-style.md",
  "readingOrder": [
    "/posts/personal-progress-system",
    "/posts/ideas-transcend-time",
    "/posts/future-vision",
    "/posts/ferry-theory-construction",
    "/posts/dialogue-on-subtraction"
  ],
  "content": [
    {
      "slug": "ferry-theory-construction",
      "type": "knowledge",
      "title": "Ferry 理论建构",
      "summary": "f(x)=y，差距驱动行动",
      "tags": ["哲学", "AI", "Ferry"],
      "status": "verified",
      "date": "2026-05-23",
      "updated": null,
      "url": "/posts/ferry-theory-construction",
      "related": [
        "/posts/personal-progress-system",
        "/posts/dialogue-on-subtraction"
      ]
    }
  ]
}
```

此端点为预渲染 JSON 文件（`prerender = true`），不需要服务端运行时。

#### 3. 文章详情页增加「相关文章」区块

读取 `related` 字段，在文章底部渲染相关文章卡片列表。人和 AI 都能顺着读。

#### 4. JSON-LD 结构化数据

每篇文章和页面增加 JSON-LD，搜索引擎和 Agent 都能理解：

```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "name": "Ferry 理论建构",
  "description": "f(x)=y，差距驱动行动",
  "author": { "@type": "Person", "name": "Walker" },
  "datePublished": "2026-05-23",
  "keywords": ["哲学", "AI", "Ferry"],
  "isPartOf": { "@type": "WebSite", "url": "https://iwalk.pro" }
}
```

### 效果

| 新增能力 | 实现 |
|----------|------|
| 发文章后 AI 索引自动更新 | `llms.txt` 自动生成 |
| AI 批量获取结构化索引 | `/api/index.json` |
| 读者顺着关联阅读 | 相关文章区块 |
| 搜索引擎更好理解 | JSON-LD |

### 局限

- 没有语义搜索，问"Walker 对做减法的看法"搜不到
- 没有 Agent 工具接口，Agent 只能读不能交互
- 外部 Agent 无法实时查询

---

## 阶段二：MCP Server

**何时做：你自己开始用 Agent 干活时**
**改动：开发独立的 MCP server 项目**
**目标：你的 Agent 直接调用你的知识库干活**

### 做什么

#### 1. MCP Server 项目

独立 Node.js 项目（可部署在 Vercel 或本地），通过 MCP 协议暴露知识库：

```
mcp-server-iwalk
├── tools/
│   ├── search.ts        → walker_search(query) 语义搜索
│   ├── get-content.ts   → walker_get_content(slug) 获取文章全文
│   ├── get-method.ts    → walker_get_methodology() 获取方法论
│   ├── get-style.ts     → walker_get_style() 获取风格说明
│   ├── get-tools.ts     → walker_get_tools(tag?) 按标签获取工具
│   ├── get-graph.ts     → walker_graph() 获取内容关系图
│   └── recommend.ts     → walker_recommend(context) 按场景推荐
├── data/
│   ├── embeddings/      → 内容向量索引（用于语义搜索）
│   └── graph.json       → 内容关系图
└── server.ts            → MCP server 入口
```

#### 2. 向量索引（语义搜索）

构建时为每篇内容生成 embedding，存入向量索引：
- 文章标题 + summary + tags → 向量
- 工具名称 + 场景描述 → 向量
- 教程阶段 + 关键概念 → 向量

语义搜索：输入"怎么做需求分析" → 匹配到 Ferry 理论、做减法对话、Walker 方法论。

#### 3. 内容关系图

从 `related` 字段和文章内链接构建知识图谱：

```
Ferry 理论建构
  ├── related → 我的畏惧也是动力
  ├── related → 与 AI 谈做减法
  ├── mentions → xyzidea.com
  └── method_of → Walker 方法流程

我的畏惧也是动力
  ├── defines → 前进系统（工具库+点子库+思考）
  ├── related → Ferry 理论建构
  └── related → 点子是不分时空的资产
```

Agent 可以遍历图谱，理解概念之间的关系。

### MCP 配置示例

```json
// Claude Code 的 MCP 配置
{
  "mcpServers": {
    "iwalk": {
      "command": "npx",
      "args": ["mcp-server-iwalk"],
      "env": {
        "CONTENT_DIR": "./src/content/log",
        "STYLE_FILE": "./walker-style.md"
      }
    }
  }
}
```

### 使用示例

```
你：帮我分析一下这个新项目的需求

Agent（调用 walker_get_methodology）：
  根据 Walker 方法论，先做环境探索和需求分析：
  1. 探索环境 — 当前技术栈是...
  2. 需求分析 — 这个项目真正要解决的是...

Agent（调用 walker_search("类似项目")）：
  你之前做过 xyzidea.com，也是 AI 辅助工具站。
  当时的验证方式是：最小方案先跑起来...
  参考：/posts/ferry-theory-construction

Agent（调用 walker_get_tools("编程")）：
  推荐工具：Claude Code（主力编程 Agent）...
  原因：你自己验证过，评分 ★★★★★
```

### 效果

| 新增能力 | 实现 |
|----------|------|
| Agent 直接调用知识库 | MCP 工具接口 |
| 语义搜索 | 向量索引 |
| 理解内容关系 | 知识图谱 |
| 不同模型都能用 | MCP 协议是通用的 |

### 局限

- 只有配置了 MCP 的 Agent 才能用
- 普通访客的 AI 无法调用
- 需要独立部署和维护

---

## 阶段三：公开 API + 站内 AI 助手

**何时做：知识库内容成型、有稳定访问量时**
**改动：新增 API 路由和 AI 助手页面**
**目标：任何人、任何 Agent 都能取用你的知识**

### 做什么

#### 1. 公开 REST API

```
GET /api/v1/
├── /content                    → 全部内容列表（分页、按 type 筛选）
├── /content/:slug              → 单篇内容全文 + 关联
├── /search?q=需求分析           → 语义搜索
├── /graph                      → 内容关系图
├── /methodology                → Walker 方法论
├── /recommend?level=入门        → 按用户水平推荐内容
├── /tools?tag=编程              → 按标签获取工具
└── /style                      → Walker 风格说明
```

鉴权：API Key（免费申请）+ 限流（每分钟 N 次请求）。

#### 2. `/llms-full.txt`

完整知识库文本文件。大上下文模型（200K+ tokens）一次读完全部内容：

```plain
# Adgai Wiki — 完整知识库

## 风格说明
（walker-style.md 全文）

## 文章
### Ferry 理论建构
（文章全文）
Related: /posts/personal-progress-system

### 我的畏惧，也是动力
（文章全文）
Related: /posts/ideas-transcend-time

## 教程
### AI 赋能生活
（教程全文）

## 工具
（工具列表 + 场景描述）
```

AI 访问这一个文件就能获取全部知识。

#### 3. 站内 AI 助手 `/ask`

```
┌──────────────────────────────────────────────┐
│  向 Walker 问点什么                            │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │  输入问题                             │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  AI 回答：                                    │
│  ┌──────────────────────────────────────┐    │
│  │  Walker 的做减法原则是：              │    │
│  │  不是少做，是想清楚再做。             │    │
│  │                                      │    │
│  │  参考：                               │    │
│  │  → 与 AI 谈「做减法」                 │    │
│  │  → Ferry 理论建构                     │    │
│  └──────────────────────────────────────┘    │
└──────────────────────────────────────────────┘
```

技术实现：RAG（Retrieval Augmented Generation）
1. 用户输入问题
2. 向量检索相关内容片段
3. 注入 Walker 风格说明作为 system prompt
4. LLM 生成回答，附引用来源
5. 好问题自动收集为内容素材

#### 4. AI 推荐引擎

```
GET /api/v1/recommend
  ?level=入门     → 返回入门教程 + 毕业任务 + 安全坎
  ?need=编程      → 返回验证过的编程工具 + 使用场景
  ?method=需求分析 → 返回 Ferry 理论 + 做减法原则 + 相关案例
```

### 效果

| 新增能力 | 实现 |
|----------|------|
| 任何 Agent 可调用 | 公开 REST API |
| 大模型一次读完全部 | `/llms-full.txt` |
| 访客站内直接问 | `/ask` AI 助手 |
| 按场景精准推荐 | 推荐引擎 |

### 局限

- API 需要鉴权和限流防滥用
- AI 助手需要 LLM 调用成本
- 内容更新后需要重新生成向量索引

---

## 阶段四：活的系统

**何时做：内容量和访问量足够，AI 能力进一步成熟后**
**改动：AI 自动化管道**
**目标：知识库自己生长，Agent 主动维护**

### 做什么

#### 1. 内容自动关联

```
你写了一篇新文章，推到 GitHub
  → GitHub Action 触发
  → AI 分析文章内容
  → 自动匹配已有内容的关联
  → 自动补全 related 字段（你确认后合并）
  → 自动更新知识图谱
```

#### 2. 过时检测

```
定时任务（每周）
  → AI 检查工具类内容
  → 发现某个工具 URL 失效 / 替代品出现
  → 标记 status: 'archived'
  → 通知你确认
```

#### 3. 方法论迭代

```
你写了新文章
  → AI 对比 walker-style.md
  → 发现新的决策原则或方法步骤
  → 建议更新 walker-style.md
  → 你确认后更新
```

#### 4. 问答沉淀

```
/ask 页面的用户提问
  → AI 判断是否是好问题（有普遍性、有深度）
  → 好问题 + AI 回答收集到素材库
  → 你决定是否写成正式文章
  → 写完后自动关联到原始问题
```

#### 5. 多 Agent 协作

```
Walker 的 Agent
  + 访客的 Agent（通过 API 取用知识）
  + 社区成员的 Agent（贡献内容、反馈）
  → 形成 Agent 生态
  → 知识在 Agent 之间流动
```

### 效果

| 新增能力 | 实现 |
|----------|------|
| 写完内容自动关联 | AI 分析 + GitHub Action |
| 过时内容自动标记 | 定时 AI 检查 |
| 方法论自动迭代 | AI 对比 + 人工确认 |
| 问答变成内容素材 | 好问题沉淀 |
| 知识在 Agent 间流动 | 多 Agent 协作 |

---

## 各阶段对照表

| 能力 | 阶段零 | 阶段一 | 阶段二 | 阶段三 | 阶段四 |
|------|--------|--------|--------|--------|--------|
| AI 拿链接能读懂 | ✅ 手动 | ✅ 自动 | ✅ 自动 | ✅ 自动 | ✅ 自动 |
| 文章互相串联 | ✅ related | ✅ 渲染 | ✅ 图谱 | ✅ 图谱 | ✅ 自动关联 |
| AI 预装方法论 | ✅ 手动 | ✅ 手动 | ✅ MCP | ✅ API | ✅ 自动迭代 |
| 语义搜索 | ❌ | ❌ | ✅ | ✅ | ✅ |
| Agent 工具调用 | ❌ | ❌ | ✅ MCP | ✅ API | ✅ |
| 外部 Agent 访问 | ✅ 读URL | ✅ 读URL | ❌ | ✅ API | ✅ |
| 站内 AI 助手 | ❌ | ❌ | ❌ | ✅ | ✅ |
| 推荐引擎 | ❌ | ❌ | ❌ | ✅ | ✅ |
| 内容自动维护 | ❌ | ❌ | ❌ | ❌ | ✅ |
| 问答→内容 | ❌ | ❌ | ❌ | ❌ | ✅ |
| 需要代码改动 | 无 | 少 | 中 | 多 | 多 |
| 维护成本 | 手动 | 自动 | 需部署 | 需LLM成本 | 需管道 |

---

## 技术选型（各阶段）

| 阶段 | 技术 | 说明 |
|------|------|------|
| 零 | 纯文本文件 | llms.txt, walker-style.md, frontmatter |
| 一 | Astro 构建钩子 | prerender JSON, 自动生成 llms.txt |
| 二 | Node.js + MCP SDK | 独立 MCP server 项目 |
| 二 | Embedding 模型 | 内容向量化（可用便宜模型） |
| 三 | Astro API Routes | REST API 端点 |
| 三 | RAG Pipeline | 向量检索 + LLM 生成 |
| 四 | GitHub Actions | 定时任务 + 推送触发 |
| 四 | LLM 调度 | 分析、关联、推荐自动化 |

---

## 立即行动项

阶段零今天就能做：

- [ ] 写 `/public/llms.txt`
- [ ] 写 `/public/walker-style.md`（或建为独立页面）
- [ ] 为现有 6 篇文章补充 `related` 字段
- [ ] 在 `astro.config.mjs` 中确保 `/llms.txt` 和 `/walker-style.md` 可被外部访问
