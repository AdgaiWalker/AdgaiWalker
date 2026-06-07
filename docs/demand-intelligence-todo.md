# 需求智能管道 — 可执行方案

> 目标：跑通「用户需求 → 匹配 → 数据收集 → 洞察聚类 → 反馈内容创作」闭环。
> 约束：单 agent 执行，遇问题自行决策。

---

## 现状快照

| 模块 | 文件 | 状态 |
|------|------|------|
| 匹配引擎 | `src/agent/match.ts` | ✅ 已提交 |
| 隐私脱敏 | `src/agent/privacy.ts` | ✅ 已提交 |
| 洞察聚类 | `src/agent/insight.ts` | ✅ 已提交 |
| 资源索引 | `src/profiles/resource-index.ts` | ✅ 已提交 |
| 工具画像 | `src/profiles/tool-profiles.ts` | ✅ 已提交 |
| 会话存储 | `src/conversation/store.ts` | ✅ 已提交 |
| 匹配 UI | `src/components/tools/ToolMatchChat.astro` | ⚠️ 未跟踪 |
| 匹配 API | `src/pages/api/match.ts` | ⚠️ 未跟踪 |
| 批处理 API | `src/pages/api/match-process.ts` | ⚠️ 未跟踪 |
| 会话结束 API | `src/pages/api/match-end.ts` | ⚠️ 未跟踪 |
| Tools 页面 | `src/pages/tools/index.astro` | ⚠️ 已修改（import ToolMatchChat） |
| Tools 数据 | `src/data/tools-data.ts` | ⚠️ 已修改（加了 Skill-Craft + 副业蓝图） |
| env 配置 | `.env.example` | ⚠️ 已修改 |

**生产环境现状**：Tools 页面没有 ToolMatchChat，匹配 API 不存在，管道未上线。

**阻塞问题**：`ANTHROPIC_API_KEY` 是否已在 Vercel 配置？未配置时 API 走本地规则匹配降级模式（不调用模型、不产生费用），管道仍可运行。

---

## Phase 0：管道上线（P0 — 必须先做）

> 让匹配系统在生产环境跑起来，开始收集真实需求数据。

### 0-1 提交未跟踪文件

**操作**：
```bash
git add src/components/tools/ToolMatchChat.astro \
        src/pages/api/match.ts \
        src/pages/api/match-process.ts \
        src/pages/api/match-end.ts \
        src/pages/tools/index.astro \
        src/data/tools-data.ts \
        .env.example
git commit -m "feat(tools): 需求索引匹配器上线 — ToolMatchChat + 匹配/批处理/会话结束 API"
git push
```

**验收标准**：
- [ ] `git status` 干净（无未跟踪/未提交文件）
- [ ] Vercel 构建成功（无 build error）
- [ ] `iwalk.pro/tools` 页面可见"需求判断"信号卡
- [ ] 点击信号卡弹出匹配 dialog
- [ ] 输入需求（如"我想学 AI"）返回结果（本地降级模式也算通过）

**影响范围**：
- `/tools` 页面新增 ToolMatchChat 组件（所有用户可见）
- 3 个新 API 端点（`/api/match`、`/api/match-process`、`/api/match-end`）
- 需要 Redis 存储（已有 Upstash），未配置时降级为内存存储

**潜在风险**：
- `ANTHROPIC_API_KEY` 未配置 → API 走本地规则匹配，结果质量降低但不阻塞
- Vercel cold start 延迟 → 首次匹配可能较慢（< 3s 正常）
- 预渲染 `prerender = true` 的 tools 页面会静态生成 ToolMatchChat 的 HTML 壳，JS 交互在客户端运行 → 无兼容性问题

### 0-2 验证 Vercel 环境变量

**操作**：
检查 Vercel Dashboard → Settings → Environment Variables 是否有：
- `ANTHROPIC_API_KEY`（可选，没有则本地规则降级）
- `KV_REST_API_URL` / `KV_REST_API_TOKEN`（必须有，用于 Redis 存储）
- `CRON_SECRET` 或 `MATCH_PROCESS_SECRET`（可选，保护批处理 API）

**验收标准**：
- [ ] Redis 相关变量已配置（点赞功能已在用，应该已有）
- [ ] 确认 `ANTHROPIC_API_KEY` 是否已配置

