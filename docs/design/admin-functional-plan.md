# Admin 功能落地计划

> 配套：[`admin-redesign-spec.md`](./admin-redesign-spec.md)
> 状态：待执行 · 2026-06-19 起草
> 背景：后台 UI 已按 spec 1:1 还原（视觉完成），但页面是"展示壳"——真实数据接不上、按钮点了没反应。本计划负责把壳变成能用的产品。

---

## 现状全貌（代码审计结论，非估计）

| 页面 | 真实度 | 详情 |
|------|--------|------|
| AI Gateway | **~75%** | 日志/配置/成功率/延迟/24h 柱状图是真的；成本/阈值/QPS 单位/"DS" logo/"2h 前"/红色降级柱是假的 |
| 内容管理 | **~40%** | 表格数据 + 编辑链接是真的；搜索/筛选/分页/复选框/批量/同步/⋮ 全是死的 |
| 工作台 | **~30%** | 3 个指标有后端函数但值写死了；需求列表有数据时真、空时用假数据补 |
| 洞察 | **~5%** | 只有 tab 切换 JS 能用；3 个 tab 的所有数据全是编的 |

### 根本问题：后端不存在，不是"没接"

- 功能热度/文章热度/来源/流失漏斗 → 全仓零遥测（`grep pageview|featureUsage|funnel` 零命中）
- 成本/阈值 → `GatewayCallLog` 有 token 但无定价模型
- 反馈"AI 聚类" → 实际是规则拼 key（`layer:ability:category:role`），无置信度、无代表原话
- `TopicCandidate` 只有 `representativeNeed`（摘要）+ `density`，**没有** spec 画的"原话/置信度/AI 建议"

### 但有现成后端能立刻接

- 待立项数 = `getTopicCandidates({status:'observed'}).length`
- Gateway 健康 = `getGatewayStats()` 算 successRate
- 命中率 = `calculateContentHitRates()` 聚合
- 内容搜索/筛选/分页 = 客户端 JS（17 条全量已加载）
- 内容改可见性 = `PATCH /api/admin/content/[slug]` ✅ 已有端点
- 需求标记审核 = `POST /api/admin/review` ✅ 已有端点

---

## 核心原则

1. **真数据优先，删假数据** — 宁可少一个 tab，不留假数据误导决策
2. **按钮要么真能跳/能执行，要么明确禁用** — 不留"看起来能点其实没用"的按钮
3. **能复用现有端点就不造新端点** — review/inspiration/insights/content PATCH 全已存在
4. **客户端过滤代替后端分页** — 17 条全量 SSR 渲染，JS 过滤分页（无 list API）

---

## 阶段一：Dashboard 接真数据

**真实度 30% → 90% ｜ ~0.5 天 ｜ 0 新端点**

| 改动 | 做什么 | 数据源 |
|------|--------|--------|
| Metric「本周需求」 | 去掉 `\|\| 47` fallback，纯用 `stats.totalCases`；副信息删假"↑12"，改成"近 7 天" | `getNeedCaseStats` ✅ |
| Metric「待立项」 | `getTopicCandidates({status:'observed'}).length` 替换写死 23 | `getTopicCandidates` ✅ |
| Metric「Gateway 健康」 | 复用 gateway 页的 `getGatewayStats()` 算 successRate，副信息用真实 fallbackCalls | `getGatewayStats` ✅ |
| Metric「内容命中率」 | 聚合 `calculateContentHitRates()` 求加权平均（resolved/feedbackGiven）；算不出则显示"—"并标"待积累" | `calculateContentHitRates` ✅ |
| 需求列表 | 删 demoNeeds 兜底；空列表直接走空状态（§4.2 已有） | `getPendingReviewNeedCases` ✅ |
| 需求行按钮 | `actionHref` 统一指向 `/admin/review?view=list`（不 POST，留给 review 页带上下文操作） | 现有路由 ✅ |
| 「全部阶段」筛选 | **删掉**（无阶段数据支撑） | — |

