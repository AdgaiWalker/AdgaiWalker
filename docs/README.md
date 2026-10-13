---
status: active
type: map
title: 文档全局索引
last_verified: 2026-09-25
ssot: false
applies_to: [web, admin, api, agent, shared]
---

# 文档

> **2026-09-25 本地进度**：F01–F18、R01–R33、V01–V24 与 C01–C05 已通过本地验收，下一项 C06 为文章编辑、差异与预览；C02 已迁移候选/发布表，C03 完成文件 CAS，C04 完成候选写入意图/审计和 apply/reconcile 恢复，C05 让人工保存经过鉴权、CAS、审计且不再自动重建公共投影。候选原文仓储和新发布链仍未接通。V23 readiness 要求真实 SDK 运行隔离证据，目前未配置报告而保持 blocked。详见根 [to-do.md](../to-do.md) 与 [V15–V24/C01–C05 验收记录](../to-do.md#10-执行实录与接续规则)。

> **2026-09-21 管理界面清空是重构过渡态**：下一日已恢复新 Admin 框架；现行页面、能力和验收状态以根 `to-do.md` 与 [架构图面](ARCHITECTURE.md) 为准。旧后台资产仍仅作历史参考，清单见 [后台重构前资产清单](evidence/ADMIN-REBUILD-INVENTORY.md)。


**现行核心文档（只读这些）：**

| 文件 | 用途 |
|------|------|
| 根 [`PLAN.md`](../PLAN.md) | **主执行计划**（北极星 · 宪法 · 主线排期 · 冻结条款 · 想法记录） |
| 根 [`to-do.md`](../to-do.md) | **新后台原子执行清单**（框架优先 · 依赖 · 验收 · 任务进度唯一真相源） |
| 根 [`README.md`](../README.md) | 安装与三端启动 |
| 根 [`CLAUDE.md`](../CLAUDE.md) | **对话默认上下文**（栈 / 命令 / 部署须知） |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | **系统架构权威图面**（当前态 · 最终架构 · 循环飞轮 · 演进对照） |
| [`PRODUCT.md`](./PRODUCT.md) | **产品权威与红线**（近端卡/逛验收 · 远景意图与 NorthStar 边界） |
| [`ENGINEERING.md`](./ENGINEERING.md) | **工程规范**（分层、命名、部署、切流就绪） |
| [`STATUS.md`](./STATUS.md) | **生产状态**（生产探针与时钟） |

**专项规格与分类目录：**

- **接口契约 `api/`**：[`api/README.md`](./api/README.md)（Nest API 契约）、[`api/INTEGRATION.md`](./api/INTEGRATION.md)（联调手册）
- **业务需求与技术方案 `specs/`**：
  - [`specs/PRD-AGENT-OPERATIONS.md`](./specs/PRD-AGENT-OPERATIONS.md)（新后台 PRD v0.2）
  - [`specs/TECH-DESIGN-AGENT-OPERATIONS.md`](./specs/TECH-DESIGN-AGENT-OPERATIONS.md)（新后台技术方案 v0.5）
  - [`specs/RESEARCH-AGENT-OPS-OPEN-SOURCE.md`](./specs/RESEARCH-AGENT-OPS-OPEN-SOURCE.md)（开源选型调研）
  - [`specs/ARCHITECTURE-AGENT-RUNTIME.md`](./specs/ARCHITECTURE-AGENT-RUNTIME.md)（Agent 运行时拓扑实况）
  - [`specs/PRD-SITE-ASSISTANT.md`](./specs/PRD-SITE-ASSISTANT.md)（站内助手 PRD）
  - [`specs/PRD-KNOWLEDGE-GRAPH.md`](./specs/PRD-KNOWLEDGE-GRAPH.md)（知识图谱 PRD）
  - [`specs/PRD-CODE-GRAPH.md`](./specs/PRD-CODE-GRAPH.md)（代码架构图谱 PRD）
- **验收与测试证据 `evidence/`**：
  - [`evidence/ADMIN-FRAMEWORK-ACCEPTANCE.md`](./evidence/ADMIN-FRAMEWORK-ACCEPTANCE.md)（F 框架验收报告）
  - [`evidence/AGENT-CORE-ACCEPTANCE.md`](./evidence/AGENT-CORE-ACCEPTANCE.md)（R 核心验收报告）
  - [`evidence/GOAL-2026-09-24-V10.md`](./evidence/GOAL-2026-09-24-V10.md)（公开问答 V10 目标与边界）
  - [`evidence/GOAL-2026-09-24-V13.md`](./evidence/GOAL-2026-09-24-V13.md)（公开成员切换与访客历史恢复验收）
  - [`evidence/GOAL-2026-09-25-V14.md`](./evidence/GOAL-2026-09-25-V14.md)（访客真实停止和断流语义验收）
  - [`evidence/GOAL-2026-09-25-V15.md`](./evidence/GOAL-2026-09-25-V15.md)（助手部件交互事件验收）
  - [`evidence/GOAL-2026-09-25-V16.md`](./evidence/GOAL-2026-09-25-V16.md)（事件故障补写与健康缺口验收）
  - [`evidence/GOAL-2026-09-25-V17.md`](./evidence/GOAL-2026-09-25-V17.md)（日志资源登记、到期策略与实体模型审计）
  - [`evidence/GOAL-2026-09-25-V18.md`](./evidence/GOAL-2026-09-25-V18.md)（可重试会话删除与防复活）
  - [`evidence/GOAL-2026-09-25-V19.md`](./evidence/GOAL-2026-09-25-V19.md)（删除清单与备份恢复防复活）
  - [`evidence/GOAL-2026-09-25-V20.md`](./evidence/GOAL-2026-09-25-V20.md)（会话日志查询与后台回看）
  - [`evidence/GOAL-2026-09-25-V21.md`](./evidence/GOAL-2026-09-25-V21.md)（受控导出、下载与数据模型审计）
  - [`evidence/GOAL-2026-09-25-V22.md`](./evidence/GOAL-2026-09-25-V22.md)（公共路由白名单与 Origin/CSRF 边界）
  - [`evidence/ADMIN-REBUILD-INVENTORY.md`](./evidence/ADMIN-REBUILD-INVENTORY.md)（重构前资产清单）
- **历史归档 `archive/`**：[`archive/README.md`](./archive/README.md)（所有已退役方案、历史待办与旧版 PRD）

冲突时：**代码 + `api/README` + PRODUCT/ENGINEERING/STATUS + `CLAUDE.md` > `archive/`**。近端行为以 PRODUCT 为准。

历史 PRD / 退役 Goal / 切流长文 / 旧分层全文 / Astro 契约 / AI 工作站 MVP 三件套（`archive/ai-workstation/`，2026-08 验证期）/ 已完成执行清单（`archive/TODO-OPTIMIZATION.md` · `archive/TODO-SITE-ASSISTANT.md`）→ [`archive/`](./archive/)。
**禁止**把 `archive/api-astro-era` 或已归档 TODO 当现行待办。
