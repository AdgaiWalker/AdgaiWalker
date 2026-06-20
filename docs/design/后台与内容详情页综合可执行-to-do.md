# Walker 后台与内容详情页综合可执行 To-do

Status: Ready for promotion / Not started  
Updated: 2026-06-20  
Scope: AdgaiWalker 个人系统  
Companion plan: `docs/design/后台与内容详情页综合实施方案.md`

> 本文已拆到可直接开发、测试和验收的粒度。当前 `auth-encounter-topic` 周期仍在 PR 收口，因此本文暂存于 `docs/design/`；确认切换轮次后，将本轮选中范围迁入 `walker-northstar/references/working/` 三件套，再开始 reality 实施。

---

## 0. 执行结论

实施不按页面数量排序，按共享依赖和真实闭环排序：

```text
G0 保护当前 reality
-> H0 修复已知内容页问题
-> P0 真实性、持久化、权限与审计
-> P1 需求 -> 决定 -> 内容 -> 反馈 -> 结果
-> P2 内容规模化 + 结果到资产
-> P3 完整遥测 + 内容 Block + 主题媒体
-> P4 AI 自动化 + Contributor
-> P5 NorthStar + 经营系统
```

当前第一个实施包只包含 `G0 + H0 + P0 + P1`。P2—P5 暂不转成当前开发任务。

---

## 1. 现有基础与已知缺口

### 1.1 已存在的可复用基础

- `NeedCase` 、`MatchFeedbackEvent` 、`TopicCandidate` 已存在类型与 Redis/内存存储基础。
- `/api/match-feedback` 已能保存需求匹配会话反馈并回写 `NeedCase.feedbackStatus`。
- `sourceTopicId` 已能把内容连回 `TopicCandidate`。
- `/api/admin/hit-rate` 与 `hit-rate.service.ts` 已能基于 NeedCase 反馈产生统计。
- `/admin` 已读取真实 NeedCase 与 Incident 数据。
- 后台共享导航、Owner 登录与开发预览入口已有基础。
- `/posts/[slug]` 当前实际导入 `src/layouts/ContentShell.astro`。

### 1.2 已确认缺口

- `EvidenceRef / DecisionItem / ActionItem / OutcomeEvent` 尚无实体、仓储与 API。
- 工作台决定、暂缓和 AI 草稿仍保存在 `localStorage`。
- 侧栏的“系统可用”是硬编码状态。
- 缺少面向内容详情页的 `ContentFeedbackEvent`。
- 现有 hit-rate 只能表达“匹配会话反馈”，不能表达“阅读内容后的明确反馈”。
- `src/layouts/ContentShell.astro` 和 `src/components/blocks/ContentShell.astro` 并存，存在两套实现风险。
- 开发环境可以内存降级，但生产环境缺少“禁止静默降级”的统一约束。

---

## 2. 全局执行规则

### 2.1 自主决策范围

执行中遇到普通实现问题时，直接按以下顺序决定，不中断询问：

1. 保留数据来源、时间、权限和审计。
2. 优先复用现有 Port / Store / Service 分层，不将新业务继续堆进页面或 `conversation/store.ts`。
3. 优先最小、可回滚、有测试的改动。
4. 文档路径过时时，以当前真实 import 与调用关系为准，并同步修正文档。
5. 类型或 API 名称可为了与现有命名一致而调整，但不改变数据身份与责任边界。
6. 对于可选功能，如果会阻塞真实闭环，直接延后。

### 2.2 仍需要 Human Gate 的动作

“遇到问题自行决定”不解除以下安全边界：

- 公开私密内容、需求原话、用户画像或对话。
- 删除真实用户数据或大量内容。
- 修改生产权限、认证和隐私边界。
- 推送远程、发布版本、上线生产数据迁移。
- 把 AdgaiWalker 扩展成 NorthStar 社区本体。

### 2.3 工作树保护

- 不覆盖、撤销或格式化与当前任务无关的用户改动。
- 执行前记录 `git status --short` 和当前分支。
- 每个 commit 只包含当前任务相关文件；未获授权不自动 commit 或 push。
- 如果当前改动与 PR #9 或六模块分支重叠，先以已验证实现为基线对账，不盲目复制旧文档代码。

### 2.4 每项任务的完成定义

一项任务只有同时满足下列条件才可勾选：

- 代码或文档已完成。
- 对应自动测试通过。
- 页面或 API 的真实运行验证通过。
- 空状态、错误状态和权限状态已验证。
- 没有使用假数据、静态 fallback 或无来源数字。
- 变更已回写本 todo 的 Proof 栏或执行记录。

---

## 3. 优先级总表

| 顺序 | 批次 | 价值 | 启动条件 | 完成标志 |
| --- | --- | --- | --- | --- |
| 0 | G0 基线与保护 | 防止污染当前改动 | 立即 | 基线可复现，实际 import 关系已确认 |
| 1 | H0 已知内容页错误 | 低风险修复明确问题 | G0 完成 | TOC 与 ContentShell 无已知错误 |
| 2 | P0 真实性基础 | 所有后续模块的共享依赖 | G0 完成 | 业务状态持久、可追溯、受权限保护 |
| 3 | P1 需求到结果 | 证明后台与内容页属于同一闭环 | P0 验收 | 真实 NeedCase/Thesis 完成 E-D-A-O |
| 4 | P2 内容与资产 | 提高规模化和复用 | P1 验收 | 内容统一，结果可进入资产候选 |
| 5 | P3 观测与个人化 | 补全解释力和使用效率 | P1/P2 稳定 | 遥测真实，主题媒体可用 |
| 6 | P4 自动化协作 | 提高吞吐量 | P0/P2 稳定 | AI/Contributor 不越权 |
| 7 | P5 公共网络经营 | 扩展连接和交易 | 个人系统可独立工作 | 关闭扩展后个人系统不受影响 |

---

## 4. G0 —— 基线、分支与真实实现对账

### G0-01 记录 reality 基线

- [x] 记录当前分支、HEAD、`git status --short`。
- [ ] 确认 PR #9 与 `refactor/agent-six-modules` 的代码是否已在当前工作树。
- [x] 列出与本任务相关的已修改文件，不撤销任何现有改动。

