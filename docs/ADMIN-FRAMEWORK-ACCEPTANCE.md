# 新后台框架本地验收 · 2026-09-22

仅对应 `to-do.md` 的 F01–F18。框架在本地完成；Agent 运行、公共位置、编辑、发布、授权、提醒与访客日志继续按 R/V/C/O/G 实施。没有部署、没有开启新写能力。

## 基线与范围

- 起点 HEAD：`9e738b1`，工作区原有 **194** 条 Git 状态记录，涵盖 admin 清空、API/共享规则/图谱改动及未跟踪设计文档。未 reset、clean、stash 或恢复旧后台。
- 进入任务时已有 React mount、HTTP/auth/dataProvider、部分布局、operations 读侧合同；缺路由、页面、样式和验收。基线 `pnpm typecheck` 因缺少 `apps/admin/src/app/router.tsx` 失败。
- Node `24.18.0`、pnpm `9.15.0`；React/DOM `19.2.7`、Vite 实际安装 `6.4.3`、Refine `5.0.12`、assistant-ui `0.15.21`、Vitest `3.2.7`。Harness SDK/runtime 均为 `0.1.5-rc.2`，本批没有调用模型或升级 web 依赖。
- `pnpm install --frozen-lockfile` 通过。沿用工作区已固定的依赖，本批不重新选择库版本。
- 联调库是系统临时目录中的独立 `framework.db`，仅建立现有 SQLite schema；不复制开发/生产数据库，不含真实访客、凭据或运行记录。29 篇内容仅复制到临时 `content` 目录只读浏览；验收后逐文件字节比对正本全部不变。
- 现有本地 `apps/api/data/walker.db` 没有 AgentUnit 表，不擅自升级。浏览器如实展示 Agent/运行空态；带行的归属、分页、成功/失败、输入输出验证在隔离 Kernel 集成测试完成，不向产品页面注入演示记录。
- 精确代码指纹：`08a66da5fff30624262eb0948cd1f8ebf13aef50c2d64ba38d3c3225a250de22`。文件清单见 [code-fingerprint.json](../output/admin-framework/code-fingerprint.json)。该指纹不包含文档和构建产物，可用清单逐文件复核。

## 已交付行为

- `/` → `/overview`，四主面为概览、内容、Agent、运营记录，设置在底部；未知路由显示 404。新详情路由 `/content/:slug`、`/agents/:id`、`/records/runs/:id`。不恢复旧路由兼容表。
- 单一 HTTP 客户端处理代理前缀、JSON、HTML 错误、超时、取消、请求编号和 401；管理凭据仅当前页面内存持有。锁定/401 清除私有查询缓存并取消在途请求，迟到旧响应不进入新会话。
- Refine 真实 dataProvider 管理内容、Agent、历史运行的查询；服务端分页返回真实 total。创建/修改/删除操作明确拒绝。
- 内容列表读取文件/Git，支持标题/标识搜索、真实类型筛选；旧 `live` 仅显示“Git 已同步”，不承诺线上版本。详情有消毒后的 Markdown 预览和原文/元数据，不执行 MDX 或内嵌脚本，不触发内容生成。
- 新 `/ops/agents` 直接读仓储，避免旧 `GET /agents` 自动创建默认角色；只投影角色/模型/系统标识/更新时间，不暴露 prompt、provider 凭据。
- 新 `/ops/runs` 提供历史 AgentRun 的分页、Agent 归属筛选及详情。旧 0 用量/耗时没有可靠测量证据，保留 null；版本、交付确认为 null，轨迹标未知。列表不载入输入输出长文本。
- capabilities 检查真实内容/角色/运行读用例，不以数据库 ping 代替可用性；所有新执行、部署、修改、发布、访客会话、提醒能力均未接入。

## 自动验证

| 命令 | 最终结果 |
|---|---|
| `pnpm typecheck` | 全仓通过，包含脚本 |
| `pnpm test:shared` | 26 文件 / 252 项通过 |
| `pnpm test:api` | 46 文件 / 241 项通过 |
| `pnpm test:web` | 37 文件 / 212 项通过 |
| `pnpm test:agent` | 4 文件 / 26 项通过 |
| `pnpm --filter @walker/admin test` | 4 文件 / 15 项通过 |
| `pnpm build:api` | 通过 |
| `pnpm build:admin` | 通过；主 JS 约442 KB，正文预览按需块约70 KB，无大包提示 |

共 **746 项测试**。本批未改访客 web 或内容，也未改架构抽取/MCP，因此不新增 web 构建/GEO 或架构抽取门禁范围。最终通过时间为本地 2026-09-22 11:17–11:18；原始本机命令日志位于 `/tmp/walker-framework-evidence/`（临时证据，持久结论以本报告和代码测试为准）。

针对性证据：

- `apps/admin/src/api/http.test.ts`：200/401/409/503、HTML/坏 JSON、断网、超时、主动取消、迟到401、清缓存。
- `apps/admin/src/api/data-provider.test.ts`：真实 total/分页、Git可用性、空数据、错误透传与写操作拒绝。
- `apps/admin/src/components/MarkdownPreview.test.tsx`：脚本、事件属性、javascript 链接、主动嵌入、外部图片不执行/加载。
- `apps/api/src/operations/operations.kernel.integration.test.ts`：真实 AppModule/KernelModule + SQLite，匿名拒绝、Basic 可用、不创建默认角色、能力失效、Agent归属、分页、未知计量、正文读取、404。
- `apps/admin/src/test/assistant-runtime-probe.test.tsx`：真实 assistant-ui `useLocalRuntime` + Provider，受控 SSE 拆帧、text.delta 累积、done.answer 覆盖、取消/缺done断流均为非成功终态。探针只在测试中，不接公网/模型，不解释为进程停止已验证。

