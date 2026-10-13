# 会话详情与首页小影审查修复（本地，2026-09-29）

范围：当前未提交工作区、本地开发库与隔离测试库。生产未部署，G07/G08 上线门槛不变。长会话仅测量，见 [独立性能记录](LOCAL-CONVERSATION-PERFORMANCE-2026-09-29.md)。

## 已实施

- `conversation.convert` 经内部提交 port 在同一 SQLite 事务创建 Action 与 AuditRecord；审计 `(action,targetType,requestId)` 唯一。服务端在验证会话前查询已提交键，保留已删除会话的同键重放；并发写入后的同键结果回读已提交审计。没有新增公开接口或数据库真相表。
- `pnpm db:migrate` 在修改旧库前检查所有非空审计请求键重复组，发现时给出 action/targetType 与数量并拒绝。第 25 条迁移只增加唯一索引。
- 后台转事项在结果不明时冻结标题、日期、消息引用和请求键，原样重试；站主可在明确的重复风险提示后放弃核对并用新键编辑。明确的 4xx 拒绝解除冻结。会话详情补规则兜底/待核对、成员切换及首页范围文案。
- 首页小影关闭气泡使用 `inert`，宠物按钮声明展开状态；从气泡内关闭时焦点回宠物按钮。失去当前公开成员的历史回答只展示安全占位，不显示原文/引用，也不冒充固定回答。

## 红绿证据

| 行为 | RED | GREEN |
|---|---|---|
| 审计写入失败 | 隔离 SQLite 触发器使审计失败后仍留 1 条 Action，断言预期 0 条失败 | 同事务提交后相同测试通过，Action 与审计均不残留 |
| 结果不明重试 | UI 测试找不到“结果未确认”和“原样重试” | 冻结原 payload 同键重试、明确放弃换键、4xx 解锁的 4 个测试通过 |
| 会话文案 | 首页详情仍显示技术范围 `site-public`，规则降级显示“尝试状态未知” | 实际状态与成员事件形状的详情测试通过 |
| 收起/历史边界 | 关闭气泡没有 `inert`，隐藏历史回答不显示占位 | 首页组件 21 项与文章助手相关测试通过 |
| 浏览器关闭焦点 | 点空白处时浏览器在 `pointerdown` 后将焦点移到页面，原先立即聚焦宠物被覆盖；增强回归测试复现失败 | 事件结束后仅对非交互目标恢复宠物焦点；回归测试与真实浏览器均通过 |

## 数据与迁移证据

- `pnpm verify:deploy --drill`：25 条迁移在隔离库全部应用，45 张表的备份与回退往返一致。
- 隔离重复键样本运行 `pnpm db:migrate` 被迁移前检查拒绝；样本仍为 2 行，未创建 `_prisma_migrations`。
- 本地开发 SQLite 在迁移前完成一致性备份，`integrity_check=ok`、非空请求键重复组 0；随后只应用 `20260929110000_conversation_action_audit_key` 成功。备份位于 `/tmp/walker-dev-before-conversation-audit-1790651404.db`，未读取或覆盖生产库。

## 最终门禁

`pnpm typecheck` 通过；`pnpm test:shared` 378/378、`pnpm test:api` 716/716、`pnpm test:web` 237/237、`pnpm test:agent` 30/30、admin 89/89。`pnpm build:api`、`pnpm build:admin`、`pnpm build:web`、`pnpm verify:geo`、`pnpm verify:docs`、`pnpm verify:architecture`、`pnpm verify:deploy`（K0 15/15）、`pnpm verify:deploy --drill`（K6）及 `git diff --check` 均通过。API 回归运行在独立 `walker.test.db`。

本地浏览器复核：后台会话详情显示“全站公开内容／首页小影／规则兜底”；首页小影收起时 `inert=true`、`aria-hidden=true`、宠物按钮 `aria-expanded=false`，展开后输入获得焦点，点空白关闭后焦点回到宠物按钮。390px 手机视口 `scrollWidth=innerWidth=390`，展开不会自动聚焦输入框；长回答仍在气泡内部滚动。未执行生产部署或生产数据写入。