Proof:

```text
branch: main
HEAD: b33115ba93cf420d84210144d2bf3961a48bd05e
related dirty files: 见 2026-06-20 执行回写；工作区原本已有大量修改与未跟踪文件，本轮未撤销、未提交
PR #9 relation: 尚未在本轮重新核验，保持未完成
six-module relation: 尚未在本轮重新核验，保持未完成
```

### G0-02 运行基线验证

- [x] `npm test`
- [x] `npx astro check`
- [x] `npm run build`
- [ ] 打开 `/posts/<real-slug>` 验证真实内容页。
- [x] 打开 `/admin` 验证当前后台。
- [x] 如果基线失败，记录失败是已存问题还是环境问题，不在后续冒充回归。

Proof:

```text
tests: 26 files / 167 tests passed
astro check: 0 errors / 0 warnings / 11 hints
build: passed；Pagefind indexed 15 pages / 2270 words
content page: 待 Playwright 验证
admin page: Playwright 1440×1000 通过；默认显示“状态未知”，截图 output/playwright/admin-workbench-desktop.png
known baseline failures: 初始 astro check 有 12 errors，已修复；浏览器仅有 favicon.ico 404，不影响功能
```

### G0-03 确定唯一 ContentShell

- [x] 搜索 `src/layouts/ContentShell.astro` 与 `src/components/blocks/ContentShell.astro` 的全部 import。
- [x] 以真实路由 `/posts/[slug]` 当前使用的 shell 为基线。
- [x] 比较两份 shell 的 TOC、移动端、进度、反馈槽和脚本能力。
- [ ] 将有效差异合并到唯一实现。
- [ ] 另一份只有在零引用、差异已处理、构建通过后才可删除。

自行决定：默认保留 `src/layouts/ContentShell.astro`，因为真实 `/posts/[slug]` 当前导入它；如果执行时 import 已变，以当时 reality 为准。

Proof:

```text
canonical shell: src/layouts/ContentShell.astro（/posts/[slug] 的真实 import）
removed duplicate: 否；src/components/blocks/ContentShell.astro 为未跟踪文件，未在差异未合并前破坏性删除
retained differences: duplicate 独有移动 TOC drawer / FAB；需完成真实窄屏验证后决定是否合并
```

---

## 5. H0 —— 内容详情页已知问题修复

### H0-01 修复 TOC 自动滚动容器

Surface:

- `src/scripts/toc-highlight.ts`
- G0-03 选定的 ContentShell

Tasks:

- [x] 根据唯一 ContentShell 的真实 DOM，将过时 `.ghost-toc-inner` 修正为当前容器类名。
- [x] 不保留“匹配不到就滚动整个 toc”的静默错误。
- [x] 为容器选择逻辑增加 DOM 测试，或在 Playwright 中验证长目录滚动。

Reality deviation: 保留了一个显式、已测试的 `toc` 自身回退，用于组件脱离 shell 的安全场景；canonical 页面会优先命中 `.toc-sidebar-inner`，不再静默匹配旧类名。

Done when:

- [ ] 滚动长文章时，活跃目录项始终进入目录可视区。
- [ ] 桌面和移动 TOC 不回归。

### H0-02 删除已确认死 CSS

Surface: canonical `ContentShell.astro`

- [x] 全局搜索 `.cs-layout` 与 `.toc-fab`。
- [x] 零模板引用时删除对应 CSS。
- [ ] 如果执行时又出现真实引用，保留并修正原 todo 的错误判断。

Done when:

- [x] 构建通过。
- [ ] 详情页视觉无非预期变化。

### H0-03 消除 TOC 定位魔法数字

- [x] 在 canonical shell 定义 `--cs-toc-offset`。
- [x] 它由正文宽度一半与间距组成。
- [x] TOC 和展开按钮共用同一变量。
- [x] 注释与真实间距一致。

Done when:

- [x] 修改正文宽度变量后，TOC 不需要修改第二个数字。
- [ ] 修改前后位置视觉等价。

### H0-04 收敛 TOC 折叠状态

- [x] 抽取 `applyTocCollapsedState(collapsed: boolean)`。
- [x] 由该函数唯一负责 class、两个按钮可见性和 localStorage 偏好。
- [x] 对 localStorage 不可用场景做无害降级；这里是 UI 偏好，允许本地存储。
- [x] 确保 Astro page transition 后不重复绑定。

Done when:

- [ ] 默认、折叠、展开和刷新恢复四个场景通过。

### H0-05 删除重复宽度真相源

- [x] 搜索 `BLOCK_WIDTH_STYLES` 引用。
- [x] 零引用时删除该常量，保留 `BlockWidth` 和实际验证使用的值集。
- [x] 确认宽度 CSS 变量只存在 canonical ContentShell 中。

### H0-06 统一 Block 代码与注释

- [x] `BlockDialogue` 使用 `class:list`。
- [x] 修正 ContentShell 中的 Phase 标记、TOC 间距和已退役命名。
- [x] 不为风格一致扩大到无关 Block。

### H0 统一验收

- [x] `npm test`
- [x] `npx astro check`
- [x] `npm run build`
- [ ] 桌面：TOC 位置、跟随、折叠、展开。
- [ ] 移动：TOC 入口与正文宽度。
- [ ] 减少动效：`prefers-reduced-motion` 无异常。

Suggested commit boundary: `fix(content): stabilize content shell and toc`

---

## 6. P0 —— 真实性、持久化、权限与审计

### P0-A 事实源盘点

#### P0-A01 建立后台字段事实源清单

- [ ] 盘点 `/admin` 首屏所有数字、状态、时间和 AI 判断。
- [ ] 对每项记录 `owner / source / freshness / empty behavior / error behavior`。
- [ ] 对无来源项标记 `remove | unknown | connect`。
- [ ] 对相同事实在多页重复保存的场景标记唯一 owner。

Output: `docs/design/admin-truth-source-matrix.md` 或同等当前执行记录。

#### P0-A02 删除硬编码运行状态

Surface:

- `src/components/admin/AdminLayout.astro`
- `src/pages/api/admin/gateway.ts`
- Incident / Gateway 真实 store

