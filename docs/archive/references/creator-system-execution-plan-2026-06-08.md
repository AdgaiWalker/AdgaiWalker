> Archived: This execution plan has been superseded by `references/creator-system-current-state.md`. It is kept for historical task detail only.

# Walker 创作者系统 — 全量可执行方案

> 日期：2026-06-08
> 范围：内联编辑、选题库、数据看板、对话保留、权限模型
> 原则：先不要写代码。每个 Phase 可独立上线，不互相阻塞。

---

## 0. 现状盘点

### 已有基础设施

| 组件 | 文件 | 状态 |
|------|------|------|
| 管理员认证 | `src/lib/admin-auth.ts` | ✅ Cookie HMAC，7天有效 |
| 登录页 | `src/pages/admin/login.astro` | ✅ 密码登录 |
| 管理仪表盘 | `src/pages/admin/index.astro` | ✅ 内容统计 + 快捷入口 |
| 认证 API | `src/pages/api/admin/auth.ts` | ✅ POST 登录 / DELETE 登出 |
| 工具匹配 UI | `src/components/tools/ToolMatchChat.astro` | ✅ 对话式 UI |
| 匹配 API | `src/pages/api/match.ts` | ✅ 隐私脱敏 + 本地匹配 + Claude API |
| 会话结束 API | `src/pages/api/match-end.ts` | ✅ 记录 endedAt |
| 批处理 API | `src/pages/api/match-process.ts` | ✅ Cron 触发，聚类需求 |
| 洞察 API | `src/pages/api/insights.ts` | ⚠️ 只认 CRON_SECRET，不认 admin cookie |
| 会话存储 | `src/conversation/store.ts` | ✅ Redis + 内存降级 |
| 需求洞察 | `src/agent/insight.ts` | ✅ 聚类 + 生成 TopicCandidate |
| 隐私护盾 | `src/agent/privacy.ts` | ✅ PII 脱敏 |
| Vercel Cron | `vercel.json` | ✅ 每日 18:00 触发 match-process |

### 已有数据结构

```typescript
// 会话（match:session:{sessionId}）
MatchSession {
  sessionId, startedAt, endedAt?, lastActiveAt,
  sourcePage, messageCount, consentForTopic,
  audienceGroup?, aiStage?, isMinorContext,
  promptVersion, modelVersion
}

// 需求事件（match:event:{eventId}）
DemandEvent {
  eventId, sessionId, createdAt,
  rawNeedRedacted, needSummary, needCategories[],
  fitVerdict?, toolDirection?, codexMisuseLikely?,
  audienceGroup?, aiStage?, isMinorContext,
  recommendedContentIds[], piiDetected, piiRemoved,
  status: 'pending' | 'processed' | 'ignored'
}

// 选题候选（match:topic:{topicId}）
TopicCandidate {
  topicId, createdAt, title, audience,
  coreQuestion, contentAngle, sourceNeedCount,
  relatedContentIds[], priority, status
}
```

### 关键缺口

| 缺口 | 影响 | 状态 |
|------|------|------|
| 对话消息不持久 | 用户看不到历史，管理员看不到原文，Agent 无法深度分析 | ✅ P1 已解决（Redis 持久化 + 历史查看） |
| Insights API 不认 admin cookie | 管理员浏览器访问 401 | ✅ P0 已解决 |
| 没有公开统计接口 | 无法在 /tools 展示社交证明 | ✅ P0 已解决（`/api/stats`） |
| 没有选题库管理页 | 选题候选存在 Redis 但没有 UI | ✅ P3 已解决（`/admin/topics`） |
| 没有数据看板页 | /admin/insights 链接存在但页面不存在 | ✅ P2 已解决（`/admin/insights`） |
| 没有内容编辑功能 | 改文章只能改代码 + push | ✅ P4 已解决（AdminEditBar + CRUD API） |
| 没有 AdminEditBar | 管理员在页面上看不到编辑入口 | ✅ P4 已解决（文章详情页已注入） |

---

## 1. 总体架构

### 三大系统

```
系统 A：对话增强层
  ├─ 消息持久化（Redis）
  ├─ 用户历史查看（localStorage sessionId）
  ├─ Agent 自动提取 role/stage/domain
  └─ 管理员查看所有对话

系统 B：选题库 + 数据看板
  ├─ /admin/topics — 选题候选管理
  ├─ /admin/insights — 数据看板
  ├─ /api/stats — 公开统计
  └─ Agent 批处理增强

系统 C：内联编辑
  ├─ AdminEditBar — 浮动编辑栏
  ├─ /api/admin/content — CRUD API
  └─ GitHub API 回写 + 自动部署
```

### 权限模型

