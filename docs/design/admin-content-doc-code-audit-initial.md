# 文档对照代码审计报告

> **复审更新（2026-06-20 19:45）**：初审 5 项中 4 项已关闭，1 项降为明确记录的后续项。当前 `npm test` 167 tests 通过，`astro check` 0 errors，build 通过；17/15 差异已确认来自 2 个 `type=tool` 内容不进入 `/posts`。两份旧详情页文档已标为历史输入。duplicate ContentShell 未在未跟踪状态下破坏性删除，剩余移动端差异已写入综合 To-do。

> 审核时间: 2026-06-20  
> 项目: AdgaiWalker  
> 审核范围: `docs/design/content-detail-page-plan.md`、`docs/design/content-detail-page-todo.md`、`docs/design/后台与内容详情页综合实施方案.md`、`docs/design/后台与内容详情页综合可执行-to-do.md`，以及内容详情页、工作台、反馈、命中率、认证与存储相关实现

## 审核结论

- **结论**: 有条件通过
- **汇总**: P0:0 P1:3 P2:1 P3:0 待证据补全:1
- **建议修复顺序**: 先恢复类型检查基线，再消除旧计划中的冲突指令，随后校准搜索覆盖口径并确定唯一 ContentShell；完成后再进入后台真实数据契约实施。

### 复审结论

- **结论**: 有条件通过，可进入下一实施包
- **已关闭**: #1 类型基线、#2 索引口径、#4 localStorage 反馈假降级文档、#5 历史归档/提交冲突
- **仍需完成**: #3 canonical ContentShell 已确定，但 duplicate 的移动端差异尚未合并，不能删除
- **新实现边界**: 工作台业务 localStorage、ContentFeedback、WorkItem 持久化仍是计划中的真实缺口，文档没有把它们误写成已完成

## 审核主题与场景

- 内容详情页当前基线：核对 Phase 1、ContentShell、TOC、构建与搜索覆盖的完成声明。
- 反馈与命中率真实性：核对详情页反馈是否有真实写入通道，是否会被后台指标读取。
- 后台业务状态真实性：核对决定、暂缓、AI 草稿、Gateway 状态是否仍由浏览器或静态文案模拟。
- 实施文档可执行性：核对旧计划与新综合计划是否会向执行者发出互相冲突的指令。

## 问题列表

### 内容详情页当前基线

### 1. “Phase 1 已完成且 0 errors”不符合当前类型检查结果

- **严重级别**: P1
- **位置**:
  - 文档: `docs/design/content-detail-page-plan.md:38`
  - 文档: `docs/design/content-detail-page-plan.md:54`
  - 代码: `src/scripts/toc-highlight.ts:45`
  - 代码: `src/services/account.service.ts:177`
  - 代码: `src/stores/managed-invite-code.store.ts:94`
  - 代码: `src/stores/session.store.ts:102`
- **证据**:
  - 文档片段:
    ```
    当前状态（Phase 1 已完成）
    npm run build → ✓ 0 errors
    ```
  - 代码片段:
    ```typescript
    const linkTop = activeLink.offsetTop;
    const codes = await redis.smembers<string>(SET_KEY);
    const ids = await redis.smembers<string>(sessionsByUserKey(username));
    ```
  - 运行证据:
    ```
    npm test       → 23 files / 160 tests passed
    npm run build  → passed
    npx astro check → 12 errors / 11 hints
    ```
- **影响**: 执行者会把“构建成功”误认为“类型与组件检查全部通过”，在不干净的基线上继续叠加数据契约和 UI 改造，扩大定位范围。
- **建议（最小修正）**: 代码侧修复当前 12 个 `astro check` 错误；文档侧把旧验证结果标记为历史快照，并把 `npm test`、`npx astro check`、`npm run build` 三项共同作为完成门槛。
- **修复收益**: 建立可信的实施起点，避免后续失败被错误归因到新功能。
- **关联原则**: 以代码为真、按场景审计、说明修复收益

### 2. “搜索包含所有 17 篇”缺少与发布规则一致的证据

