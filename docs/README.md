# Docs 使用规则

## 1. 现行（保留 · 施工/联调以这些为准）

| 文档 | 用途 |
|------|------|
| 根 [`README.md`](../README.md) | 安装、三端启动、验收命令 |
| [`docs/api/README.md`](./api/README.md) | **Nest API 契约**（唯一） |
| [`docs/architecture-modules.md`](./architecture-modules.md) | 模块职责与依赖/调用/触发/实现 |
| [`docs/frontend-layers.md`](./frontend-layers.md) | **前端分层**：配置/规则/门面/页/块 + 全量归层表 |
| [`docs/PRD-双入口小生产.md`](./PRD-双入口小生产.md) | 产品：卡/逛 + 过程 + 安全 |
| [`docs/PRD-双入口触感.md`](./PRD-双入口触感.md) | 公开面触感工艺 |
| [`docs/s1-go-live.md`](./s1-go-live.md) | 验证盒时钟与 A11 复盘勾选 |
| [`docs/cutover-runbook.md`](./cutover-runbook.md) | 生产切流草案（未下令不执行） |
| [`docs/redirects.md`](./redirects.md) | 公开路径表 |
| [`docs/feature-keys.md`](./feature-keys.md) | feature_key 字典 |
| [`docs/stage1-retro.md`](./stage1-retro.md) | Stage1 工程毕业复盘 |

## 2. 资料 / 长期记录（保留）

| 文档 | 用途 |
|------|------|
| [`docs/adr/`](./adr/) | 架构决策记录 |
| [`docs/AI赋能/`](./AI赋能/) | 方法论资料（非运行时契约） |
| [`docs/CC入门.md`](./CC入门.md) / [`Codex入门.md`](./Codex入门.md) | 工具入门笔记 |

## 3. 归档（保留追溯 · 禁止当现行施工）

| 路径 | 内容 |
|------|------|
| [`docs/archive/goals/`](./archive/goals/) | 已完成 Goal（双入口 / React 栈 / scripts TS / stage1） |
| [`docs/archive/api-astro-era/`](./archive/api-astro-era/) | 废止的 Astro 67 端点契约 |
| [`docs/archive/design/`](./archive/design/) | 旧设计稿与上线 to-do |
| [`docs/archive/cycles/`](./archive/cycles/) | 历史轮次 implement/retro |
| [`docs/archive/整体改造方案.md`](./archive/整体改造方案.md) | Stage1 时代改造宪法（历史） |
| 其它 `docs/archive/*` | 旧 workbench / workflow 注记等 |

空壳指针：`docs/design/README.md`、`docs/cycles/README.md` → 指向 archive。

## 规则

1. **冲突时**：`docs/api` + `architecture-modules` + 根 README + 代码 > 归档 Goal/设计。  
2. **新 PRD/Goal**：写在 `docs/` 根或明确入口表；完成后迁 `archive/goals/` 并更新本页。  
3. **不要**恢复 `api-astro-era` 为权威契约。  
4. 可选 skill 路径 `.agents/skills/walker-northstar/references/` **不保证**在本仓 git 内；有冲突以本仓现行表为准。
