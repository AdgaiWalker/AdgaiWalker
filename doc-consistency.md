# Walker PRD 与代码差距文档

> 审核时间：2026-05-17  
> 目标文件：`docs/walker-blog-prd.md`  
> 对照范围：`src/pages/**`, `src/components/**`, `src/layouts/**`, `src/content.config.ts`, `src/content/**`, `astro.config.mjs`, `package.json`

## 结论

整体实现与 PRD 主体一致：路由、核心 Layout、内容 Schema、Astro/Vercel/Pagefind/Supabase 点赞等技术规格基本能在代码中找到对应实现。

本轮发现 6 项仍需跟进的差距，其中 2 项为 PRD 已明确记录但代码/内容尚未完成，1 项为代码实现与 PRD 设计原则直接不一致，3 项为 PRD 待办项在代码中的当前状态确认。

| 优先级 | 差距 | 状态 |
| --- | --- | --- |
| P1 | `dockItem` 分类仍未迁移 | 未完成 |
| P2 | 缺少真实 `type: idea` 内容 | 未完成 |
| P2 | `/ai/toolkit` 使用 Emoji 作为标题图标 | 新发现 |
| P2 | `WalkerProfile` 深层入口仍偏少 | 未完成 |
| P2 | About 页文案仍处于待精修状态 | 待产品判断 |
| P3 | 卡片级点赞仍未评估/实现 | 未完成 |

## 差距详情

### P1：`dockItem` 分类仍未迁移

目标文件说明：
- `docs/walker-blog-prd.md:271`：`design-review-skill.md` 仍是 `info-source`，应评估迁移为 `skill`
- `docs/walker-blog-prd.md:272`：`aigc-wechat.md` 仍是 `info-source`，应评估迁移为 `community`

实际代码：
- `src/content/dock/design-review-skill.md:4`：`category: info-source`
- `src/content/dock/aigc-wechat.md:4`：`category: info-source`

影响：
- `design-review-skill` 当前不会进入 `/ai/toolkit` 的 Skill 分区。
- `aigc-wechat` 当前在信息源分组中展示，而不是社群分组。
- `/explore` 的主从列表分类也会继续把这两个条目归到信息源。

建议：
- 先确认内容定位，然后分别改为 `skill` 和 `community`。
- 修改后同步检查 `/ai/sources`, `/ai/toolkit`, `/explore` 三处展示结果。

### P2：缺少真实 `type: idea` 内容

目标文件说明：
- `docs/walker-blog-prd.md:190-194`：`/ai/ideas` 状态中写明 Schema 已支持，但真实 `type: idea` 内容不足。
- `docs/walker-blog-prd.md:351`：待办项为“补真实 `type: idea` 内容”。

实际代码：
- `src/content.config.ts` 已支持 `type: 'idea'`、`status`、`claimInfo`。
- `src/pages/ai/ideas.astro` 已按 `data.category === 'ai' && data.type === 'idea'` 查询内容。
- 当前 `src/content/log/*` 未检索到任何 `type: idea` 条目。

影响：
- `/ai/ideas` 页面功能存在，但内容为空，只能展示空状态。
- PRD 中“AI 想法和项目认领”的页面定位还没有内容支撑。

建议：
- 至少补 2-3 篇真实 idea 内容，覆盖 `open` 和 `completed` 状态。
- 每篇补充 `summary`, `status`, `claimInfo`, `tags`，便于现有 `IdeaCard` 直接展示。

### P2：`/ai/toolkit` 使用 Emoji 作为标题图标

目标文件说明：
- `docs/walker-blog-prd.md:35`：图标使用 Lucide，不用 Emoji 承担界面语义。
- `docs/walker-blog-prd.md:370`：新图标使用 Lucide。

实际代码：
- `src/pages/ai/toolkit.astro:62`：`🧠`
- `src/pages/ai/toolkit.astro:72`：`🛠️`
- `src/pages/ai/toolkit.astro:94`：`✨`
- `src/pages/ai/toolkit.astro:116`：`🧭`
- `src/pages/ai/toolkit.astro:126`：`💸`
- `src/pages/ai/toolkit.astro:136`：`📌`

影响：
- 这与 PRD 的全站图标原则直接冲突。
- 当前页面没有导入 `astro-icon` 的 `Icon`，不能复用 Lucide 图标体系。