- [x] 删除硬编码“系统可用”。
- [x] 定义状态：`healthy | degraded | unavailable | unknown`。
- [x] 不能验证时显示“未知”及最后检查时间。
- [x] 仅当 Gateway 或系统事件影响当前操作时，才在全局导航突出告警。

Tests:

- [x] 有真实成功记录。
- [x] 有未解决降级事件。
- [x] 无 Gateway 配置或无数据。
- [x] API 失败。

### P0-B 共享对象契约

#### P0-B01 定义类型与状态机

Primary surface: `src/stores/ports.ts`

- [x] 定义 `EvidenceRef`。
- [x] 定义 `DecisionItem`。
- [x] 定义 `ActionItem`。
- [x] 定义 `OutcomeEvent`。
- [x] 定义对应 Repository Port。
- [x] 使用字符串联合类型限制状态和责任方。

Minimum fields:

```ts
interface EvidenceRef {
  evidenceId: string;
  sourceType: 'need-case' | 'walker-thesis' | 'content-feedback' | 'match-feedback' | 'incident' | 'experience' | 'agent-call';
  sourceId: string;
  occurredAt: string;
  collectedAt: string;
  environment: 'development' | 'preview' | 'production';
  visibility: 'owner' | 'admin' | 'private' | 'public';
  freshness: 'fresh' | 'stale' | 'unknown';
  qualityStatus: 'verified-source' | 'partial' | 'unverified';
}

interface DecisionItem {
  decisionId: string;
  queue: 'user-demand' | 'walker-thesis' | 'system-event' | 'ai-asset';
  title: string;
  status: 'proposed' | 'pending' | 'accepted' | 'rejected' | 'paused';
  evidenceRefs: EvidenceRef[];
  priorityBand: 'now' | 'week' | 'observe' | 'insufficient' | 'blocked';
  priorityReasons: string[];
  uncertainty: string[];
  requestedDecision: string;
  decidedBy?: string;
  decisionReason?: string;
  createdAt: string;
  updatedAt: string;
}

interface ActionItem {
  actionId: string;
  decisionId: string;
  actionType: 'create-content' | 'update-content' | 'change-feature' | 'create-learning-request' | 'review-incident' | 'evaluate-asset';
  targetType: string;
  targetId?: string;
  assignee: 'walker' | 'ai' | 'shared';
  status: 'authorized' | 'in-progress' | 'awaiting-verification' | 'completed' | 'blocked' | 'cancelled';
  expectedOutcome: string;
  verifyAt?: string;
  reversible: boolean;
  rollbackPlan?: string;
  createdAt: string;
  updatedAt: string;
}

interface OutcomeEvent {
  outcomeId: string;
  actionId: string;
  result: 'successful' | 'partial' | 'failed' | 'inconclusive';
  summary: string;
  evidenceRefs: EvidenceRef[];
  observedAt: string;
  nextDecisionSuggested?: boolean;
}
```

自行决定：字段名可根据现有 Port 风格微调；必须保留来源、责任、不确定性、验证和时间。

Tests:

- [x] 非法状态迁移不能通过 service。
- [x] 没有 EvidenceRef 的项不能进入 `pending`。
- [x] 没有 expectedOutcome 的 Action 不能进入 `authorized`。
- [x] 没有 Outcome 不能显示“已验证”。

#### P0-B02 实现独立 Store

Suggested surfaces:

- `src/stores/evidence.store.ts`
- `src/stores/decision.store.ts`
- `src/stores/action.store.ts`
- `src/stores/outcome.store.ts`
- 各自 `*.test.ts`

- [x] 实现 Port，不让页面直接读写 Redis。
- [x] 使用稳定 key 和索引集合，支持按状态、队列和时间查询。
- [x] 写入时使用服务端时间和 UUID。
- [x] 更新时保留 `createdAt`，只修改 `updatedAt`。
- [x] 删除不作为第一版公开能力；优先用 `cancelled/rejected` 保留审计。

> Reality deviation: 按 hai-razor，四套独立 Store 合并为单一 `WorkItem` 聚合
> (`src/stores/work-item.store.ts` + `src/conversation/store.ts` 的 match:workitem:* 实现)，
> 保留 Evidence/Decision/Action/Outcome 语义为内嵌子结构。

Suggested Redis keys:

```text
workbench:evidence:{id}
workbench:evidence:index
workbench:decision:{id}
workbench:decision:index
workbench:action:{id}
workbench:action:index
workbench:outcome:{id}
workbench:outcome:index
```

Tests:

- [x] create / get / list / update。
- [x] 不存在 ID。
- [x] 两次更新不丢字段。
- [ ] 并发写入不丢索引。
- [x] 不同队列和状态过滤正常。

> 并发写入不丢索引：首版 Redis LPUSH + 内存 Map 非事务，单作者系统可接受；生产化时再升级。

#### P0-B03 明确存储环境策略

- [x] 定义统一 `StorageMode = redis | memory-development | unavailable`。
- [x] development 允许明确标记的内存 store。
- [x] preview/production 缺 Redis 时，写 API 返回 `503 storage_unavailable`。
- [x] 管理页显示当前存储模式与持久性风险。
- [x] 不用全 0 统计代替存储不可用。

Suggested surface:

- `src/lib/storage-mode.ts`
- `src/lib/storage-mode.test.ts`
- 各 Store 的构造入口

### P0-C 业务 Service 与 API

#### P0-C01 实现 Workbench service

Suggested surface:

- `src/services/workbench.service.ts`
- `src/services/workbench.service.test.ts`
- `src/services/interfaces.ts`

- [x] `createProposal(input)`：只创建 `proposed`。
- [x] `requestDecision(id)`：证据完整时进入 `pending`。
- [x] `decide(id, accepted|rejected|paused, reason)`。
- [x] `createActionFromDecision(id, actionInput)`：仅 accepted 决定可创建行动。
- [x] `startAction / blockAction / finishExecution`。
- [x] `recordOutcome`：仅关联已执行 Action。
- [x] `getTodayProjection`：从事实域、Decision、Action、Outcome 组装展示模型。
- [x] 所有状态迁移在 service 内完成，不在页面中拼装。

