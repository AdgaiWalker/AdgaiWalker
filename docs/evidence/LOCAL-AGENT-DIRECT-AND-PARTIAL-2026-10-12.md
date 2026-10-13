# 本地：Agent 直调与访客助手修复验收（2026-10-12）

> 状态：**仅本地验收，生产未部署**。触发问题：前端调用 AI 功能返回无内容（=「AI 没有提供服务」）。

## 一、修复前的现场（可复现）

| 症状 | 复现 | 现场证据 |
|------|------|----------|
| 后台试跑面板「没有输出记录」 | `POST /ops/execution-runs` + 前端会挑中的那条授权 | `state=FAILED, stopReason=quota, events=[]`；该授权 `runLimit=3, runsCharged=3` |
| 直调返回 201 + `output:""` | `POST /agents/:id/try` | 响应 2.28s 空产出；同一 run 32,234ms 后才 `SUCCEEDED` 并落下 79 字文本 |
| 访客助手偶发固定回答（文案写「当前 AI 未启用」） | `POST /assistant/stream` | 当日 5 次公开问答 3 成 2 败，失败为 `stopReason=deadline`（15,126 / 15,143ms） |
| 首轮延迟高 | 同上 | 首轮 prompt 29,808 字（整库 28 篇正文）→ 9.55s；同会话第二轮 1.90s |

## 二、根因与修法（都不是补丁）

1. **授权可用性没有单一真相源**：`AuthorizationGrantView` 只带限额、不带已用量，后端直调自己 `.find()` 一条、前端自己写一遍「未撤销 + 未过期」，两处都把用满的授权当可用。
   → shared 拆成 `grantDenial`（权限）与 `grantUsable`（权限 + 额度）；读视图补齐四个计数器；token 终态记账进 `usageCharged`（此前 `usageLimit` 是装饰字段）；`AuthorizationService.selectUsable` 成为后端唯一"挑授权"入口。
   **执行准入仍只看 `grantDenial`**，额度由 `reserve` 的原子 UPDATE 把关——读侧重复拒绝会把「额度已用完，已改为规则处理」悄悄换成笼统 403。

2. **等待与取结果有两份实现，其中一份是 2 秒假窗口**：`submitOwned` 只轮询 `40 × 50ms`，模型要 2.3–32 秒，超窗就把空事件当成功返回。
   → `AgentExecutionService.awaitTerminal/savedText` 成为唯一实现（跟随运行自己的 `deadline`），发布测试与直调共同复用；直调失败一律结构化报错（409 `grant-required` / 5xx 带 `state`+`stopReason` / 502 `agent-run-empty`），绝不拿空串当成功。

3. **预算到点丢弃已生成内容**：deadline 一到直接换成规则文案，而访客在流里已经看到半截真回答。
   → 有可见文本就交付并标 `partial`（前端显示「未写完」），只有一个字都没生成才降级。

4. **首轮上下文整库倾泻**：把 28 篇正文（3.4 万字）整包塞进每次新会话。
   → shared `packFirstTurnContext`：**全量目录**（slug/标题/标签/摘要）+ **相关正文**（标题/标签命中记 2 分、摘要 1 分，阈值 2；条数 ≤6、字符 ≤8000 双闸）。

5. **假功能面**：`compare`（承诺 2–4 引擎并排、实现被"禁止换引擎"红线否决，只返回 `execution-denied` 占位）、`run-file`/`log-files`（与内容工作站重复）、`agents/:id/runs`（读 G01 后只读保留的历史表 `AgentRun`）。
   → 四个面删除，`RUN_KINDS` 去掉 `compare`。

## 三、修复后实测（本机，dev 库）

后台直调（新签一条 `runLimit=3` 授权后）：

```
POST /agents/agent-fd6726…/try  {"input":"用一句话说明你是谁"}
→ HTTP 201  wall 4.35s
  output: "我是小影，Walker 站主 Dora 的只读站内助手，可以帮你了解 Dora、找文章和学习路径。"
  elapsedMs 2917 · providerId deepseek-official · model deepseek-flash · temperature null
```

额度用满时（同一端点，未新签授权）：

```
→ HTTP 409 {"code":"grant-required","message":"这个 Agent 名下没有还有额度的授权；先签发一条（额度用完的授权不会自动续）"}
```

访客助手三条（每次都是新会话 = 首轮）：

| 问题 | 首轮 prompt | 耗时 | 结果 |
|------|-------------|------|------|
| 我每个月在 AI 模型上的花销大概是多少？ | 11,361 字（原 29,808） | 4.05s | `aiUsedFlag=true`，1 条引用，答出「不到三分之一」与三个渠道 |
| 你好 | **3,580 字** | **2.22s** | `aiUsedFlag=true`，0 引用 |
| 怎么跨区买海外 AI 会员？ | 11,368 字 | 3.55s | `aiUsedFlag=true`，2 条引用，给出可操作步骤 |

三条全部真实 AI 回答，无一条落到规则兜底。

## 四、回归门禁（本机全绿）

- `pnpm typecheck`：shared / admin / agent / api / web 全过
- `pnpm test:shared`：49 文件 390 项通过
- `apps/api` vitest：143 文件 727 项通过（1 项失败为**既有环境问题**：`apps/web/src/generated/public-manifest.json` 已被 Git 跟踪，`git check-ignore` 必然失败，与本次改动无关）
- `pnpm test:web`：40 文件 237 项通过；`pnpm test:agent`：5 文件 30 项通过
- 新增/更新的关键测试：`packages/shared/src/authorization.test.ts`（权限与额度边界）、`assistant-context.test.ts`（打包与阈值）、`apps/api/src/execution/agent-execution.service.test.ts`（唯一等待实现）、`apps/api/src/agents/agent-runner.service.test.ts`（直调四种失败语义）、`public-assistant.service.test.ts`（partial 交付）、`legacy-execution.kernel.integration.test.ts`（直调等待真实终态）

## 五、未做 / 留待决策

- `usageLimit` 现在会随成功运行累计 token；**历史可用量上限的授权不会自动失效**，站主需要时按剩余额度重签。
- 首轮正文选择是**确定性关键词加权**，不是向量检索；站点继续增长时先调 `FIRST_TURN_MAX_BODIES` / `FIRST_TURN_BODY_BUDGET_CHARS`。
- `apps/web/src/generated/public-manifest.json` 仍被 Git 跟踪（`content-publish-script-lock.test.ts` 因此失败）；是否 `git rm --cached` 属发布链决策，未擅动。
