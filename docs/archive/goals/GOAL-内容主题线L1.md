# Goal Document: 内容主题线 L1（series / related 进站）

> **状态**：已执行（工程）  
> **关联**：`docs/content-naming.md`（文件名=URL slug）

## Target Outcome

逛 `/posts` 可按主题线筛选；详情对有 `series` 的文显示同线上一篇/下一篇；对存活 `related` 显示站内链。数据仅来自 `content/log` → `pnpm content:gen`。

## 核心模块（一句话职责）

| 模块 | 职责 |
|------|------|
| **content-gen**（`scripts/generate-content.ts`） | 扫描 log frontmatter，投影为 `content.json`（含 series / seriesOrder / related） |
| **content-series**（`apps/web/src/shared/content-series.ts`） | 纯函数：主题线列表、同线排序、邻篇、过滤死 related |
| **content 门面**（`apps/web/src/content.ts`） | 绑定 gen 产物，向页面暴露已发布查询 API |
| **PostsPage** | 编排主题线 chips + 列表筛选展示 |
| **PostDetailPage** | 渲染正文、目录/进度、邻篇导航、related 链、赞与反馈 |
| **article-outline** | 从 HTML 抽 TOC、注入标题 id、计算阅读进度比例 |
| **ArticleToc / ReadingProgress** | 目录与进度条纯展示（Lucide） |

## 模块关系（依赖 / 调用 / 触发 / 实现）

```
[触发] pnpm content:gen / build:web / dev:web
    → [调用] content-gen
    → [实现] 写入 apps/web/src/generated/content.json
    （理由：构建期唯一内容投影入口，页面不直读 md）

[依赖] PostsPage / PostDetailPage / ItemList
    → [依赖] content 门面（接口式查询函数，不 import JSON 路径散落）
    → [依赖] content-series 纯函数（content 门面调用；页面不重复排序逻辑）
    （理由：依赖倒置——页依赖稳定查询形状，排序/过滤实现可单测）

[触发] 访客切换主题线 chip
    → [调用] listSeries / getPostsBySeries / getPostsWithoutSeries
    → [实现] 列表数据替换，URL 仍为 /posts/{ascii-slug}

[触发] 打开详情
    → [调用] getSeriesNeighborsForSlug / getRelatedPosts
    → [调用] buildArticleOutline（正文 HTML）
    → [实现] 邻篇、related、TOC、进度条（死 related 丢弃）
```

方向小结：

- **依赖**：UI → content 门面 → content-series；gen 不依赖 UI。  
- **调用**：门面调用 series 纯函数；页只调门面。  
- **触发**：构建脚本 / 用户筛选 / 路由进详情。  
- **实现**：排序与过滤在 content-series；投影在 gen。

## Non-goals（本 Goal）

生产切流、TOC/Giscus、Match、Admin 内容编辑、硬编码主题线名单。

## Pass（工程）

- [x] gen 含 series / related；Ferry 单一线名  
- [x] `/posts` chips  
- [x] 详情邻篇 + related  
- [x] 模块关系文档  
