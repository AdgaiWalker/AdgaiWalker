# Agent 基础首段本地验收

2026-09-22。范围 R01–R09；原子进度仅维护根 `to-do.md`。未部署，模型执行、公开位置、内容写入和发布仍未接通。

## 已实现的行为

- SQLite 使用版本迁移。旧 PostgreSQL 物料仅归档；空库 `db:migrate`，原有库经结构核对后 `db:baseline` 标记基线并执行后续迁移。库路径必须为绝对 `file:`，历史 checksum、连续性、完整性、外键及实际 schema 漂移均检查。
- AgentRevision、ExecutionRun、AuthorizationGrant、AuditRecord、Outbox 已建表；Agent 归档保留历史，旧 AgentRun 外键改为 Restrict，计量未知保留 null。运行另存准入对象范围，缺范围的历史父运行不能派生子任务。
- 执行仓储支持幂等提交、原子领取、租约续期和状态 CAS；旧 epoch 与终态后的完成回执不能覆盖取消。
- 审计与业务状态在同一 SQLite 事务内提交。Outbox 消费者仅允许本地数据库效果，与投递标记同事务；最多五次失败进入可查死信。未注册业务消费者或定时派发，不宣称网络/文件外部效果恰好一次。
- Agent 配置保存生成不可变版本；历史角色显式导入版本 1，重复导入不增版本。技能文件仅通过显式导入/导出 API，不在保存时同步写盘。旧 POST /agents 与 DELETE /agents/:id 退役。
- 工作台可创建、编辑、查看历史及并排比较提示词；模型来自供应商目录并在服务端校验，当前工具 profile 固定只读。无供应商时仅保存默认模型草稿。
- 授权明确动作、对象、Agent、期限及调用/用量上限。L2 单次，L3 仅提醒；修改不会自动获得发布。来源与主体由服务端构造，撤销幂等，公开来源不能使用后台 grant。
- AgentExecutionService.preflight 统一检查来源、只读 profile、事项和内容索引策略；父子不能换归属、扩大对象或提升来源。preflight 仍只做策略检查。其后的 R12 已在同一 SQLite 事务里领取并预留额度；HTTP 提交仍属 R15。

## 复用依据

- Paperclip `server/src/services/approvals.ts`，已调查提交 `846336e5a0d3003e1b938e8c983aa5a65bda81ff`，MIT：参考条件 UPDATE RETURNING 与幂等返回语义，实现 Prisma SQLite CAS；没有整体复制其 PostgreSQL 存储层，也未引入平台运行时。
- Refine 5.0.12 的资源查询与共享 QueryClient 继续负责列表/详情；写请求走同一 HTTP 客户端。Vite 使用与 web 相同的 shared 源码别名，解决工作区 CommonJS 构建不能直接导出运行时常量的问题。
- Harness 仍使用已安装的 SDK 0.1.5-rc.2。R10 工厂环境和工具隔离尚待实施，不能把旧 read-only 环境变量视为完整隔离。

## 自动化证据

- `prisma-migration.integration.test.ts`：临时新库重复迁移、旧行保留、旧 Agent 历史不级联、唯一键、漂移拒绝；从基线自动升级全部增量。
- `prisma-agent-execution.repository.test.ts`：真实 Kernel，重复请求、竞争领取、旧 epoch、停止与迟到结果。
- `operations-journal.integration.test.ts`：审计冲突回滚运行及 Outbox；消费失败效果回滚，重复派发只产生一次效果，五次失败可查。
- `agent-catalog.integration.test.ts`：真实 AppModule + 独立迁移库 + HTTP 鉴权；版本保持、重复导入、模型校验、旧写路由退役；审计失败无半条 grant；重复撤销；执行前伪造来源/换主体/换 grant/隐藏对象/扩大子范围全部拒绝。
- shared `agent-execution`、`authorization`、`execution-policy` 测试：未知字段、状态终态、来源上限、授权模板与策略交集。
- 修复旧文件 runner 的实测竞态：完成回执前等待 trace 流 finish，防止返回成功时完成事件尚未写完。

全仓类型、shared/API/web/agent/admin 测试与 API/admin 构建的最终结果写入下方验证记录；不能用旧 F 阶段 fingerprint 当作本次代码证据。

## 浏览器证据

沿用隔离 `framework.db` 和临时内容副本，API 127.0.0.1:8788、Vite 127.0.0.1:5174，无密码、AI 关闭。现有开发库与生产未改。

通过 UI 创建“修订验收 Agent”，版本 1 提示词“只读检查文章结构，给出中文建议。”；编辑为版本 2“只读检查文章结构，先列证据再给建议。”；刷新后仍展示两版和各自原文，列表/详情使用实际 SQLite 数据。配置摘要分别为 `5717f256dec5d53b1bd40c888f2486b8c4348212933ea2848beb0581985234ec`、`2e94ff227d5542ffc9a4b31216bed11431d8cf8f53ec07349d4a7f7e88415c8b`。

## 后续边界

R10 起收敛 Harness 环境和工具 profile，再接 SDK、队列、停止恢复和试跑。现存 LLM_CLIENT 与旧工作站写路径仍需按 R18/C 批次收口。未运行模型、未上线、未改生产鉴权。

## 最终验证记录

2026-09-22：`pnpm typecheck` 通过；shared 259、API 248、web 212、agent 26、admin 15，共 **760 项测试通过**；`pnpm build:api`、`pnpm build:admin` 通过。执行日志 `/tmp/walker-r09-validation.log`。本批未改访客 web 实现或内容，无生产部署。
