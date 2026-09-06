# 主线执行清单（原子版）

来源：`PLAN.md` §3 主线八步的原子化拆解。本文覆盖 **M2 / M3 / M4 / M5 / M8** 五段；M1、M6、M7 已有原子清单，交叉引用不重复：

| PLAN 主线 | 原子清单 |
|---|---|
| M1 观测 P0 | `TODO-OBSERVABILITY.md` P0（P0-1~3） |
| M6 判断代理 v1 | `TODO-AGENT.md` A0–A7（冻结至 M3 完成） |
| M7 观测 P1 | `TODO-OBSERVABILITY.md` P1（P1-1~6） |

## 已拍板决策（细化时定死，执行不再议）

1. **DshAgentRunner 用 per-run 实例**（复用 `buildDefaultRuntimeFactory`，跑完即关，与洞察周报同模式）——**不与助手共享单飞锁**：工作站分钟级运行不得阻塞访客 15s 预算。内存注记：2C2G 并发 dsh 实例 ≤2（produce 互斥已保 1 + 助手常驻 1），ops 手册登记。
2. **codex 线退役删除**：CodexAgentRunner + 守卫测试 + ops README 的 CODEX_CLI_PATH 小节一并移除，不留兼容分支；stdin/免 shell 守卫语义迁入 DshAgentRunner 测试（dsh 经 node+args 起、prompt 走 JSON-RPC stdin，永不进命令行）。
3. **produce 无规则兜底**：`AI_ENABLED≠true` → runner 抛 `ai-disabled`，作品如实 FAILED——工作站是站主面，诚实优先于可用性装饰（与访客面红线不同，访客面降级规则不变）。
4. **卡口 nextStep 随 provider 自动切到 dsh**（同一 AGENT_RUNNER 注入）：15s 预算内冷启动已被小影生产验证；偶发超时走既有规则兜底，无新代码。
5. 共创文案 v1 范围：卡口成功回执一行 + /ask 提交区固定一句 + 周报回推行；**小影动态「记下了」推迟**（需意图分类，等信号数据），记 PLAN 支线。
6. 转题苗只建 **INBOX 题苗 + evidence 备注**，主选永远人工五问（宪法第 5 条）。
7. 流水线 v1 **不加后端端点**（前端聚合现有 API），旧九页保留直达；「九并五」收口与观测 P2 数据页同批。
8. M8 复盘只用现有数据面（metrics / AssistantRun / 循环计数），不为复盘提前做 P1。

## 优先级与依赖

```
M1（观测P0，独立）
M2（换 runner）──► M3 ★初稿全链（心脏）──► 解冻 M6（判断代理）＋启动 M7（观测P1）
M4（共创+转题苗）──┐
M5（流水线视图）──┴─► M8 复盘（9/17 固定日程）
```

M4/M5 与 M3 并行无依赖，但**冻结条款优先**：M3 未完成前 M4/M5 只做不发布大改（避免主线分心）；卡壳 >2 天降级推进。

---

## M2 · dsh 换工作站 runner（约 1 天）

- [ ] **M2-1 DshAgentRunner 适配器**｜新增 `apps/api/src/adapters/dsh-agent.runner.ts`｜构造注入 `APP_CONFIG`；per-run 实例（factory 起、finally close）；prompt 尾部追加输出合同（「只输出一个 JSON 对象 `{recipeVersion:1, stage, output:{…}}`」+ 原 prompt，生产 buildPrompt 不动）；`finalResponse` → `JSON.parse` → `{output, rawEvents:[], elapsedMs}`；`timeoutMs` 默认 10 分钟（race + 关实例）；`signal` abort 即关实例；`AI_ENABLED≠true` 抛 `ai-disabled`。｜验收：单测覆盖解析/超时/abort/ai-disabled 四路；守卫测试断言 launch 配置为 node+args（无 shell）、prompt 不出现在 args。
- [ ] **M2-2 接线切换与 codex 退役**｜`kernel.module.ts` AGENT_RUNNER → `DshAgentRunner`；删除 `codex-agent.runner.ts` + 其测试；`ops/windows/README.md` CODEX_CLI_PATH 小节改为一句历史注记；`docs/api/README.md` AI 行同步（nextStep/配方运行时=dsh）。｜验收：全仓 grep 无 CodexAgentRunner 残留；typecheck + api 测试全绿。
- [ ] **M2-3 本地真机冒烟**｜Mac 起 dev:api（本地 dsh clone 路径）｜(a) `POST /works` 假初稿 → produce → REVIEW_READY；(b) `POST /intake` 提问 → `aiUsedFlag:true`（nextStep 走 dsh）。｜验收：两问冒烟实录（终端输出贴进 PR/提交说明）。
- [ ] **M2-4 部署**｜按 AGENTS 部署流（无 schema 变更：build:api → 版本 → 重启 → 四步核验）。｜验收：生产 health 版本更新；`/workstation` 配方可启动（任一 work produce 不再因 runner 缺失 FAILED）。

## M3 · ★ 一篇真实初稿走完全链（心脏，站主 0.5 天 + agent 保障）