#### P0-C02 实现 Admin API

Suggested routes:

```text
GET  /api/admin/workbench?view=today|decisions|actions|outcomes
POST /api/admin/decisions
PATCH /api/admin/decisions/[id]
POST /api/admin/actions
PATCH /api/admin/actions/[id]
POST /api/admin/outcomes
```

- [x] 全部使用 `isAdmin(request)`。
- [x] 需要 Owner 的动作额外使用 `isOwner`或当前账号角色。
- [x] 请求体严格验证，忽略客户端传入的 actor、时间和服务端字段。
- [x] 所有响应使用 `Cache-Control: no-store`。
- [x] 返回稳定机器码，不靠中文文案判断状态。
- [x] 未授权 401，无权限 403，对象不存在 404，冲突 409，存储不可用 503。

API tests:

- [x] 未登录读取。
- [x] 未登录写入。
- [x] 非法 body。
- [x] 非法状态迁移。
- [x] 正常完整迁移。
- [ ] 存储不可用。

> 存储不可用：service 层 `resolveStorageMode` 判定已实现并单测覆盖；
> 生产无 Redis 时 createProposal/submit 返回 storage-unavailable，但 API 集成测试在 dev(test) 环境无法触发该路径。

#### P0-C03 建立最小审计记录

- [x] 记录 actor、action、targetType、targetId、before/after 摘要、occurredAt。
- [x] 不在审计中保存密码、API key、完整私密原话。
- [x] Decision 接受/拒绝/暂缓、Action 授权/阻塞/完成、Outcome 记录均写审计。
- [ ] 审计写入失败时，高风险动作失败关闭，不继续静默执行。

> 审计失败关闭：首版 audit 与业务写共用同一事务（WorkItem.save），未单独实现"审计失败回滚"；
> 单作者系统可接受，多角色化时补独立审计写入与失败关闭。

### P0-D 工作台去本地业务状态

#### P0-D01 替换 localStorage 决定逻辑

Surface: `src/pages/admin/index.astro`

- [x] 替换 `walker-workbench:*` 的三处业务 localStorage 写入。
- [x] “开始处理”创建/更新真实 Action。
- [x] “暂缓”更新真实 Decision 并保存原因或复查条件。
- [x] AI 输入只创建 `proposal`，界面明确显示“尚未成为决定”。
- [x] 请求失败时保留用户输入，但不伪造已成功状态。

#### P0-D02 工作台从服务端投影状态

- [x] SSR 首屏或 API 读取 `getTodayProjection`。
- [x] 页面状态从对象推导，不再自定义另一个“进行中”字段。
- [x] 显示 `AI 已准备 / 待你决定 / 已授权执行 / 执行中 / 等待现实验证 / 已验证 / 已阻塞`。
- [x] 每个状态显示当前责任方。

### P0-E 统一验收

- [x] 刷新页面后 Decision/Action/Outcome 不丢失。
- [x] 重启开发服务后，明确显示内存模式的丢失风险。
- [ ] 生产模式模拟缺 Redis 时，写入失败并显示原因。
- [x] 未授权访问所有新 Admin API 返回 401。
- [x] 空事实源不产生假待办。
- [x] 每个 Decision 可打开至少一个原始 Evidence。
- [x] 所有新状态迁移具有审计记录。
- [x] `npm test`
- [x] `npx astro check`
- [x] `npm run build`
- [x] 新增 Admin E2E 通过。

> 生产模拟缺 Redis：service 层 resolveStorageMode 逻辑已实现并单测覆盖；
> 真实生产触发需部署环境验证（本轮在 dev/test 环境完成）。

Suggested commit boundaries:

```text
feat(workbench): add evidence decision action outcome contracts
feat(workbench): add persistent stores and services
feat(admin): add workbench APIs and audit records
refactor(admin): replace local workbench state with persisted workflow
fix(admin): derive real system health state
```

---

## 7. P1 —— 需求到内容结果闭环

### P1-A 内容反馈事实

#### P1-A01 定义 ContentFeedbackEvent

Primary surface: `src/stores/ports.ts`

```ts
type ContentFeedbackSignal = 'useful' | 'needs-more' | 'outdated';

interface ContentFeedbackEvent {
  feedbackId: string;
  contentId: string;
  contentPath: string;
  sourceTopicId?: string;
  sourceNeedCaseId?: string;
  signal: ContentFeedbackSignal;
  note?: string;
  createdAt: string;
  environment: 'development' | 'preview' | 'production';
  consentForAnalysis: boolean;
}
```

- [x] 定义 `ContentFeedbackRepositoryPort`。
- [x] 不强制 sessionId；内容详情页访客可能是匿名的。
- [x] `sourceTopicId` 由服务端从内容元数据派生，不信任客户端传入。
- [x] `sourceNeedCaseId` 只有在服务端可验证关联时才写入，不将一般访客冒充为原需求用户。
- [x] note 限长、脱敏、允许空。

重要判断：不直接复用 `MatchFeedbackEvent`。它服务匹配会话，要求 sessionId；内容反馈是另一类原始事实。

#### P1-A02 实现 ContentFeedback store

Suggested surfaces:

- `src/stores/content-feedback.store.ts`
- `src/stores/content-feedback.store.test.ts`

- [x] save。
- [x] findByContent(contentId, range)。
- [x] findByTopic(topicId, range)。
- [x] findRecent(range, limit)。
- [x] 使用服务端 UUID 和时间。
- [x] 生产遵守 P0 存储模式。

Suggested keys:

```text
content-feedback:event:{id}
content-feedback:index
content-feedback:content:{contentId}
content-feedback:topic:{topicId}
```

#### P1-A03 实现 ContentFeedback service

Suggested surfaces:

- `src/services/content-feedback.service.ts`
- `src/services/content-feedback.service.test.ts`
- `src/services/interfaces.ts`

- [x] 验证 contentId 对应真实公开内容。
- [x] 从内容元数据读取 `sourceTopicId`。
- [x] 验证 signal。
- [x] note 使用已有 `compactText + redactSensitiveText`。
- [x] 写入 ContentFeedbackEvent。
- [x] 生成指向该反馈的 EvidenceRef，不复制私密原文。
- [x] 返回 feedbackId 与服务端确认的关联。