- **严重级别**: 待证据补全
- **位置**:
  - 文档: `docs/design/content-detail-page-plan.md:57`
  - 文档: `docs/design/content-detail-page-plan.md:146`
  - 代码: `src/pages/posts/[slug].astro:8`
- **证据**:
  - 文档片段:
    ```
    17 篇文章 → 全部走 ContentShell，0 退化
    Pagefind re-index 验证：确认搜索结果包含所有 17 篇
    ```
  - 代码片段:
    ```typescript
    import ContentShell from '../../layouts/ContentShell.astro';
    ```
  - 运行证据:
    ```
    src/content 中共有 17 个 .md/.mdx 文档；当前构建的 Pagefind 输出为 Indexed 15 pages。
    ```
- **影响**: 17 个源文档、实际发布文章与 Pagefind 索引页面被混成一个数字，可能把未发布或被过滤内容误判为搜索故障，也可能漏掉真正未入索引的页面。
- **建议（最小修正）**: 在基线任务中输出“源文档数、已发布文章数、可索引页面数、实际索引数”四个口径，并明确两篇差异的原因；完成前不要保留“全部 17 篇已索引”的当前态声明。
- **修复收益**: 搜索覆盖可以复现、解释和回归，不再依赖手工计数。
- **关联原则**: 以代码为真、合同优先、按场景审计

### 3. 当前存在两套 ContentShell，但旧详情页计划按单一实现描述

- **严重级别**: P2
- **位置**:
  - 文档: `docs/design/content-detail-page-plan.md:48`
  - 文档: `docs/design/后台与内容详情页综合可执行-to-do.md:50`
  - 代码: `src/layouts/ContentShell.astro:1`
  - 代码: `src/components/blocks/ContentShell.astro:1`
  - 代码: `src/pages/posts/[slug].astro:8`
- **证据**:
  - 文档片段:
    ```
    src/layouts/ContentShell.astro | 统一阅读容器
    ```
  - 代码片段:
    ```typescript
    import ContentShell from '../../layouts/ContentShell.astro';
    ```
  - 仓库证据:
    ```
    src/layouts/ContentShell.astro
    src/components/blocks/ContentShell.astro
    ```
- **影响**: TOC、反馈带和样式修复可能落在未被路由使用的实现上，出现“代码改了但页面不变”或两份实现继续分叉。
- **建议（最小修正）**: 执行综合待办 G0-03：以真实路由引用为起点，比较差异后确定唯一实现；视觉与引用验证通过后再删除重复实现。
- **修复收益**: 后续 H0 和反馈集成只有一个修改面，减少重复修复与视觉漂移。
- **关联原则**: 以代码为真、合同优先

### 反馈与实施文档真实性

### 4. 旧待办允许把业务反馈写入 localStorage，与真实命中率链路冲突

- **严重级别**: P1
- **位置**:
  - 文档: `docs/design/content-detail-page-todo.md:93`
  - 文档: `docs/design/后台与内容详情页综合实施方案.md:281`
  - 代码: `src/pages/api/match-feedback.ts:69`
  - 代码: `src/pages/api/admin/hit-rate.ts:18`
- **证据**:
  - 文档片段:
    ```
    如果 hit-rate 只读统计不能写 → 反馈先存 localStorage，Phase 3 再接
    ```
  - 代码片段:
    ```typescript
    const result = await feedbackService.submit({
      needCaseId: body.needCaseId,
      sessionId: body.sessionId,
      feedbackType: body.feedbackType,
      feedbackText: body.feedbackText,
    });

    const [contents, topics, needCases] = await Promise.all([
      getPublishedContentItems(),
      getTopicCandidates({ limit: 500 }),
      getRecentNeedCases(2000),
    ]);
    ```
- **影响**: 本地反馈不会进入服务端数据，也不会被命中率计算读取；界面可能提示“反馈成功”，后台却永远看不到，直接破坏“只展示真实数据”的目标。
- **建议（最小修正）**: 给旧待办增加“已被综合方案取代”的醒目标记，并删除业务反馈的 localStorage 降级路径；localStorage 只允许保存防重复提示或 UI 偏好。内容反馈必须等 `ContentFeedbackEvent` 与持久化 API 可用后再上线。
- **修复收益**: 消除假成功和统计断链，确保每条可见反馈都能追溯到服务端记录。
- **关联原则**: 合同优先、安全默认收紧、以代码为真