**如未配置 ANTHROPIC_API_KEY**：
不阻塞。系统会走 `matchSiteResources()` 本地关键词匹配路径，仍能收集需求数据。后续需要模型判断时再配。

---

## Phase 1：数据读取层（P1）

> 让收集到的需求数据可查询，为页面展示和管理面板提供数据源。

### 1-1 store.ts 增加读取函数

**新增文件**：无（修改 `src/conversation/store.ts`）

**新增函数**：

```ts
// 获取 TopicCandidate 列表（按 priority + 创建时间排序）
export async function getTopicCandidates(options?: {
  status?: TopicCandidate['status'];
  limit?: number;
}): Promise<TopicCandidate[]>

// 需求统计聚合
export async function getDemandStats(options?: {
  days?: number;    // 统计最近 N 天，默认 30
}): Promise<{
  totalEvents: number;
  totalSessions: number;
  byCategory: Record<string, number>;
  byFitVerdict: Record<string, number>;
  codexMisuseRate: number;
  topNeeds: Array<{ summary: string; count: number }>;
  dailyTrend: Array<{ date: string; count: number }>;
}>
```

**验收标准**：
- [ ] `npx astro check` 零 error
- [ ] 本地 `npm run build` 成功
- [ ] 两个函数在 Redis 不可用时降级为内存数据

**影响范围**：
- 仅新增导出函数，不修改已有函数签名
- 无页面级影响

### 1-2 洞察 API 端点

**新增文件**：`src/pages/api/insights.ts`

**功能**：
- `GET /api/insights?type=stats&days=30` → 需求统计
- `GET /api/insights?type=topics&status=pending` → TopicCandidate 列表
- `POST /api/insights` → 更新 TopicCandidate 状态（accept/defer/ignore）
- 受 `CRON_SECRET` 或 `MATCH_PROCESS_SECRET` 保护（仅站长可访问）

**验收标准**：
- [ ] 未带认证头时返回 401
- [ ] 带 `Authorization: Bearer <secret>` 时返回 JSON 数据
- [ ] 统计数据结构正确（byCategory、byFitVerdict、topNeeds、dailyTrend）

**影响范围**：
- 新增 API 路由，不影响现有页面
- 与点赞 API 共用 Redis 实例

### 1-3 提交并部署

**验收标准**：
- [ ] 生产环境 `/api/insights?type=stats` 带认证可访问
- [ ] 返回数据与 Redis 存储一致

---

## Phase 2：页面增强（P2）

> 把需求信号可视化到 ideas 和 projects 页面，让用户和站长看到需求验证的流动。

### 2-1 `/ideas` 页面增强

**当前问题**：只有 2 条 idea，没有需求验证信号，页面单薄。

**改动**：
1. `/ideas` 页面的 idea 卡片增加"需求信号"徽章（数据来自 TopicCandidate）
2. 当某个 idea 的关键词在 TopicCandidate 中出现 ≥ 2 次时，显示 `📊 N 次需求提及`
3. 无数据时不显示徽章（不露丑）

**实现方式**：
- 在 `src/pages/ideas/index.astro` 中调用新增的 `getDemandStats()`
- 前端渲染时对比 idea 的 tags 与 topNeeds 的摘要文本
- 匹配逻辑：idea 的 `tags` 或 `summary` 关键词出现在 topNeeds 中 → 显示信号

**验收标准**：
- [ ] idea 卡片在无数据时不显示多余元素
- [ ] idea 卡片在有数据时显示需求提及次数徽章
- [ ] 不影响现有 idea 列表的排序和样式

**影响范围**：
- 修改 `src/pages/ideas/index.astro`
- 可能需要修改 idea 卡片样式

**行为衔接**：
- 依赖 Phase 1 的 `getDemandStats()` 函数
- 如果管道刚上线没有数据 → 降级为不显示徽章 → 不影响体验

### 2-2 `/projects` 页面增强

**当前问题**：只有 1 张 Ferry 卡片，项目信息单薄。

**改动**：
1. 项目卡片增加"解决了什么"标签
2. 从 project 条目的 `summary` 字段提取
3. Ferry 合集页已有完整信息，项目列表页只做摘要展示

**验收标准**：
- [ ] 项目卡片展示解决什么问题的摘要
- [ ] 卡片样式与现有设计一致
- [ ] Ferry 卡片保持现有设计语言

