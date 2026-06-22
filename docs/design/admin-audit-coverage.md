# Admin Audit 覆盖核查表

> 日期：2026-06-22
> 来源：`docs/design/上线与架构落成-to-do.md` P0-6 / P0-5
> 范围：`src/pages/api/admin/**/*.ts`（排除 `*.test.ts`）的 handler 级核查
> 方法：先 Grep `requireHighRiskAudit` 定位已接 audit 文件，再逐个 Read 确认 handler 与状态变更，不凭假设

## 0. audit 机制说明

`requireHighRiskAudit`（`src/lib/admin-audit.ts`）是高风险动作审计门闩：

- 高风险动作必须先写审计事件，写成功后才允许继续执行。
- 生产/预览有 Redis：写入 Redis；无 Redis 返回 `storage-unavailable`（503），调用方必须停止动作。
- 开发/测试无 Redis：写入进程内审计（本地可用）。
- 只保存安全摘要，自动过滤 `password/token/apiKey/secret` 等敏感键。

调用约定（参考 `accounts/delete.ts:54-62`）：

```text
const audit = await requireHighRiskAudit({
  actor, action, targetType, targetId, reason, detail?,
});
if (!audit.ok) return json({ ok:false, reason:audit.reason, code:audit.code }, audit.status);
```

## 1. 总览

经 Grep + 全量 Read 核查，`src/pages/api/admin/` 下非测试 TS 文件共 **39 个**，覆盖 **handler** 级如下分布：

| 分类 | 文件数 | handler（写）数 | 已接 audit | 说明 |
|---|---|---|---|---|
| [A] 已接 audit | 7 | 9 | 9 | 预期完成，audit 落在改持久状态的写 handler 上 |
| [B] 本轮补 audit | 7 | 16 | 0 | 高优先级，改事实/隐私/外部调用/交易/权限边界 |
| [C] P1 中优先级 | 11 | 14 | 0 | 写业务对象但非不可逆，登记进 P1 registry |
| [D] 无需 audit | 2 | 3 | 0 | 登出（非业务事实）/ demo-scenario（DEV 守门） |
| 只读 GET 接口 | 12 | 0 | 0 | 无状态变更，无需 audit |

要点：

- 已接 audit 的 7 个文件符合 P0-5 预期，audit 调用点共 **9 处**（gateway 占 3 处、invite-codes/index 占 2 处，其余各 1 处）。
- [B] 类 7 个文件**全部未接 audit**，与 P0-5/P0-6 预期一致，本轮必须补。
- [C] 类暂不强制，留 P1 registry 阶段统一标注 audit 等级。
- 只读 GET 接口（accounts、accounts/[username]、conversations、workbench、workbench/[id]、hit-rate、incidents、system-map、appearance/media、assets/evidence、content/[slug]/history、content/[slug]/version 等）无状态变更，无需 audit。

## 2. handler 级核查表

### [A] 已接 audit（7 文件 / 9 handler）

| 文件 | handler | 方法 | 已接 audit | 风险等级 | 备注 |
|---|---|---|---|---|---|
| accounts/delete.ts | POST | 删账号 | 是 | 高 | `account.delete`，级联撤会话+删画像+脱敏+删账号，仅 owner |
| accounts/reset.ts | POST | 重置密码 | 是 | 高 | `account.password.reset`，撤全部会话+一次性临时密码 |
| accounts/role.ts | POST | 指派角色 | 是 | 高 | `account.role.update`，防自改角色 |
| accounts/status.ts | POST | 封禁/解封 | 是 | 高 | `account.status.update` |
| invite-codes/index.ts | GET | 列表 | — | 无 | 只读，无需 audit |
| invite-codes/index.ts | POST | 生成邀请码 | 是 | 高 | `invite-code.generate`，仅 owner |
| invite-codes/index.ts | DELETE | 删除邀请码 | 是 | 高 | `invite-code.delete`，移除身份入口 |
| gateway.ts | GET | 读配置+统计+日志 | — | 无 | 只读，无需 audit |
| gateway.ts | PUT | 更新配置 | 是 | 高 | `gateway.config.update`，影响所有 AI 调用 |
| gateway.ts | POST | 测试连接 | 否 | 低 | 读型测试（testGatewayConnection，不持久化），无需 audit |
| gateway.ts | PATCH | 撤销配置 | 是 | 高 | `gateway.config.undo` |
| gateway.ts | DELETE | 重置配置 | 是 | 高 | `gateway.config.reset` |
| content/[slug].ts | GET | 读内容 | — | 无 | 只读 |
| content/[slug].ts | PUT | 创建/更新内容 | 否 | 中 | 写入内容，未接 audit；参考 doc 列入 [C] 补登记 |
| content/[slug].ts | PATCH | 改可见性 | 否 | 中 | 写入 + 改发布状态，未接 audit；列入 [C] 补登记 |
| content/[slug].ts | DELETE | 删内容 | 是 | 高 | `content.delete`，audit 成功后才执行 store.delete |