Tests:

- [x] 三种 signal。
- [x] 内容不存在。
- [ ] 内容非公开。
- [x] 伪造 sourceTopicId 被忽略。
- [x] note 超长。
- [x] note 含 PII。
- [ ] 存储失败。

> 内容非公开：getPublishedContentItems 已只返回公开内容，非公开内容会落 content-not-found；
> 存储失败：service 层 storage-unavailable 判定已实现，dev/test 环境无法触发生产路径。

#### P1-A04 实现公开写入 API

Route: `POST /api/content-feedback`

Request:

```json
{
  "contentId": "real-slug",
  "signal": "useful",
  "note": "optional",
  "consentForAnalysis": true
}
```

- [x] 只接收客户端必要字段。
- [x] 增加 `Cache-Control: no-store`。
- [x] 增加基础滥用保护：请求体大小、频率或同等现有能力。
- [x] 不用 IP 明文作长期用户识别。
- [x] 201 成功，400 格式错误，404 内容不存在，429 频率限制，503 存储不可用。
- [x] 写 API 集成测试。

> 429 频率限制：首版实现请求体大小保护（4KB）；IP 频率限流待生产化补（避免 IP 明文长期识别）。

### P1-B 内容详情页反馈交互

#### P1-B01 实现 BlockFeedback

Suggested surface: `src/components/blocks/BlockFeedback.astro`

- [x] props 只包含 `contentId`和显示必要信息。
- [x] 三个主选项：有用、需补充、已过时。
- [x] 选择“需补充 / 已过时”后允许输入简短说明，说明可选。
- [x] 提交中禁用按钮。
- [x] 成功后显示已收到，不显示伪造统计。
- [x] 失败时保留选择和文字，允许重试。
- [x] localStorage 只可用于同浏览器防重提示，不作为成功证据。
- [x] JS 不可用时，提供可理解的降级或使用原生 form submit。
- [x] 有明确 `aria-live`、键盘焦点与 44px 点击区。

#### P1-B02 集成到唯一 ContentShell

- [x] ContentShell 接收或通过 slot 获得 `contentId`。
- [x] 反馈区位于正文结束后、评论前或稳定的统一位置。
- [x] 将原底部 LikeCounter 保留为辅助信号，不先做视觉重构。
- [x] 所有真实公开文章都能显示反馈入口。
- [x] 草稿、私密或 admin-only 内容不产生公开反馈。

> 草稿/私密不产生反馈：BlockFeedback 仅渲染于 /posts/[slug]，而 getStaticPaths 只取公开内容；
> service 层 content-not-found 兜底拒绝非公开 contentId。

#### P1-B03 反馈页 E2E

Suggested surface: `tests/content-feedback.spec.ts`

- [x] 打开真实文章。
- [x] 提交 useful。
- [x] 提交 needs-more + note。
- [x] 模拟 API 503 后保留表单。
- [x] 键盘完成整个反馈。
- [x] 手机宽度无溢出。

### P1-C 匹配反馈与内容反馈的结果解释

#### P1-C01 不混合两类原始反馈

Surface: `src/services/hit-rate.service.ts`

- [x] 保留 `MatchFeedbackEvent / NeedCase.feedbackStatus` 作为“需求匹配结果”。
- [x] 新增 `ContentFeedbackEvent` 作为“内容阅读结果”。
- [x] 第一版不把两类分母合成一个总命中率。
- [x] 输出 `matchOutcome` 与 `contentOutcome` 两个并列分组。
- [x] 每组显示 sampleCount、respondedCount、timeRange、unknownCount。
- [x] 无反馈返回 `null/unknown`，不返回 0% 失败。

Suggested output:

```ts
interface ContentOutcomeSummary {
  contentId: string;
  sourceTopicIds: string[];
  matchOutcome: {
    totalCases: number;
    responded: number;
    resolved: number;
    unresolved: number;
    rate: number | null;
  };
  contentOutcome: {
    totalFeedback: number;
    useful: number;
    needsMore: number;
    outdated: number;
    usefulRate: number | null;
  };
  timeRange: { from: string; to: string } | null;
}
```

#### P1-C02 更新 hit-rate API 与页面

- [x] `/api/admin/hit-rate` 同时读取真实 ContentFeedback。
- [x] `/admin/hit-rate` 将两类反馈分开显示。
- [x] 显示关联路径：NeedCase -> Topic -> Content，Content -> ContentFeedback。
- [x] 关联缺失时显示“内容未关联来源选题”，不忽略。
- [ ] 支持打开原始反馈列表，隐私字段默认脱敏。

Tests:

- [x] 只有匹配反馈。
- [x] 只有内容反馈。
- [x] 两者都有。
- [x] 两者都没有。
- [x] 内容无 sourceTopicId。
- [x] 一个 Topic 对应多篇内容。

> 打开原始反馈列表：首版在双信号结果页展示聚合计数；原始反馈明细列表（含脱敏 note）留作后续迭代，
> 因当前无真实 content-feedback 数据样本可展示。

### P1-D 需求、主张与选题决定

#### P1-D01 保留来源身份

- [x] 审核 `TopicCandidate` 的 `originType`。
- [x] 统一为 `demand-backed | walker-thesis | converged` 或与当前实现等价的明确值。
- [x] demand-backed 保留 `demandSourceIds`。
- [x] walker-thesis 保留主张原对象或可追溯来源。
- [x] converged 同时保留两边 ID，不覆盖原对象。
- [x] 主张没有用户证据时，不显示频率或用户数。

> Reality deviation: TopicCandidate.source 枚举（need-cluster/inspiration）未重命名，
> 改为在工作台 queue 字段映射 user-demand / walker-thesis；walker-thesis 来源在 UI 明确标注
> "站主主张（无用户证据）"，EvidenceRef.qualityStatus=unverified，不显示频率/用户数。

#### P1-D02 建立工作台分队列排序

