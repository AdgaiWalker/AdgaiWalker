# 路径偏差表（Stage 1）

公开内容路径与现网对齐意图：

| 源 | 目标 | 说明 |
|----|------|------|
| `/` | `/` | 首页 |
| `/posts` | `/posts` | 文章列表 |
| `/posts/:slug` | `/posts/:slug` | 文章详情（slug 与 `src/content/log` 文件名一致） |
| `/ideas` | `/ideas` | 点子列表 |
| `/projects` | `/projects` | 项目列表 |
| `/learn` | `/learn` | 学习指南列表 |
| `/content` | `/content` | 内容宇宙流 |
| `/about` | `/about` | 关于 |
| `/support` | `/support` | 赞赏/支持 |
| `/login` | `/login` | 登录入口壳 |
| `/tools` | `/tools` | 问答入口（产品改造区） |

暂无额外 301；切流细节见 `docs/cutover-runbook.md`。
