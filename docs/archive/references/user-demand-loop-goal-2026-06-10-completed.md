# Goal Document: 用户需求闭环第一轮落地

## Go / No-Go
- **Judgment**: Go
- **Reason**: PRD 已整合，Architecture 已写入，目标、边界、模块映射和迁移路径都已明确。当前代码可运行，拆分风险可控。

## Target Outcome

`/api/match.ts` 的业务逻辑被拆入 `src/services/` 和 `src/stores/`，API route 只剩 HTTP 层。邀请制身份入口可以跑通一条完整测试链。数据边界（public / private / admin-only）经过验收。系统可继续正常 build 和运行。

## Goal Definition

- **Type**: technical + delivery
- **Boundary**:
  - 拆分 `/api/match.ts` 到四层架构
  - 建立邀请制身份入口的 service 和 store 接口
  - 验收数据边界
- **Non-goals**:
  - 不实现完整社区账号系统
  - 不做 Skill 准入的完整闭环（只建接口）
  - 不改 MCP server 和 Admin 页面 UI
  - 不做内容模型字段补齐
- **Deferred work**:
  - 内容创作闭环（选题 -> 草稿 -> 发布 -> 关联需求）
  - Skill 准入判断和注册
  - Agent 六模块拆分
  - AI 可读接口 v2
- **Verification rule**: `npm run build` 通过，邀请码可准入，无效邀请码被拒绝，普通用户看不到 private/admin-only 数据。
- **Evidence source**: build 命令 + 手动测试 + 代码结构检查
- **Pass criteria**:
  - `src/services/` 至少有 matching.service.ts、invite.service.ts、visibility.service.ts
  - `src/stores/` 至少有 demand-event.store.ts、invite-code.store.ts
  - `/api/match.ts` 行数减少 50% 以上
  - 邀请码准入可测试
  - `npm run build` 通过
- **Confidence note**: 拆分逻辑已经在 PRD 中定义清楚，风险主要在运行时测试覆盖。
- **Judgment owner**: Walker 手动验收

## Current State

- PRD 已整合：`user-demand-integrated-prd.md`
- Architecture 已写入 PRD
- `/api/match.ts` 约 300+ 行，承载 11 项关注点
- `src/agent/match.ts` 混合分类关键词和业务规则
- `src/conversation/store.ts` 混合 4 种数据结构
- 管理端已有基础：/admin、/admin/insights、/admin/topics、/admin/content
- MCP 工具已有基础：5 个工具
- Content Collection 使用 `log` 集合
- 已知约束：Vercel 部署，Redis 用 Upstash，内容写回用 GitHub API
- 已知风险：拆分过程中可能引入运行时回归，需要每步 build 验证

## Priority Rationale

1. 先建目录和接口定义（零风险，不改现有代码）
2. 再拆 match.ts（最高杠杆，影响最大）
3. 再建邀请制接口（新功能，不破坏现有逻辑）
4. 最后验收数据边界（验证拆分结果）

## Assumptions and Open Decisions

| Item | Status | Impact | Owner / Next step |
| --- | --- | --- | --- |
| 邀请码存储用环境变量还是文件 | assumed: 环境变量 | 不影响接口设计 | Walker 决定 |
| 画像存储用 Cookie 还是 Redis | assumed: Cookie 第一版 | 不影响接口设计 | Walker 决定 |
| 需求事件存储用 Redis 还是本地文件 | assumed: Redis（线上）/ 本地文件（开发） | 影响 store 实现 | 已在 PRD 中确认 |
| Agent 路由是否先实现 | deferred | 不影响架构骨架 | 后续 phase |

## Phases

### Phase 1: 建目录和接口定义

- **Purpose**: 建立四层架构的骨架，不改任何现有代码，零风险。
- **Entry condition**: 当前代码可正常 build。
- **Phase rules**:
  - 只新建文件和接口类型，不修改任何现有文件。
  - 每个 Port 接口只定义方法签名，不实现。
  - 每个 service 只定义公共方法签名，不实现。
- **Todos**:
  - [ ] 创建 `src/services/` 目录
    - **Surface**: 目录结构
    - **Proof**: 目录存在
    - **Depends on**: none
  - [ ] 创建 `src/stores/` 目录
    - **Surface**: 目录结构
    - **Proof**: 目录存在
    - **Depends on**: none
  - [ ] 创建 `src/infrastructure/` 目录
    - **Surface**: 目录结构
    - **Proof**: 目录存在
    - **Depends on**: none
  - [ ] 定义 Port 接口文件 `src/stores/ports.ts`
    - **Surface**: 类型定义
    - **Proof**: TypeScript 编译通过
    - **Depends on**: 目录存在
  - [ ] 定义 Service 接口文件 `src/services/interfaces.ts`
    - **Surface**: 类型定义
    - **Proof**: TypeScript 编译通过
    - **Depends on**: Port 接口定义
  - [ ] `npm run build` 验证
    - **Surface**: build 输出
    - **Proof**: build 成功
    - **Depends on**: 以上全部
- **Exit proof**: 目录存在，接口文件编译通过，build 成功。
- **Stop condition**: 如果接口定义与现有类型冲突，暂停确认。

### Phase 2: 拆分 /api/match.ts

- **Purpose**: 把 match.ts 的业务逻辑移入 service 和 store，API route 只剩 HTTP 层。
- **Entry condition**: Phase 1 完成，接口已定义。
- **Phase rules**:
  - 每拆一个关注点，立即 build 验证。
  - 不改变外部行为：同样的请求应返回同样的响应结构。
  - 不做功能新增，只做结构搬迁。
  - 如果拆分导致行为变化，立即暂停。