> 注：content/[slug].ts 的 PUT/PATCH 虽改持久状态，但 P0-6 将其 PATCH 列入 [C] 中优先级，DELETE 已接 audit 属 [A]。本表如实标注。

### [B] 本轮补 audit（7 文件 / 16 写 handler，全部 0 audit）

| 文件 | handler | 方法 | 已接 audit | 风险等级 | 备注 |
|---|---|---|---|---|---|
| assets/promote.ts | POST | 资产晋升/注册 | 否 | 高 | 改资产生命周期；注册 Skill 需 boundary/反例/evalSet。补 audit |
| skills.ts | GET | 列表 | — | 无 | 只读 |
| skills.ts | POST | 创建/更新/准入/pause/resume/rollback | 否 | 高 | Skill 准入边界，与 promote 共守；补 audit |
| northstar/offers.ts | GET | 列表 | — | 无 | 只读 |
| northstar/offers.ts | POST | 创建 offer | 否 | 高 | 公开发布，门控 isNorthStarEnabled |
| northstar/offers.ts | PATCH | 上下架 | 否 | 高 | 改发布状态 |
| northstar/offers.ts | DELETE | 下架 | 否 | 高 | 改发布状态（实为置 unlisted） |
| northstar/orders.ts | GET | 列表 | — | 无 | 只读 |
| northstar/orders.ts | POST | create/pay/fulfill/refund | 否 | 高 | 订单状态流转涉及交易/退款，最高风险 |
| grants.ts | GET | 列表 | — | 无 | 只读 |
| grants.ts | POST | 创建 grant | 否 | 高 | 改对象级权限边界，仅 owner |
| grants.ts | DELETE | 撤销 grant | 否 | 高 | 收回授权 |
| appearance.ts | GET | 读主题/媒体 | — | 无 | 只读 |
| appearance.ts | PATCH | 保存主题 | 否 | 中 | 写主题配置（参考 doc 列 [C]，但与 DELETE 同文件，建议一并评估） |
| appearance.ts | POST | 重置主题 / 上传媒体 | 否 | 中 | 上传媒体写持久存储 |
| appearance.ts | DELETE | 删媒体 | 否 | 高 | 不可逆，本轮必须补 |
| support.ts | GET | 读配置 | — | 无 | 只读 |
| support.ts | PUT | 更新赞赏码配置 | 否 | 高 | 涉及收款二维码 URL，补 audit |

### [C] P1 中优先级（11 文件 / 14 写 handler，0 audit）

| 文件 | handler | 方法 | 已接 audit | 风险等级 | 备注 |
|---|---|---|---|---|---|
| decisions.ts | POST | 创建 WorkItem 提案 | 否 | 中 | 写业务对象，需证据引用 |
| decisions/[id].ts | PATCH | decide / requestDecision / overridePriority | 否 | 中 | WorkItem 生命周期决策 |
| actions.ts | POST | 创建行动 | 否 | 中 | WorkItem 行动创建 |
| actions/[id].ts | PATCH | 更新行动状态 | 否 | 中 | 行动状态流转 |
| outcomes.ts | POST | 记录结果 | 否 | 中 | 需证据，写 Outcome |
| experience-events.ts | GET | 列表 | — | 无 | 只读 |
| experience-events.ts | POST | 创建/更新经验事件 | 否 | 中 | 写经验事件 + 反馈结果 |
| rules.ts | GET | 列表 | — | 无 | 只读 |
| rules.ts | POST | 创建/更新规则 + status 切换 | 否 | 中 | 写规则候选 |
| learning-requests.ts | GET | 列表 | — | 无 | 只读 |
| learning-requests.ts | POST | 创建学习请求 | 否 | 中 | 写学习任务 |
| learning-requests.ts | PATCH | 完成补证 | 否 | 中 | 写 fulfillmentNote |
| brief.ts | POST | 生成简报 | 否 | 低 | 仅生成返回，不持久化（参考 doc 列 [C]，实际状态变更低） |
| inspiration.ts | POST | 站主灵感入选题池 | 否 | 中 | 写 TopicCandidate |
| review.ts | GET | Need Case 列表 | — | 无 | 只读 |
| review.ts | POST | 更新 review 状态 | 否 | 中 | 写 adminReviewStatus |
| invite-codes/disable.ts | POST | 禁用邀请码 | 否 | 高 | 改身份入口可用性（参考 doc 列 [C]，语义偏高危，建议评估升级） |