---

## 阶段二：内容管理变可操作

**真实度 40% → 90% ｜ ~1 天 ｜ 0 新端点 ｜ 投入产出比最高**

表格数据本就真实，只差交互。

| 改动 | 做什么 |
|------|--------|
| SSR 全量渲染 | 去掉 `slice(0,6)`，渲染全部 17 行（默认 JS 只显示前 10） |
| 搜索框 | `<input>` 加 `input` 事件，客户端按 title/slug/tags 过滤 |
| 类型/状态筛选 | 下拉改成 select change 事件，客户端过滤（复用 `ideas-page.ts` filter 模式） |
| 排序 | 最新（date desc，默认）/ 最早 / 按标题，客户端排 |
| 分页器 | 真 JS 分页，每页 10 条，pager 按钮读当前页 state |
| 「同步」按钮 | **删掉**（内容是本地集合，无外部源可同步，按钮语义不存在） |
| 行菜单「设为私密」 | 每行加"⋯"菜单 → `PATCH /api/admin/content/[slug]`（复用 `AdminEditBar.astro:163-191` fetch 模式） |
| 批量操作 | 暂禁用 + tooltip"待实现" |
| 访问列 | 保留"—"，列头加 title"浏览遥测待建" |

---

## 阶段三：Insights 三 tab 接真数据

**真实度 5% → 每个 tab 都是真数据 ｜ ~1.5 天 ｜ 0 新端点 ｜ 最复杂**

**策略：改语义、删无数据部分。**

### Tab1「功能活动」（原"功能热度"）

- 改 tab 名为"功能活动 · 改功能"
- 保留：提问匹配（`match:stats:total`）、点赞总数（`getLikeLeaderboard` 聚合）
- **删除**：文章阅读/学习轨道/内容关系图谱/项目展示 4 行（无遥测）
- **删除**：来源卡 + 流失漏斗卡（无 referrer/funnel 遥测）
- 副标诚实写明"基于提问与点赞计数 · 浏览/漏斗遥测待建"
- 死按钮（加固/观察/考虑删除）→ 改成跳转：提问匹配→`/admin/ai-gateway`，点赞→`/admin/content`

### Tab2「文章反馈」（原"文章热度"）

- 改 tab 名为"文章反馈 · 改文章"
- 数据源：`calculateContentHitRates()` 拿每篇 resolved/stuck/feedback 数，按 resolved 降序排
- 删除假的 views/stay/delta 列，改成"反馈 N · 解决 X · 卡 Y"
- `ArticleRow` 保持单动作（不扩展为多动作菜单）：
  - 有命中问题的文章 → "查看反馈" → `/admin/hit-rate`
  - 点赞高的文章 → "改写" → `/admin/content/edit?slug=<id>`
- **不接**"写更多/藏起来/补问答"（需扩展组件 + 需 slug，留后续）

### Tab3「反馈聚类」

- 数据源：`getTopicCandidates({limit:20})` 接真聚类
- 副标"AI 已聚类"改成**"规则聚类"**（诚实——`insight.ts` 是规则拼 key）
- ThemeCard 映射：`representativeNeed`（摘要）→ quote 区，`density`→ 计数，`priority`→ tagKind
- **删掉假的"置信 N%"**
- "加入选题" → `POST /api/admin/inspiration { text: representativeNeed }`（用文本创建新灵感，不强行回链 clusterKey）
- "全部忽略" → `POST /api/insights { topicId, status:'ignored' }`（复用 `topics.astro:228-251` 模式，需真 topicId）

### 「本周该做的 3 件事」AI 行动条

- **降级**：从"AI 自动排序 3 件事"改成"需关注"静态列表
- 取 resolved=0 且 density≥3 的 topic，按 density 降序取前 3
- 删掉假的优先级颜色（红/青/amber），改成统一中性 + density 标注
- 副标"AI · 本周建议"改成**"需关注 · 按反馈密度"**