- **Todos**:
  - [ ] 实现 `stores/demand-event.store.ts`
    - **Surface**: 数据层代码
    - **Proof**: 需求事件读写可编译
    - **Depends on**: Phase 1
  - [ ] 实现 `stores/match-session.store.ts`
    - **Surface**: 数据层代码
    - **Proof**: 会话读写可编译
    - **Depends on**: Phase 1
  - [ ] 实现 `stores/feedback.store.ts`
    - **Surface**: 数据层代码
    - **Proof**: 反馈读写可编译
    - **Depends on**: Phase 1
  - [ ] 实现 `services/matching.service.ts`
    - **Surface**: 业务层代码
    - **Proof**: 分类和匹配逻辑从 match.ts 移入
    - **Depends on**: stores
  - [ ] 实现 `services/visibility.service.ts`
    - **Surface**: 业务层代码
    - **Proof**: 脱敏和隐私过滤从 privacy.ts 移入
    - **Depends on**: Phase 1
  - [ ] 实现 `services/question.service.ts`
    - **Surface**: 业务层代码
    - **Proof**: 提问处理逻辑从 match.ts 移入
    - **Depends on**: matching.service.ts
  - [ ] 重写 `/api/match.ts` 为 HTTP 薄层
    - **Surface**: API route
    - **Proof**: 调用 service + 格式化响应，行数减少 50%+
    - **Depends on**: 所有 service 和 store
  - [ ] `npm run build` 验证
    - **Surface**: build 输出
    - **Proof**: build 成功
    - **Depends on**: 重写完成
- **Exit proof**: match.ts 行数减少 50%+，build 通过，功能不变。
- **Stop condition**: 如果拆分导致行为回归，暂停定位。

### Phase 3: 邀请制身份入口接口

- **Purpose**: 建立邀请码验证和轻量会话的 service 和 store，能在 API 层调用。
- **Entry condition**: Phase 2 完成，四层架构已验证。
- **Phase rules**:
  - 只建新 service 和 store，不改动已有拆分结果。
  - 邀请码存储用环境变量实现第一版。
  - 会话存储用 Cookie 实现第一版。
  - 不做画像 UI，只做 API 接口。
- **Todos**:
  - [ ] 实现 `stores/invite-code.store.ts`（环境变量版）
    - **Surface**: 数据层代码
    - **Proof**: 邀请码校验可编译
    - **Depends on**: Phase 2
  - [ ] 实现 `services/invite.service.ts`
    - **Surface**: 业务层代码
    - **Proof**: 准入逻辑可编译
    - **Depends on**: invite-code.store
  - [ ] 创建 `/api/admin/invite-verify` API route
    - **Surface**: API route
    - **Proof**: 有效邀请码返回成功，无效返回拒绝
    - **Depends on**: invite.service
  - [ ] `npm run build` 验证
    - **Surface**: build 输出
    - **Proof**: build 成功
    - **Depends on**: 以上全部
- **Exit proof**: 邀请码 API 可调用，build 通过。
- **Stop condition**: 如果邀请码验证需要产品决策（如一次性 vs 多人共用），暂停确认。

### Phase 4: 数据边界验收

- **Purpose**: 确认拆分后，普通用户、管理员、Agent、MCP 各自能看到正确的数据范围。
- **Entry condition**: Phase 3 完成。
- **Phase rules**:
  - 不改功能，只验收。
  - 每个角色逐一检查。
  - 发现问题记录但不改，回到对应 phase 修复。
- **Todos**:
  - [ ] 验收 `/api/stats` 只返回聚合字段
    - **Surface**: API 响应
    - **Proof**: 响应中无原始用户数据
    - **Depends on**: Phase 3
  - [ ] 验收后台洞察不出现在公开接口
    - **Surface**: API 路由
    - **Proof**: `/admin/insights` 需要管理员身份
    - **Depends on**: Phase 3
  - [ ] 验收 MCP 默认只读 public 内容
    - **Surface**: MCP 工具
    - **Proof**: private 内容不在 MCP 结果中
    - **Depends on**: Phase 3
  - [ ] 验收 `walker_insights` 私有数据有开关
    - **Surface**: MCP 工具
    - **Proof**: 私有洞察需要管理员参数
    - **Depends on**: Phase 3
  - [ ] 记录验收结果
    - **Surface**: 文档
    - **Proof**: 写入 execution-log-current.md
    - **Depends on**: 以上全部
- **Exit proof**: 四个角色验收通过，结果写入 execution log。
- **Stop condition**: 如果发现边界问题，回到 Phase 2 修复。

## Dry-Run Findings

- Phase 1 零风险，不需要额外准备。
- Phase 2 是核心风险点：match.ts 拆分时可能遗漏隐式依赖（如 Redis 连接复用、错误处理分支）。建议每拆一个关注点立即 build。
- Phase 3 新增代码不触碰现有逻辑，风险低。邀请码存储方式需要 Walker 确认。
- Phase 4 纯验收，风险最低。
- 整体依赖链是线性的，无循环依赖。

## Final Validation

```bash
npm run build
```

加上手动测试：
- 有效邀请码可通过
- 无效邀请码被拒绝
- `/api/stats` 无原始用户数据
- `/admin/insights` 需要管理员身份

## First Execution Step

创建 `src/services/`、`src/stores/`、`src/infrastructure/` 三个目录，定义 Port 接口文件。
