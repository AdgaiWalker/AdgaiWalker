# ADR-0001: Agent 核心与 Astro 展示层分离

## 日期
2026-06-08

## 状态
已接受

## 上下文
项目的 Agent 能力（匹配引擎、需求洞察、工具画像、对话管理）和 Astro 展示层（页面、布局、组件）的代码混在 `src/lib/` 和 `src/data/` 中。这导致：
- Agent 逻辑变更时，需要翻找分散在不同目录的文件
- 展示层重构时，容易误触 Agent 核心代码
- 两个变化速率不同的系统耦合在一起，模块边界模糊

## 决策
按业务职责将文件重新组织到独立模块目录：

| 旧路径 | 新路径 | 模块 |
|--------|--------|------|
| `src/lib/content.ts` | `src/knowledge/content.ts` | 知识库 |
| `src/lib/content-query.ts` | `src/knowledge/content-query.ts` | 知识库 |
| `src/lib/content-model.ts` | `src/knowledge/content-model.ts` | 知识库 |
| `src/data/tool-profiles.ts` | `src/profiles/tool-profiles.ts` | 画像系统 |
| `src/data/match-resource-index.ts` | `src/profiles/resource-index.ts` | 画像系统 |
| `src/lib/match-recommend.ts` | `src/agent/match.ts` | 匹配 Agent |
| `src/lib/match-process.ts` | `src/agent/insight.ts` | 匹配 Agent |
| `src/lib/match-privacy.ts` | `src/agent/privacy.ts` | 匹配 Agent |
| `src/lib/match-store.ts` | `src/conversation/store.ts` | 对话层 |
| `src/lib/constants.ts` | `src/shared/constants.ts` | 共享 |
| `src/lib/format.ts` | `src/shared/format.ts` | 共享 |
| `src/lib/routes.ts` | `src/shared/routes.ts` | 共享 |

Astro 框架绑定的文件（pages/、layouts/、components/、content/、scripts/、styles/）保持原位不动。仅搬移业务逻辑文件，不改代码逻辑。

## 原因
- **管理复杂度**：按业务职责组织比按技术类型（lib/data）组织更清晰
- **应对变化**：Agent 模块和展示层有不同的变化速率，分离后互不影响
- **最小改动**：纯搬移 + 更新 import 路径，不改变任何业务逻辑
- **向后兼容**：通过 `@/` 路径别名（`@/*` → `src/*`），新路径对 TypeScript 和 Astro 透明

## 后果
- **正面**：每个模块的文件集中在同一目录，职责一目了然；后续可以独立测试 Agent 模块
- **负面**：import 路径全部从 `@/lib/` 变为 `@/knowledge/`、`@/agent/` 等，需要一次全局更新
- **风险**：约 35 个文件的 import 需要更新，遗漏任何一个都会导致构建失败

## 替代方案
1. **保持现状** — 不搬移，靠命名约定区分。代价是模块边界始终模糊
2. **拆为独立 npm 包** — Agent 核心完全脱离 Astro 项目。当前阶段过度工程化，先通过目录分离验证边界
