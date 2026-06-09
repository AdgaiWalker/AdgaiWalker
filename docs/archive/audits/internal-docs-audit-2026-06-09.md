# Internal Documentation Audit: docs/

> 审计日期：2026-06-09  
> 审计范围：`docs/` 当前文档集及 `docs/archive/references/` 中仍被当前文档引用的归档参考。  
> 审计边界：只审文档内部一致性，不拿代码、线上页面或仓库实际实现当真相源。

## Verdict

- **Status**: inconsistent
- **Main issue**: 当前文档集同时保留“唯一决策入口”“执行计划”“已完成总结”“旧架构参考”，但没有清楚标注哪些是当前事实、哪些只是历史参考，导致状态、范围和下一步互相打架。
- **Scope reviewed**: `docs/README.md`、`docs/2026-05-30-ai-era-idea-co-creation-architecture-design.md`、`docs/adgaiwalker-personal-agent-system-architecture.md`、`docs/agent-six-modules-boundary.md`、`docs/creator-system-plan.md`、`docs/demand-intelligence-todo.md`、`docs/invite-identity-understanding-prd.md`、`docs/iwalk-agent-system-full-redesign.md`、`docs/tool-match-agent-redesign.md`、`docs/tool-match-agent-to-do-list.md`、`docs/adr/ADR-0001-agent-core-separation.md`、`docs/archive/references/*.md`。

## Document Map

| Section / Doc | Apparent purpose | Notes |
|---|---|---|
| `docs/README.md` | 当前唯一决策入口和路线图 | 角色正确，但仍引用已删除路径和旧参考文件。 |
| `docs/2026-05-30-ai-era-idea-co-creation-architecture-design.md` | 早期大架构和表达形式 | 仍放在根目录，状态写“待用户审阅”，但多处实施判断已过时。 |
| `docs/adgaiwalker-personal-agent-system-architecture.md` | 个人 Agent / Skill / 经验沉淀总架构 | 内容有价值，但混合了总架构、Skill 准入、原始事件采集多个目标。 |
| `docs/agent-six-modules-boundary.md` | 当前 Agent 六模块责任边界 | 结构清楚，可作为 Agent 模块边界源。 |
| `docs/creator-system-plan.md` | 创作者系统执行方案 | 顶部说“先不要写代码”，但大量内容已被标记已解决，后续 TODO 仍未同步。 |
| `docs/demand-intelligence-todo.md` | 需求智能管道执行方案 | 有明确剩余事项，但 MCP 状态和已完成总结冲突。 |
| `docs/invite-identity-understanding-prd.md` | 邀请制轻身份入口 PRD | 与“iwalk 不承担多人平台复杂度”并非完全冲突，但需要明确是否进入当前路线。 |
| `docs/iwalk-agent-system-full-redesign.md` | Agent 产品和架构重设计总案 | 比 `tool-match-agent-redesign.md` 更新，已有阶段状态。 |
| `docs/tool-match-agent-redesign.md` | 需求匹配 Agent 早期执行方案 | 多数 checkbox 未更新，和后续总案/清单重复。 |
| `docs/tool-match-agent-to-do-list.md` | 工具匹配安全、体验、数据清单 | 有较细任务状态，但局部仍保留旧 Codex 文案。 |
| `docs/adr/ADR-0001-agent-core-separation.md` | Agent 核心和展示层分离决策 | 可保留，属于决策记录。 |
| `docs/archive/references/*.md` | 旧文档价值提炼和已完成总结 | 适合追溯，不应反向成为当前执行入口。 |

## Findings

### P1: README 的“唯一决策入口”与根目录旧架构参考并存，源头身份不清

