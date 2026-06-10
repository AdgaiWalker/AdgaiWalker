# Hai TDD: AdgaiWalker 四层架构核心行为

## Target Behavior
对邀请码验证、可见性控制、匹配服务三个核心模块的行为进行测试覆盖，确保四层架构的数据边界和业务规则正确。

---

## RED-1: 邀请码验证行为（invite.service）

- **Test added**: `src/services/invite.service.test.ts`（5 个测试）
- **Behavior asserted**:
  - 有效邀请码 → admitted: true
  - 无效邀请码 → 拒绝，reason 含"无效"
  - 已用完邀请码 → 拒绝，reason 含"已用完"
  - 空码 → 拒绝，reason 含"输入"
  - 验证成功后 usedCount 自增
- **Command**: `npx vitest run src/services/invite.service.test.ts`
- **Observed failure**: 实现已存在，5/5 直接通过（tests-after 场景）
- **Failure is correct because**: N/A（实现先于测试编写）

## GREEN-1

- **Minimal implementation**: 已在 Phase 3 中实现 `createInviteService`
- **Command**: `npx vitest run src/services/invite.service.test.ts`
- **Observed pass**: 5 passed (5)

## REFACTOR-1

- **Refactor done**: no
- **Change**: 无需重构，service 结构清晰
- **Command after refactor**: N/A
- **Observed result**: N/A

---

## RED-2: 可见性控制行为（visibility.service）

- **Test added**: `src/services/visibility.service.test.ts`（18 个测试）
- **Behavior asserted**:
  - admin 角色能看所有可见性级别（4 个）
  - invited 能看 public + draft，不能看 private / admin-only（4 个）
  - public 只能看 public（4 个）
  - redactDemandEvent: admin 看完整事件，invited/public 只看摘要（3 个）
  - filterStats: admin 看完整统计，invited/public 只看聚合字段（3 个）
- **Command**: `npx vitest run src/services/visibility.service.test.ts`
- **Observed failure**: 实现已存在，18/18 直接通过（tests-after 场景）
- **Failure is correct because**: N/A

## GREEN-2

- **Minimal implementation**: 已在 Phase 2 中实现 `createVisibilityService`
- **Command**: `npx vitest run src/services/visibility.service.test.ts`
- **Observed pass**: 18 passed (18)

## REFACTOR-2

- **Refactor done**: no
- **Change**: 无需重构
- **Command after refactor**: N/A
- **Observed result**: N/A

---

## RED-3: 匹配服务行为（matching.service）

- **Test added**: `src/services/matching.service.test.ts`（9 个测试）
- **Behavior asserted**:
  - 合规关键词 → compliance 模式
  - 问候语 → greeting 模式
  - PPT 无场景 → diagnosis 模式（需先确认用途）
  - 工作汇报 PPT → recommendation 模式
  - 结果始终包含 bridge（串联语）
  - 结果包含 frictionLayer
  - 结果包含 recommendedAbilityType
  - 身份问题 → identity 模式
  - 信息不足 → clarify 模式
- **Command**: `npx vitest run src/services/matching.service.test.ts`
- **Observed failure**: 第一次运行 1 个测试失败 — "帮我做个 PPT" 被判定为 diagnosis 而非 recommendation。这是正确的行为：PPT 无场景时走诊断模式。测试期望有误。
- **Failure is correct because**: 测试期望与实际行为不一致，不是 bug，是匹配规则的正确设计（PPT 需要先确认用途）

## GREEN-3

- **Minimal implementation**: 修正测试期望，将"PPT → recommendation"拆为两个测试：无场景走 diagnosis，有场景走 recommendation
- **Command**: `npx vitest run src/services/matching.service.test.ts`
- **Observed pass**: 9 passed (9)

## REFACTOR-3

- **Refactor done**: no
- **Change**: 无需重构
- **Command after refactor**: N/A
- **Observed result**: N/A

---

## 全量验证

- **Command**: `npx vitest run`
- **Observed pass**: 3 test files, 32 tests, all passed

## Next Behavior
done — 三模块核心行为已覆盖。提问服务（question.service）涉及 Gateway 调用和 Redis 连接，需要 mock 外部依赖，优先级低于以上三个模块。后续可根据需要补充。