**影响范围**：
- 修改 `src/pages/projects/index.astro`
- 可能增加 Ferry 子项的快速入口（Skill-Craft、副业蓝图）

**行为衔接**：
- 不依赖 Phase 1，可独立推进
- 但如果有需求信号数据，可以叠加展示

### 2-3 `/about?tab=site` 增加需求洞察 section

**改动**：
1. 在"关于站"tab 中增加"需求洞察"折叠区
2. 展示：
   - 需求总数（会话数 + 事件数）
   - Top 5 需求分类（饼图或条形图）
   - Codex 误用率
   - 最新 TopicCandidate 列表（含状态标记）
3. 仅站长可见（通过 `CRON_SECRET` 保护的数据源）

**验收标准**：
- [ ] "关于站"tab 底部新增"需求洞察"section
- [ ] 无数据时显示"暂无数据"占位
- [ ] 有数据时展示统计图表和 TopicCandidate 列表
- [ ] 不影响现有"关于站"内容

**影响范围**：
- 修改 `src/components/about/AboutSiteTab.astro`
- 可能需要轻量图表库（纯 CSS 条形图即可，不引入新依赖）

**行为衔接**：
- 依赖 Phase 1 的洞察 API
- 数据来源：`/api/insights?type=stats`（需认证，但 about 页面是预渲染的）
- **替代方案**：构建时直接调用 `getDemandStats()`（不走 API），因为 about 页面 `prerender = true`

---

## Phase 3：闭环（P3 — 后续迭代）

> 让洞察数据直接驱动内容创作决策。

### 3-1 TopicCandidate → 内容创作工作流

**流程**：
1. 站长查看 `/about?tab=site` 的 TopicCandidate 列表
2. 对 high priority 的 candidate 点"accept"
3. 系统自动生成 idea 条目的 frontmatter 草稿（标题、摘要、分类）
4. 站长在 Obsidian 中完善内容
5. 发布后，idea 条目的关键词自动进入 `resource-index.ts` 的匹配池

**验收标准**：
- [ ] accept 操作更新 TopicCandidate 状态为 accepted
- [ ] 已 accept 的 candidate 在列表中标绿
- [ ] 新内容发布后匹配系统能推荐到

### 3-2 MCP 暴露洞察数据

**改动**：在 `src/mcp/index.ts` 新增 `walker_insights` 工具，让 Agent 能查询需求趋势。

**验收标准**：
- [ ] MCP `walker_insights` 工具可调用
- [ ] 返回与 API 相同结构的数据
- [ ] `npm run build:mcp` 成功

### 3-3 `/ideas` 和 `/projects` 的交互关联

**改动**：
- idea 卡片可显示"已立项 → 查看项目"链接
- project 卡片可显示"源自点子 → 查看原始想法"链接
- 通过 `related` 字段或 `status` 变化自动判断关联关系

**验收标准**：
- [ ] idea 变成 project 后，idea 卡片显示"已立项"标记和跳转链接
- [ ] project 卡片可回溯到原始 idea

---

## 执行顺序总结

```
Phase 0（今天）
  0-1 提交未跟踪文件 → push → 验证生产
  0-2 确认 Vercel 环境变量
  ↓
Phase 1（管道跑起来之后）
  1-1 store.ts 增加读取函数
  1-2 洞察 API 端点
  1-3 提交部署
  ↓
Phase 2（有数据之后）
  2-1 /ideas 页面增强
  2-2 /projects 页面增强
  2-3 /about 需求洞察 section
  ↓
Phase 3（闭环，持续迭代）
  3-1 TopicCandidate → 内容创作
  3-2 MCP 暴露洞察
  3-3 ideas ↔ projects 交互关联
```

## 决策记录

| 问题 | 决策 | 理由 |
|------|------|------|
| ideas 和 projects 是否合并 | **不合并** | idea = 未验证需求，project = 已验证需求，本质不同 |
| ANTHROPIC_API_KEY 未配置怎么办 | **不阻塞** | 本地规则匹配降级模式可用，仍能收集数据 |
| 洞察数据用 API 还是构建时读取 | **构建时读取**（about 页面）/ API（管理场景） | about 页面是预渲染，不能运行时请求认证 API |
| 是否引入图表库 | **不引入** | 纯 CSS 条形图足够，避免新依赖 |
| 多 agent 执行 | **不使用** | 用户明确要求单 agent |