- **Type**: scope conflict / stale signal
- **Location**: `docs/README.md:3`、`docs/README.md:236-244`、`docs/2026-05-30-ai-era-idea-co-creation-architecture-design.md:6-7`
- **Evidence**:
  - `README` 声称“当前唯一的决策入口”，旧 PRD、旧架构设计、旧 Agent 规划归档后“不再作为当前判断依据”。
  - 旧架构文档仍在 `docs/` 根目录，状态仍写“待用户审阅”，范围覆盖 iwalk.pro、FerrySpec、NorthStar。
  - `README` 又把它列为“未归入 archive/ 的参考文件”，但没有说明它只保留图式和表达，不保留实施判断。
- **Impact**: 后续写 PRD 或执行任务时，容易把旧架构文档里的实施状态当成当前决策，特别是登录、MCP、路由和反馈数据台。
- **Repair**: update / move
- **Recommendation**: 给旧架构文档顶部加醒目的“仅作架构表达参考，不作当前实施依据”横幅；或移动到 `docs/archive/references/`。`README` 保留它时只写“视觉/表达参考”。

### P1: `creator-system-plan.md` 同一文档内同时说“已解决”和“待做”

- **Type**: lifecycle conflict
- **Location**: `docs/creator-system-plan.md:5`、`docs/creator-system-plan.md:23`、`docs/creator-system-plan.md:62-68`、`docs/creator-system-plan.md:148`、`docs/creator-system-plan.md:224-242`
- **Evidence**:
  - 文档顶部原则仍是“先不要写代码”。
  - 现状表中 `src/pages/api/insights.ts` 仍标为“只认 CRON_SECRET，不认 admin cookie”。
  - 关键缺口表又写 Insights API、公开统计、选题库、看板、内容编辑、AdminEditBar 都已解决。
  - 后文 P0/P1/P2/P3/P4 验收和 To-Do 仍大量未勾选。
- **Impact**: 这份文档会同时引导“已经完成”和“继续按旧计划执行”，容易重复做已完成工作，或者误判当前真正剩余事项。
- **Repair**: split / update
- **Recommendation**: 拆成两份：`creator-system-current-state.md` 保留已完成能力和剩余风险；原长执行方案移入 archive，或统一勾选/划掉已完成项。

### P1: MCP / `walker_insights` 状态在当前文档间冲突

- **Type**: lifecycle conflict
- **Location**: `docs/README.md:65`、`docs/README.md:190-200`、`docs/demand-intelligence-todo.md:250-255`、`docs/archive/references/completed-execution-summary-2026-06.md:47`
- **Evidence**:
  - `README` 写 MCP server 已实现，包含 `walker_insights`。
  - 已完成总结也写 MCP 工具包括 query/search/get/stats/insights。
  - `demand-intelligence-todo.md` 仍把“新增 `walker_insights` 工具”放在 Phase 3 未完成验收项。
- **Impact**: 会让人误以为 MCP 洞察还没做，或不知道真正剩下的是“权限边界、数据质量、内容创作闭环”，不是工具注册本身。
- **Repair**: update
- **Recommendation**: 将 `demand-intelligence-todo.md` 的 3-2 改为“已完成基础工具，剩余：权限模式、返回字段白名单、洞察数据质量验收”。

### P1: 需求匹配 Agent 的三份文档重复且状态互相覆盖

- **Type**: redundant content / lifecycle conflict
- **Location**: `docs/tool-match-agent-redesign.md:1-35`、`docs/tool-match-agent-redesign.md:45-110`、`docs/tool-match-agent-to-do-list.md:84`、`docs/tool-match-agent-to-do-list.md:550-557`、`docs/iwalk-agent-system-full-redesign.md:579-638`
- **Evidence**:
  - `tool-match-agent-redesign.md` 是早期执行方案，Phase 0-3 全部仍是未勾选状态。
  - `tool-match-agent-to-do-list.md` 一处仍写用户看到“别急着用 Codex”，但后文又写入口文案已改成“不确定用什么？说说你要做什么”。
  - `iwalk-agent-system-full-redesign.md` 已给出更新状态：Phase 1 工具匹配 MVP 已完成，Phase 2/3/5 未开始，Phase 4 部分完成。