| 能力 | 游客 | 已匹配用户 | 管理员 |
|------|------|-----------|--------|
| 浏览内容 | ✅ | ✅ | ✅ |
| 使用工具匹配 | ✅ | ✅ | ✅ |
| 看匹配总数（社交证明） | ✅ | ✅ | ✅ |
| 看自己的对话历史 | — | ✅ | ✅ |
| 看别人对话 | ❌ | ❌ | ✅（脱敏） |
| 内联编辑按钮 | ❌ | ❌ | ✅ |
| /admin/* 全部页面 | 重定向登录 | 重定向登录 | ✅ |
| /api/insights | ❌ | ❌ | ✅ |
| /api/admin/content | ❌ | ❌ | ✅ |

### 数据敏感度分层

| 层级 | 数据 | 可见范围 |
|------|------|----------|
| 🟢 公开聚合 | 匹配总数、内容总数、Top 3 类别 | 任何人 |
| 🟡 用户自有 | 当前用户的对话历史 | 仅自己（localStorage sessionId） |
| 🔴 管理专属 | 脱敏对话全文、选题候选、趋势、缺口 | 仅管理员 |
| ⛔ 不存储 | 原始 IP（永久）、手机号、邮箱、身份证 | 不存在 |

---

## 2. 分期计划

### Phase 概览

```
P0 ── 认证打通 + 公开统计 ──────────────── 基础设施
 │
P1 ── 对话持久化 + 用户历史 ────────────── 系统A
 │
P2 ── 数据看板 (/admin/insights) ───────── 系统B
 │
P3 ── 选题库 (/admin/topics) + Agent增强 ── 系统B
 │
P4 ── 内联编辑 (AdminEditBar + CRUD) ───── 系统C
```

每个 Phase 的验收标准、影响范围、行为衔接如下。

---

### Phase 0：认证打通 + 公开统计

> 目标：让管理员能通过浏览器访问洞察数据，同时给用户展示社交证明。
> 优先级：最高（后续所有 Phase 依赖此基础）
> 预计涉及：~6 个文件

#### P0-A：Insights API 加 admin cookie 认证

**现状**：`/api/insights.ts` 只认 `CRON_SECRET` header，管理员在浏览器登录后访问 `/api/insights` 返回 401。

**改动**：

- `src/pages/api/insights.ts`
  - `isAuthorized()` 函数增加 admin cookie 检查
  - 优先级：admin cookie > CRON_SECRET header
  - 引入 `isAdmin()` from `@/lib/admin-auth`

**影响**：
- 现有 Cron 定时任务不受影响（仍然用 CRON_SECRET）
- 管理员登录后可直接在浏览器访问 `/api/insights?type=topics`
- 不影响任何用户端功能

**行为衔接**：
```
管理员登录 → cookie walker-admin 被设置
  → 访问 /api/insights → 检查 cookie → 验证通过 → 返回数据
  → 访问 /admin → 跳转到仪表盘
Cron 定时任务 → 带 x-match-process-secret header
  → 访问 /api/insights → 检查 header → 验证通过 → 返回数据
```

#### P0-B：公开统计接口 `/api/stats`

**新建文件**：`src/pages/api/stats.ts`

**功能**：
- `GET /api/stats` → 返回聚合数字，无需任何认证
- 返回内容：
  ```json
  {
    "matchCount": 128,
    "contentCount": 42,
    "topCategories": [
      { "id": "coding", "label": "编程", "count": 45 },
      { "id": "writing", "label": "写作", "count": 28 },
      { "id": "education", "label": "教学", "count": 18 }
    ]
  }
  ```
- `matchCount` 从 Redis `match:events:*` 计数（或独立 counter）
- `contentCount` 从 content collection 获取
- 响应缓存 5 分钟（`Cache-Control: public, max-age=300`）

**影响**：
- 新增一个只读公开 API
- 不暴露任何个人数据或单条需求
- 每次请求 Redis 计数可能有性能影响 → 考虑独立 counter

**计数方案**：

选择独立 Redis counter（`match:stats:total`），每次 `/api/match` 成功时 `INCR`，避免每次 stats 请求扫描所有 event key。

**行为衔接**：
```
/api/match 被调用 → 推荐成功 → redis.incr('match:stats:total')
                                  redis.incr('match:stats:category:{cat}')
/api/stats 被调用 → 读取 counter → 返回聚合数字
/tools 页面加载 → fetch /api/stats → 展示"已帮助 X 人"
```

#### P0-C：/tools 页面展示社交证明

**改动**：

- `src/components/tools/ToolMatchChat.astro`
  - 在 `.match-signal` 按钮内增加 `<span class="signal-stat" id="match-stat"></span>`
  - 客户端脚本 fetch `/api/stats`，填入"已帮助 {n} 人"
  - 加载失败不显示（优雅降级）

**影响**：
- 视觉上只多了一行小字
- 不影响现有匹配功能
- 用户首次访问时多一个 fetch 请求（可缓存）

#### P0 验收标准

- [ ] 管理员登录后，浏览器直接访问 `/api/insights` 返回 200 + 数据
- [ ] Cron 带正确 header 访问 `/api/match-process` 仍然正常工作
- [ ] `GET /api/stats` 无需认证返回 `{ matchCount, contentCount, topCategories }`
- [ ] `/tools` 页面信号按钮显示"已帮助 X 人"（数字来自 API）
- [ ] 未登录用户访问 `/api/insights` 返回 401
- [ ] `matchCount` 准确反映成功匹配次数

#### P0 详细 To-Do

- [ ] `src/pages/api/insights.ts`：`isAuthorized()` 增加 `isAdmin(request)` 检查
- [ ] `src/conversation/store.ts`：新增 `incrementMatchStats(categories)` 函数
- [ ] `src/pages/api/match.ts`：成功返回前调用 `incrementMatchStats()`
- [ ] `src/pages/api/stats.ts`：新建，读取 counter + content count
- [ ] `src/components/tools/ToolMatchChat.astro`：增加统计展示 + fetch 逻辑
- [ ] 测试：管理员浏览器访问 insights → 200
- [ ] 测试：匿名访问 stats → 200 + 正确数据
- [ ] 测试：匿名访问 insights → 401

---

### Phase 1：对话持久化 + 用户历史

> 目标：保留用户对话消息，用户能看自己的历史，管理员能看所有对话。
> 优先级：高（选题库 Agent 分析需要对话原文）
> 预计涉及：~5 个文件

#### P1-A：对话消息存储

**现状**：`/api/match` 接收 `messages[]` 但只提取最新需求做匹配，不存储消息。`ToolMatchChat.astro` 的 `conversationHistory` 只在内存中，刷新即丢失。

**改动**：

- `src/conversation/store.ts`
  - 新增 `ConversationMessage` 类型：`{ role, content, timestamp }`
  - 新增 `saveConversationMessages(sessionId, messages)` 函数
  - Redis key: `match:messages:{sessionId}`，List 类型
  - 对话 30 天 TTL（`redis.expire` 设置）

- `src/pages/api/match.ts`
  - 在 `POST` handler 中，匹配成功后调用 `saveConversationMessages(session, cleanMessages)`
  - 只存储脱敏后的消息（已通过 `cleanMessages()` 处理）

**影响**：
- 每次匹配多一次 Redis 写操作
- Redis 存储量增加（每条对话 ~1-2KB，30 天自动过期）
- 不影响匹配性能（异步写入）

**行为衔接**：
```
用户发消息 → /api/match → 匹配 + 脱敏
  → 返回推荐结果
  → saveConversationMessages(sessionId, [用户消息, 助手回复])
  → Redis: match:messages:{sessionId} = [{role, content, timestamp}, ...]
  → TTL 30 天
```

#### P1-B：用户查看自己的对话历史

**新建 API**：`src/pages/api/match-history.ts`

**功能**：
- `GET /api/match-history?sessionIds=id1,id2,id3`
- 接收 localStorage 中存储的 sessionId 列表
- 返回这些 session 的对话消息
- 每个 session 单独返回，不混合

**客户端改动**：

- `src/components/tools/ToolMatchChat.astro`
  - 新增"历史"按钮，点击展开对话历史面板
  - localStorage 存储 `match-session-ids`：用户所有会话 ID 列表
  - 每次新会话创建时追加 sessionId
  - 历史面板 fetch `/api/match-history` 展示历史对话

**影响**：
- 用户关闭浏览器后再回来，能看到之前的对话
- 管理员通过 `/api/admin/conversations` 看所有对话（P3 实现）
- 对话 30 天后自动过期

**隐私**：
- sessionId 是 UUID，无法猜测其他用户的 ID
- 不暴露任何其他用户的信息
- 用户可以清空 localStorage 来"忘记"历史

#### P1-C：Agent 自动提取用户画像

**现状**：用户可选 audience/stage 下拉，但大多数人跳过。

**改动**：

- `src/pages/api/match.ts`
  - 在系统提示词中增加：要求 Claude 从对话内容推断 `inferredAudience` 和 `inferredAiStage`
  - 模型返回 JSON 中增加 `inferredAudience?` 和 `inferredAiStage?` 字段
  - 如果用户没手动选，用推断值填充 session 的 `audienceGroup` 和 `aiStage`
  - 如果用户手动选了，手动选优先

**影响**：
- 不改变前端 UI
- 不改变用户体验
- 后台数据更丰富（更多 session 带有 audience/stage 标签）
- 推荐质量提升（更多上下文）

**行为衔接**：
```
用户："我是老师，想用 AI 出卷子"
  → Claude 推断：inferredAudience = "teacher", inferredAiStage = "beginner"
  → session.audienceGroup = "teacher"（用户没手动选，用推断值）
  → session.aiStage = "beginner"
  → 后续推荐针对性更强
  → 匿名需求事件也带上这些标签
```

#### P1 验收标准

- [ ] 匹配对话后，Redis 中存在 `match:messages:{sessionId}` 且内容正确
- [ ] 对话消息已脱敏（无 PII）
- [ ] 用户刷新页面后，点击"历史"能看到之前的对话
- [ ] 用户看不到其他用户的对话
- [ ] Agent 能从对话中推断 audience/stage（测试"我是老师想出卷子"）
- [ ] 手动选的 audience/stage 优先于推断值
- [ ] 对话 30 天后自动过期

#### P1 详细 To-Do

- [ ] `src/conversation/store.ts`：新增 `ConversationMessage` 接口 + `saveConversationMessages()` + `getConversationMessages()`
- [ ] `src/pages/api/match.ts`：成功后调用 `saveConversationMessages()`；增加 `inferredAudience`/`inferredAiStage` 到模型提示词和返回解析
- [ ] `src/pages/api/match-history.ts`：新建，按 sessionId 列表返回对话
- [ ] `src/components/tools/ToolMatchChat.astro`：localStorage 存 sessionId 列表 + "历史"按钮 + 历史面板
- [ ] 测试：对话后检查 Redis 数据
- [ ] 测试：刷新后查看历史
- [ ] 测试：推断画像的准确性（测试 3 个典型场景）

---

### Phase 2：数据看板 /admin/insights

> 目标：管理员专属数据看板，展示匹配趋势、类别分布、热门需求、内容缺口。
> 优先级：中高（选题库的前置可视化）
> 依赖：P0（认证打通）
> 预计涉及：~3 个新文件

#### P2-A：看板页面

**新建文件**：`src/pages/admin/insights.astro`

**功能**：
- 服务端渲染（`prerender = false`），检查 admin cookie
- 未认证重定向 `/admin/login`
- 页面布局沿用 `/admin/index.astro` 的风格（Admin bar + 主内容区）

**展示内容**：

| 区域 | 数据 | 图表形式 |
|------|------|----------|
| KPI 卡片 | 匹配总数、会话总数、待处理事件数、选题候选数 | 数字卡片 |
| 匹配趋势 | 最近 30 天每日匹配数 | SVG 折线图（polyline） |
| 类别分布 | 需求类别占比 | CSS 水平条形图 |
| 判断分布 | fitVerdict 占比 | CSS 水平条形图 |
| 热门需求 Top 10 | 需求摘要 + 次数 | 排行榜列表 |
| 内容缺口 | 无关联站内内容的选题 | 警告列表 |

**图表方案**：纯 CSS + SVG，不引入 Chart.js 等重型库。
- 折线图：SVG `<polyline>` + viewBox 自适应
- 条形图：`<div>` + `width: {pct}%` + `transition: width 0.3s`
- 排行榜：`<ol>` + 计数气泡

**数据获取**：
- 页面 frontmatter 中调用 `getDemandStats()` 和 `getTopicCandidates()`
- 直接服务端渲染，无需客户端 fetch
- 缓存：页面级不缓存（每次请求都拿最新数据）

#### P2-B：导航更新

**改动**：

- `src/pages/admin/index.astro`
  - "需求洞察"快捷入口的链接保持 `/admin/insights`（已有占位）
  - Top bar 增加一个"洞察"导航链接

#### P2 验收标准

- [ ] `/admin/insights` 未登录访问 → 重定向到 `/admin/login`
- [ ] 登录后访问 → 展示完整看板
- [ ] KPI 卡片数字与 `/api/insights` 返回一致
- [ ] 折线图展示最近 30 天趋势，数据点正确
- [ ] 条形图展示类别分布，总和 = 匹配总数
- [ ] 热门需求 Top 10 按次数降序
- [ ] 内容缺口列表正确识别无关联站内内容的选题
- [ ] 移动端布局正常（< 640px）

#### P2 详细 To-Do

- [ ] `src/pages/admin/insights.astro`：新建完整看板页
- [ ] 图表组件：SVG 折线图（内联在页面中）
- [ ] 图表组件：CSS 条形图（内联在页面中）
- [ ] 排行榜列表：热门需求 + 计数气泡
- [ ] 内容缺口识别：筛选 `relatedContentIds.length === 0` 的 TopicCandidate
- [ ] `src/pages/admin/index.astro`：Top bar 增加"洞察"链接
- [ ] 响应式布局：< 640px 卡片 2 列，图表全宽
- [ ] 测试：登录 → 看板展示正确
- [ ] 测试：未登录 → 重定向

---

### Phase 3：选题库 /admin/topics + Agent 增强

> 目标：管理员查看、审核、管理选题候选。Agent 批处理增加内容缺口分析。
> 优先级：中（核心价值，但依赖 P1 的对话数据）
> 依赖：P1（对话持久化）、P2（看板基础）
> 预计涉及：~5 个文件

#### P3-A：选题库管理页

**新建文件**：`src/pages/admin/topics.astro`

**功能**：
- 服务端渲染，检查 admin cookie
- 展示所有 TopicCandidate，按 priority 排序（高 → 中 → 低）
- 每个 TopicCandidate 卡片展示：
  - 优先级标签 + 来源需求数
  - 标题
  - 受众 + AI 阶段
  - 核心问题
  - 内容角度
  - 关联站内资料（如有）或"内容缺口"标记
  - 操作按钮：采纳 / 暂缓 / 忽略

**交互**：
- 点击"采纳" → `POST /api/insights` `{ topicId, status: 'accepted' }` → 卡片变为"已采纳"状态
- 点击"暂缓" → 同上，status = 'deferred'
- 点击"忽略" → 同上，status = 'ignored'
- 客户端 JS 处理，无需整页刷新
- Tab 筛选：全部 / 待处理 / 已采纳 / 已暂缓

#### P3-B：Agent 批处理增强

**现状**：`insight.ts` 的 `processPendingDemandEvents()` 用简单的 key 前缀聚类（`category:needText[0:18]`），规则硬编码。

**改动**：

- `src/agent/insight.ts`
  - 增加一轮 Claude API 调用（可选，有 API key 时启用）
  - 输入：待处理的需求事件摘要列表
  - 让 Claude 做：
    1. 更精确的语义聚类（不是前缀匹配）
    2. 判断内容缺口（站内资料是否已覆盖）
    3. 生成更自然的选题标题和内容角度
    4. 评估优先级（基于需求频率 × 内容缺口 × 受众规模）
  - 无 API key 时降级为现有规则聚类

**成本控制**：
- 只发送脱敏摘要，不发送完整对话
- 每次批处理最多 50 条
- 模型用 `claude-sonnet-4-6`（便宜）
- 单次调用 max_tokens: 1000
- 超时 15s

#### P3-C：管理员查看所有对话

**新建 API**：`src/pages/admin/conversations.ts`（或扩展现有 insights API）

**功能**：
- `GET /api/admin/conversations?limit=20&offset=0`
- 需要 admin cookie 认证
- 返回所有对话会话列表（按时间降序）
- 每个 session 包含消息列表（脱敏后）
- 支持按 audience/stage/category 筛选

**影响**：
- 管理员能看到用户实际在问什么
- 用于人工判断选题方向
- 所有对话内容已脱敏

#### P3 验收标准

- [ ] `/admin/topics` 未登录 → 重定向
- [ ] 登录后 → 展示所有 TopicCandidate
- [ ] 点击"采纳" → 状态变为 accepted，卡片更新
- [ ] 点击"暂缓"/"忽略" → 状态正确更新
- [ ] Tab 筛选功能正常
- [ ] Agent 批处理能生成比纯规则更好的聚类结果
- [ ] 无 API key 时降级为现有规则，不报错
- [ ] 管理员能查看所有对话（脱敏后）
- [ ] 选题卡片正确标记"内容缺口"

#### P3 详细 To-Do

- [ ] `src/pages/admin/topics.astro`：新建选题库管理页
- [ ] TopicCard 组件：优先级标签 + 完整信息 + 操作按钮
- [ ] 客户端 JS：采纳/暂缓/忽略操作 + 状态更新
- [ ] Tab 筛选：全部/待处理/已采纳/已暂缓
- [ ] `src/agent/insight.ts`：增加可选 Claude API 调用增强聚类
- [ ] `src/pages/admin/conversations.ts`：新建，返回所有对话
- [ ] `src/pages/admin/index.astro`：增加"选题库"快捷入口
- [ ] 测试：选题卡片交互正确
- [ ] 测试：Agent 增强聚类（有/无 API key 两种情况）
- [ ] 测试：对话列表展示正确

---

### Phase 4：内联编辑（AdminEditBar + CRUD）

> 目标：管理员在原页面上直接编辑内容，不跳转到后台。
> 优先级：中低（便利性功能，不影响核心系统）
> 前置条件：`GITHUB_TOKEN` 环境变量（有 repo 写权限的 Personal Access Token）
> 预计涉及：~6 个文件

#### P4-A：AdminEditBar 浮动编辑栏

**新建组件**：`src/components/admin/AdminEditBar.astro`

**功能**：
- 检测 admin cookie 是否存在（通过设置一个全局标记）
- 如果是管理员：在页面右下角显示浮动编辑栏
- 编辑栏包含：
  - 编辑（打开内联编辑器）
  - 新建（跳转新建页面）
  - 删除（确认后删除）
- 非管理员：完全不可见

**注入方式**：

- `src/pages/posts/[slug].astro`
  - 直接 import 并渲染 `<AdminEditBar slug={entry.id} />`
  - 当前仅在文章详情页可见，未通过 Base.astro 全局注入
- 后续可扩展到 `src/layouts/Base.astro` 实现全站可见

**影响**：
- 非管理员完全无感（不渲染、不加载 JS）
- 管理员在所有页面都能看到编辑栏
- 对 SEO 无影响（搜索引擎不登录）

#### P4-B：内容 CRUD API

**新建文件**：`src/pages/api/admin/content/[slug].ts`

**功能**：

| 方法 | 功能 | 实现 |
|------|------|------|
| GET | 读取 markdown 源文件 | GitHub Contents API `GET /repos/{owner}/{repo}/contents/{path}` |
| PUT | 更新内容 | GitHub Contents API `PUT`（需 SHA，自动获取最新） |
| DELETE | 删除内容 | GitHub Contents API `DELETE`（需 SHA） |

**新建文件**：`src/pages/api/admin/content/index.astro`（POST 新建）— ⚠️ **未实现**，当前只有 `[slug].ts` 的 GET/PUT/DELETE

**安全**：
- 所有请求检查 admin cookie
- 只允许操作 `src/content/log/` 目录下的文件
- 文件名验证：只允许 `.md` 和 `.mdx`
- 内容验证：必须有合法 frontmatter（title、date、type 等）
- commit message 自动生成：`content: update {slug}` / `content: delete {slug}` / `content: create {slug}`

**行为衔接**：
```
管理员点击"编辑"
  → GET /api/admin/content/{slug}
  → 返回 markdown 源文件内容
  → 弹出编辑器（CodeMirror 或简单的 textarea + 实时预览）
  → 管理员修改后点"保存"
  → PUT /api/admin/content/{slug}
  → GitHub API commit 到 main
  → Vercel 检测到 push → 自动重新构建
  → ~60s 后页面更新
```

#### P4-C：内联编辑器

**方案**：轻量级，不引入重型编辑器库。

- 编辑器：`<textarea>` + 实时预览面板（split view）
- 预览：调用 `/api/admin/content/preview`，服务端渲染 markdown → HTML — ⚠️ **未实现**，当前编辑器页使用客户端渲染
- 工具栏：加粗、标题、列表、链接、代码块（插入 markdown 语法）
- 快捷键：Ctrl+S 保存

**备选方案**（如果觉得 textarea 太简陋）：
- 引入 CodeMirror 6（~100KB gzip，支持 markdown 高亮）
- 按需加载（仅管理员加载）

#### P4-D：管理员专属视图

**在各内容页面中**：

- `src/pages/posts/[slug].astro`
  - 管理员看到文章顶部多一个编辑栏
  - 显示文章的 frontmatter 元数据（tags、type、status 等）
- `src/pages/posts/index.astro`
  - 管理员看到每篇文章旁边有编辑/删除按钮
- `src/pages/tools/index.astro`
  - 管理员看到编辑/新增按钮

**改动原则**：最小侵入。只在现有页面条件渲染少量管理控件，不改变整体布局。

#### P4 验收标准

- [ ] 管理员登录后，所有内容页面右下角显示浮动编辑栏
- [ ] 非管理员完全看不到编辑栏
- [ ] 点击"编辑" → 弹出编辑器，加载 markdown 源文件
- [ ] 修改 + 保存 → GitHub commit 成功 → Vercel 自动部署
- [ ] 点击"删除" → 确认对话框 → 删除成功
- [ ] 只能操作 `src/content/log/` 下的文件
- [ ] 非法操作（路径穿越、非法扩展名）被拒绝
- [ ] `GITHUB_TOKEN` 未配置时，编辑功能优雅降级（显示提示但不报错）

#### P4 详细 To-Do

- [ ] 环境变量：`GITHUB_TOKEN` 配置（有 repo 写权限的 PAT）
- [ ] `src/components/admin/AdminEditBar.astro`：浮动编辑栏组件
- [ ] `src/layouts/Base.astro`：注入 admin 标记 + AdminEditBar
- [ ] `src/pages/api/admin/content/[slug].ts`：GET/PUT/DELETE
- [ ] `src/pages/api/admin/content/index.ts`：POST 新建
- [ ] `src/pages/api/admin/content/preview.ts`：markdown 预览 — ⚠️ 未实现渲染 — ⚠️ 未实现
- [ ] 编辑器 UI：textarea + 预览面板 + 工具栏
- [ ] `src/pages/posts/[slug].astro`：增加管理员编辑入口
- [ ] `src/pages/posts/index.astro`：增加编辑/删除按钮
- [ ] 安全测试：路径穿越、非法文件类型、未认证访问
- [ ] 功能测试：完整编辑 → 保存 → 部署流程

---

## 3. 行为衔接总图

```
用户进入 /tools
  ├─ 看到"已帮助 X 人找到合适工具"（P0C 公开统计）
  ├─ 点击"不确定用什么？" → 打开匹配对话框
  │    ├─ 可选：选择身份/AI阶段（手动）
  │    ├─ Agent 自动推断身份/阶段（P1C）
  │    ├─ 输入需求 → 匹配 → 返回推荐
  │    ├─ 对话消息存入 Redis（P1A）
  │    ├─ sessionId 存入 localStorage（P1B）
  │    └─ 匹配计数 +1 → 更新公开统计（P0B）
  ├─ 点击"历史" → 查看自己的历史对话（P1B）
  └─ 关闭页面 → 10分钟无活动自动结束会话

管理员登录 /admin/login
  ├─ 进入 /admin 仪表盘
  │    ├─ 内容统计
  │    ├─ 快捷入口 → /admin/insights（P2）
  │    └─ 快捷入口 → /admin/topics（P3）
  ├─ /admin/insights 数据看板（P2）
  │    ├─ 匹配趋势折线图
  │    ├─ 类别分布条形图
  │    ├─ 热门需求排行
  │    └─ 内容缺口警告
  ├─ /admin/topics 选题库（P3）
  │    ├─ 查看 Agent 生成的选题候选
  │    ├─ 采纳 / 暂缓 / 忽略
  │    └─ 查看所有用户对话（脱敏）
  └─ 在原页面浏览时
       ├─ 右下角浮动编辑栏（P4A）
       ├─ 点击编辑 → 弹出编辑器（P4C）
       └─ 保存 → GitHub commit → 自动部署（P4B）

每日 18:00 Cron
  └─ /api/match-process
       ├─ 读取 pending 需求事件
       ├─ 规则聚类（现有）
       ├─ 可选：Claude API 增强分析（P3B）
       └─ 生成 TopicCandidate → 等待管理员审核
```

---

## 4. 可能涉及的影响

### 性能影响

| Phase | 影响 | 缓解 |
|-------|------|------|
| P0 | `/api/stats` 每次 Redis GET | 缓存 5 分钟；独立 counter，O(1) |
| P1 | 每次匹配多一次 Redis 写（消息） | 异步写入；消息 30 天 TTL |
| P1 | `/api/match-history` 多次 Redis GET | 限制最多 10 个 sessionId |
| P2 | `/admin/insights` 服务端数据聚合 | 每次请求实时计算（管理员低频） |
| P3 | Agent 增强批处理多一次 Claude API 调用 | 每天一次，成本可控 |
| P4 | 编辑保存需 GitHub API | 仅管理员操作，极低频 |

### 安全影响

| Phase | 风险 | 缓解 |
|-------|------|------|
| P0 | `/api/stats` 泄露数据 | 只返回聚合数字，无个人数据 |
| P1 | sessionId 被猜测查看他人对话 | UUID v4 不可猜测；30天过期 |
| P1 | Agent 推断画像不准确 | 推断值不暴露给用户，只用于后台 |
| P3 | 管理员看到用户对话 | 已脱敏；合规（站主权限） |
| P4 | 内容编辑被恶意利用 | admin cookie + 路径白名单 + 文件类型验证 |
| P4 | GitHub Token 泄露 | 服务端环境变量，不返回前端 |

### 数据影响

| Phase | Redis 存储增量 | 估算 |
|-------|---------------|------|
| P0 | `match:stats:*` counter | ~10 keys |
| P1 | `match:messages:*` 对话 | 每天约 50-200 条对话 × ~1KB = 50-200KB/天，30天 TTL |
| P3 | 无新增 | 复用现有 TopicCandidate |

### 合规影响

| 阶段 | 数据 | 合规性 |
|------|------|--------|
| P0 | 聚合计数 | ✅ 无个人数据 |
| P1 | 脱敏对话消息 | ✅ 已通过 privacy.ts 处理 |
| P1 | 推断画像（枚举） | ✅ 只有角色/阶段枚举，无身份信息 |
| P3 | 管理员查看对话 | ✅ 站主权限，数据已脱敏 |
| P4 | 不涉及用户数据 | ✅ |

---

## 5. 默认决策

遇到分歧时按以下默认决策执行：

1. **安全优先于体验** — 任何不确定是否安全的操作，按不安全处理。
2. **隐私优先于数据量** — 宁可少收集，不多收集。
3. **降级优先于报错** — 没有Redis/API key时，内存降级或静默失败。
4. **聚合优先于原始** — 公开展示的数据必须是聚合的，不是单条的。
5. **手动优先于自动** — 选题库必须经过管理员审核，不自动发布。
6. **枚举优先于自由文本** — 用户画像只用预定义枚举，不存自由文本。
7. **轻量优先于重型** — 图表用 CSS/SVG，编辑器用 textarea，不引入重型库。

---

## 6. 总 To-Do List

### Phase 0：认证打通 + 公开统计

- [ ] `src/pages/api/insights.ts`：`isAuthorized()` 增加 `isAdmin(request)` 检查
- [ ] `src/conversation/store.ts`：新增 `incrementMatchStats(categories: NeedCategory[])` 函数
- [ ] `src/pages/api/match.ts`：成功返回前调用 `incrementMatchStats()`
- [ ] `src/pages/api/stats.ts`：新建公开统计 API（无需认证，缓存 5 分钟）
- [ ] `src/components/tools/ToolMatchChat.astro`：增加统计数字展示 + fetch 逻辑
- [ ] 验证：管理员浏览器访问 `/api/insights` → 200
- [ ] 验证：匿名访问 `/api/stats` → 200 + 正确数据
- [ ] 验证：匿名访问 `/api/insights` → 401
- [ ] 验证：`/tools` 页面显示匹配计数

### Phase 1：对话持久化 + 用户历史

- [ ] `src/conversation/store.ts`：新增 `ConversationMessage` 接口 + `saveConversationMessages()` + `getConversationMessages()`
- [ ] `src/pages/api/match.ts`：成功后异步存储对话消息
- [ ] `src/pages/api/match.ts`：增加 `inferredAudience`/`inferredAiStage` 到模型提示词 + 解析 + 自动填充 session
- [ ] `src/pages/api/match-history.ts`：新建用户对话历史 API
- [ ] `src/components/tools/ToolMatchChat.astro`：localStorage 存 sessionId 列表 + "历史"按钮 + 历史面板 UI
- [ ] 验证：对话后 Redis 存在消息数据
- [ ] 验证：刷新后查看历史正常
- [ ] 验证：Agent 推断画像准确性
- [ ] 验证：手动选择优先于推断

### Phase 2：数据看板 /admin/insights

- [ ] `src/pages/admin/insights.astro`：新建完整看板页（KPI + 趋势 + 分布 + 排行 + 缺口）
- [ ] SVG 折线图：30 天匹配趋势
- [ ] CSS 条形图：类别分布 + fitVerdict 分布
- [ ] 排行榜：热门需求 Top 10 + 计数气泡
- [ ] 内容缺口：筛选无关联站内资料的选题
- [ ] `src/pages/admin/index.astro`：Top bar 增加"洞察"链接
- [ ] 响应式：< 640px 适配
- [ ] 验证：登录后看板展示正确
- [ ] 验证：未登录重定向

### Phase 3：选题库 /admin/topics + Agent 增强

- [ ] `src/pages/admin/topics.astro`：新建选题库管理页
- [ ] TopicCard 组件：优先级 + 完整信息 + 操作按钮
- [ ] 客户端 JS：采纳/暂缓/忽略 + 实时状态更新
- [ ] Tab 筛选：全部/待处理/已采纳/已暂缓
- [ ] `src/agent/insight.ts`：增加可选 Claude API 增强聚类
- [ ] `src/pages/admin/conversations.ts`：新建管理员对话查看 API
- [ ] `src/pages/admin/index.astro`：增加"选题库"快捷入口
- [ ] 验证：选题卡片交互正确
- [ ] 验证：Agent 增强聚类（有/无 API key）
- [ ] 验证：对话列表展示正确

### Phase 4：内联编辑

- [ ] 环境变量 `GITHUB_TOKEN` 配置
- [ ] `src/components/admin/AdminEditBar.astro`：浮动编辑栏
- [ ] `src/layouts/Base.astro`：注入 admin 标记 + AdminEditBar
- [ ] `src/pages/api/admin/content/[slug].ts`：GET/PUT/DELETE
- [ ] `src/pages/api/admin/content/index.ts`：POST 新建
- [ ] `src/pages/api/admin/content/preview.ts`：markdown 预览 — ⚠️ 未实现
- [ ] 编辑器 UI：textarea + 预览面板 + 工具栏
- [ ] `src/pages/posts/[slug].astro`：管理员编辑入口
- [ ] `src/pages/posts/index.astro`：编辑/删除按钮
- [ ] 安全测试：路径穿越、非法类型、未认证
- [ ] 功能测试：编辑 → 保存 → 部署完整流程

---

## 7. 环境变量清单

| 变量 | 用途 | Phase | 必需 |
|------|------|-------|------|
| `ADMIN_PASSWORD` | 管理员登录密码 | 已有 | ✅ |
| `ANTHROPIC_API_KEY` | Claude API（匹配 + 批处理） | 已有 | ✅（AI Gateway 可覆盖） |
| `UPSTASH_REDIS_REST_URL` | Redis 连接（优先） | 已有 | ✅ |
| `UPSTASH_REDIS_REST_TOKEN` | Redis 认证（优先） | 已有 | ✅ |
| `KV_REST_API_URL` | Redis 连接（Vercel Marketplace 旧名，降级备选） | 已有 | ✅ |
| `KV_REST_API_TOKEN` | Redis 认证（Vercel Marketplace 旧名，降级备选） | 已有 | ✅ |
| `CRON_SECRET` | Cron 定时任务认证 | 已有 | 推荐 |
| `GITHUB_TOKEN` | 内容编辑回写 | P4 | P4 必需 |
| `MATCH_PROCESS_SECRET` | 批处理 API 认证 | 已有 | 可选 |

---

## 8. 文件变更清单

### 新建文件

| 文件 | Phase |
|------|-------|
| `src/pages/api/stats.ts` | P0 |
| `src/pages/api/match-history.ts` | P1 |
| `src/pages/admin/insights.astro` | P2 |
| `src/pages/admin/topics.astro` | P3 |
| `src/pages/admin/conversations.ts` | P3 |
| `src/components/admin/AdminEditBar.astro` | P4 |
| `src/pages/api/admin/content/[slug].ts` | P4 |
| `src/pages/api/admin/content/index.ts` | P4 | ⚠️ 未实现 |
| `src/pages/api/admin/content/preview.ts` | P4 | ⚠️ 未实现 |

### 修改文件

| 文件 | Phase | 改动范围 |
|------|-------|----------|
| `src/pages/api/insights.ts` | P0 | isAuthorized 增加分支 |
| `src/pages/api/match.ts` | P0+P1 | 统计计数 + 消息存储 + 画像推断 |
| `src/components/tools/ToolMatchChat.astro` | P0+P1 | 统计展示 + 历史面板 |
| `src/conversation/store.ts` | P0+P1 | 统计函数 + 消息存储 |
| `src/agent/insight.ts` | P3 | Claude API 增强聚类 |
| `src/pages/admin/index.astro` | P2+P3 | 导航链接 |
| `src/layouts/Base.astro` | P4 | AdminEditBar 注入 |
| `src/pages/posts/[slug].astro` | P4 | 编辑入口 |
| `src/pages/posts/index.astro` | P4 | 编辑/删除按钮 |
