# WorkbenchService domain 剥离实施计划

> **日期**:2026-06-22
> **分支**:`worktree-workbench-domain`(worktree:`.claude/worktrees/workbench-domain`)
> **目标**:把 `WorkbenchService` 的状态机 + 信任边界 + history 构造抽成纯 domain 模块(`src/domain/workitem/`),service 变成「findById → 调 domain apply → save」的薄编排层;顺带修复 4 个已确诊 bug;全程 TDD。
> **方法**:subagent-driven-development(implementer + reviewer per task)。

## 背景

`src/services/workbench.service.ts`(551 行)把「Astro 请求解析 + Redis 调用 + 业务状态机规则」三件事耦合在一起,导致:
1. 状态机不变量无法被纯单测覆盖(必须 mock repository/Redis);
2. 4 个 bug 无法靠测试捕获(测试对 history 值正确性零覆盖);
3. 未来迁移到 Go(架构演进方案)无纯逻辑蓝本。

剥离后:`domain/workitem/` 是纯 TS、零 IO、可纯单测的状态机核心;`WorkbenchService` 是 ~30 行/方法的薄编排层。这同时是 `docs/design/后端架构与技术栈演进方案.md` 阶段 1 的「domain 剥离」奠基动作。

## Global Constraints(红线,所有任务必须遵守)