- **Impact**: 三份文档会给出三套“下一步”，其中早期执行方案会把已完成文案和 UI 工作重新拉回待办。
- **Repair**: merge / remove
- **Recommendation**: 保留 `iwalk-agent-system-full-redesign.md` 作为 Agent 总案，保留 `tool-match-agent-to-do-list.md` 作为细项清单；将 `tool-match-agent-redesign.md` 移入 archive 或删除，并把其中仍有价值的验收项合并到 to-do list。

### Needs Decision: 邀请制身份入口到底属于 iwalk.pro 短期，还是 NorthStar 长期

- **Type**: scope conflict
- **Location**: `docs/README.md:53`、`docs/README.md:202-214`、`docs/2026-05-30-ai-era-idea-co-creation-architecture-design.md:193-199`、`docs/invite-identity-understanding-prd.md:9-21`、`docs/archive/references/completed-execution-summary-2026-06.md:52-54`
- **Evidence**:
  - `README` 和旧架构强调 iwalk.pro 不应过早承担多人平台复杂度，NorthStar 单独推进多人系统网络。
  - 邀请制 PRD 把邀请码、轻量会话、用户画像、管理员复盘放进测试阶段目标。
  - 已完成总结写“没有做多用户账号、注册、邀请制和 RBAC”，但没有说明邀请制是下一步还是暂缓。
- **Impact**: 如果不拍板，后续会在“只做个人站需求匹配”和“做邀请用户入口”之间反复摇摆。
- **Repair**: ask
- **Recommendation**: 需要明确一句决策：邀请制是 iwalk.pro 的短期测试入口，还是 NorthStar 的长期用户系统前置研究。若归入 iwalk.pro，应写入 README Plan；若归入 NorthStar，应把 PRD 移到 NorthStar/backlog。

### P2: README 引用已删除或空目录，削弱当前入口可信度

- **Type**: stale signal
- **Location**: `docs/README.md:132-134`、`docs/README.md:236-244`
- **Evidence**:
  - Plan 1 的“当前详细执行计划”指向 `docs/superpowers/plans/2026-05-30-ai-era-idea-co-creation-implementation.md`，该文件已不存在。
  - “未归入 archive/ 的参考文件”列出 `docs/2026-05-31-ideas-page-redesign-spec.md`，该文件已不存在。
  - `docs/media/` 仍被列为媒体计划参考，但目录已没有实际参考内容。
- **Impact**: README 作为唯一入口时出现死引用，会让后续清理和执行判断不可信。
- **Repair**: update / remove
- **Recommendation**: 删除不存在路径；若确实要保留历史引用，改指向 `docs/archive/references/legacy-docs-extracted-value.md`。

### P2: 内容状态语言有两套，Ferry 阶段和当前 `status` 枚举没有完全对齐

- **Type**: terminology drift
- **Location**: `docs/README.md:88-106`、`docs/2026-05-30-ai-era-idea-co-creation-architecture-design.md:307`、`docs/2026-05-30-ai-era-idea-co-creation-architecture-design.md:484-494`
- **Evidence**:
  - `README` 当前内容状态是 `thinking / validating / building / verified / archived`，并说明 P3 Dialectic 还没有映射。
  - 旧架构文档的 status 写成“想法中、规划中、实践中、修正中、已沉淀、已归档”。
  - 两套词都在根目录文档中出现，但没有说明哪一套为正式字段，哪一套只是中文解释。
- **Impact**: 后续补 frontmatter 或写 UI 文案时，可能混用状态字段，导致内容治理混乱。
- **Repair**: merge / update
- **Recommendation**: 以 README 的英文枚举为唯一字段；旧架构中文状态只保留为“历史表达”，或映射成一张中文显示表。

### P2: `adgaiwalker-personal-agent-system-architecture.md` 一份文档承载了多个独立目标

