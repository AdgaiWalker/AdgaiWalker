# 旧文档可取之处提炼

本文不是当前执行文档，而是删除或归档旧文档前的价值提炼。

目的：

```text
不让过期 PRD、旧架构、旧执行计划继续干扰当前判断；
也不把其中有价值的表达形式、原则、图式和方法论一起删掉。
```

当前决策入口以 `references/project-docs-index.md` 为准；`references/adgaiwalker-personal-agent-system-architecture.md`、`references/skill-admission-system-prd.md`、`references/experience-validation-system-prd.md`、`references/content-intent-demand-policy-prd.md` 和 `references/invite-identity-understanding-prd.md` 只作为当前设计或待决策草案使用。

## 1. AI 时代点子共创系统架构设计

原文件：

```text
docs/archive/references/2026-05-30-ai-era-idea-co-creation-architecture-design.md
```

### 可取之处

1. **架构图表达形式好。**
   它用“时代潮流层 -> 演化协议层 -> 价值宪法层 -> 点子驱动层 -> 内容内核层 -> 人类 I/O / AI I/O -> 反馈校准层 -> 方法论进化层”表达系统，适合后续解释 AdgaiWalker / NorthStar 的大结构。

2. **三系统关系清楚。**

   ```text
   FerrySpec = 演化协议层
   iwalk.pro / AdgaiWalker = 个人实践场
   NorthStar = 社会实践场
   ```

3. **价值宪法仍然有效。**
   特别是：

   - 人是目的，AI 是工具。
   - 数据提供现象，不提供目的。
   - 公开方向，不公开脆弱。
   - 系统帮助人成为自己，不把人系统化。
   - 重复劳动交给 AI，不可替代的体验留给人。

4. **“界面服务人的理解，结构服务 AI 的执行”值得保留。**

   ```text
   界面 = 人类 I/O
   结构 / API = AI I/O
   内容内核 = 共同事实源
   ```

### 建议保留方式

不要作为当前执行架构使用。保留为：

```text
架构图表达参考
世界观表达参考
AdgaiWalker / NorthStar 关系说明参考
```

如果后续瘦身，建议将原文件降级移动到：

```text
docs/archive/references/ai-era-idea-co-creation-architecture-visual-reference.md
```

## 2. Walker 个人网站 PRD

原文件：

```text
docs/archive/prd/Ferry-Walker个人网站PRD.md
```

### 可取之处

1. **“网站是沉淀层，不是原始草稿箱”很重要。**
   原始思考留在 Obsidian、桌面文档和 AI 对话中；网站承载经过整理、对实践有帮助、对别人有价值的内容。

2. **“因为需要，所以设计”仍然是核心原则。**
   不先设计栏目，再往里面塞内容；先确认真实需要，再让内容、分类和界面生长出来。

3. **三问叙事可复用。**

   ```text
   为什么做
   做什么
   怎么做
   ```

4. **Walker 方法流程可复用。**

   ```text
   探索环境
   -> 需求分析
   -> 验证需求
   -> 设计方案
   -> 拆分任务
   -> 锚定目标
   -> 达成结果
   -> 整理沉淀
   ```

5. **前进状态语言仍然有品牌价值。**

   ```text
   准备出发：观察、收集、判断、定目标。
   正在出发：行动、验证、拆解、交付结果。
   歇会再出发：复盘、整理、沉淀、再次出发。
   ```

6. **内容模型字段有参考价值。**

   ```text
   need
   practice_value
   public_value
   related_tools
   related_projects
   related_ideas
   agent_notes
   ```

   这些字段不一定直接实现，但对“内容为什么存在、能被谁调用”有启发。

### 建议保留方式

提炼到当前总架构或内容模型时，只保留：

```text
沉淀层原则
三问叙事
Walker 方法流程
内容字段灵感
```

原文件可以继续归档，不建议作为当前 PRD 使用。

## 3. Walker 博客 PRD

原文件：

```text
docs/archive/prd/walker-blog-prd.md
```

### 可取之处

1. **交互设计原则仍有用。**

   - 让每次交互得到可感知回应。
   - 合适的内容搭配合适的形式。
   - 克制但不冷淡。
   - 图标使用 Lucide，不用 Emoji 承担界面语义。

2. **交互反馈表可作为 UI 体验检查清单。**

   ```text
   点击、拖拽、悬停、滚动、搜索、点赞、目录高亮都应该有状态反馈。
   ```

3. **“内容搭配形式”的判断仍然有效。**

   ```text
   文章 -> 阅读页
   工具和资源 -> 卡片
   首页 -> 桌面/画布/入口
   关于页 -> 沉浸式叙事
   ```

### 已过时部分

路由、组件、首页架构多处已过时，例如 `SparkBoxModal`、`CustomPalette`、部分旧路由和页面形态。不要按它实现。

### 建议保留方式

保留为 UI/UX 设计口味参考，不作为当前路由或组件规格。

## 4. iwalk.pro Agent 架构

原文件：

```text
docs/archive/specs/2026-05-30-agent-architecture.md
```

### 可取之处

1. **知识系统分层图值得保留。**

   ```text
   内容层
   -> 理解层
   -> 服务层
   -> 反哺层
   ```

2. **“渐进式 Agent 路线”是正确的。**

   ```text
   静态 AI 接口
   -> 自动生成结构化索引
   -> MCP / API
   -> 站内问答
   -> 系统反哺内容关系
   ```

3. **使用场景清楚。**

   - 你自己用 Agent 干活。
   - 外部 AI 读取站点。
   - 别人的 AI 来取内容。
   - 访客在站内提问。
   - 系统从好问题中生长。