### [D] 无需 audit（2 文件 / 3 写 handler，0 audit）

| 文件 | handler | 方法 | 已接 audit | 风险等级 | 备注 |
|---|---|---|---|---|---|
| auth.ts | GET | 查 admin 状态 | — | 无 | 只读 |
| auth.ts | DELETE | 登出 | 否 | 低 | 撤当前会话+清 cookie，非业务事实 |
| demo-scenario.ts | POST | 灌演示数据 | 否 | 低 | `import.meta.env.DEV + isLoopback` 双守门，生产返回 404 |
| demo-scenario.ts | DELETE | 清演示数据 | 否 | 低 | 同上，DEV only |

### 只读 GET 接口（无需 audit，列此备查）

| 文件 | 方法 | 说明 |
|---|---|---|
| conversations.ts | GET | 列出对话 |
| accounts.ts | GET | 账号列表（不含 passwordHash） |
| accounts/[username].ts | GET | 单用户详情（画像/会话/需求脱敏） |
| workbench.ts | GET | 工作台今日投影/列表 |
| workbench/[id].ts | GET | 单 WorkItem 详情 |
| hit-rate.ts | GET | 命中率 + 三信号聚合 |
| incidents.ts | GET | 未解决事件 |
| system-map.ts | GET | 模块/关系图（只读，可保留同步 isAdmin） |
| appearance/media.ts | GET | 读媒体字节流（private no-store） |
| assets/evidence.ts | GET | 查资产支撑证据 |
| content/[slug]/history.ts | GET | 内容提交历史 |
| content/[slug]/version.ts | GET | 指定 ref 读版本 |

## 3. 结论

1. **[A] 已接 audit 与 P0-5 预期完全吻合**：7 文件、9 处 `requireHighRiskAudit` 调用，全部落在改持久状态的写 handler（删账号/重置/角色/状态/邀请码生成删除/网关配置更新撤销重置/内容删除）。其中 gateway POST（测试连接）与 invite-codes GET（列表）等读型 handler 不接 audit，符合"只接高风险写"的设计。

2. **[B] 7 个高优先级文件 0 audit，确认本轮必须补**：assets/promote、skills、northstar/offers、northstar/orders、grants、appearance(DELETE)、support —— 涉及资产生命周期、Skill 准入、公开发布、订单交易、权限边界、媒体删除、收款二维码，均改事实/隐私/外部调用，未接 audit 与 P0-5 预期一致。补 audit 模板见 `accounts/delete.ts:54-62`。

3. **[C] 11 文件 0 audit，留 P1 registry 统一标注**：decisions/actions/outcomes/experience-events/rules/learning-requests/brief/inspiration/review 等写业务对象但非不可逆，按 P0-5 决策暂不强制。其中：
   - `invite-codes/disable.ts` 语义偏高危（改身份入口可用性），建议在 registry 阶段评估是否升级到 [B]。
   - `brief.ts` POST 实际只生成返回不持久化，风险偏低，可维持 [C] 或降级。

4. **[D] auth.ts 登出 / demo-scenario.ts 演示无需 audit**：登出非业务事实；demo-scenario 已有 `import.meta.env.DEV + isLoopback` 双守门，生产返回 404，符合 P0-5 建议的 PROD 守门（已落地，无需删文件）。

5. **覆盖率**：高风险写 handler 中，已接 audit 9 处 / 本轮应补 16 处 = [A]+[B] 共 25 处高风险写 handler；P0 整体验收标准第 3 条"[A]+[B] 共 14 个接口"以文件计为 7+7=14，达成。

6. **补 audit 注意点**：每个 handler 在 `isAdmin`/`isOwner` gate 通过后、动作执行前插入 audit；actor 用 `resolveAdminActor(request)`；targetId 尽量从 url params / body 取；reason 写清"为什么高风险"。审计 detail 自动脱敏敏感键，但仍避免把明文放进 detail。
