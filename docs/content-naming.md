# 内容命名与网址（简单规则）

## 三句规则

1. **`content/log/{slug}.md` 的文件名 = 公开 URL 的 slug**（`/posts/{slug}`）。
2. **slug 只用** 小写 ASCII + 短横线：`[a-z0-9]+(-[a-z0-9]+)*`。
3. **`title` 写中文**（给人看）；改标题不必改文件名。

新文直接按此创建；**尽量不改已发布 slug**（改了 = 网址变了，需 redirects）。

不做：纯数字 `/posts/1`、文件名中文、独立 `slug:` 双轨（要简单就维持文件名=网址）。

## 2026-07-22 迁移对照（旧 → 新）

| 旧 slug（文件名） | 新 slug |
|-------------------|---------|
| Walker启航 | walker-launch |
| 我的畏惧也是动力 | fear-as-fuel |
| 点子超越时间 | ideas-beyond-time |
| 未来已经在来了 | future-already-here |
| 渡论构建 | ferry-theory |
| Ferry渡轮 | ferry-spec |
| 减法对话 | subtraction-dialogue |
| 设计为人与内容搭桥 | design-for-people |
| 卡牌桌 | card-table |
| CLI命令面板 | cli-command-palette |
| CC入门 | cc-intro |
| Codex入门 | codex-intro |
| 点子共促 | idea-cocreate |
| 平价AI社区 | affordable-ai-community |
| 无题-关于人与skill | on-people-and-skill |
| walkcraft-skill-craft | （未改） |
| side-hustle-blueprint | （未改） |

生产旧链 301 见根目录 `vercel.json` redirects（与上表同步）。