- **Type**: misplaced content / split needed
- **Location**: `docs/adgaiwalker-personal-agent-system-architecture.md:1-17`、`docs/adgaiwalker-personal-agent-system-architecture.md:139-229`、`docs/adgaiwalker-personal-agent-system-architecture.md:231-270`
- **Evidence**:
  - 开头声明这是个人 Agent 系统总架构，不是单一 Skill 准入 PRD。
  - 中段又定义 Skill 准入、Skill 注册、Agent 路由。
  - 后段另起“原始经验采集与验证系统”，已经像独立 PRD。
- **Impact**: 该文档过大，后续实现时容易“一口吃掉全系统”，与文档自己说的“不要一次性实现整份总架构”冲突。
- **Repair**: split
- **Recommendation**: 保留当前文件为总架构目录，把 Skill 准入系统、原始事件采集系统各拆成独立 PRD。

### P3: 归档参考文件仍有“删除建议”指向已删除内容

- **Type**: stale signal
- **Location**: `docs/archive/references/legacy-docs-extracted-value.md:441-456`
- **Evidence**:
  - 该文件仍列出“可删除或继续冷藏”的具体旧文件。
  - 部分旧文件已经被删除，建议已执行但未标记。
- **Impact**: 作为 archive 影响较小，但会让人误以为删除批次尚未完成。
- **Repair**: update
- **Recommendation**: 在删除建议段落加“已执行批次”标记，或改成“历史删除依据”。

## Remove / Update / Move Decisions

| Content | Decision | Reason | Suggested destination or replacement |
|---|---|---|---|
| `docs/tool-match-agent-redesign.md` | move / merge | 早期执行方案已被总案和 to-do list 覆盖 | 合并剩余验收项后移入 `docs/archive/references/` |
| `docs/2026-05-30-ai-era-idea-co-creation-architecture-design.md` | update / move | 架构图有价值，但实施状态过时 | 顶部加参考声明，或移入 archive references |
| `docs/creator-system-plan.md` | split / update | 已完成状态与旧 TODO 混在一起 | 拆为 current-state + archived execution plan |
| `docs/demand-intelligence-todo.md` | update | MCP 等部分状态过时，但仍有剩余闭环价值 | 更新 Phase 3，把已完成项改成剩余验收 |
| `docs/README.md` reference section | update | 存在已删除路径和空目录引用 | 删除死链接，改指向当前保留文档 |
| `docs/adgaiwalker-personal-agent-system-architecture.md` | split | 总架构、Skill PRD、事件采集 PRD混在一起 | 拆成 1 个总览 + 2 个 PRD |
| 邀请制 PRD | ask / update | 需要确定是否进入 iwalk.pro 近期路线 | 由 owner 决策后写入 README Plan 或移入 NorthStar backlog |

## Open Decisions

- 邀请制身份理解入口是否是 iwalk.pro 的近期模块？如果是，它应成为 README 当前路线中的一个 Plan；如果不是，应移动到 NorthStar/backlog。
- `docs/2026-05-30-ai-era-idea-co-creation-architecture-design.md` 是否继续保留在 docs 根目录？如果保留，是否只作为架构表达参考？
- `creator-system-plan.md` 是否还作为当前执行入口？如果不作为，应拆出当前状态后归档长执行计划。

## Suggested Repair Order

1. 修 `docs/README.md`：删除死链接，明确当前文档入口、参考文档、归档文档三类。
2. 给旧架构文档加“仅参考”声明，或移动到 `archive/references`。
3. 处理 Agent 匹配文档重复：归档 `tool-match-agent-redesign.md`，保留总案 + to-do list。
4. 更新 `demand-intelligence-todo.md`：把 MCP 已完成项改成剩余验收。
5. 拆 `creator-system-plan.md`：当前状态留根目录，旧执行细节归档。
6. 拍板邀请制身份入口归属，再决定更新 README 或移动 PRD。
7. 统一内容状态词表：字段以 README 枚举为准，旧中文状态只作显示映射。
