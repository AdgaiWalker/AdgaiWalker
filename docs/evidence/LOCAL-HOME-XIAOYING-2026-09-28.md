# 首页小影布局与后台模型本地验收（2026-09-28）

范围：当前未提交工作区、开发 SQLite 和本地浏览器；**未提交、未推送、未部署生产**。沿用原首页卡片、Dora 头像与现有影鳐资产，没有生成新图片。G07/G08 上线门槛不变。

## 实施与可见结果

- 小影气泡贴在可见影鳐上方，最大高度 16rem，长回答在气泡内部滚动；拖动小影时气泡仍随同一容器移动。手机 390×844 浏览器截图复核：`scrollWidth = innerWidth = 390`，气泡底部邻接影鳐，输入框仍可见。
- 新增 `home-xiaoying/site-public` 位置。首页从公开 manifest 取得当前部署成员与代次，再经现有 `/assistant/stream` 提问；后台部署页将该位置的范围固定为 `site-public`。服务端只把已核验、`citable` 的公开快照交给只读 Agent，不引入第二套内容索引。
- 开发库创建小影 v1（模型连接为 `deepseek-official / deepseek-flash`），三类发布权限测试通过后，部署 `dep-home-xiaoying-local-20260928` 已在本地启用（generation 2）。公开 manifest 返回 `available:true`、`aiEnabled:true`、小影 v1。真实浏览器提问得到 `AI 回答` 和可点击文章引用。
- 本地模型连接测试通过（217ms）。`pnpm probe:runtime` 最初发现脚本读取已退役的凭据文件；改为读取 dsh 原生 `credentials.env` 后，隔离探针真实回答、SHA-256、正常关闭及进程退出均通过。脱敏结果在 `runtime-probe.json`。忽略的本机 `apps/api/.env` 指向该报告，并将内存余量采样门槛设为 0MB，以适配本机空闲内存读数偏低；生产默认 512MB 未改。
- API 重启后不再把数据库里的旧 SDK session 直接交给新运行时（曾出现 `session already exists`）；未在本进程绑定的旧 session 用完整核验公开资料新建。访客业务时间线保留，但该次模型上下文从公开资料重新开始。气泡把历史固定回答标为历史，本轮失败时不再把上一轮回答当作本轮答案。
- 首页位置的交互事件通过全站范围校验；SSE 已到浏览器但服务端 `finish` 稍晚时，ACK 只对 `assistant-message-not-sent` 做短暂重试。最终浏览器复测的 API 状态为事件 `201`、问答 `200`、ACK `201`，没有本轮 `404/409`。

## 红绿证据

| 行为 | RED | GREEN |
|---|---|---|
| 首页位置事件 | `recordInteraction` 把 `site-public` 当文章 slug，返回 404 | 复用 `placementContentAvailable`；对应单测通过 |
| API 重启后的模型会话 | 真实运行时返回 `session already exists`，页面退回固定回答 | 旧 session 改用完整公开上下文新建；适配器回归测试与真实浏览器回答通过 |
| ACK 竞态 | SSE `done` 到达后立即 ACK 返回 409 | 仅对未标记 sent 的 409 重试；单测与浏览器日志通过 |
| 失败轮展示 | 新问题失败时仍显示上一轮固定回答 | 当前问题与回答按轮次配对；组件测试通过 |
| 旧固定回答辨识 | 部署启用后旧历史仍写“当前 AI 未启用” | 气泡固定显示当前小影版本，旧回答标“历史固定回答” |

## 门禁与边界

`pnpm typecheck` 通过；`pnpm test:shared` 378/378、`pnpm test:api` 712/712、`pnpm test:web` 233/233、`pnpm test:agent` 30/30、admin 83/83；`pnpm build:admin`、`pnpm build:web`、`pnpm verify:geo`、`pnpm verify:docs`、`git diff --check` 通过。API 测试在隔离的 `walker.test.db` 运行。

浏览器以 `http://127.0.0.1:5173/` 验证桌面与 390px 手机视口。真实问题“推荐一篇 Dora 的 AI 入门文章，并说明推荐理由。”由小影 v1 输出 AI 回答，引用《CC入门》和《Codex入门》。桌面/手机均保留原首页卡片。生产公共位置未开启；本机 probe 与 0MB 覆盖不能作为 G08 生产验收凭据。
