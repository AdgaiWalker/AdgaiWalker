# 新后台开源项目选型调研

调研日期：2026-09-22。对应 [PRD v0.2](PRD-AGENT-OPERATIONS.md)。使用 GitHub 插件查询仓库、许可证、源码与提交记录，并通过网络搜索补充候选发现。

**结论：完整 Agent 管理产品优先研究 Paperclip；现有项目首期落地优先评估 Refine + assistant-ui，并继续使用现有 Nest、内容发布链与 DeepSeek Harness。Harness 自身模块是运行与日志复用的第一检查对象，Langfuse 是日志产品参考。**

2026-09-22 框架探针结果：Refine 5.0.12 已用于真实只读 dataProvider；assistant-ui 0.15.21 的自有 SSE Runtime 探针通过（text 增量、done覆盖、取消、断流），暂不进入产品调用链。版本与证据见 [框架验收](../evidence/ADMIN-FRAMEWORK-ACCEPTANCE.md)。其余选型仍是建议，未部署或引入整套平台。

## 1. 筛选依据

优先满足本站已确认的需求：文章/项目等内容管理，后台创建并部署 Agent 到前台位置，多 Agent 调用与监督，按具体事情授权，访客对话和日志回看。前台 AI 永远不得写站主内容。

同时考虑现有条件：

- 前台为 React 19 + Vite，后台是已清空的 Vite 入口；服务端为 Nest + Prisma + SQLite。
- 内容原文仍以 `content/log` 为唯一真相源；保存、发布、上线核验有现有语义。
- Harness SDK 本地声明版本为 `0.1.5-rc.2`。不能把支持 DeepSeek 模型等同于接入 DeepSeek Harness SDK。
- 现行服务器是 Windows 2C2G；项目规范限制额外数据库、多个服务及外部监控栈。整套平台迁入通常会改变这些条件。
- 本次按功能匹配、接入成本、许可证边界及近期维护信号筛选，未以星标数作为排序依据。

## 2. 候选排序与采用方式

| 项目 | 类型 | 最适合复用的部分 | 对本站的主要缺口 | 建议 |
|---|---|---|---|---|
| **Paperclip** | 完整 Agent 管理应用 | Agent、目标/任务、周期唤醒、预算、审批、运行与操作记录 | 无现成的本站内容发布和前台服务位置模型；需要 Harness adapter；引入 PostgreSQL 与自身服务 | **产品功能最接近；整套二开首选研究对象，首期以局部借鉴为主** |
| **Refine** | React 后台开发框架 | 内容/Agent/日志列表、表单、筛选、数据与权限接口 | 不提供 Agent 运行器、业务授权和实际日志存储 | **现有后台工程底座首选候选** |
| **assistant-ui** | React 对话组件与适配接口 | 访客问答、后台调试、会话回看、流式呈现、反馈 | 需要接本站 API；对话存储、权限与行为采集仍由本站完成 | **前台问答与后台对话界面首选候选** |
| **DeepSeek Harness 自带 Web/会话模块** | 当前运行时的上游模块 | 原生会话呈现、运行事件、会话查询、临时审批交互 | 与 Cordis、Host Remote、会话投影等内部机制耦合；不是现成 CMS | **优先复用运行/查询能力，界面按需借鉴** |
| **Langfuse** | AI 观测应用 | session/trace 关联、输入输出、耗时/token、反馈与检索视图 | 不管理内容发布或业务权限；整套自托管组件较多 | **日志产品参考；首期不新增整套部署** |
| **CopilotKit** | Agent 与应用交互框架 | AG-UI、动态界面、共享状态、人工介入交互 | 当前只读问答不需要多数能力；Harness 需协议桥接 | 后续需要更复杂前台协作时评估 |
| **react-admin** | React 后台框架 | CRUD、筛选、表格与博客/电商管理示例 | 同样缺 Agent 业务层；默认 Material UI，部分扩展是商业产品 | Refine 的备选，二者不同时引入 |
| **Dify** | AI 应用平台 | 应用配置、发布、工作流和日志的产品参考 | 自有运行体系、资源要求与前端许可限制 | 不作为本次二开底座 |
| **Flowise** | 可视化 Agent/流程平台 | 历史流程编辑、嵌入聊天设计 | 官方仓库已归档；部分代码有商业许可例外 | 排除新项目首选 |