建议：
- 在 `/ai/toolkit` 中引入 `Icon`。
- 将上述 Emoji 替换为 `lucide:brain`, `lucide:wrench`, `lucide:sparkles`, `lucide:compass`, `lucide:badge-dollar-sign` 或相近图标。

### P2：`WalkerProfile` 深层入口仍偏少

目标文件说明：
- `docs/walker-blog-prd.md:352`：待办项为“增强 `WalkerProfile` 深层入口”。

实际代码：
- `src/components/WalkerProfile.astro:27-36` 当前只提供 `/posts`, `/explore`, `/about` 三个入口。
- PRD 导航和 AI 子页面还包含 `/ai/learn`, `/ai/ideas`, `/ai/toolkit`, `/ai/sources`。

影响：
- 首页身份卡只能进入总入口，无法直接分流到学习、工具箱、信息源、Idea 等更具体页面。

建议：
- 在不增加首页复杂度的前提下，为 `WalkerProfile` 增加 2-4 个二级入口或折叠入口。
- 优先考虑 `/ai/toolkit`、`/ai/learn`、`/ai/ideas`，因为它们更像个人能力与内容的深层索引。

### P2：About 页文案仍处于待精修状态

目标文件说明：
- `docs/walker-blog-prd.md:353`：待办项为“精修 About 页文案”。

实际代码：
- `src/pages/about.astro` 已包含视频 Hero、个人简介、技能兴趣、社交链接、页面点赞。
- 文案已可用，但仍是通用介绍型表达，是否达到 PRD 想要的“个人介绍与关于本站”深度需要产品侧判断。

影响：
- 这不是功能缺口，更像内容质量缺口。
- 若站点定位为“个人数字根据地”，About 页可进一步强化个人主张、项目脉络和连接理由。

建议：
- 将 README 中的“以人的幸福为目的的 AI 工程哲学”“项目演进路径”“Ferry”等更强识别度内容提炼到 About 页。

### P3：卡片级点赞仍未评估/实现

目标文件说明：
- `docs/walker-blog-prd.md:354`：待办项为“评估卡片级点赞”。

实际代码：
- `LikeCounter` 当前用于首页、About 页和文章详情页：
  - `src/pages/index.astro:119`
  - `src/pages/about.astro:209`
  - `src/pages/posts/[slug].astro:199`
- 未看到 `ArticleCard`, `DockItemCard`, `IdeaCard` 等卡片级点赞接入。

影响：
- 当前点赞粒度是页面级，不支持对资源卡、Idea 卡或文章列表项进行轻反馈。

建议：
- 先明确是否真的需要卡片级点赞；如果需要，应确定 `pagePath` 命名规则，例如 `/card/dock/{id}` 或 `/card/idea/{id}`。
- 避免直接复用页面 URL 导致统计语义混乱。

## 已对齐项摘要

- 路由结构基本符合 PRD：`/posts`, `/posts/[slug]`, `/ai/learn`, `/ai/sources`, `/ai/toolkit`, `/ai/ideas`, `/explore`, `/explore/[slug]`, `/about`, `/404`, RSS 路由均存在。
- `/ai` 与 `/life` 在 `astro.config.mjs` 中配置为重定向到 `/posts`，`/ai/[slug]` 与 `/life/[slug]` 也会 301 到 `/posts/[slug]`。
- `log` 与 `dockItem` Schema 与 PRD 字段基本一致。
- Layout 文件与 PRD 列表一致：`Base`, `SidebarLayout`, `ArticleLayout`, `DockLayout`, `FullscreenLayout` 均存在。
- 客户端脚本与 PRD 列表一致：`ambient`, `scroll-fade`, `sidebar-state`, `toc-tracker`, `column-resize`, `justify-tags` 均存在。
- 技术栈与 PRD 基本一致：Astro 6、Vercel adapter、Tailwind v4、Content Collections、Pagefind、`astro-icon` + Lucide、Supabase 点赞组件均可在配置或源码中找到。

## 验证说明

本轮只生成差距文档，未修改业务代码。

已做文件级核对：
- 读取并对照 `docs/walker-blog-prd.md`
- 读取核心页面、Layout、组件、内容 Schema 与内容条目
- 使用 `Select-String` 抽查关键字段、路由、分类、点赞接入和图标实现

未执行：
- `npx astro check`
- `npm run build`

原因：
- 本轮没有改页面、路由、Schema 或构建配置；按 PRD 验收规则，这两项更适合在后续修复代码后执行。
