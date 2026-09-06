# 文档

**现行只读这些：**

| 文件 | 用途 |
|------|------|
| 根 [`PLAN.md`](../PLAN.md) | **主执行计划**（北极星 · 宪法 · 主线排期 · 冻结条款 · 想法记录） |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | **架构权威图面**（当前态 · 最终架构 · 循环飞轮 · 演进对照） |
| 根 [`README.md`](../README.md) | 安装与三端启动 |
| 根 [`Claude.md`](../Claude.md) | **对话默认上下文**（栈 / 命令 / 部署须知） |
| [`PRODUCT.md`](./PRODUCT.md) | **产品**（近端验收） |
| [`VISION.md`](./VISION.md) | **远景**（方向与边界，不抢验收） |
| [`ENGINEERING.md`](./ENGINEERING.md) | **工程**（分层、命名、部署、切流就绪） |
| [`STATUS.md`](./STATUS.md) | **状态**（生产探针与时钟） |
| [`api/README.md`](./api/README.md) | **Nest API 契约** |
| [`PRD-SITE-ASSISTANT.md`](./PRD-SITE-ASSISTANT.md) | **站内助手规划**（活跃 PRD；冲突时低于上行四文档） |
| [`TODO-SITE-ASSISTANT.md`](./TODO-SITE-ASSISTANT.md) | **站内助手执行清单**（P0–P3 任务与验收） |
| [`TODO-OPTIMIZATION.md`](./TODO-OPTIMIZATION.md) | **全站优化执行清单**（T0–T4 分批任务与验收，源自 2026-09-05 完整分析） |
| [`TODO-MAINLINE.md`](./TODO-MAINLINE.md) | **主线执行清单**（M2 换 runner · M3 初稿全链 · M4 共创/转题苗 · M5 流水线 · M8 复盘，原子任务） |
| [`TODO-OBSERVABILITY.md`](./TODO-OBSERVABILITY.md) | **观测与数据执行清单**（AI 使用数据 + 交互记录，复用 dsh 会话数据平面） |
| [`TODO-AGENT.md`](./TODO-AGENT.md) | **判断代理 v1 执行清单**（apps/agent · Cordis 组合 · MCP 暴露站主判断；排在初稿全链之后） |

冲突时：**代码 + `api/README` + PRODUCT/ENGINEERING/STATUS + `Claude.md` > VISION 与 `archive/`**。近端行为以 PRODUCT 为准。

历史 PRD / Goal / 切流长文 / 旧分层全文 / Astro 契约 / AI 工作站 MVP 三件套（`archive/ai-workstation/`，2026-08 验证期）→ [`archive/`](./archive/)。  
**禁止**把 `archive/api-astro-era` 当现行契约。
