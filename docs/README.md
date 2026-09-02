# 文档

**现行只读这些：**

| 文件 | 用途 |
|------|------|
| 根 [`README.md`](../README.md) | 安装与三端启动 |
| 根 [`Claude.md`](../Claude.md) | **对话默认上下文**（栈 / 命令 / 部署须知） |
| [`PRODUCT.md`](./PRODUCT.md) | **产品**（近端验收） |
| [`VISION.md`](./VISION.md) | **远景**（方向与边界，不抢验收） |
| [`ENGINEERING.md`](./ENGINEERING.md) | **工程**（分层、命名、部署、切流就绪） |
| [`STATUS.md`](./STATUS.md) | **状态**（生产探针与时钟） |
| [`api/README.md`](./api/README.md) | **Nest API 契约** |
| [`PRD-SITE-ASSISTANT.md`](./PRD-SITE-ASSISTANT.md) | **站内助手规划**（活跃 PRD；冲突时低于上行四文档） |
| [`TODO-SITE-ASSISTANT.md`](./TODO-SITE-ASSISTANT.md) | **站内助手执行清单**（P0–P3 任务与验收） |

冲突时：**代码 + `api/README` + PRODUCT/ENGINEERING/STATUS + `Claude.md` > VISION 与 `archive/`**。近端行为以 PRODUCT 为准。

历史 PRD / Goal / 切流长文 / 旧分层全文 / Astro 契约 → [`archive/`](./archive/)。  
**禁止**把 `archive/api-astro-era` 当现行契约。
