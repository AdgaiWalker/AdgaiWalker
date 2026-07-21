# 命名与 SSOT 词汇表（hai-naming / hai-ssot）

> 同一概念只用一个词；不同概念禁止同名。

## 产品词

| 概念 | 用词 | 路径/键 |
|------|------|---------|
| 带着问题来 | **卡** | `dualEntry.ask` → `/tools` |
| 读证据 | **逛** | `dualEntry.browse` → `/posts` |
| 管理过程 | 线索 / 题苗 / 执行 / 指标 | admin 路由 |

禁止：页面里再写死 `'/tools'`、`'/posts'`（应读 `dualEntry`）。

## 页面命名（禁止跨 app 同名异义）

| 文件 | 含义 |
|------|------|
| `AccountLoginShellPage` | 公开站登录**壳**（Auth 未接） |
| `AdminTokenPage` | 管理端 Bearer 令牌 |
| `ContentUniversePage` | 公开「内容宇宙」列表 |
| `AdminContentPlaceholderPage` | 管理端内容未迁占位 |

路由 URL 可仍为 `/login`、`/content`（对外稳定）；**导出组件名**必须可区分。

## 日期与外链 SSOT

| 事实 | 唯一入口 |
|------|----------|
| 解析内容日期 | `parseIsoDate`（`shared/format.ts`） |
| 站外链接 | `SITE_LINKS`（`shared/constants.ts`） |
| 邮箱 | `SITE_EMAIL` / `SITE_LINKS.mailto` |

## 分层词（与 frontend-layers 一致）

配置 · 规则 · 门面 · 页 · 展示块 · 壳 · hooks  

「组件」口语默认指**展示块**，不要用来指门面或规则。
