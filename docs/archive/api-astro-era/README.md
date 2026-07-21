# 已废止：Astro 时代 API 契约（仅追溯）

> **状态**：已废止 · 禁止联调 · 禁止当作当前契约  
> **废止日期**：2026-07-21  
> **原因**：仓库唯一运行栈为 React monorepo + Nest + PostgreSQL；旧 `src/pages/api/**` 与 walker-session/Redis 模型已移除。

本目录内容（01–10 章与 verify）描述的是 **Astro 单应用时代** 约 67 个端点，与当前代码 **不一致**。

## 请改用

| 用途 | 文档 |
|------|------|
| **当前 Nest API 契约** | [`docs/api/README.md`](../../api/README.md) |
| 模块与分层 | [`docs/architecture-modules.md`](../../architecture-modules.md) |
| 本地运行 | 根 [`README.md`](../../../README.md) |

## 不得再声称

- 「权威契约 / 零漂移」
- Cookie `walker-session` 管理鉴权（现网管理面为 `ADMIN_API_TOKEN` Bearer）
- Redis / Upstash 为生产存储前提（现网为 PostgreSQL）