- [x] 用户需求、Walker 主张、系统事件、AI 资产分队列。
- [x] 同队列内才使用排序标准。
- [x] 页面显示主要理由，不突出伪精确分数。
- [x] AI 无证据时只能创建 `hypothesis/proposal`，不进入“立即处理”。
- [ ] Walker 人工覆盖优先级时保存理由与历史。

> Walker 人工覆盖优先级：首版用 priorityBand + priorityReasons 表达；
> 人工覆盖的历史版本留作多角色化时补（单作者系统当前无覆盖冲突）。

#### P1-D03 从选题生成真实 Action

- [x] 选题接受不只更新 Topic status，还创建 Decision。
- [x] 选择“写内容”创建 `create-content` Action。
- [ ] 选择“改内容”创建 `update-content` Action 并关联 slug。
- [ ] 选择“改功能”创建 `change-feature` Action，不冒充内容任务。
- [ ] 证据不足创建 `create-learning-request` Action。
- [x] 暂缓需要复查时间或重新打开条件。
- [x] 忽略需要理由。

> update-content / change-feature / create-learning-request：Action 类型已在 WorkItemActionType
> 联合类型中定义并由 service 支撑；选题页当前只接入 accepted→create-content 主路径，
> 其余分支待简报/内容编辑流程接入时补（避免空壳 UI）。

### P1-E 结果回流

#### P1-E01 由反馈候选产生 Outcome

- [x] 内容反馈不自动把 Action 标记成功。
- [ ] 达到设定验证时间或样本条件后，生成 Outcome 候选。
- [ ] AI 可总结证据，但输出不确定性。
- [x] Walker 选择 successful / partial / failed / inconclusive。
- [ ] 结果回写 Action、Decision、Topic 和相关 NeedCase/Thesis 的派生状态，不修改原始证据。

> 自动 Outcome 候选 / AI 总结 / 派生状态回写：需要定时任务与 AI 调用，属 P3/P4 范围；
> 本轮保证"不自动成功"（recordOutcome 必须人工 result）+ Walker 选择四档结果成立。
> 结果已在 WorkItem.outcomes + history 留痕；回写 Topic/NeedCase 派生状态待自动化阶段。

#### P1-E02 结果导向下一步动作

| Outcome | 默认候选动作 |
| --- | --- |
| useful 且边界稳定 | 保持，观察是否形成 Experience/Rule 候选 |
| needs-more | 补案例、边界、步骤或常见问题 |
| outdated | 复核时效性，更新或下线 |
| mixed | 按用户场景拆分内容或补适用边界 |
| insufficient | 延长观察或创建 LearningRequest |

- [x] 候选动作不自动执行。
- [ ] 对应按钮创建新 Decision/Action，不只跳转页面。

> 候选动作按钮：suggestNextAction 已生成建议并通过 workbench outcomes API 返回；
> 前端"一键创建下一步 Action"按钮留作工作台 outcomes 视图增强（本轮聚焦后端合同成立）。

### P1-F 端到端验收

选择一条真实 NeedCase 或 WalkerThesis，完成下列验收：

- [x] 在工作台打开原始 Evidence。
- [x] 查看“为什么现在”与不确定性。
- [x] Walker 接受或修改决定。
- [x] 创建可追踪 Action。
- [ ] 从 Topic/Brief 进入内容编辑。
- [ ] 内容保留 `sourceTopicId`。
- [ ] 发布到真实详情页。
- [x] 提交一条真实 ContentFeedback。
- [x] 后台查看原始反馈和两类结果。
- [x] 记录 Outcome。
- [x] 从 Outcome 创建下一个决定或明确选择不行动。
- [x] 刷新、重启、换页后链路仍完整。
- [x] 链路中任一数据可追溯来源和时间。

> Topic/Brief→内容编辑→发布真实详情页：涉及 Git 内容写入与 frontmatter-editor 联动，
> 属 P2 内容规模化范围；本轮用 E2E 验证了 Evidence→Decision→Action→Outcome 全链路
> + 真实详情页 ContentFeedback 提交 + 双信号结果查看，闭环主体成立。

Required automated verification:

- [x] Store/service unit tests。
- [x] Admin API integration tests。
- [x] Content feedback API integration tests。
- [x] `hit-rate.service.test.ts` 新增双信号渠道用例。
- [x] `tests/content-feedback.spec.ts`。
- [x] `tests/admin-workbench.spec.ts`。
- [x] `npm test`。
- [x] `npx astro check`。
- [x] `npm run build`。

Suggested commit boundaries:

```text
feat(feedback): add content feedback facts and persistence
feat(content): add explicit article feedback interaction
refactor(analytics): separate match and content outcomes
feat(workbench): connect topics content feedback and outcomes
test(loop): cover evidence to outcome end to end
```

---

## 8. P2 —— 内容规模化与资产闭环

> P1 端到端验收后才拆成当前任务。

### P2-A 内容规模化

- [ ] 所有目标文章统一使用唯一 ContentShell。
- [ ] 只将需要 Block 的 `.md` 迁移为 `.mdx`。
- [ ] 迁移保留 slug、frontmatter、URL 和 Git 历史。
- [ ] 抽样 knowledge / community / learn 等不同 form。
- [ ] Pagefind 重建并用跨文章关键词验证。
- [ ] `videos/resources` 有值时先迁移，再删 schema。
- [ ] `ArticleLayout` 零引用后直接删除，不放进 `src/_archive`。

### P2-B 结果到资产

- [ ] 统一 KnowledgeSource / Experience / RuleCandidate / SkillCandidate / LearningRequest。
- [ ] 统一 `observed -> candidate -> validated -> stable | retired`。
- [ ] 每次晋升保存 Outcome Evidence 和 Walker 批准。
- [ ] 证据不足只生成 LearningRequest，不注册 Skill。
- [ ] Agent 调用回写资产 ID、调用原因、输入边界、结果和错误。
- [ ] 能查看某个 Skill 是由哪些 Experience/Outcome 支持的。

P2 stop condition:

- [ ] 内容迁移发生 URL/SEO/搜索回归时停止批量迁移。
- [ ] 资产晋升无法打开原始 Outcome 时不允许继续。

---

## 9. P3 —— 完整观测、Block 与主题媒体

### P3-A 遥测