以上判断来自下文各项目的一手证据；“首选”表示适配本站的判断，不是通用排行榜。

## 3. Paperclip：最接近目标产品，但不是可直接换皮的后台

[项目 README](https://github.com/paperclipai/paperclip/blob/846336e5a0d3003e1b938e8c983aa5a65bda81ff/README.md)介绍了自带 Agent 的管理、目标任务、预算、周期工作和治理能力。已进一步核对 [审批 service](https://github.com/paperclipai/paperclip/blob/846336e5a0d3003e1b938e8c983aa5a65bda81ff/server/src/services/approvals.ts)、[adapter 接口入口](https://github.com/paperclipai/paperclip/blob/846336e5a0d3003e1b938e8c983aa5a65bda81ff/server/src/adapters/types.ts)和 [UI 依赖](https://github.com/paperclipai/paperclip/blob/846336e5a0d3003e1b938e8c983aa5a65bda81ff/ui/package.json)；它确有实现资产，不仅是一份路线图。

最值得借鉴：

- Agent 详情将状态、当前任务、调用与运行结果放在一起。
- 任务、运行、审批分成不同对象；任务完成不等于某次模型输出结束。
- 周期唤醒、预算停止、运行历史与操作记录可以对应本站的更新提醒与监督需求。
- 审批解析包含状态条件与重复决议处理，可作为本站幂等设计的参考，但不代表它已满足文章候选 hash 绑定规则。

**Harness 接入是可扩展方向，尚未验证。** [创建 adapter 文档](https://github.com/paperclipai/paperclip/blob/846336e5a0d3003e1b938e8c983aa5a65bda81ff/docs/adapters/creating-an-adapter.md)提供执行上下文、结果、会话状态及日志适配机制。已核查的内置列表未见 DeepSeek Harness 专用适配器。可开发独立 adapter 调用 Harness SDK，映射会话、事件、用量与终态；[通用 HTTP/process adapter 的反馈较粗](https://github.com/paperclipai/paperclip/blob/846336e5a0d3003e1b938e8c983aa5a65bda81ff/docs/adapters/overview.md)，不能把“HTTP 能接通”当作完整监督接入。

整套采用的代价：

- [数据库文档](https://github.com/paperclipai/paperclip/blob/846336e5a0d3003e1b938e8c983aa5a65bda81ff/docs/deploy/database.md)使用 PostgreSQL + Drizzle，默认嵌入式 PostgreSQL也不是 SQLite；[服务端依赖](https://github.com/paperclipai/paperclip/blob/846336e5a0d3003e1b938e8c983aa5a65bda81ff/server/package.json)是自身 Express 服务，与本站 Nest/Prisma 不同。
- UI 当前要求 Node >=24.11，并采用较新的 React/Vite 工具链；不能假设直接复制就与本站依赖兼容。
- 产品强调组织、公司、汇报关系；本站是一人经营内容，需要裁剪这些概念。
- 本站的前台服务位置、访客隔离、内容知识范围、只读上限、Git 发布与日志保留仍需实现。
- Windows 与现有 2C2G 上的可用性/内存尚未实测，不能直接承诺迁入生产。

许可证：[MIT](https://github.com/paperclipai/paperclip/blob/846336e5a0d3003e1b938e8c983aa5a65bda81ff/LICENSE)。使用代码时保留其许可与版权信息，具体子目录及依赖另核查。

**选择条件：** 如果愿意以 Agent 任务管理为产品中心，并接受运行拓扑与数据库调整，它是最有价值的整套二开候选；若保留现有架构与首期轻量范围，则先借鉴 Agent/任务/审批/活动日志的设计，避免同时维护两套内容事实。

## 4. Refine：最适合重建当前管理界面

[README](https://github.com/refinedev/refine/blob/2352eb5b6539e2f39ad9aef652279ad1dcf2c467/README.md)明确提供 headless React 后台能力、数据适配、认证与访问控制等接口。适合内容台账、Agent 配置、日志检索和运营事项管理；可沿用自己的视觉与导航。

接入方式建议：

1. 用 data provider 对接本站现有 API，处理其分页、筛选和错误结构。
2. 保留发布、审批、启停等业务动作的独立接口；不要把它们退化成通用“更新一行”。
3. 前端 access control 控制展示；实际权限仍由 Nest 执行。
4. 日志 UI 可以利用相关 hooks，但权威审计必须在服务端产生。[官方 audit provider 文档](https://github.com/refinedev/refine/blob/2352eb5b6539e2f39ad9aef652279ad1dcf2c467/documentation/docs/audit-logs/audit-log-provider/index.md)也明确建议在 API 端记录审计。

已有 NestJS 连接器不保证适配本站定制 REST 契约，需要自己的薄适配层。Refine 不会自动给我们 Agent 调度、日志数据库或 L0–L3 授权。

许可证：[MIT](https://github.com/refinedev/refine/blob/2352eb5b6539e2f39ad9aef652279ad1dcf2c467/LICENSE)。采用库与合适示例即可，不必 fork 其整个大型 monorepo。

## 5. assistant-ui：把前台服务与后台回看共用起来

[README](https://github.com/assistant-ui/assistant-ui/blob/9b902faaa1984c55056aebdbdbdaee2b159d834e/README.md)提供消息、输入框、线程列表、流式呈现、重试与反馈等组件。关键优势是可以连接自有后端：[自定义 runtime 文档](https://github.com/assistant-ui/assistant-ui/blob/9b902faaa1984c55056aebdbdbdaee2b159d834e/apps/docs/content/docs/runtimes/custom/overview.mdx)提供 LocalRuntime、ExternalStore 等路径；不必为了使用 UI 改成另一家模型 SDK。

拟议接入：`assistant-ui → 本站 API/SSE → Nest 权限与日志 → Harness SDK`。

- 同一套消息呈现可服务文章旁问答、后台 Agent 测试及访客对话详情。
- 使用自有历史适配器对接业务消息库；[持久化 adapter](https://github.com/assistant-ui/assistant-ui/blob/9b902faaa1984c55056aebdbdbdaee2b159d834e/apps/docs/content/docs/integrations/persistence/custom-adapter.mdx)是接入点，不等于已经替我们保存了对话。
- 现有 SSE 裁剪文本和最终 done 覆盖语义需要适配；UI 的停止按钮必须遵循后台实际终止结果。
- 对话身份校验、页面/内容归因、删除和导出仍由业务层完成。
- 不向访客启用写入前台动作、后台审批或任意工具能力。

许可证：[MIT](https://github.com/assistant-ui/assistant-ui/blob/9b902faaa1984c55056aebdbdbdaee2b159d834e/LICENSE)。README 提到的可选托管线程与分析服务不列入本站首期依赖。

## 6. Harness 自身：最不能忽略的已有资产

上游 [Web app](https://github.com/deepseek-ai/deepseek-harness/blob/ddefc45fbc7f8e46dd73185e68295696d1297887/packages/bundle/web-app/README.zh.md)已有聊天、模型设置、会话历史及按会话组合 Agent 的能力。应优先核查这些模块，避免重写底层日志读取逻辑：

| 模块 | 可复用价值 | 边界 |
|---|---|---|
| [ui-chat](https://github.com/deepseek-ai/deepseek-harness/blob/ddefc45fbc7f8e46dd73185e68295696d1297887/packages/client/ui-chat/README.zh.md) | 已记录会话呈现、过程折叠、用量与历史窗口展示 | 依赖 Harness 会话投影与多个客户端插件 |
| [ui-approval](https://github.com/deepseek-ai/deepseek-harness/blob/ddefc45fbc7f8e46dd73185e68295696d1297887/packages/client/ui-approval/README.zh.md) | 工具权限请求的批准/拒绝交互 | 面板只提供临时决定，持续权限由 Host 负责 |
| [session-query](https://github.com/deepseek-ai/deepseek-harness/blob/ddefc45fbc7f8e46dd73185e68295696d1297887/packages/session-query/session-query/README.zh.md) | 会话/事件读取、过滤、关系追踪；后端提供全文搜索 | 是运行时内部服务；不能假设现有 stdio SDK 已暴露全部查询接口 |

重要区别：**上游完整 Web/Host 有审批能力，不等于本站当前安装的 stdio SDK 支持相同的交互审批协议。** 本次查到的 [ui-chat 包](https://github.com/deepseek-ai/deepseek-harness/blob/ddefc45fbc7f8e46dd73185e68295696d1297887/packages/client/ui-chat/package.json)为 `0.1.6-alpha.2`，且开发依赖 React 18 与多个 Cordis 客户端服务；本站为 React 19、SDK 声明为 `0.1.5-rc.2`。不能直接承诺兼容，也不据此自动升级。

Web 文档关于绑定所有网卡的段落存在前后不一致，本次不采纳其 LAN 部署描述作为本站方案。本站只通过自己的鉴权入口暴露所需能力，不把原生开发工具整站作为访客应用。

许可证：[MIT](https://github.com/deepseek-ai/deepseek-harness/blob/ddefc45fbc7f8e46dd73185e68295696d1297887/LICENSE)。建议复用其当前可用事件与查询机制、借鉴呈现规则，不整套替换本站内容后台。

## 7. Langfuse：日志参考价值高，当前不宜整套部署

[项目](https://github.com/langfuse/langfuse/blob/5e113040fcc3e16df21a375ce223ff73688817bd/README.md)提供 LLM 观测、会话/trace、评测等能力。适合参考“会话→请求→模型/工具步骤”的关联方式，以及输入输出、耗时、用量和反馈的展示。

[官方 Compose](https://github.com/langfuse/langfuse/blob/5e113040fcc3e16df21a375ce223ff73688817bd/docker-compose.yml)包含 web、worker、PostgreSQL、ClickHouse、Redis、MinIO。结合本站 Windows 2C2G 及现行基础设施限制，整套自托管不适合首期；这是对部署组成与本站条件的判断，未进行内存实测。

Langfuse 也不能替代前台组件事件采集、内容发布审计与业务授权。即使后续采用，仍需由本站把内容/位置/Agent/会话归因传过去，并统一保留与删除规则。

[许可证](https://github.com/langfuse/langfuse/blob/5e113040fcc3e16df21a375ce223ff73688817bd/LICENSE)规定普通目录为 MIT，`ee/`、`web/src/ee/`、`worker/src/ee/` 等目录另有许可；不能将全仓代码都按 MIT 搬用。

## 8. 其他候选为什么没有排在前面

- **CopilotKit**：[README](https://github.com/CopilotKit/CopilotKit/blob/b5093521d3311220e2b2e31443dabfcee2eea5b3/README.md)覆盖 AG-UI、动态界面、共享状态与人工介入，根 [许可证为 MIT](https://github.com/CopilotKit/CopilotKit/blob/b5093521d3311220e2b2e31443dabfcee2eea5b3/LICENSE)。当前主要是文章只读问答，assistant-ui 的自定义后端路径更直接。其持久线程/分析等产品宣传不一概视为免费自托管核心能力；若后续需要复杂交互再核查。也不能用 UI 的人工确认能力补足 SDK 不存在的暂停接口。
- **react-admin**：[README](https://github.com/marmelab/react-admin/blob/d680a5e3bc1d4770a22c05680831b339a74e94ad/README.md)有 CRUD、REST/GraphQL、自定义 data provider 和博客/电商示例，仓库标注 MIT，并明确存在 Enterprise 产品。适合快速标准管理界面；本站希望内容与 Agent 工作流有较大定制空间，因此优先评估 Refine。两者都只是界面底座，不是 Agent 运营系统。
- **Dify**：[README](https://github.com/langgenius/dify/blob/d6491af103d5a4c509adcbd1d119dcd002a35e8d/README.md)标出的最低内存为 4 GiB，高于当前机器总内存。[许可证](https://github.com/langgenius/dify/blob/d6491af103d5a4c509adcbd1d119dcd002a35e8d/LICENSE)是附加条件的 Apache 2.0，涉及多租户以及使用前端时的标识/版权约束，不应当作纯 Apache 2.0 换皮模板。它有自己的应用运行体系，支持 DeepSeek 模型不等于复用本站 Harness。
- **Flowise**：GitHub 返回 `archived=true`，[README](https://github.com/FlowiseAI/Flowise/blob/9291856d1ea4a4ceea9f8fef8ce14f4f6c81e8eb/README.md)明确说明归档；[许可证](https://github.com/FlowiseAI/Flowise/blob/9291856d1ea4a4ceea9f8fef8ce14f4f6c81e8eb/LICENSE.md)也对 enterprise 等代码另行授权。可做历史参考，不为新系统承担其后续维护负担。

## 9. 建议采用的组合与待验证项

首期建议：

- **内容、Agent 和日志管理界面：Refine。**
- **访客问答、后台调试与对话回看：assistant-ui。**
- **业务授权、部署绑定、提醒与消息记录：沿用 Nest，并补齐 PRD 缺口。**
- **运行与原始会话事实：继续使用现有 Harness，优先验证上游查询能力的可复用范围。**
- **管理流程参考 Paperclip；日志体验参考 Langfuse。**

不建议把这五个项目都部署一次，也不建议同时建立 Paperclip、Refine 两套后台。组合方案是采用两个界面库、保留现有后端与运行时，其余作为设计/局部源码参考。

如果选整套 Paperclip 二开，应先另行明确允许调整 PostgreSQL/运行拓扑，再验证 Harness adapter；不能一边声称保留原架构，一边隐式迁入第二个状态系统。

下一步最有判别力的三个小验证（尚未执行）：

1. Refine 接通一份真实内容列表与保存接口，证明无需改动内容真相源和发布语义。
2. assistant-ui 接通一次本站 Harness 问答及历史读取，验证最终输出、断流、停止与会话隔离。
3. 以测试任务验证 Paperclip 自定义 adapter 的 Harness 运行/事件映射，比较整套引入和局部参考的真实代价；该试验使用隔离数据，不连接生产内容。

无论选哪条路线，下列能力仍须本站定制：前台位置绑定、多 Agent 可用范围、前台只读强制上限、基于对象/动作的授权、候选版本审批、Git 发布核验、访客日志保留/删除与内容运营归因。

## 10. 维护快照

以下是调研时读取到的默认分支最新提交，日期为 UTC；不是正式发布版本，也不保证维护质量。仓库状态与提交记录均通过 GitHub 插件读取。

| 仓库 | 状态 | 默认分支最新提交日期 | 核查提交 |
|---|---|---|---|
| [paperclipai/paperclip](https://github.com/paperclipai/paperclip) | 未归档 | 2026-09-21 | [846336e](https://github.com/paperclipai/paperclip/commit/846336e5a0d3003e1b938e8c983aa5a65bda81ff) |
| [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) | 未归档 | 2026-09-17 | [ddefc45](https://github.com/deepseek-ai/deepseek-harness/commit/ddefc45fbc7f8e46dd73185e68295696d1297887) |
| [refinedev/refine](https://github.com/refinedev/refine) | 未归档 | 2026-09-10 | [2352eb5](https://github.com/refinedev/refine/commit/2352eb5b6539e2f39ad9aef652279ad1dcf2c467) |
| [assistant-ui/assistant-ui](https://github.com/assistant-ui/assistant-ui) | 未归档 | 2026-09-21 | [9b902fa](https://github.com/assistant-ui/assistant-ui/commit/9b902faaa1984c55056aebdbdbdaee2b159d834e) |
| [langfuse/langfuse](https://github.com/langfuse/langfuse) | 未归档 | 2026-09-21 | [5e11304](https://github.com/langfuse/langfuse/commit/5e113040fcc3e16df21a375ce223ff73688817bd) |
| [CopilotKit/CopilotKit](https://github.com/CopilotKit/CopilotKit) | 未归档 | 2026-09-21 | [b509352](https://github.com/CopilotKit/CopilotKit/commit/b5093521d3311220e2b2e31443dabfcee2eea5b3) |
| [marmelab/react-admin](https://github.com/marmelab/react-admin) | 未归档 | 2026-09-14 | [d680a5e](https://github.com/marmelab/react-admin/commit/d680a5e3bc1d4770a22c05680831b339a74e94ad) |
| [langgenius/dify](https://github.com/langgenius/dify) | 未归档 | 2026-09-21 | [d6491af](https://github.com/langgenius/dify/commit/d6491af103d5a4c509adcbd1d119dcd002a35e8d) |
| [FlowiseAI/Flowise](https://github.com/FlowiseAI/Flowise) | 已归档 | 2026-08-13 | [9291856](https://github.com/FlowiseAI/Flowise/commit/9291856d1ea4a4ceea9f8fef8ce14f4f6c81e8eb) |

来源均为仓库自身 README、许可证、接口/服务源码及 GitHub 元数据。链接固定到已核查提交，避免后续默认分支变化使结论失去依据。兼容性、性能、完整权限正确性尚未经运行验证。


## 2026-09-22 R01–R09 实施复用

参考已锁定 Paperclip 提交 `846336e5a0d3003e1b938e8c983aa5a65bda81ff` 的 `server/src/services/approvals.ts` 条件更新与幂等结果语义，使用 Prisma SQLite `updateManyAndReturn` 实现唯一领取；不复制 PG 平台层。Refine 既有资源查询继续用于 Agent 列表/修订详情，写操作复用单一 HTTP 客户端。具体测试与边界见 [Agent 基础验收](../evidence/AGENT-CORE-ACCEPTANCE.md)。

## 2026-09-22 R10 实施复用

继续使用已安装的 DeepSeek Harness `0.1.5-rc.2`（调研锁定的上游提交是 [ddefc45](https://github.com/deepseek-ai/deepseek-harness/commit/ddefc45fbc7f8e46dd73185e68295696d1297887)，未升级到该提交）。工具 id 取自本机 `@deepseek-ai/dsh-base` 的 `cordis.patch.yml`，关闭写法取自 `@deepseek-ai/dsh-sdk-app` 的 `disabled: true`。凭据名使用 `@deepseek-ai/dsh-llm-deepseek` 的默认 `DEEPSEEK_API_KEY`。未采用 `sdk-minimal`：它的 patch 仍挂载持久 shell，且 sandbox 为 `danger-full-access`。未把 `@deepseek-ai/dsh-subprocess` 的 `scrubbedParentEnv` 当作子进程环境：它会留下 `DATABASE_URL` 这类无关变量。许可证均为该仓库 MIT。

## 2026-09-22 R14 实施复用

进程身份复用已安装 `@deepseek-ai/dsh-subprocess-local@0.1.5-rc.2` 的 `ProcessIdentity`：核对和终止都要同时匹配 PID 与启动时间，避免 PID 复用后杀错进程。Paperclip `reapOrphanedRuns` 在缺少 PID 时会把运行标失败并立刻派下一轮，已锁定提交之后的 issue #7270 说明这会造成孤儿进程累积；本项不复制该重派行为。没有进程身份或进程表读失败时保持 UNKNOWN 并占用槽。

## 2026-09-22 R15 实施复用

提交、领取和停止继续走已有 ExecutionService，不另写一套状态机。幂等返回沿用先前参考的 Paperclip 审批条件更新语义：同一请求键返回已有运行，不新建。没有把 Paperclip 的 heartbeat HTTP 路由搬过来，它绑定的是另一套任务表。历史 AgentRun 的 `GET /ops/runs` 已验收，新执行单独放在 `/ops/execution-runs`，避免两套记录共用一个返回结构。
