# Docs 使用规则

`docs/` 不是当前项目工作台。当前有效的 PRD、plan、to-do list、规划材料和当前轮次状态统一放在：

```text
.agents/skills/walker-northstar/references/
```

`docs/` 只承担两类材料：

1. **归档材料**：已经完成、过期、被替代或只用于追溯的文档，放入 `docs/archive/`。
2. **额外材料**：专题、素材、图谱、媒体、非当前调用资料，放入 `docs/AI赋能/`、`docs/media/` 或后续明确命名的资料目录。

当前项目决策入口：

```text
.agents/skills/walker-northstar/references/project-docs-index.md
```

注意：`.agents/` 默认不进入本仓库版本管理，它由独立的 `walker-northstar-skill` 仓库保护。`docs/` 不要复制一份当前工作台，只保留归档、ADR 和额外材料。

## 文件存在原因

| 文件或目录 | 存在原因 | 当前处理 |
| --- | --- | --- |
| `README.md` | 仓库入口，告诉人这是哪个项目、怎么运行、文档入口在哪里。 | 保留，不能和 `docs/README.md` 合并。 |
| `docs/README.md` | 文档路由守门员，说明什么材料放 `docs/`，什么材料放 skill references。 | 保留，保持短。 |
| `.agents/skills/walker-northstar/references/` | 当前有效 PRD、计划、架构、状态和执行清单。 | 当前工作台。 |
| `docs/archive/` | 历史材料、旧方案、审计报告、已完成执行记录。 | 保留，只作追溯。 |
| `docs/AI赋能/目录.md` | AI 赋能方法论总纲，讲方向、阶段、原则。 | 保留。 |
| `docs/AI赋能/具体.md` | AI 赋能落地操作指南，讲具体工具、步骤和任务。 | 保留。 |
| `docs/AI赋能/内容关系图谱.md` | 内容之间的关系图谱，属于资料图谱，不属于项目根目录。 | 已放入 `docs/AI赋能/`。 |

## 可合并判断

| 对象 | 是否合并 | 理由 |
| --- | --- | --- |
| `README.md` + `docs/README.md` | 不合并 | 一个是仓库入口，一个是文档治理入口，合并会混淆读者和 AI。 |
| `docs/AI赋能/目录.md` + `docs/AI赋能/具体.md` | 暂不合并 | 一个讲总纲，一个讲操作。等未来要对外发布教程时，再合并成正式教程。 |
| `project-docs-index.md` + `current-cycle-state.md` | 不合并 | 一个是决策入口，一个是当前轮次状态；入口不能变成状态长文。 |
| `*-prd.md` + `*-plan.md` + `*-todo.md` | 不合并 | PRD 定义要什么，plan 定义怎么做，todo 定义下一步执行。混在一起会失去判断力。 |
| 旧执行方案 + 已完成总结 | 可归档合并 | 它们不再指导当前执行，只用于追溯“当时怎么做”。 |
| 重复的旧架构图和表达草稿 | 可提炼后归档 | 保留表达价值，不保留当前决策权。 |

## 当前有效文档规则

```text
references/working/prd.md          = 当前轮需求分析、功能设计、架构设计
references/working/plan.md         = 当前轮开发规划、阶段顺序、依赖关系
references/working/to-do list.md   = 当前轮可执行、可验收任务清单
references/planning/*-architecture.md = 长期架构和模块关系
references/current-cycle-state.md  = 当前轮次状态
```

## 归档规则

当一个当前文档完成、过期或被新文件替代：

1. 移入 `docs/archive/` 或 `docs/archive/references/`。
2. 从 `walker-northstar/references/project-docs-index.md` 的当前列表中移除。
3. 如果仍有历史价值，在归档文件顶部说明“只作历史参考，不作为当前依据”。

不要在 `docs/` 根目录继续堆新的当前 PRD、plan、todo 或架构文档。
