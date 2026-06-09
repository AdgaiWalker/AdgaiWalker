# 2026-06 已落地功能与废弃执行文档归档

> 用途：替代已经完成或被吸收的执行清单，保留“实际做成了什么”和“哪些边界还没有做成”。

## 实际已经做了的功能

### 1. 单管理员认证与后台入口

- 已有唯一站主登录：`src/pages/admin/login.astro` + `src/pages/api/admin/auth.ts`。
- 已有管理员 cookie 校验：`src/lib/admin-auth.ts`。
- `/admin`、`/admin/insights`、`/admin/topics`、`/admin/ai-gateway`、`/admin/content`、`/admin/content/edit` 均有后台入口。

### 2. 内容管理 CRUD

- 已有后台内容列表页：`src/pages/admin/content/index.astro`。
- 已有 Markdown 编辑页：`src/pages/admin/content/edit.astro`。
- 已有文章页浮动编辑入口：`src/components/admin/AdminEditBar.astro`。
- 已有内容读、写、改可见性、删除 API：`src/pages/api/admin/content/[slug].ts`。
- 已有内容存储抽象：`src/lib/admin-content-store.ts`，本地开发可写本地文件，生产环境走 GitHub Contents API。

### 3. 内容可见性与公开过滤

- 已有 `visibility: public | draft | private` 规则入口：`src/knowledge/visibility.ts`。
- 旧 `published: false` 会按草稿处理，旧公开内容默认可公开。
- Astro 内容查询和独立内容查询都已走统一 public 判断：`src/knowledge/content.ts`、`src/knowledge/content-query.ts`。
- MCP 默认内容查询只读公开内容。

### 4. 数据公开与私有后台边界

- 公开统计接口已有：`src/pages/api/stats.ts`，只返回聚合字段，例如匹配总数、公开内容数、Top 类别。
- 后台洞察已有：`src/pages/admin/insights.astro` + `src/pages/api/insights.ts`。
- 后台对话查看已有：`src/pages/api/admin/conversations.ts`。
- MCP 私有洞察默认关闭，需要显式环境变量开启。

### 5. 需求匹配、记忆与选题

- 用户需求匹配接口已有：`src/pages/api/match.ts`。
- 用户历史接口已有：`src/pages/api/match-history.ts`。
- 反馈接口已有：`src/pages/api/match-feedback.ts`。
- 会话、消息、需求事件、选题候选的存储入口已有：`src/conversation/store.ts`。
- 后台选题页已有：`src/pages/admin/topics.astro`。

### 6. Agent 与工具层基础

- 匹配规划逻辑已有：`src/agent/match.ts`。
- AI Gateway 基础已有：`src/agent/gateway.ts`、`src/agent/gateway-config.ts`、`src/pages/admin/ai-gateway.astro`。
- MCP 工具有基础版本：`src/mcp/index.ts`，包括 query/search/get/stats/insights。
- Agent 六模块边界已经沉淀到：`references/agent-six-modules-architecture.md`。

## 还没有完全做成的事

- 没有实现多用户账号、完整注册系统和 RBAC；邀请制身份入口已纳入 iwalk.pro 近期路线，但尚未实现。
- 没有做文章多版本历史、版本对比、回滚。
- 没有做完整社区系统，NorthStar 仍应作为独立长期方向推进。
- 没有做完整 E2E 测试，只做过构建、类型和静态审计层面的验证记录。
- 生产环境内容写回依赖 `GITHUB_TOKEN` 权限；本地可用不等于线上 token 已配置正确。
- 源码中部分中文提示存在终端乱码风险，后续体验修复时应单独处理编码和文案。

## 本次删除的废弃执行文档

以下文档已经完成执行使命，继续留在当前 docs 根目录会让人误以为它们还是待办：

- `docs/admin-auth-agent-execution-goal.md`：一次性执行目标文档，执行结果已沉淀到本文和现有代码。
- `docs/admin-auth-agent-permission-to-do-list.md`：权限、CRUD、Agent 六模块的执行清单，核心规则已拆入当前代码、`references/agent-six-modules-architecture.md` 和本文。
- `docs/clean-code-refactor-goal.md`：Clean Code 重构执行记录，实际结构已经落到 `ContentFileStore`、`Visibility Policy` 和后台内容页面中。

## 保留的相关文档

- `references/creator-system-current-state.md`：作为创作者系统当前状态，保留。
- `docs/archive/references/creator-system-execution-plan-2026-06-08.md`：旧全量执行方案，已归档。
- `references/demand-intelligence-todo.md`：仍有未完成的需求洞察闭环，保留。
- `references/iwalk-agent-system-plan.md`、`references/tool-match-agent-to-do-list.md`：作为需求匹配 Agent 当前总案和细项清单，保留。
- `docs/archive/references/tool-match-agent-redesign-2026-06-08.md`：早期需求匹配执行方案，已归档。
- `references/adgaiwalker-personal-agent-system-architecture.md`：作为个人 Agent 系统总览，保留。
- `references/skill-admission-system-prd.md`：作为 Skill 准入设计，保留。
- `references/experience-validation-system-prd.md`：作为原始经验验证设计，保留。
- `references/content-intent-demand-policy-prd.md`：作为内容意图和需求关系策略，保留。
- `docs/archive/references/2026-05-30-ai-era-idea-co-creation-architecture-design.md`：架构图表达形式有价值，仅作历史参考。
