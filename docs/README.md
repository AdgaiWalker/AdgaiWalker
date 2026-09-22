# 文档

> **2026-09-22 本地进度**：新后台 F01–F18 框架及 R01–R20、R22、R23 已通过本地验收。R21 真实探针未通过。详见 [框架验收与隔离启动](ADMIN-FRAMEWORK-ACCEPTANCE.md) 和根 [to-do.md](../to-do.md)。业务写入和部署尚未接通，生产状态不变；下文9月21日空白入口说明为此前状态。

> **2026-09-21 后台重构状态（优先于下文旧界面说明）**：站主要求清空管理界面。`apps/admin` 仅保留空白开发/构建入口与 API 代理；计划、内容、复盘、设置、旧路由及管理 UI 均已退役。API、数据库、文章与共享规则保留，生产未部署此变更。旧后台页面图与验收记录仅作历史参考，不作为新重构需求。资产清单见 [后台重构前资产清单](ADMIN-REBUILD-INVENTORY.md)。


**现行只读这些：**

新后台访谈草稿：[站主内容与 Agent 运营后台 PRD](PRD-AGENT-OPERATIONS.md)（v0.2，2026-09-22，含访客 AI 交互数据与日志；待审阅，不表示已实现或已部署）。

配套调研：[新后台开源项目选型](RESEARCH-AGENT-OPS-OPEN-SOURCE.md)（2026-09-22，候选、许可证、维护快照与复用建议；已记录Refine/assistant-ui本地探针，未部署）。

配套技术方案：[站主内容与 Agent 运营系统](TECH-DESIGN-AGENT-OPERATIONS.md)（v0.2，2026-09-22；F框架与Refine/assistant-ui探针已验收，其余授权、执行、发布一致性、访客日志与迁移待实施）。实施顺序见根 PLAN 的新后台章节。

执行入口：[原子任务 to-do.md](../to-do.md)（2026-09-22；F/R/V/C/O/G 六批，框架优先，SQLite 单库；任务前置、文件落点、验收与勾选实录的唯一入口）。第一次交付为 F01–F18，不以完整 Agent 系统阻塞框架。

| 文件 | 用途 |
|------|------|
| 根 [`PLAN.md`](../PLAN.md) | **主执行计划**（北极星 · 宪法 · 主线排期 · 冻结条款 · 想法记录） |
| 根 [`to-do.md`](../to-do.md) | **新后台原子执行清单**（框架优先 · 依赖 · 验收 · 任务进度） |
| 根 [`PRD.md`](../PRD.md) | 旧后台 PRD 与保留资产背景；新重构以 PRD-AGENT-OPERATIONS 为准 |
| 根 [`TECH-DESIGN.md`](../TECH-DESIGN.md) | 旧后台技术方案；新重构以 TECH-DESIGN-AGENT-OPERATIONS 为准 |
| 根 [`EXEC-PLAN.md`](../EXEC-PLAN.md) | 旧后台 Batch 1–3 历史方案；新实施顺序见根 PLAN、原子任务见 to-do.md |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | **架构权威图面**（当前态 · 最终架构 · 循环飞轮 · 演进对照） |
| 根 [`README.md`](../README.md) | 安装与三端启动 |
| 根 [`Claude.md`](../Claude.md) | **对话默认上下文**（栈 / 命令 / 部署须知） |
| [`PRODUCT.md`](./PRODUCT.md) | **产品**（近端验收） |
| [`VISION.md`](./VISION.md) | **远景**（方向与边界，不抢验收） |
| [`ENGINEERING.md`](./ENGINEERING.md) | **工程**（分层、命名、部署、切流就绪） |
| [`STATUS.md`](./STATUS.md) | **状态**（生产探针与时钟） |
| [`api/README.md`](./api/README.md) | **Nest API 契约**（信封 · 鉴权 · 按产品面列出；已落地/待落地） |
| [`api/ANALYSIS.md`](./api/ANALYSIS.md) | **API 面项目分析**（四条环 · 痛点 · 设计原则） |
| [`api/INTEGRATION.md`](./api/INTEGRATION.md) | **联调手册**（起服务 · 顺序 · 门面） |
| [`PRD-SITE-ASSISTANT.md`](./PRD-SITE-ASSISTANT.md) | **站内助手规划**（活跃 PRD；冲突时低于上行四文档） |
| [`PRD-AGENT-WORKBENCH.md`](./PRD-AGENT-WORKBENCH.md) | **后台智能体工坊与文件直调规划**（活跃 PRD；以 Agent 为单位 + 文件直通） |
| [`PRD-KNOWLEDGE-GRAPH.md`](./PRD-KNOWLEDGE-GRAPH.md) | **知识图谱规划**（活跃 PRD；Obsidian Graph View 逐条对齐 · 访客 `/graph` + 站主体检 + MCP 导航） |
| [`PRD-CODE-GRAPH.md`](./PRD-CODE-GRAPH.md) | **代码架构图谱规划**（活跃 PRD；把代码库当 vault 看 · 访客 `/architecture` + 门禁 `verify:architecture` + admin 体检 + MCP 四工具） |
| [`TODO-MAINLINE.md`](./TODO-MAINLINE.md) | **主线执行清单**（M2 换 runner · M3 初稿全链 · M4 共创/转题苗 · M5 流水线 · M8 复盘，原子任务） |
| [`TODO-OBSERVABILITY.md`](./TODO-OBSERVABILITY.md) | **观测与数据执行清单**（AI 使用数据 + 交互记录，复用 dsh 会话数据平面） |
| [`TODO-AGENT.md`](./TODO-AGENT.md) | **判断代理 v1 执行清单**（apps/agent · Cordis 组合 · MCP 暴露站主判断；排在初稿全链之后） |

冲突时：**代码 + `api/README` + PRODUCT/ENGINEERING/STATUS + `Claude.md` > VISION 与 `archive/`**。近端行为以 PRODUCT 为准。

历史 PRD / Goal / 切流长文 / 旧分层全文 / Astro 契约 / AI 工作站 MVP 三件套（`archive/ai-workstation/`，2026-08 验证期）/ 已完成执行清单（`archive/TODO-OPTIMIZATION.md` · `archive/TODO-SITE-ASSISTANT.md`）→ [`archive/`](./archive/)。  
**禁止**把 `archive/api-astro-era` 或已归档 TODO 当现行待办。
