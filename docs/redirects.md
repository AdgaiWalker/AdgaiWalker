# 路径偏差表（Stage 1）

公开内容路径与现网对齐意图（React `apps/web`）：

| 源 | 目标 | 说明 |
|----|------|------|
| `/` | `/` | 首页 |
| `/posts` | `/posts` | 文章列表 |
| `/posts/:slug` | `/posts/:slug` | 文章详情（slug 与 **`content/log`** 下文件名一致，不含扩展名） |
| `/ideas` | `/ideas` | 点子列表 |
| `/projects` | `/projects` | 项目列表 |
| `/learn` | `/learn` | 学习指南列表 |
| `/content` | `/content` | 内容宇宙流 |
| `/about` | `/about` | 关于 |
| `/support` | `/support` | 赞赏/支持 |
| `/login` | `/login` | **登录壳 only**（Auth API 未接；见 feature-keys `auth.login` 后置） |
| `/tools` | `/tools` | 「卡」问答入口 |
| `/tools/resources` | `/tools/resources` | 资源列表 |

内容真相源：`content/log/**/*.{md,mdx}` → `pnpm content:gen` → `apps/web/src/generated/content.json`。

暂无额外 301；切流细节见 `docs/cutover-runbook.md`。