- **GC1**:`WorkbenchServicePort` 接口签名(`src/services/interfaces.ts:259-362`)不变——方法名、参数、`WorkbenchResult<T>` 返回结构(`{ ok, code, message?, data? }`)逐字保持。
- **GC2**:`WorkbenchResultCode` 枚举(`interfaces.ts:266-273`)7 个值不变。**唯一允许的枚举扩展**:`WorkItemHistoryEntry.kind` 联合类型(`ports.ts:853-860`)新增 `'priority-override'`(Task 4 修 BUG #2 要求)。
- **GC3**:`createWorkbenchService()` 工厂签名不变。
- **GC4**:`new WorkbenchService({ repository?, storageMode? })` options bag 形状不变(`production-storage-gates.test.ts` 直构依赖它)。
- **GC5**:`domain/workitem/` 层**零 IO 依赖**——不 import `@/conversation/store`、不直接调 `getRedis` / `Date.now` / `crypto.randomUUID`;时钟与 ID 通过 `WorkItemDeps` 注入。
- **GC6**:现有测试(`workbench.service.test.ts`、`workbench.api.test.ts`、`workbench-storage-unavailable.api.test.ts`、`production-storage-gates.test.ts`)**不因重构而改动一行**;新增测试放 `domain/workitem/*.test.ts` 或在现有文件**追加**(不修改已有断言)。
- **GC7**:改任何 `.ts` 后必须跑 `npx astro check`(build/build:mcp 走 esbuild 只转译不查类型,抓不到类型错)。
- **GC8**:每个任务 implementer 自验 `npx astro check` + 针对性 `npx vitest run <相关测试>`;Task 6 完成后跑验证四件套全套(`astro check` → `npm run test` → `npm run build` → `npm run test:e2e`)。

## bug 修复映射

| Bug | 现象 | 根因 | 修复任务 |
|---|---|---|---|
| **BUG #1** | `updateAction` 审计 `fromStatus` 恒为 `'acting'` | `workbench.service.ts:351` 先改写 status,L353 回溯式三元恒取 acting | Task 4(`applyUpdateAction` 闭包顶部捕获 `from`) |
| **BUG #2** | `overridePriority` 自反审计 + `kind:'status-change'` 错位 | `workbench.service.ts:444-451` fromStatus===toStatus 且 kind 错 | Task 4(`applyOverridePriority` + 扩 kind 枚举) |
| **BUG #3** | `list` 不过滤过期 proposal | `workbench.service.ts:463-465` 缺过滤(对照 `getTodayProjection:460` 有) | Task 5(`filterExpiredProposals` + `list` 复用) |
| **BUG #4** | `canTransition` 白名单只 2/6 迁移点使用,非法迁移可达 | `createAction:280,306` / `updateAction:350` / `recordOutcome:401` 绕过白名单 | Task 3+4(所有 `apply*` 统一调 `canTransition`) |

---

## Task 1:安全网测试(剥离前补当前正确行为覆盖)

**目标**:在 domain 剥离前,先用测试固化当前 WorkbenchService 的正确行为,确保剥离时不引入回归。**只覆盖当前正确行为,不固化 bug**(bug 回归测试放 Task 3/4 的 domain 单测)。

**文件**:追加到 `src/services/workbench.service.test.ts`(不改动已有用例)。

**新增用例**:
1. `requestDecision` happy path:proposal(证据完整)→ requestDecision → pending,断言 history 有 `proposal→pending` 一条 + reason。
2. `decide` 从 `paused` 出发:paused → decide(accepted)→ accepted(验证 ALLOWED_TRANSITIONS 允许 paused→accepted?**先查表**:paused 只能去 pending/proposal/rejected——所以 paused→accepted 应返回 `invalid-transition`;断言此拒绝)。
3. `decide` 从 `proposal` 出发:proposal → decide(accepted)→ accepted(允许)。
4. `updateAction` 非 completed 路径:action 状态 authorized→in-progress / blocked / cancelled,断言 WorkItem 状态不变 + history 记 `action-updated`。
5. `updateAction` actionId 不存在 → `not-found`。

**验证**:`npx vitest run src/services/workbench.service.test.ts` 全绿(含新增);`npx astro check`。

**注意**:若某个新增用例暴露当前 bug(如某迁移本应拒绝却被接受),**不要**在此任务修,标注 `// TODO Task N: 当前行为疑似 bug,见 domain 单测` 并让测试断言当前实际行为(绿),bug 的期望行为测试留到 domain 层。implementer 遇到此类情况在 report 里标 DONE_WITH_CONCERNS。

---

## Task 2:domain/workitem/ 骨架 + 纯函数搬迁

**目标**:建立 `src/domain/workitem/` 模块,搬迁已是纯函数的逻辑,建立 deps 注入接口。此任务**零行为变化**(纯搬迁 + 新单测),`WorkbenchService` 暂时仍用旧内部实现(或在 service 内 re-export domain 的纯函数,二选一以最小 diff 为准)。

**新建文件**:
- `src/domain/workitem/types.ts`:`WorkItemClock`(now()→string)、`WorkItemIdGenerator`(workItemId/historyId/actionId/outcomeId)、`WorkItemDeps`(`{ clock, idGen }`)、`WorkItemDomainResult`(`{ ok:true, workItem } | { ok:false, code, message }`)。import WorkItem 等类型从 `@/stores/ports`(只读类型,无运行时依赖)。
- `src/domain/workitem/state-machine.ts`:`ALLOWED_TRANSITIONS`、`canTransition(from, to)`(从 `workbench.service.ts:89-102` 搬)。
- `src/domain/workitem/rules.ts`:`hasSufficientEvidence(refs)`(从 L76-78 搬)、`isProposalExpired(item, now)`(从 L58-60 搬,**去掉 now 默认参数**,显式入参)、`filterExpiredProposals(items, now)`(从 L460 提取)。
- `src/domain/workitem/suggest-next-action.ts`:`suggestNextAction`(从 L514-550 搬,已纯)。
- `src/domain/workitem/index.ts`:re-export 上述。

**新建测试**(每个纯函数配单测,`src/domain/workitem/*.test.ts`):
- `state-machine.test.ts`:覆盖 ALLOWED_TRANSITIONS 每条合法迁移 + 每个终态(resolved/rejected)拒绝所有后继 + 关键非法对(proposal→acting、accepted→pending 等)。
- `rules.test.ts`:hasSufficientEvidence(空/unverified/有 summary 三态)、isProposalExpired(非 proposal 不过期 / proposal 未过期 / proposal 过期)、filterExpiredProposals。
- `suggest-next-action.test.ts`:从现有 `workbench.service.test.ts` 的 suggestNextAction 用例镜像(不删旧的)。

**WorkbenchService 改动**(最小):把内部 `ALLOWED_TRANSITIONS`/`canTransition`/`hasSufficientEvidence`/`isProposalExpired`/`suggestNextAction` 改为从 `@/domain/workitem` import(re-export),实现删除。`nowIso`/`makeId`/`expiryFromDays` 暂留 service(IO 边界)。

**验证**:`npx vitest run src/domain/workitem/` 全绿;`npx vitest run src/services/workbench.service.test.ts src/pages/api/admin/workbench.api.test.ts` 全绿(行为未变);`npx astro check`。

---

## Task 3:domain apply 函数(createProposal / requestDecision / decide / createAction)

**目标**:把这 4 个迁移的「状态迁移 + 信任边界 + history 构造」抽成纯 `apply*` 函数,统一在内部调 `canTransition`(修 BUG #4 的这 4 个迁移点)。domain 是**新增并行模块**,此任务 service 还未改委托(Task 6 才改)。

**新建文件**:`src/domain/workitem/apply.ts`(或拆 `apply-proposal.ts` / `apply-decision.ts` / `apply-action.ts`,以可读为准)。

**函数签名**(遵循 Agent A 设计):
```ts
applyCreateProposal(input: CreateProposalInput, deps: WorkItemDeps): WorkItemDomainResult;
applyRequestDecision(current: WorkItem, actor: string, deps: WorkItemDeps): WorkItemDomainResult;
applyDecide(current: WorkItem, input: DecideInput, deps: WorkItemDeps): WorkItemDomainResult;
applyCreateAction(current: WorkItem, input: CreateActionInput, deps: WorkItemDeps): WorkItemDomainResult;
```

**规格**(逐函数,从 `workbench.service.ts` 精读材料 §1 提取,逐行对齐):
- 每个函数内部:校验(信任边界)→ `canTransition` 校验(迁移类)→ `mutate`(深拷贝,但 domain 用不可变风格:`{...item, ...}`)→ 应用字段 → 构造 history entry(用 `deps.clock.now()` / `deps.idGen.historyId()`)→ 返回 `{ok:true, workItem}` 或 `{ok:false, code, message}`。
- **`applyCreateProposal`**:信任边界(title 空→invalid-input;evidenceRefs 空→missing-evidence;AI+now+无证据→invalid-input);initialStatus = requestDecision&&hasSufficientEvidence?pending:proposal;expiresAt = ai-asset?deps.clock.now()+14d:undefined;history created [+ status-change 若进 pending]。
- **`applyRequestDecision`**:hasSufficientEvidence 否→missing-evidence;canTransition(current.status,'pending')否→invalid-transition;history status-change。
- **`applyDecide`**:reason 空→invalid-input;canTransition(current.status, target)否→invalid-transition;target=accepted 时 hasSufficientEvidence 否→missing-evidence;history decision-updated + decision 字段全量更新。
- **`applyCreateAction`**:current.status∉{accepted,acting}→invalid-transition(经 canTransition 语义,accepted→acting 走白名单);expectedOutcome 空→missing-expected-outcome;accepted→acting 迁移(白名单);history status-change(若迁移)+ action-added(恒)。

**清理(允许,GC6 不破测试)**:`applyCreateProposal` 不复制 `workbench.service.ts:151-153` 的 decision 字段死代码(三元两分支相同)——直接用合理值(`{ requestedDecision: input.summary, outcome: 'pending' }`),在单测里断言。

**单测**(`src/domain/workitem/apply.test.ts`):注入确定性 deps(`clock: ()=>'2026-01-01T00:00:00.000Z'`,`idGen` 返回固定前缀串),覆盖:
- 每个函数的 happy path(断言完整 WorkItem 结构,含 history 的 fromStatus/toStatus/kind 值正确)。
- 每个信任边界失败 code。
- 每个迁移的 canTransition 拒绝路径(非法 from→to)。
- history 值正确性(fromStatus = 真实源状态,toStatus = 真实目标,kind 正确)——这是 Agent B 指出的盲点,必须覆盖。

**验证**:`npx vitest run src/domain/workitem/apply.test.ts` 全绿;`npx astro check`。

---

## Task 4:domain apply(updateAction / recordOutcome / overridePriority)+ 修 BUG #1/#2/#4

**目标**:剩余 3 个迁移的 apply 函数,**在 domain 层用期望(正确)行为实现**,直接修 3 个 bug。

**函数**:
```ts
applyUpdateAction(current, actionId, input, deps): WorkItemDomainResult;   // 修 BUG #1 + #4
applyRecordOutcome(current, input, deps): WorkItemDomainResult;            // 修 BUG #4
applyOverridePriority(current, input, deps): WorkItemDomainResult;         // 修 BUG #2
```

**BUG #1 修复(`applyUpdateAction`)**:在函数顶部 `const from = current.status;`(深拷贝前捕获),completed 分支的 history 用 `fromStatus: from`(不是回溯式三元)。action 层 `fromActionStatus = target.status`(改写前)。

**BUG #4 修复(`applyUpdateAction` / `applyRecordOutcome`)**:
- `applyUpdateAction`:completed→awaiting-verification 走 `canTransition(current.status, 'awaiting-verification')`,非法(如 paused→awaiting-verification)→ invalid-transition。
- `applyRecordOutcome`:→resolved 走 `canTransition(current.status, 'resolved')`,非法(如 accepted/paused→resolved)→ invalid-transition。
- **行为收紧提示**:修复后,某些之前被静默接受的非法迁移会返回 invalid-transition。Pre-Flight 已标注,见下文风险节。

**BUG #2 修复(`applyOverridePriority`)**:history `kind` 从 `'status-change'` 改为 `'priority-override'`;fromStatus/toStatus 仍可自反(因为不是状态迁移),但 kind 正确反映事件性质。

**GC2 枚举扩展**:修改 `src/stores/ports.ts:853-860` 的 `WorkItemHistoryEntry.kind` 联合类型,新增 `'priority-override'`。这是 GC2 明确允许的唯一枚举变化。

**单测**(`src/domain/workitem/apply.test.ts` 追加):
- BUG #1 回归:`applyUpdateAction` completed 路径,断言 history.fromStatus === 'acting'(或其他真实源),不是恒 'acting'。覆盖 paused 等边角源状态。
- BUG #4 回归:paused→awaiting-verification(updateAction)→ invalid-transition;paused→resolved(recordOutcome)→ invalid-transition。
- BUG #2 回归:overridePriority history.kind === 'priority-override'。
- 各函数 happy path + 信任边界。

**验证**:`npx vitest run src/domain/workitem/apply.test.ts` 全绿;`npx astro check`。

---

## Task 5:filterExpiredProposals + list 过滤(BUG #3)

**目标**:Task 2 已建 `filterExpiredProposals`;此任务让 `WorkbenchService.list` 复用它过滤过期 proposal,加 `includeExpiredProposals` 选项。

**改动**:`WorkbenchService.list(options)` 改为:
```ts
async list(options?: { queue?; status?; limit?; includeExpiredProposals?: boolean }): Promise<WorkItem[]> {
  const items = await this.repository.list(options);
  return options?.includeExpiredProposals ? items : items.filter(i => !isProposalExpired(i, this.clockNow()));
}
```
(`this.clockNow()` = service 持有的时钟,Task 6 会随 deps 注入统一;此处先用现有 `nowIso()`。)

**行为变化**:默认过滤过期 proposal(修 BUG #3)。审计场景显式传 `includeExpiredProposals: true`。**注意**:`getTodayProjection` 已过滤,行为不变。

**调用方影响**:`pages/api/admin/workbench.ts` 的 view=decisions/actions/outcomes 路径默认不再看到过期 proposal。这是修 bug 的预期行为变化。若有调用方依赖看到过期 proposal,需显式传选项——implementer grep 调用方确认(Agent B 已列出 10 个调用点,只有 workbench.ts 和 outcomes.astro 用 list)。

**单测**:在 `workbench.service.test.ts` 追加 list 过滤用例(过期 proposal 默认不返回;includeExpiredProposals:true 返回)。

**验证**:`npx vitest run src/services/workbench.service.test.ts src/pages/api/admin/workbench.api.test.ts`;`npx astro check`。

---

## Task 6:WorkbenchService 改造为薄编排层 + 全套验证

**目标**:把 `WorkbenchService` 的 9 个写方法改成统一模式 `ensureWritable → findById → apply* → save`,公开签名严格不变(GC1/GC3/GC4),现有测试全绿(GC6)。

**改造模式**(以 decide 为例):
```ts
async decide(workItemId, input): Promise<WorkbenchResult<WorkItem>> {
  const blocked = this.ensureWritable<WorkItem>();
  if (blocked) return blocked;
  const existing = await this.repository.findById(workItemId);
  if (!existing) return fail('not-found', '工作项不存在。');
  const result = applyDecide(existing, input, this.deps);
  if (!result.ok) return result;
  await this.repository.save(result.workItem);
  return ok(result.workItem);
}
```

**构造函数**:保持 `new WorkbenchService({ repository?, storageMode? })`(GC4)。内部新增 `this.deps: WorkItemDeps`——clock 用现有 `nowIso` 包一层,idGen 用现有 `makeId` 包一层(保持 ID 前缀 wi_/wh_/wa_/wo_ 不变)。

**createProposal 无 current**(新建):`applyCreateProposal(input, deps)` 不需要 findById。

**保留在 service 的 IO**:`ensureWritable` / `resolveWorkbenchStorageMode` / `repository.*` / `nowIso` / `makeId` 的真值获取。

**验证四件套(GC8 全套)**:
1. `npx astro check`(类型,tsc 严格)
2. `npm run test`(全部单元 + 集成,含现有 4 个 workbench 测试文件 + 新 domain 测试)
3. `npm run build`(构建 + SSR 渲染)
4. `npm run test:e2e`(浏览器真实闭环;TOC/工作台/反馈时序敏感,单 worker)

**全绿标准**:四件套全过,现有测试零改动零失败(GC6),新 domain 测试覆盖 4 个 bug 修复 + 状态机全表 + history 值正确性。

**Final whole-branch review**:Task 6 后派 final code-reviewer(`scripts/review-package MERGE_BASE HEAD`),覆盖全分支 diff。

---

## 风险节(Pre-Flight 关注点)

1. **BUG #4 修复导致行为收紧**:`recordOutcome` / `updateAction` 修复后,从 `paused` / `accepted`(无 action)/ 其他非法源状态的迁移会返回 `invalid-transition`(之前被静默接受)。需确认:① demo-scenario.ts 的演示数据路径是否触发非法迁移;② 是否有线上 WorkItem 处于"非法但被接受"的状态(历史脏数据)。**这是面向用户的产品行为变化**,Pre-Flight 需用户确认可接受。

2. **list 默认过滤(BUG #3)影响 admin 视图**:`view=decisions` 等默认不再显示过期 AI proposal。若 Walker 依赖在 decisions 视图审计过期 proposal,需在调用方显式传 `includeExpiredProposals: true`。Pre-Flight 需确认 admin 视图行为预期。

3. **kind 枚举扩展(GC2 例外)**:新增 `'priority-override'` 后,任何按 `kind` 序列化/筛选的前端或迁移脚本需感知。implementer grep `history.kind` / `.kind ===` 全仓确认无硬编码穷尽分支。

4. **domain 层不持久化 expiresAt 变化**:Task 3 的 apply 函数必须保留 `current.expiresAt`(深拷贝/展开不丢),且不在迁移后清空(尽管 `ports.ts:892` 注释说"pending+ 无 expiresAt"——当前实现就没清,保持一致,不扩大范围)。

## 文件清单(预计触及)

- 新增:`src/domain/workitem/{types,state-machine,rules,suggest-next-action,apply,index}.ts` + 对应 `.test.ts`
- 修改:`src/services/workbench.service.ts`(瘦身,9 方法委托 domain)
- 修改:`src/stores/ports.ts`(kind 枚举 + 'priority-override',Task 4)
- 追加测试:`src/services/workbench.service.test.ts`(Task 1 安全网 + Task 5 list 过滤)
- 不动:`src/services/interfaces.ts`(GC1/GC2)、所有 `src/pages/api/admin/*` 调用方(GC1 保证签名兼容)、`src/pages/admin/*.astro` SSR 调用方