- [ ] **M3-1 前置保障（agent）**｜确认 admin 全链按钮状态机无阻断：创建（五问 brief）→ Run → Stop → Review 包全文 → Approve → Website(PREPARED) → Verify；对照 TODO-OPTIMIZATION T1 验收逐项过一遍。｜验收：清单核对记录留档。
- [ ] **M3-2 写初稿（站主）**｜800–2000 字，主题建议来自真实信号（周报/问题池任选），含站主真实观点与一次真实经历。｜验收：无（判断的定价权在人）。
- [ ] **M3-3 走链（站主）**｜admin 创建 work（填五问）→ Run recipe → 完成后刷新 → 审阅包读完整候选 → Approve。｜验收：work = APPROVED，approvedArtifactHash = 审阅包 hash。
- [ ] **M3-4 发布上线（站主+agent）**｜Website 发布 → PREPARED → 仓库根 `pnpm content:publish --push` → 等 Vercel → Verify website → PUBLISHED。｜验收：文章线上 200 可读。
- [ ] **M3-5 回灌证据（agent）**｜`content:gen` 后 content.json 含新 slug；问小影相关问题，citations 含新文章 slug。｜验收：回灌证据截图/记录。
- [ ] **M3-6 记账与解冻（agent）**｜PLAN §8 循环计数 0→1、STATUS 验证盒记录补行；**冻结解除**（M6 解冻、M7 启动）。｜验收：两份文档回写完成。

## M4 · 共创显性化 + 周报转题苗（约 1 天）

- [ ] **M4-1 卡口回执**｜`apps/web` IntakePanel｜提交成功的结果区追加一行：「这个问题已进入站主的选题池——它可能变成下一篇文章」。｜验收：web 测试断言回执渲染。
- [ ] **M4-2 /ask 提示**｜AskPage 提交区固定小字：「问过的问题会进入站主的选题池」。｜验收：快照测试。
- [ ] **M4-3 转题苗端点**｜`InsightsService.createSeedFromSuggestion` + `POST /insights/suggestions/seed`｜仅 `kind=write`；建 INBOX 题苗（title=text.slice(0,60)，note=evidence 原文）；幂等（同 suggestion 文本+周内已建则返回既有）。｜验收：service 单测（非 write 拒绝、幂等、状态 INBOX）。
- [ ] **M4-4 admin 按钮**｜InsightsPage 建议卡加「转题苗」→ 成功后按钮变「已入池 →」链接到种子页。｜验收：admin 测试；api/README 回写新端点。
- [ ] **M4-5 周报回执**｜InsightsPage 顶部：「本周期 N 条访客问题 · M 个内容缺口 · 已转题苗 K」（数据取 signalsView）。｜验收：数字与 signals 接口一致。
- [ ] **M4-6 部署**｜web+admin+api 三端构建部署 + 版本核对。｜验收：线上真实提问出现回执。

## M5 · admin 流水线视图（1–2 天）

- [ ] **M5-1 骨架**｜新增 `PipelinePage`（默认路由 `/pipeline`）：四段「池 / 苗 / 作 / 品」+ 各段待办计数徽章；数据 = clues/seeds/executions/works/workbench 现有 API 前端聚合。｜验收：admin typecheck/test；无新增后端端点。
- [ ] **M5-2 池段**｜candidate 线索行内「入池」；in-pool 计数；助手问题池 top5（链接）。｜验收：入池操作后计数即时更新。
- [ ] **M5-3 苗段**｜INBOX/CANDIDATE 题苗卡 + 「主选」按钮：从 SeedsPage 抽公共 `PromoteDialog`（五问表单）复用。｜验收：流水线页内完成一次主选全流程。
- [ ] **M5-4 作段**｜执行卡 doing / 停滞>3 天高亮；works PROCESSING/FAILED 行内 Retry(fromStage)/Stop。｜验收：失败 work 一键重试生效。
- [ ] **M5-5 品段**｜REVIEW_READY（审阅/批准入口，复用服务端审阅包恢复）+ APPROVED（发布/Verify）+ publications 状态徽章 + PREPARED 上线提示。｜验收：M3 的那篇作品在品段可完整追踪。
- [ ] **M5-6 导航收口（第一步）**｜导航第一项「流水线」设为默认；旧九页保留直达；「九并五」完整收口记 PLAN 支线（与 P2 数据页同批）。｜验收：登录落地流水线；任一旧页路由不破。
- [ ] **M5-7 部署**｜build:admin + 部署 + 版本核对。｜验收：站主自用一天无阻断。

## M8 · 验证盒复盘（9/17 固定，0.5 天）

- [ ] **M8-1 数据拉取**｜metrics（闭环计数/事件聚合）、AssistantRun 总量与 AI 占比、文章数、循环计数（PLAN §8）；若 M7 已完成加 AI 观测四指标。｜验收：一页数据汇总。
- [ ] **M8-2 复盘四问**｜循环转了几次？信号池有多少真实访客问题？AI 实际可用率（降级原因分布）？下一周期唯一重点是什么？｜验收：四问有数据答案，不靠感觉。
- [ ] **M8-3 回写**｜STATUS 验证盒记录表补行；PLAN §8 快照更新 + §3 主线按结论重排；下一 14 天验证盒起算条件确认。｜验收：两份文档与结论一致。

## 全局验收门

每段完成必跑：`pnpm typecheck` → `pnpm test:shared && pnpm test:api && pnpm test:web && pnpm --filter @walker/admin test` → 涉 web/admin 再 `pnpm build:web && pnpm verify:geo`；部署按 AGENTS 流 + ops 四步核验。M2/M4/M5 部署后各留一条生产冒烟记录。
