---
status: active
type: contract
title: Admin 极简工作台埋点事件字典（SSOT）
version: v1.0
last_verified: 2026-11-23
ssot: true
applies_to: [admin]
---

# Admin 极简工作台埋点事件字典

> 本文件是 `apps/admin` 所有前端交互统计事件的**唯一真相源（SSOT）**，与 [telemetry.ts](../apps/admin/src/api/telemetry.ts) 严格一一对应。
> 服务端请求事实直接复用既有 `AdminRequestLog`（fail-closed 持久化），前端交互漏斗采用进程内环形缓冲（fail-open，200 条上限，零 SQLite 迁移）。

## 事件清单（严格收敛至 8 个）

| 事件名 | 触发时机 | 属性字段 | 用途（回答什么问题） |
|---|---|---|---|
| `admin.page_view` | 进入任一主表面 | `surface: content \| editor \| signals \| settings`, `viewport: desktop \| mobile` | 检验一级入口与移动端真实使用分布（连续 30 天 0 访问即淘汰） |
| `editor.save_completed` | 编辑器保存结束 | `durationMs: number`, `conflict: boolean` | 量化保存耗时与 CAS 409 冲突率 |
| `publish.flow_started` | 打开一键发布浮层 | `slug: string`, `dirty: boolean` | 发布漏斗起点 |
| `publish.flow_completed` | 自动串行 `save→prepare→release` 成功 | `slug: string`, `durationMs: number` | 发布完成率与端到端交互耗时 |
| `publish.flow_abandoned` | 打开发布浮层后取消或失败离开 | `slug: string`, `reason: cancel \| error` | 定位发布摩擦点 |
| `drawer.opened` | 打开文章 `···` 滑出抽屉的某个区块 | `section: history \| ai \| share \| meta \| delete` | 检验按需收纳是否合理（若某区块高频打开可评估外置） |
| `ai.silent_degraded` | AI 能力超时/502/未启用，无声降级回手动 UI | `feature: string`, `reason: string` | 验证优雅降级次数与健康度 |
| `app.version_drift_refreshed` | 检测到 `/health` version 与构建 SHA 漂移并点击刷新 | `from: string`, `to: string` | 验证静默版本漂移提示生效 |

## 变更纪律

- 新增或删除任一事件，必须同步更新本表与 [telemetry.ts](../apps/admin/src/api/telemetry.ts)；
- 禁止采集文章正文、密码、Token 或访客敏感信息。