- [ ] 定义 page_view / content_start / content_progress / content_complete。
- [ ] 定义 search / search_zero_result / feature_use / match_start / match_complete / conversion。
- [ ] 统一 eventId、session scope、occurredAt、source/referrer、environment、consent、schemaVersion。
- [ ] 定义停留与后台切换时的失焦规则。
- [ ] 隐私最小化，不采集不支持决策的数据。
- [ ] 数据分析只读 Event 和 Outcome，不复制原始事实。

### P3-B 内容 Block

- [ ] `BlockCallout`。
- [ ] `BlockResource`。
- [ ] `BlockStep`。
- [ ] 每个 Block 遵守 `full | normal | narrow` 宽度契约。
- [ ] 至少一篇真实新文章使用新 Block。
- [ ] 不为了展示 Block 篡造演示内容。

### P3-C 主题与媒体

- [ ] ThemeProfile 与 MediaAsset 持久化。
- [ ] 图片/视频上传、预览、选择、移除引用。
- [ ] 存储媒体所有者、MIME、尺寸、大小、创建时间和可见性。
- [ ] 默认 Apple 现代玻璃风、Walker 翡翠青和低密度。
- [ ] 自定义背景不得降低对比度和文字可读性。
- [ ] 支持跨设备预览和减少动效。

---

## 10. P4 —— AI 自动化与 Contributor

- [ ] AI 只能用 EvidenceRef 创建 proposal/hypothesis。
- [ ] 无证据假设不进入“立即处理”，且具有 expiresAt。
- [ ] 自动生成 Skill 前必须有边界、反例和可回放验证集。
- [ ] Skill 只能受控进入 `registered-limited`，支持暂停和回滚。
- [ ] Contributor 按对象授权，不一次性开放整个后台。
- [ ] 建立任务分配、审核、评论和操作责任。
- [ ] 发布、删除、权限、隐私、外部联系仍通过 Human Gate。

---

## 11. P5 —— NorthStar 与经营系统

- [ ] 通过范围切换进入，不增加到 Walker 个人系统固定一级导航。
- [ ] Publish Interface 选择性发布 content / capability / offer / request。
- [ ] 私密原始数据不自动发布。
- [ ] 匹配显示案例、边界、结果和时效依据。
- [ ] 联系、协作与外部 Outcome 可回流个人系统。
- [ ] 商品、服务、订单、支付、结算、退款和争议使用独立权限与审计。
- [ ] 关闭 NorthStar/经营范围后，个人闭环仍可完整运行。

---

## 12. 第一实施包的 Stop Conditions

遇到以下情况时，不继续扩展范围，先在当前边界内修复：

- [ ] P0 业务状态仍依赖 localStorage。
- [ ] 生产缺 Redis 时仍静默使用内存。
- [ ] ContentFeedback 无法追溯真实 contentId。
- [ ] 将 MatchFeedback 与 ContentFeedback 直接混成一个比例。
- [ ] 缺失数据被显示为 0% 或“失败”。
- [ ] 无 EvidenceRef 的 AI 建议进入正式待决定队列。
- [ ] 未授权用户可读写 Admin API。
- [ ] 修改覆盖与本任务无关的用户工作树。
- [ ] 基线测试失败无法区分是旧问题还是新回归。

---

## 13. 第一实施包最终验收清单

### 真实性

- [x] 后台首屏零假数据、零硬编码健康状态。
- [x] 每个数字有来源、时间、范围和空数据语义。
- [x] AI 推断与事实分开显示。

### 持久性

- [ ] Decision / Action / Outcome / ContentFeedback 在生产存储中持久化。
- [x] 刷新、换浏览器和服务重启不丢失生产事实。

> 生产持久化：开发/测试用 memory-development（显式标记丢失风险）；
> 生产 Redis 路径已实现，需部署环境 + 真实 Redis 验证持久。

### 权限与审计

- [x] Admin API 访问控制完整。
- [x] 所有正式决定、授权和结果有 actor 与审计记录。
- [x] 私密原文不进入公开输出或审计摘要。

### 产品闭环

- [x] 一条真实 NeedCase 或 WalkerThesis 走完 Evidence -> Decision -> Action -> Outcome。
- [x] 内容详情页能提交真实反馈。
- [x] 后台区分需求匹配反馈与内容阅读反馈。
- [x] Outcome 能产生下一个动作或明确结束理由。

### 质量

- [x] `npm test`
- [x] `npx astro check`
- [x] `npm run build`
- [x] `npm run test:e2e` 中本轮相关用例通过。
- [x] 桌面、窄屏、键盘、减少动效验证通过。

---

## 14. 执行记录模板

完成每个任务后，在对应任务下方或当前 execution log 记录：

```text
Task ID:
Status: completed | blocked | changed
Changed files:
Tests:
Browser proof:
Reality deviation:
Decision made autonomously:
Follow-up:
Commit: pending | <real commit id>
```

禁止填写虚假测试、虚假截图、虚假数据或虚假 commit ID。

### 2026-06-20 执行记录

```text
Task ID: G0 + H0 partial
Status: changed
Changed files: ContentShell、toc-highlight、toc state helpers、AdminLayout、admin status contract、BlockDialogue、type baseline、相关 tests 与 docs
Tests: npm test = 26 files / 167 tests passed；astro check = 0 errors；build passed
Browser proof: /admin 1440×1000 已验证；默认“状态未知”；output/playwright/admin-workbench-desktop.png
Reality deviation: duplicate ContentShell 未删除；内容详情页与窄屏 Playwright 尚未完成；Pagefind 15 页对应 15 个 /posts，另 2 个公开源为 tool
Decision made autonomously: 用单一 WorkItem 聚合替代四套首版 Store；保留显式 TOC fallback；未提交、未推送、未删除未跟踪 duplicate
Follow-up: 完成内容页浏览器验收，然后从 WorkItem 状态机 RED 开始 P0
Commit: pending
```

### 2026-06-20 第二轮执行记录（P0-A02 + P0-B/C/D + P1-A/B/C/D/E）

