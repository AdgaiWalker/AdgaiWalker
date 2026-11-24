---
status: active
type: contract
title: 公开站（apps/web）交互统计事件字典（SSOT）
version: v1.0
last_verified: 2026-11-24
ssot: true
applies_to: [web]
---

# 公开站（apps/web）交互统计事件字典

> 本文件是 `apps/web` 所有前端交互与兜底事件统计的**唯一真相源（SSOT）**，与 [web-telemetry.ts](../apps/web/src/lib/web-telemetry.ts) 严格一一对应。
> 运行时事件先写入客户端内存环形缓冲（最近 100 条），供 `ErrorBoundary` / 降级兜底一键复制诊断现场；助手交互与漏搜继续沿用既有 `POST /assistant/events` 与 `POST /search-events`（零新增 SQLite 迁移与公网白名单变更）。

## 事件清单（严格收敛至 9 个）

| 事件名 | 触发时机 | 属性字段 | 用途（回答什么问题） |
|---|---|---|---|
| `web.page_view` | 进入或切换公开站路由 | `path: string`, `viewport: desktop \| mobile` | 检验桌面顶栏与手机底栏真实路由分布 |
| `web.omnibar_opened` | 打开统一 Omni-Bar | `trigger: hotkey \| button \| pet \| card`, `path: string` | 统计 `⌘K` 与界面按钮的呼出习惯 |
| `web.omnibar_escalated_to_ai` | Omni-Bar 从搜索回车/点击转入问小影 | `hasHits: boolean`, `queryLength: number` | 验证统一入口代替双模态框的转化率 |
| `web.home_card_flipped` | 首页点击或键盘翻转「灵感翻牌」 | `slug: string \| null`, `isReal: boolean` | 检验首页互动趣味组件的实际翻牌频次 |
| `web.home_card_acted` | 灵感翻牌背面点击「读原文」或「问小影」 | `action: read \| ask`, `slug: string \| null` | 检验趣味互动到深度阅读/提问的实际转化 |
| `web.pet_3d_activated` | 首页小影按需载入 3D WebGL 完成 | `trigger: hover \| click \| focus \| idle` | 验证按需加载命中率与冷启动耗时基线 |
| `web.pet_motion_toggled` | 访客切换小影动效暂停/播放 | `paused: boolean` | 检验无障碍持续动效控制使用率（WCAG 2.2.2） |
| `web.ai_graceful_degraded` | AI 问答或卡点请求失败/超时后无声降级 | `surface: omnibar \| pet \| tools`, `code: string` | 追踪 15%–18% AI 失败场景是否平滑落到本地检索/规则下一步 |
| `web.runtime_error_caught` | 捕获运行时异常或动态分包加载失败 | `kind: boundary \| error \| rejection \| preload`, `message: string` | 兜底三件套日志核心，定位白屏与发版间隙 chunk 404 |

## 变更纪律

- 新增或删除任一事件，必须同步更新本表与 [web-telemetry.ts](../apps/web/src/lib/web-telemetry.ts) 白名单；
- 禁止在统计属性中记录访客隐私、完整输入长文或敏感凭据。
