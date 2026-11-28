---
status: active
type: contract
title: 公开站（apps/web）交互统计事件字典与人机边界账本（SSOT）
version: v3.0
last_verified: 2026-11-27
ssot: true
applies_to: [web]
---

# 公开站（apps/web）交互统计事件字典与人机边界账本

> 本文件是 `apps/web` 所有前端交互与兜底事件统计的**唯一真相源（SSOT）**，与 [web-telemetry.ts](../apps/web/src/lib/web-telemetry.ts) 严格一一对应。
> 运行时事件先写入客户端内存环形缓冲（最近 100 条），供 `ErrorBoundary` / 降级兜底一键复制诊断现场；助手交互继续沿用既有 `POST /assistant/events`（零新增 SQLite 迁移与公网白名单变更）。
> 2026-11-27 纸页重构：3D 展馆、小影、⌘K Omni-Bar 与平铺首页筛选整体下线，对应 8 个事件一并删除。

## 人机边界交互账本

| 场景模块 | 用户必做动作 | 系统自动消化项 | 事件标识 |
| --- | --- | --- | --- |
| 首页（一张纸） | 从上往下读：自述 → 作品 → 文章 → 在线 | 作品与在线来自 `apps/web/src/data/profile.ts`；文章按年自动归档、默认 8 篇可展开 | `web.page_view` |
| 文末回邮卡 | 文章读完写下问题，点「寄出」 | 在原地打开围绕这篇文章的问答并自动发送一次；不在文章页时带着原话进 `/tools` 只发送一次 | `web.postcard_sent` |
| 文章目录 | 点章节页签或「脉络」 | 章节状态只放 URL（`?c=`），可分享可回退；按年自动归档 | `web.page_view` |
| 文章阅读 | 读；有问题就在文末回邮卡寄出 | 吸顶细条与进度线、左栏目录高亮、问答面板寄出后才加载 | `web.article_ask_opened` |
| 问（`/tools`） | 写卡点、发送、可随时打断 | AI 超时或报错时无声降级为站内相关文章 | `web.ai_graceful_degraded` |
| 全站兜底 | 无 | 路由级错误界面、动态分包 404 单次自愈、版本漂移轻提示 | `web.runtime_error_caught` |

## 事件清单（5 个）

| 事件名 | 触发时机 | 属性字段 | 用途（回答什么问题） |
|---|---|---|---|
| `web.page_view` | 进入或切换公开站路由 | `path: string`, `viewport: desktop \| mobile` | 五个面（首页 / 文章 / 问 / 脉络 / 关于）的真实访问分布 |
| `web.postcard_sent` | 回邮卡点「寄出」 | `queryLength: number` | 文末「问一步」入口是否真被使用 |
| `web.article_ask_opened` | 文末回邮卡寄出、原地打开这篇的问答 | `slug: string` | 按需显现的文章问答是否有人用、哪些文章引发追问 |
| `web.ai_graceful_degraded` | 卡点请求失败/超时后无声降级 | `surface: tools`, `code: string` | AI 失败是否平滑落到站内相关文章 |
| `web.runtime_error_caught` | 捕获运行时异常或动态分包加载失败 | `kind: boundary \| error \| rejection \| preload`, `message: string` | 兜底三件套日志核心，定位白屏与发版间隙 chunk 404 |

## 变更纪律

- 新增或删除任一事件，必须同步更新本表与 [web-telemetry.ts](../apps/web/src/lib/web-telemetry.ts) 白名单；
- 禁止在统计属性中记录访客隐私、完整输入长文或敏感凭据（回邮卡只记长度，不记原话）。
