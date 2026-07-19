# ADR-0001: Agent 核心和展示层分离

**日期**: 2026-06-11  
**状态**: 已完成  
**范围**: AdgaiWalker 项目前端/src 重构

## Context

项目初期，Agent 逻辑（匹配、对话、内容查询）和展示层代码（Astro 页面/组件）混在 `src/` 下，没有明确分层。随着 Agent 模块增长（匹配引擎、MCP server、需求聚类），这种混用导致：

- Agent 逻辑被 Astro 构建上下文（`getCollection`）绑定，无法独立运行
- 单元测试需要模拟 Astro 环境
- MCP server 需要自己的查询入口，不能复用 Astro 构建期代码

## Decision

把 `src/` 按职责拆分为五个逻辑层，展示层原地不动：

| 层 | 目录 | 职责 |
|----|------|------|
| 知识库 | `src/knowledge/` | 纯查询与纯函数，Astro 构建期内容读取 + 计算 |
| 画像系统 | `src/profiles/` | 工具画像、资源索引、分类标签 |
| Agent | `src/agent/` | 匹配引擎、AI Gateway、六模块编排 |
| 对话存储 | `src/conversation/` | Redis + 内存降级的存储实现 |
| 共享 | `src/shared/` | 路由常量、格式化、类型 |

展示层文件（`pages/`、`layouts/`、`components/`、`scripts/`、`styles/`）保持原位不动。

关键原则：
- `knowledge/` 只含纯查询与纯函数，**不直连 store**
- 需要跨层组合的编排放 `services/`（后续新增的应用服务层）
- 统计聚合查询走 store 自由函数，不走单实体 RepositoryPort

## Consequences

- MCP server 可通过 `content-query.ts` 独立查询内容，不再依赖 Astro 构建
- Agent 代码可独立单元测试
- 展示层与业务逻辑层的修改不再相互阻塞
- 后续新增 `services/` 和 `stores/` 层自然继承此分层

## 后续演进

- 2026-06-22: 新增 `services/`（应用服务层）和 `stores/`（数据仓储端口层），Workbench domain 剥离已完成
- 未来: domain/ 纯逻辑层独立，与 storage adapter 解耦