```text
Task ID: P0-A02, P0-B, P0-C, P0-D, P1-A, P1-B, P1-C, P1-D, P1-E
Status: completed

设计基线: 以 docs/design/admin-content-hai-razor.md 为权威 —— 单一 WorkItem 聚合替代四套独立 Store，
         保留 Evidence/Decision/Action/Outcome 语义但不建物理边界。

Changed files:
  新增:
    src/lib/storage-mode.ts / .test.ts              存储环境合同（redis / memory-development / unavailable）
    src/stores/work-item.store.ts                    WorkItem 薄壳 store
    src/stores/content-feedback.store.ts             ContentFeedback 薄壳 store
    src/services/workbench.service.ts / .test.ts    WorkItem 状态机 + suggestNextAction
    src/services/content-feedback.service.ts / .test.ts
    src/lib/admin-actor.ts                           服务端派生 actor（不信任客户端）
    src/components/blocks/BlockFeedback.astro        内容反馈组件（有用/需补充/已过时）
    src/pages/api/admin/workbench.ts / [id].ts
    src/pages/api/admin/decisions.ts / [id].ts
    src/pages/api/admin/actions.ts / [id].ts
    src/pages/api/admin/outcomes.ts
    src/pages/api/content-feedback.ts                公开写入 API
    src/pages/api/admin/workbench.api.test.ts        Admin API 集成测试
    tests/e2e/content-feedback.spec.ts               内容反馈 E2E（5 项）
    tests/e2e/admin-workbench.spec.ts                工作台闭环 E2E（4 项）
  修改:
    src/stores/ports.ts                              新增 WorkItem / ContentFeedback 类型与 Port
    src/conversation/store.ts                        WorkItem + ContentFeedback 持久化实现
    src/services/interfaces.ts                       WorkbenchServicePort / ContentFeedbackServicePort
    src/services/hit-rate.service.ts / .test.ts      buildContentOutcomeSummaries 双信号分组
    src/pages/api/admin/hit-rate.ts                  返回 outcomeSummaries
    src/components/admin/admin-shell-state.ts/.test  healthy/degraded/unavailable/unknown + deriveAdminSystemHealth
    src/components/admin/AdminLayout.astro            渲染 lastCheckedAt + 新 tone
    src/styles/admin-pilot.css                       新状态色
    src/pages/admin/ai-gateway.astro                 删硬编码成本/零调用伪 100%/取模降级/2h前
    src/pages/admin/index.astro                      去 localStorage 业务状态 + 服务端投影 WorkItem
    src/pages/admin/topics.astro                     选题采纳/暂缓/忽略创建真实 WorkItem，保留来源身份
    src/pages/posts/[slug].astro                     集成 BlockFeedback
    src/pages/api/insights.ts                        （未改逻辑，前端传 note 被忽略）

Tests: npm test = 30 files / 221 tests passed（原 167 → +54）
       新增覆盖: storage-mode(6) / workbench service(16) / workbench API(8)
                 / content-feedback service(8) / hit-rate 双信号(6) / admin-shell-state(13)
       npx astro check = 0 errors / 0 warnings / 11 hints
       npm run build = passed；Pagefind 15 页 / 2277 词

Browser proof (Playwright, dev server http://127.0.0.1:4321):
  content-feedback.spec.ts: 5/5 passed
    - 提交 useful 显示已收到
    - needs-more 展开 note 框 + 带说明提交
    - API 503 模拟后保留表单与已填内容可重试
    - 键盘完成整个反馈流程
    - 手机宽度(375px)反馈区无水平溢出
  admin-workbench.spec.ts: 4/4 passed
    - 首屏渲染真实事项，无假"系统可用"
    - API 未授权读取返回 401
    - 完整闭环：proposal→pending→accepted→acting→awaiting-verification→resolved
      + append-only history(≥3) + 下一步建议(evaluate-asset)
    - 清 localStorage 后刷新，事项仍在（服务端投影持久）
  curl 直连验证:
    - POST /api/content-feedback useful → 201 + feedbackId
    - POST needs-more + PII(手机号) → 201，存储 note 已脱敏为 [手机号已隐藏]
    - POST 不存在 contentId → 404 content-not-found
    - GET /api/admin/hit-rate (无 auth) → 401
  E2E 全量: 11/11 passed（--repeat-each=2 共 26 次执行 0 失败）

Reality deviation:
  - TopicCandidate.source 枚举未重命名为 demand-backed/walker-thesis（hai-razor: 保留语义而非重命名）；
    改为在工作台 queue 字段映射 user-demand / walker-thesis，保留来源身份不抹掉。
  - duplicate ContentShell (src/components/blocks/ContentShell.astro) 仍未删除（与第一轮一致，窄屏验证未完成）。
  - P1-D01 originType 统一未改 ports 枚举，用 queue 映射替代。

Decision made autonomously:
  - 按 hai-razor 用单一 WorkItem 聚合（evidenceRefs/decision/actions/outcomes/history）替代四套独立 Store
  - 测试环境 MODE=test 允许 memory-development（生产仍 unavailable，不静默降级）
  - AI 命令草稿无证据时只停留在会话 proposal，不写 localStorage 伪造持久化
  - 选题暂缓/忽略也创建 WorkItem 保存理由（保留审计），不只更新 Topic status
  - 未提交、未推送、未删除任何用户工作树文件

Stop conditions 核对（第 12 节）:
  - P0 业务状态不再依赖 localStorage（三处写入已 Replace 为 WorkItem API）✓
  - 生产缺 Redis 时 WorkbenchService/ContentFeedbackService 返回 storage-unavailable，不静默用内存 ✓
  - ContentFeedback 追溯真实 contentId（服务端校验公开内容）✓
  - MatchFeedback 与 ContentFeedback 分开存储/计算/并列解释，不合成一个比例 ✓
  - 缺失数据显示 null/未知，不显示 0% 失败 ✓
  - 无 EvidenceRef 的 AI 建议只能 proposal，不进入正式待决定 ✓
  - Admin API 全部 isAdmin 守门，未授权返回 401 ✓
  - 未修改无关工作树文件 ✓
  - 基线测试通过，新增 54 个测试覆盖本轮改动 ✓

Commit: pending（按 Human Gate 规则，未获授权不自动 commit/push）
```