## 浏览器实测

地址：`http://127.0.0.1:5174`；API：`127.0.0.1:8788`。使用隔离联调库和真实内容副本。

| 场景 | 实测 |
|---|---|
| 概览 | 29篇内容、0个Agent、0条运行，数字可下钻，来源与读取时间可见 |
| 内容筛选 | 全部29条；项目5条；不存在关键词显示0/29匹配，不假装数据库空 |
| 详情 | DoraZoom项目、419a2f文章均读到真实正文；原文模式含真实frontmatter |
| 深链刷新/前进后退 | 刷新清掉内存凭据；重新验证回到原详情，返回/前进正常 |
| 鉴权 | 缺凭据/错误凭据均保持锁定，未读取私有列表；JSON 401不触发原生 Basic 弹窗 |
| 空库/空目录 | Agent和历史运行真实空态；临时切为空目录显示0/0，恢复后重新读取29条 |
| 服务中断 | 关闭本次联调API，列表显示连接失败与重试，概览数量变“不可用”而不是0；重启后恢复29/0/0 |
| 未接入资源 | 访客对话/授权/提醒说明性空态，设置显示真实能力表，无假开关 |
| 未知路由 | 鉴权后显示404与返回概览入口 |
| 响应式 | 1440×1000、390×844、320×800视口可用；扣滚动条后的1425/375/305宽度均无页面横向溢出，表格容器可横滚 |
| 最终控制台 | 内置浏览器未发现 error/warn；按需详情加载验证通过 |

[桌面验收截图](../output/admin-framework/overview.png)。沿用工作区概念图的颜色、导航和内容分区；实际数据替换设计占位。

Ego浏览器能读取DOM，但截图连续 `Page.captureScreenshot` 超时；改用 Codex 内置浏览器完成实际点击、截图、响应式验收。该工具故障不算应用失败。

## 遇到的问题与决定

1. **SQLite新文件初始化**：当前 Prisma 引擎对不存在文件的 `db push` 返回空 Schema engine error；先创建空文件后成功。测试 globalSetup 固定先独占创建空文件，再建 schema；测试 URL 拒绝非 file、相对路径和非 `.test.db` 文件。不引入 PG 兼容，也不把这项修复当作 R01 版本迁移完成。
2. **401 Basic挑战**：JSON请求交由页面处理401，普通导航保留 Basic挑战；认证条件仍相同。对应中间件新增行为测试。
3. **旧读接口副作用**：使用新只读投影，避免自动创建默认角色；历史记录继续来自同一 AgentRun 表，不双写、不造新数据库模型。
4. **assistant-ui探针**：Runtime必须挂载Provider；异常需用结构化 incomplete/error 或 cancelled 状态承载，直接抛出会成为未处理拒绝。适配后测试通过，无需回退库。
5. **既有随机失败**：`code-graph.test.ts` 的确定性测试遗漏了显式时间输入，两次生成相差1毫秒导致失败；仅为该测试补固定 `now`，未改图谱实现或放宽断言。
6. **原有工作区空白警告**：全局 `git diff --check` 仍报告既有 `next-actions.test.ts` 末尾空行；不修改无关用户改动，本批路径检查无新增空白错误。

## 重新建立隔离联调环境（macOS）

2026-09-22 站主补充：本地工作台暂不需要密码。使用既有开发模式（空 `WALKER_ADMIN_TOKEN`），仅监听127.0.0.1；生产强制鉴权逻辑保持原状。

在仓库根目录执行以下命令；每次生成全新的临时目录，不读写站主开发库或生产库。已有服务占用8788/5174时先关闭对应开发进程。

```bash
pnpm install --frozen-lockfile
pnpm build:shared
framework_root="$(mktemp -d /tmp/walker-framework.XXXXXX)"
mkdir "$framework_root/content"
cp content/log/*.md* "$framework_root/content/"
touch "$framework_root/framework.db"
export DATABASE_URL="file:$framework_root/framework.db"
export WALKER_DB_PROVIDER=sqlite
export CONTENT_LOG_DIR="$framework_root/content"
export WORK_ROOT_DIR="$framework_root/works"
export AI_ENABLED=false
export CONTENT_GEN_ON_SAVE=false
export WALKER_ADMIN_TOKEN=""
pnpm db:generate
pnpm --filter @walker/api exec prisma db push --schema prisma/schema.prisma --skip-generate
pnpm --filter @walker/api dev
```

另一个终端运行 `pnpm dev:admin`，打开 `http://127.0.0.1:5174`，按站主最新要求，本地联调暂不设置管理密码，打开和刷新均直接进入。需要复测鉴权时再显式设置临时 `WALKER_ADMIN_TOKEN`；上文鉴权验收记录保留为已执行证据。R01 后根 `pnpm dev:api` 已取消隐式改库。新空库先 `db:migrate`，原有未标记库先 `db:baseline` 核对基线并应用增量；所有命令显式指向独立库。本文保留 F 阶段历史证据，后续见 [Agent 基础验收](AGENT-CORE-ACCEPTANCE.md)。

若使用自己准备的测试库，`API_TEST_DB_URL` 必须是绝对路径 `file:/.../name.test.db`；测试会重建这个独立文件。框架联调库和测试库必须分开。
