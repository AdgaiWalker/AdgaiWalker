# Walker (iwalk.pro)

> **把真实卡点变成可检验的下一步。**  
> 一套专为 AI 时代设计的个人知识站点、站内智能体与运营闭环系统。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Architecture: SQLite Native](https://img.shields.io/badge/Architecture-SQLite%20Native-emerald.svg)](AGENTS.md)
[![AI-First: llms.txt](https://img.shields.io/badge/AI--First-llms.txt-purple.svg)](https://www.iwalk.pro/llms.txt)
[![Status: Production Ready](https://img.shields.io/badge/Status-Production%20Ready-success.svg)](docs/STATUS.md)

---

## 哲学：如无必要，勿增实体

在微服务、分布式数据库和过度封装把个人项目越做越臃肿的今天，Walker 坚守奥卡姆剃刀：

* **单库自足，拒绝双库**：独立 SQLite 单文件持久化，零外部数据库依赖，免装 Docker，单文件备份/迁移即全部。
* **发布即版本，拒绝 Git 充当业务历史**：草稿区（`content/log`）随便改；正式上线确证那一刻，SHA-256 物理固化为不可变版本快照（`content/versions`）。
* **事实优先，拒绝假虚荣**：概览页每一个数字都能下钻到真实流水，分母为零不出比率，绝不画假趋势图、不造伪指标。
* **AI-First 原生友好**：原生输出 `/llms.txt`、`/llms-full.txt` 与纯 Markdown 镜像；内置基于真实双链、绝无模型幻觉的 Obsidian 级全站知识图谱。
* **提示词自举运维**：机器的事情交给机器。你无需记住几十条终端参数，克隆本仓库后，直接将一段提示词发给任何 AI Agent，全自动完成环境接管与部署。

---

## ⚡️ 快速开始：提示词驱动 AI 部署

> **在 AI 时代，人类不应再逐行复制粘贴终端命令。**  
> 将本仓库克隆到本地后，直接将下方对应的**提示词复制给你所用的 AI 工具**（如 Antigravity、Cursor、Claude Code、Windsurf 等），AI 将自动为你完成全套部署与运维。

### 场景 1：本地一键自举与启动

把以下提示词直接发给你的 AI Agent：

```text
这是我的 Walker 知识站仓库。请仔细阅读根目录的 AGENTS.md 工程约定，严格遵循“如无必要，勿增实体”的单文件 SQLite 架构，为我完成依赖安装、SQLite 本地库初始化与迁移，并启动 Web、Admin 和 API 三端服务。完成后告诉我各端口的本地访问入口与自检状态。
```

### 场景 2：独立云端服务器部署与全链路体检

把以下提示词直接发给你的 AI Agent：

```text
这是我的 Walker 生产仓库。请查阅 AGENTS.md 中的生产拓扑与验证门禁，帮我检查远端服务器的连通性、数据库迁移状态、Let's Encrypt 证书与 Caddy 托管配置，并执行一次完整全链路接口健康检查（包括公开 Web、API 网关与 Admin 鉴权拦截）。
```

### 场景 3：新增一篇文章并核验上线

把以下提示词直接发给你的 AI Agent：

```text
请阅读 AGENTS.md 的内容管道规范。我需要新增一篇 slug 为 [你的文章slug] 的技术札记，请在 content/log 下规范生成符合 frontmatter 门禁的 Markdown 正本，生成公开内容投影与版本快照，跑通 check:content-fields，并告诉我如何一键推送到线上。
```

<details>
<summary>🛠 传统开发者手动命令行（点击展开备查）</summary>

```bash
# 1. 安装依赖
pnpm install

# 2. 初始化本地 SQLite 数据库
cp apps/api/.env.example apps/api/.env
pnpm db:generate && pnpm db:migrate

# 3. 本地启动三端（API :8788 / Web :5173 / Admin :5174）
pnpm dev:api
pnpm dev:web
pnpm dev:admin

# 4. 运行全套门禁自检
pnpm typecheck
pnpm test:shared && pnpm test:api && pnpm test:web && pnpm test:admin
pnpm verify:docs && pnpm verify:geo
```
</details>

---

## 系统全景

```text
├── apps/
│   ├── web/        # 访客端：极速静态预渲染、Obsidian 原生复刻 3D/2D 知识图谱、小影 AI 助手
│   ├── admin/      # 管理台：单页活动流、内容 CAS 受控编辑、不可变版本演进对比、Agent 授权治理
│   ├── api/        # 核心网关：NestJS + Prisma + SQLite，跨进程发布锁、Fail-Closed 安全边界
│   └── agent/      # 判断代理：Cordis 驱动，外接 DeepSeek/Claude 大模型与 MCP 生态
├── packages/
│   └── shared/     # 纯函数单点契约：图谱规则、版本算法、授权校验、无外部副作用
├── content/
│   ├── log/        # 内容唯一真相源（纯 Markdown 文本，进 Git 才触发 Vercel 发布）
│   └── versions/   # 不可变公开演进历史区（SHA-256 内容寻址，永久保留承诺）
└── ops/windows/    # 生产部署物料：Caddy 自动化反代、服务看门狗、冷启动兜底
```

---

## 核心设计特性

### 1. 维基式不可变版本历史（发布即版本）
正本草稿区（`content/log`）可反复推翻重写不留痕，但一旦在管理后台点击「执行发布」，确证的一刻便固化一条永久不可变快照（`content/versions`），自动为每篇文章分配唯一的 `/posts/:slug/v/:n` 历史沉淀页，并向访客兑现“永久保留”的技术承诺。

### 2. Obsidian 级原生知识图谱
全站复刻 Obsidian 原生排斥力与连接引擎，正文内的 `[[wikilink]]` 双链自动编译为高精度的关联网络，零模型幻觉。

### 3. 全链路 Fail-Closed 安全审计
后台管理操作严格遵循安全闸门，无 Token 拦截、CAS 并发写入冲突保护、跨进程排他发布锁。任何异常中断绝不伪造已成功状态。

---

## 文档地图

本仓库严格践行**单一真相源（SSOT）**，拒绝文档漂移：

| 文档 | 作用与定位 |
|---|---|
| [`AGENTS.md`](AGENTS.md) | **全仓常驻宪法**（Agent 进场必读：工程约定 / 栈 / 命令 / 部署禁区） |
| [`PLAN.md`](PLAN.md) | **主执行计划**（北极星愿景 · 阶段宪法 · 排期路线图） |
| [`to-do.md`](to-do.md) | **原子任务跟踪**（唯一不可篡改的任务执行流与验收记录） |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | **架构权威图面**（拓扑态、飞轮、分层契约） |
| [`docs/PRODUCT.md`](docs/PRODUCT.md) | **产品红线与概念定义**（领域词汇 SSOT） |
| [`docs/ENGINEERING.md`](docs/ENGINEERING.md) | **工程规范与实现指南** |
| [`docs/STATUS.md`](docs/STATUS.md) | **生产运行状态时钟** |
| [`docs/api/README.md`](docs/api/README.md) | **后端 API 契约** |

---

## 开源协议

本项目采用 [MIT 协议](LICENSE) 开源。欢迎基于本项目自建您自己的 AI 时代个人知识与 Agent 生产站。
