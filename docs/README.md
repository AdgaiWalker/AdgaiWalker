# Docs 使用规则

`docs/` 不是当前项目工作台。当前有效的 PRD、plan、todo、architecture、current-state
统一放在 `hai-stack/skills/walker-northstar/references/`，由 `walker-northstar`
作为主 skill 调用。

`docs/` 只承担三类材料：

1. **归档材料**：已经完成、过期、被替代或只用于追溯的文档，放入 `docs/archive/`。
2. **架构决策记录**：需要长期保留决策理由的 ADR，放入 `docs/adr/`。
3. **额外材料**：专题、素材、媒体、非当前调用资料，放入 `docs/AI赋能/`、`docs/media/`
   或后续明确命名的资料目录。

## 当前工作台

当前有效文档入口：

```text
hai-stack/skills/walker-northstar/references/project-docs-index.md
```

当前有效文档规则：

```text
*-prd.md            = 当前需求与模块职责
*-plan.md           = 当前计划方案
*-todo.md           = 当前执行清单
*-architecture.md   = 当前架构和模块关系
*-current-state.md  = 当前真实状态
```

## 归档规则

当一个当前文档完成、过期或被新文件替代：

1. 移入 `docs/archive/` 或 `docs/archive/references/`。
2. 从 `walker-northstar/references/project-docs-index.md` 的当前列表中移除。
3. 如果仍有历史价值，在归档文件顶部说明“只作历史参考，不作为当前依据”。

不要在 `docs/` 根目录继续堆新的当前 PRD、plan、todo 或架构文档。
