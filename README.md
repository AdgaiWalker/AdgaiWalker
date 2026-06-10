# AdgaiWalker / iwalk.pro

这是 Walker 的个人网站与个人 Agent 系统实验场。

它不是单纯博客，也不是完整社区平台。当前重点是把内容、想法、工具、需求反馈、管理员创作后台和 Agent 读取接口收束成一个可持续迭代的个人系统。

## 当前定位

```text
AdgaiWalker = 个人系统样板节点
iwalk.pro = 对外展示、内容沉淀和需求匹配入口
walker-northstar skill = 项目决策、文档路由和开发边界
NorthStar = 长期社区网络方向，不直接塞进当前个人站
```

当前阶段先服务个人站和发布接口验证，不提前承担完整社区复杂度。

## 技术栈

- Astro 6
- TypeScript
- Tailwind CSS v4
- Astro Content Collections
- Pagefind
- Upstash Redis
- Vercel SSR adapter
- MCP server

## 本地运行

```bash
npm install
npm run dev
```

常用命令：

```bash
npm run build
npm run preview
npm run build:mcp
```

## 文档入口

本仓库采用“代码仓库 + Skill 仓库”双边界：

- 代码与真实实现：本仓库
- 当前 PRD、plan、todo、architecture、current-state：`.agents/skills/walker-northstar/references/`
- 归档、ADR、额外材料：`docs/`

`.agents/` 默认不进入本仓库版本管理，它由独立的 `walker-northstar-skill` 仓库保护。

`docs/README.md` 只负责说明文档应该放哪里，不作为当前项目决策入口。
当前项目决策入口是：

```text
.agents/skills/walker-northstar/references/project-docs-index.md
```

## 内容边界

公开内容、私密内容、管理员内容必须分层：

- `public`：普通用户可见
- `draft`：未发布草稿
- `private`：站主私密内容
- admin-only 数据：只给管理员复盘，不进入公开接口

公开统计可以展示聚合结果，例如内容数量、功能使用次数、公开趋势；原始对话、用户画像、后台洞察和私密内容不应公开。

## 开源声明

本仓库代码采用 MIT 协议，授权文本见 [LICENSE](./LICENSE)。
