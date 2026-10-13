# G06.R · 内容发布与编辑边界审查修复

日期：2026-09-27。范围：上一轮七项代码审查问题及同一状态边界所需的条件更新、运行中核对和进程退出证明。仅本地代码；未推送、未部署、未调用真实发布远端。

## 目标与实现

1. API、手工脚本使用同一发布锁。API 将锁路径和随机标识仅通过子进程环境交接；脚本验证父锁后接续 PID 持有权，手工运行独立取锁。锁过期但持有者仍活着时不得接管；两个恢复者由排他 `.recovery` 文件串行化，恢复过程中正本写入仍被拦截；进程树退出未证实时保留锁。生产锁配置在 `C:/Walker/data/content-publish.lock`，手工脚本从 API `.env` 读取此路径。
2. 管理执行 API 必带 `releaseId`。文件 hash、公开投影 hash、发布目标、批准绑定与显式 L2 授权在持锁后复检；授权撤销与 `PREPARED → COMMITTING` 在同一 SQLite 事务排序，状态更新按旧阶段条件写入。站主仍可手工批准，不强制创建 Agent 授权。
3. `COMMITTING` 包含 commit/push。脚本派发后的取消、异常退出、超时或退出未证实保持 `UNKNOWN`；运行中核对等待进程退出，本地 commit 不冒充远端 push。只有派发前确定失败记 `FAILED`，线上目标 hash 才能确证 `PUBLISHED`。
4. `graph.json` 随内容提交；带 Git 构建标识的公开 manifest 不再进 Git。网页版本取最近一次 `PUBLISHED`，新版本可再次批准，工作文件 hash 与公开投影 hash 不混比。Admin 使用 data router 阻断站内导航/后退丢草稿，刷新仍由 `beforeunload` 保护。

## RED → GREEN 证据

| 行为 | RED（修复前） | GREEN（修复后） |
|---|---|---|
| 活进程超期锁 | 测试发现第二持有者接管了过期但活着的 PID | 跨进程锁测试通过；正本保存仍返回 `content-locked` |
| 发布单与授权 | 无 `releaseId` 的 HTTP 请求返回 201；不存在的显式 grant 也返回 201 | 两者分别拒绝；批准后改正文、撤销授权均不派发脚本 |
| 取消与结果不明 | `COMMITTING` 取消返回已安全失败；非零退出进入 `FAILED`；本地 commit 被当作推送成功 | 取消/异常保留 `UNKNOWN`；运行中核对不误判中断；未证实退出不释放锁 |
| 再次批准与草稿 | 已有历史批准时按钮消失；侧栏跳转直接丢草稿 | 新版本可再批准，旧单不可执行；侧栏与后退均弹确认，取消保留草稿 |

## 验证口径

- RED 在实现前逐项确认：过期活锁被接管；无发布单和无效授权被放行；`COMMITTING` 取消或非零退出误记失败；本地 commit 被误判为推送成功；新版本无法再次批准；站内导航直接丢草稿；退出未证实时退出码 0 被误认成功。
- GREEN：`pnpm typecheck`；`pnpm test:shared` 48 文件/376 项；`pnpm test:api` 141 文件/706 项；`pnpm test:web` 40 文件/227 项；`pnpm test:agent` 5 文件/30 项；Admin 17 文件/80 项，全部 0 失败。API 测试使用隔离 `walker.test.db`，未指向开发库。运行器退出证明为必填合同，遗漏证明在类型检查中直接失败。
- 构建与门禁：`pnpm build:api`、`pnpm build:admin`、`pnpm build:web`（内含 `verify:architecture` 与 GEO）、`pnpm verify:docs`、`pnpm verify:deploy` 15/15 全过。Web 构建前备份并在结束后恢复原有生成文件，避免覆盖既有未提交资产。
- 脚本零推送实跑：`pnpm content:publish --json` 返回 `exitCode=0` 与一行结构化报告；内容路径无未提交变更。该次运行未传 `--commit`/`--push`，生成文件在结束后恢复原字节。
- 目标服务器上的部署/恢复脚本、远端 Git push 与生产网页版本仍由 G07/G08 逐项核验；本报告不将本地假 runner 视为生产发布证明。