4. **`llms.txt`、`walker-style.md`、`index.json` 的定位仍有价值。**
   它们构成了 AI 可读接口的基础层。

### 建议保留方式

保留它的“阶段路线”和“场景语言”，不要保留旧实现细节。当前实现应以 `references/project-docs-index.md` 与实际代码为准。

## 5. 站点架构重设计

原文件：

```text
docs/archive/specs/2026-05-30-site-architecture-redesign.md
```

### 可取之处

1. **四条设计原则仍有用。**

   - 内容决定形式。
   - 因为需要所以存在。
   - 内容主动找人。
   - 可自然扩展。

2. **UI 元素模型简单有效。**

   ```text
   卡片 = 容器，承载信息
   按钮 = 触发器，执行动作
   ```

3. **导航模型有参考价值。**

   ```text
   分类导航：去哪个板块
   类导航：去哪篇内容
   内容导航：内容内定位
   交互触发：执行动作
   ```

4. **反馈闭环设计可提炼。**

   ```text
   点赞
   评论
   提问/建议
   统一反馈入口
   内容更新标记
   ```

5. **Agent 预留思路仍正确。**
   内容先具备 `title / summary / tags / type`，后续再让 Agent 推荐、检索和引用。

### 已过时部分

它明确写了“未采纳此方案”，例如砍掉 `/ideas`、`/projects`、新增 `/learn` 的部分与当前事实不一致。不要按它调整路由。

### 建议保留方式

只保留设计原则、UI 元素模型、导航模型、反馈闭环，不保留路由方案。

## 6. 技术架构总览

原文件：

```text
docs/archive/specs/2026-05-30-technical-architecture.md
```

### 可取之处

1. **分层架构图可复用。**

   ```text
   页面层
   -> 布局层
   -> 组件层
   -> 数据层
   -> 脚本层
   ```

2. **Obsidian 到 Vercel 的内容流仍然重要。**

   ```text
   Obsidian 写 md
   -> GitHub
   -> Astro Content Collections
   -> 构建验证
   -> Vercel 部署
   -> 用户访问
   ```

3. **构建部署流程有参考价值。**

   ```text
   astro build
   -> Pagefind 索引
   -> Vercel 静态/SSR 输出
   ```

4. **客户端脚本生命周期思想可保留。**
   特别是 Astro 页面切换中脚本初始化和清理的问题。

### 已过时部分

技术栈事实已过时，例如 Supabase 点赞、部分文件名、部分组件和路由。不要作为当前技术真相。

### 建议保留方式

提炼为“架构表达模板”和“内容发布链路说明”，不要保留为当前技术文档。

## 7. AI Era Idea Co-Creation Implementation Plan

原文件：

```text
docs/superpowers/plans/2026-05-30-ai-era-idea-co-creation-implementation.md
```

### 可取之处

1. **Scope Check 写法很好。**
   它明确区分：

   ```text
   Implement now
   Do not implement now
   ```

   这正是当前文档也需要坚持的边界写法。

2. **任务拆解方式可复用。**

   ```text
   Create
   Modify
   Validation commands
   Task 1
   Task 2
   ...
   ```

3. **每阶段可验证的执行方式可复用。**
   它每个任务都有文件、步骤、验证命令，适合作为 `hai-goal` 或实现计划模板。

4. **验证命令值得保留。**

   ```text
   npx astro check
   npm run build
   ```

### 已过时部分

具体文件、任务、schema 和组件很多已经完成或改变，不应继续作为执行清单。

### 建议保留方式

不要按原计划执行。只保留它的执行文档格式：

```text
Scope Check
File Structure
Create / Modify
Validation commands
Task-by-task checklist
```

## 总结：真正值得保留的 9 类资产

从这些旧文档里提炼出来，真正值得进入未来系统的不是完整旧文件，而是这些资产：

1. **架构图表达形式**
   从时代层、协议层、价值层、内容层、I/O 层、反馈层讲清楚系统。

2. **三系统关系**

   ```text
   FerrySpec -> AdgaiWalker -> NorthStar
   ```

3. **价值宪法**
   人是目的、AI 是工具；数据提供现象，不提供目的。

4. **网站是沉淀层，不是草稿箱**
   原始混沌可以存在，但公开内容要经过整理。

5. **三问叙事**

   ```text
   为什么做
   做什么
   怎么做
   ```

6. **Walker 方法流程**

   ```text
   探索环境
   -> 需求分析
   -> 验证需求
   -> 设计方案
   -> 拆分任务
   -> 锚定目标
   -> 达成结果
   -> 整理沉淀
   ```

7. **渐进式 Agent 路线**

   ```text
   静态 AI 接口
   -> 结构化索引
   -> MCP / API
   -> 站内问答
   -> 反馈反哺
   ```

8. **UI/UX 口味**
   内容决定形式，交互要有反馈，克制但不冷淡。

9. **执行计划格式**
   先写 Scope Check，再写创建/修改文件，再写验证命令和任务清单。

## 删除建议

完成本文提炼后，旧文档可以分两类处理：

### 可删除或继续冷藏

```text
docs/archive/prd/Ferry-Walker个人网站PRD.md
docs/archive/prd/walker-blog-prd.md
docs/archive/specs/2026-05-30-agent-architecture.md
docs/archive/specs/2026-05-30-site-architecture-redesign.md
docs/archive/specs/2026-05-30-technical-architecture.md
docs/superpowers/plans/2026-05-30-ai-era-idea-co-creation-implementation.md
```

### 建议保留为架构表达参考

```text
docs/archive/references/2026-05-30-ai-era-idea-co-creation-architecture-design.md
```

原因：它的顶层架构图和价值宪法表达形式仍然很适合后续复用。
