# Docs 使用规则

## 当前有效入口（以仓库树为准）

产品与工程的**现行**说明在本仓 `docs/` 与根 `README.md`，不以已删除的 Astro 路径为准。

| 文档 | 用途 |
|------|------|
| 根 [`README.md`](../README.md) | 怎么装、怎么跑三端、验收命令 |
| [`docs/api/README.md`](./api/README.md) | **Nest API 现行契约** |
| [`docs/architecture-modules.md`](./architecture-modules.md) | 模块一句话职责与依赖/调用/触发/实现 |
| [`docs/PRD-双入口小生产.md`](./PRD-双入口小生产.md) | 产品：卡/逛 + 站主过程 |
| [`docs/PRD-双入口触感.md`](./PRD-双入口触感.md) | 触感 / 主控件 |
| [`docs/GOAL-双入口小生产.md`](./GOAL-双入口小生产.md) | 双入口落地 Goal（已合 main，作追溯） |
| [`docs/GOAL-scripts-TypeScript化.md`](./GOAL-scripts-TypeScript化.md) | scripts TS 化 Goal |
| [`docs/s1-go-live.md`](./s1-go-live.md) | 验证盒时钟与观测 |
| [`docs/cutover-runbook.md`](./cutover-runbook.md) | 生产切流草案（未下令不执行） |
| [`docs/feature-keys.md`](./feature-keys.md) | feature_key 字典 |
| [`docs/redirects.md`](./redirects.md) | 公开路径表 |

可选 skill 仓库（若本机存在、**不**保证在 git 跟踪内）：

```text
.agents/skills/walker-northstar/references/
```

有冲突时：**本仓 `docs/api` + `architecture-modules` + 代码** 优先于 skill 草稿。

## `docs/` 分区

| 目录 | 含义 |
|------|------|
| `docs/*.md` 上表 | **现行**产品/工程说明 |
| `docs/api/` | 现行 Nest 契约 |
| `docs/adr/` | 长期 ADR |
| `docs/archive/` | **历史**（含 `api-astro-era`、旧 workflow 注记） |
| `docs/design/` | **历史设计输入**，禁止当施工步骤执行 |
| `docs/cycles/` | **历史轮次记录**，非当前 sprint 工作台 |
| `docs/AI赋能/` | 方法论资料，非运行时契约 |

## 归档规则

文档完成、过期或被替代时：

1. 移入 `docs/archive/`（或子目录），文首标明「只作历史参考」。  
2. 从本 README「当前有效入口」表移除。  
3. 不要在 `docs/api` 恢复 Astro 67 端点为「权威」。

## 根 README 与本文

| 对象 | 是否合并 | 理由 |
|------|----------|------|
| 根 `README.md` + 本文 | **不合并** | 一个是仓库运行入口，一个是文档路由 |