### 5. 旧待办仍包含与新执行规则冲突的归档和提交指令

- **严重级别**: P1
- **位置**:
  - 文档: `docs/design/content-detail-page-todo.md:159`
  - 文档: `docs/design/content-detail-page-todo.md:221`
  - 文档: `docs/design/后台与内容详情页综合实施方案.md:301`
  - 代码: `git status --short`（2026-06-20 工作区状态）
- **证据**:
  - 文档片段:
    ```
    移到 src/_archive/ 而不是删，保留一周再清理
    每个任务独立 commit
    ```
  - 仓库证据:
    ```
    当前工作区包含多项已修改和未跟踪文件，且本轮未授权自动提交。
    ```
- **影响**: 执行者可能制造第二份死代码，或在未确认变更归属的脏工作区中切碎并提交不属于当前任务的改动。
- **建议（最小修正）**: 将旧待办标为历史文档；以综合方案为唯一执行入口。零引用代码在验证后直接删除并由 Git 保留历史；提交仅在用户明确授权并完成变更边界核对后执行。
- **修复收益**: 避免死代码长期存在，也避免误提交用户未完成的工作。
- **关联原则**: 以代码为真、安全默认收紧、说明修复收益

## 已核对但无需修改

- 综合方案准确识别了工作台三处业务 `localStorage` 写入；当前代码位于 `src/pages/admin/index.astro:362`、`:380`、`:427`。
- 综合方案准确识别了侧栏“系统可用”为硬编码；当前代码位于 `src/components/admin/AdminLayout.astro:168`。
- `/api/match-feedback` 已持久化 `MatchFeedbackEvent` 并回写 `NeedCase`；它不能替代缺失的内容阅读反馈契约。
- `/api/admin/hit-rate` 当前从已发布内容、选题与 NeedCase 计算命中率；综合方案新增独立 `ContentFeedbackEvent` 的方向正确。
- `EvidenceRef`、`DecisionItem`、`ActionItem`、`OutcomeEvent` 当前尚无实体、仓储和 API；综合待办把它们列为 P0，而不是描述为已完成。
- 综合方案明确禁止 AI 在没有证据时生成正式优先级，符合 Ferry 的“AI 提案、人类裁决”边界。

## 审核结论

### 结论

- [ ] **通过** — 无 P0/P1 问题
- [x] **有条件通过** — 需先修复以下前置条件：
  1. 修复 `astro check` 的 12 个错误并建立三项基线。
  2. 将两份旧详情页计划标为历史输入，综合方案与综合待办作为唯一执行入口。
  3. 解释 17 个源文档与 15 个索引页面的差异。
- [ ] **不通过** — 存在阻断项

### 汇总统计

| 级别 | 数量 |
|------|------|
| P0 Blocker | 0 |
| P1 Major | 3 |
| P2 Minor | 1 |
| P3 Nit | 0 |
| 待证据补全 | 1 |
| **总计** | **5** |

### 建议修复优先级

1. **立即修复 (P0)**: 无。
2. **优先修复 (P1)**: #1 恢复类型检查基线；#4 移除反馈假降级；#5 停止执行冲突的历史指令。
3. **计划修复 (P2)**: #3 确定唯一 ContentShell。
4. **补充证据**: #2 建立发布与索引四口径。

### 变更影响

| 影响范围 | 是否需要 | 说明 |
|----------|----------|------|
| Demo 更新 | 是 | 基线修复和唯一 ContentShell 确定后需重新验证后台与详情页。 |
| 截图更新 | 否 | 本轮先校准事实与行为，不改变已确认的视觉方向。 |
| 脚本更新 | 是 | 验证脚本需同时运行 test、astro check、build，并核对索引数量。 |
| Changelog | 否 | 尚未形成发布版本。 |
| 对外通知 | 否 | 当前均为内部设计与实施准备。 |
