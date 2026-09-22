# 项目分析：Walker 与 API 面

| 字段 | 内容 |
|------|------|
| 日期 | 2026-09-18 |
| 角色 | 架构（联调前的边界判断） |
| 结论 | **不是没有 API，是没有一份按产品面组织的契约。** 联调应沿现有 Nest 资源接口走；驾驶舱缺的是两个读模型，不是整套重写。 |

## 1. 这是什么项目

Walker 是一人站点：**访客**带着问题来（卡）或读证据（逛）；**站主**把问题变成可上线的文章/项目，并用 Agent 当可关的助手与工坊。

四条环，不要揉成一张「万能后台 API」：

```text
访客 卡/逛 ──公开白名单──► Nest
站主 计划/内容/复盘/设置 ──管理凭据──► Nest
内容  content/log ──content:publish──► Git → Vercel（www）
Agent 角色/模型/技能 ──dsh 运行时──► data/runs/<runId>/trace.jsonl
```

| 环 | 真相源 | 上线/生效 |
|----|--------|-----------|
| 文章与项目 | `content/log/**/*.md` | `pnpm content:publish --push` |
| 过程（线索/题苗/执行） | SQLite（未来 PG） | API 写库即生效，不进 Vercel |
| 站内助手 | dsh + `AssistantRun` 索引 | `AI_ENABLED` 可关，fail-closed |
| 代码/知识图谱 | 构建产物 json | 静态站引入；体检走管理接口 |

禁止把过程状态写进文章 frontmatter，禁止把文章阶段落成数据库字段。阶段由 shared `deriveContentStage` 从可见性 + 门禁 + git 脏否推导。

## 2. 产品面（admin）与对象

驾驶舱四个入口：

| 面 | 人在干什么 | 背后对象 |
|----|------------|----------|
| 计划 | 今天动手：入池 / 主选 / 交付 / 检验；有日期的待办 | Clue, Seed, Execution, Action |
| 内容 | 还要你的稿 → 保存 / 上线 | `content/log` 文件，不是 CMS 行 |
| 复盘 | 世界问了什么 → 要不要变成需求 | DemandSignal（四源）+ Clue |
| 设置 | 拧螺丝：Agent / 观测 / 结构 | AgentUnit, ModelProvider, Skill, health |

Agent 不是第四个日常工作面。它是设置里的一组，外加访客面的「小影」（`POST /assistant`）。

## 3. 现有 API 的诚实状态

Nest 无全局 `/api` 前缀。浏览器经 Vite/Caddy 把 `/api/*` 剥成 Nest 路径。

**已落地、可联调：**

- 公开：health、intake、assistant（含 stream）、likes、content-feedback、search-events、support
- 内容：ledger、单篇 GET/PUT、release preflight/release、trace
- 计划日历：`GET /admin/plan/calendar` + `/actions*`
- 过程资源：`/clues*`、`/seeds*`、`/executions*`
- 复盘原料：`GET /insights/signals`
- Agent：`/agents*`、`/model-providers*`、runs、trace
- 观测与结构：health、usage/ai/journey、graph/architecture health

**驾驶舱在用、但没有「面」级读模型：**

- 计划「下一动作」= 前端并行打 clues + seeds + executions，再跑 shared `pickNextActions`
- 复盘 = signals + clues + metrics 三次请求
- 设置 = 旧页各自打旧接口

这不是「没接口」，是 **IA 已是四个面，HTTP 仍是二十张表。**

## 4. 痛点（联调视角）

1. **契约文档只覆盖内容台账增量**（旧 `docs/api/README.md`），Agent / 过程 / 公开面要靠读 controller。
2. **写接口按对象是对的**（入池仍 PATCH 线索）。不要为页面再造一套状态机。
3. **缺的是读模型**：`GET /admin/plan/next`；signals 上补 intake 的 `poolStatus`，复盘少打 `/clues` 与 `/metrics`。
4. **Agent 已有工坊接口**，与访客助手不是同一条路：工坊走 `AgentRunner` + jsonl；访客问答走 harness，高频不写 trace 文件。

## 5. 设计原则（后面的接口文档必须遵守）

1. 不新增公开路由；放行必须双侧改 `app.module.ts` exclude 与 `ops/windows/Caddyfile`。
2. 不改 Prisma 来迁就驾驶舱展示。
3. 规则只在 `packages/shared` 有一份（阶段、下一动作、建图、门禁字段）。
4. 前端只用 `runId` 拉轨迹，不接收服务器文件路径。
5. 新读模型必须能由现有对象重建；禁止第二份业务事实。
6. 管理端 401 `code: admin-auth-required`。生产缺 `WALKER_ADMIN_TOKEN` 拒启。

下一份：[`README.md`](./README.md) 契约正文；[`INTEGRATION.md`](./INTEGRATION.md) 联调步骤。
