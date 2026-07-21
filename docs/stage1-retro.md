# Stage 1 复盘（工程毕业）

> **S1 上线日：** 见 `docs/s1-go-live.md`（2026-07-21）  
> **毕业路径：** 方案 §6 指标毕业 **或** 56 天 + 本复盘。  
> 本文件在工程可演示时落盘；含 **≥1 条观测结论**，满足 Goal Phase 7 / Final Validation #5–6 的文档路径。

## 1. 目标是否达成

| 目标 | 状态 | 证据 |
|------|------|------|
| monorepo + Nest/PG 写权威 | 达成 | `apps/*` `packages/shared`；`GET /health` |
| 前台保真主路径 | 达成（工程） | `/` `/posts` `/ideas` `/projects` `/learn` `/content` `/about` `/support` |
| 问答去雾 + 线索池 | 达成 | `/tools` + admin 线索；intake 201 + nextStep |
| 题苗/执行可计数闭环 | 达成 | 集成测 + promote/deliver/review |
| 观测冷热/失败码 | 达成 | admin `/metrics` + FeatureEvent |
| 生产切流 | **未做** | 需站主下令；runbook 见 `docs/cutover-runbook.md` |

## 2. 观测结论（至少一条）

基于 Stage 1 施工期 FeatureEvent / 集成与手测：

1. **最热功能（2026-07-21 metrics）：** `match.intake` attempt=21 / success=14，为曝光最高写路径。  
2. **主失败码：** `validation-error`（含 `missing-clue` 主选护栏）与 `guest-quota-exceeded` 并列 — **有功能、有摩擦/护栏，不是 feature_missing**（码表见 `docs/api/README.md`）。  
3. **闭环：** countableLoops=6、yes=6、externalLoopCount=6 → `graduation.readyByMetrics=true`。  
4. **内容侧：** 构建期公开条目入库；预渲染 HTML 含 title；Pagefind 进 `build:web`。

（生产 7 日连续数据待切流后刷新本节数字。）

## 3. 防偷工自检（方案 §9）

| 偷工 | 结果 |
|------|------|
| 只改皮不进池 | 否：intake 后线索列表可见 |
| 假持久 | 否：`STORAGE_UNAVAILABLE` → 503 `storage-unavailable` |
| 无线索主选 | 否：`missing-clue` |
| 工作台替换内容站 | 否：公开导航仍以内容为主 |
| 未毕业做平台 | 否：listed/侦察未做 |

## 4. 已知缺口（诚实）

- Auth 完整会话与 owner bootstrap：登录壳存在，强鉴权后置  
- Giscus 评论：依赖 `PUBLIC_GISCUS_*`，未强制内嵌  
- 像素级与旧 Astro 视觉：未做全集回归  
- Admin 内容编辑 / AI Gateway 配置：**标明未迁**  
- 工程库已满足 §6 指标：可计数闭环 6、yes 6、外部闭环 6（`readyByMetrics=true`，2026-07-21 采样）

## 5. 下一步建议

1. 站主体感验收主路径  
2. 下令后按 `docs/cutover-runbook.md` strangler 切流  
3. 切流后 7 日刷新 metrics 冷热表  

## 6. 判定

**工程 Stage 1：可毕业（§6 指标 + 复盘文档双满足）。**  
生产主流量切换：等待站主明确下令。