---

## 阶段四：AI Gateway 诚实化

**真实度 75% → 95% ｜ ~0.5 天 ｜ 0 新端点**

| 改动 | 做什么 |
|------|--------|
| 「今日 QPS」| 改名**"今日调用数"**，单位去掉"/min"（实为总数不是 QPS），副信息删"正常区间"假话 |
| 「本月成本」| 改名**"Token 用量"**，显示 `promptTokens+completionTokens` 总和（无金额） |
| 预算卡 + 阈值卡 | **删掉**（无成本聚合、无限流/熔断配置字段，全是假数据） |
| 红色降级柱 | 删掉 `h.hour % 7 === 0` 假逻辑，柱状图纯按 `hourlyDistribution.count` 渲染（全 teal） |
| "DS" logo | 从 `currentProvider.name` 取首字母 |
| "降级中 · 2h 前" | "2h 前"删掉（无 last-degraded 时间戳），只留"降级中"红点 |
| 「服务商配置」按钮 | 禁用 + tooltip"在 /api/admin/gateway 配置"（无独立配置 UI 页） |
| 「全部日志」链接 | **删掉**（无独立日志页，现误指向 /admin/insights） |
| 日志 query 列 | 列名改**"路由"**（显示的是 `log.route` 不是访客原话） |

---

## 明确不做

- **不建遥测基建**（功能浏览量/停留时长/来源/漏斗）—— 独立大工程，单独立项
- **不建成本/定价模型** —— 需定价表 + 聚合，单独立项
- **不建 Q&A 页面** —— "补问答"无落点，留后续
- **不扩展 ArticleRow 为多动作菜单** —— 保持单动作，降低改动面
- **不动 `/api/admin/inspiration` 加 clusterKey 参数** —— 会破坏双源聚类设计（`processPendingNeedCases` 靠 clusterKey 合并，强加会 shadow 真聚类）

---

## 交付节奏

4 个阶段各自独立分支 + PR。

**建议执行顺序：阶段一 → 阶段四 → 阶段二 → 阶段三**（按改动量从小到大、风险从低到高）。

每个 PR 验收标准：
- `astro check`（0 新错误）
- `vitest`（现有 160 通过）
- `astro build` ✓
- 截图回归对照

---

## 总工作量

约 **3.5 个工作日**（阶段一 0.5d + 阶段二 1d + 阶段三 1.5d + 阶段四 0.5d）

---

## 关键端点/函数速查

| 需求 | 端点/函数 | 位置 |
|------|-----------|------|
| 内容改可见性 | `PATCH /api/admin/content/[slug]` body `{visibility}` | `content/[slug].ts:108` |
| 灵感转选题 | `POST /api/admin/inspiration` body `{text}` | `inspiration.ts:25` |
| 选题状态变更 | `POST /api/insights` body `{topicId,status}` | `insights.ts:50` |
| 需求审核 | `POST /api/admin/review` body `{needCaseId,status,note?}` | `review.ts:56` |
| 内容命中率 | `calculateContentHitRates()` | `hit-rate.service.ts:50` |
| 点赞榜 | `getLikeLeaderboard(limit)` | `hit-rate.service.ts:111` |
| 选题候选 | `getTopicCandidates({status,limit})` | `conversation/store.ts:766` |
| Gateway 统计 | `getGatewayStats()` | `gateway-config.ts:418` |
| 需求统计 | `getNeedCaseStats({days})` | `conversation/store.ts:831` |
| 内容全量 | `getAllContentEntries()` | `content.ts:23` |
| 可见性判定 | `getContentVisibility(data)` | `content.ts:11` |

## 客户端过滤参照模式

- tab/button 过滤：`src/scripts/ideas-page.ts:53`、`src/scripts/justify-tags.ts:11`
- visibility PATCH fetch：`src/components/admin/AdminEditBar.astro:163-191`
- 选题状态 POST fetch：`src/pages/admin/topics.astro:228-251`
