# 文档一致性审核报告

> 日期：2026-06-08
> 审核范围：CLAUDE.md、docs/README.md、docs/ 下所有 .md 文件
> 合同文件：src/content.config.ts、astro.config.mjs、package.json、tsconfig.json
> 方法：以代码为真，逐文档比对实现

---

## 审核结论

- **结论**：通过 — 所有 P1/P2/P3 问题已在本次审核中修复。
- **汇总**：P0:0 P1:7（已修复） P2:14（已修复） P3:8（已修复） 待补充:1（已修复）
- **修复优先级**：✅ 全部完成

---

## P1 — 核心功能不一致

### 1. docs/README.md Plan 6 MCP 工具名完全错误
- **严重级别**: P1
- **位置**: `docs/README.md:186-192`
- **证据**:
  - 文档: 列出 `walker_get_content`、`walker_get_style`、`walker_get_methodology`、`walker_get_tools`、`walker_graph`、`walker_recommend`
  - 代码: `src/mcp/index.ts` 实际注册的 5 个工具为 `walker_query`、`walker_search`、`walker_get`、`walker_stats`、`walker_insights`
- **影响**: 任何人按此文档开发 MCP 集成会完全失败
- **建议**: 将 Plan 6 工具列表替换为实际的 5 个工具名和功能描述
- **关联原则**: 合同优先

### 2. CLAUDE.md 声称 MCP 只有 4 个工具，实际为 5 个
- **严重级别**: P1
- **位置**: `CLAUDE.md:174`
- **证据**:
  - 文档: "注册 4 个工具：`walker_query`、`walker_search`、`walker_get`、`walker_stats`"
  - 代码: `src/mcp/index.ts` 注册了 5 个工具，额外包含 `walker_insights`（需求洞察统计）
- **影响**: 未来 Claude Code 实例不知道有 walker_insights 工具可用
- **建议**: 改为"注册 5 个工具"，补充 walker_insights 描述
- **关联原则**: 以代码为真

### 3. docs/creator-system-plan.md 引用多个不存在的文件路径
- **严重级别**: P1
- **位置**: `docs/creator-system-plan.md` 多处
- **证据**:
  - 文档 Phase 2 影响范围: `src/lib/match.ts`、`src/lib/match-recommend.ts`
  - 文档 Phase 3 影响范围: `src/lib/insight.ts`
  - 代码: 这些文件已按 ADR-0001 迁移到 `src/agent/match.ts`、`src/agent/insight.ts`；`match-recommend.ts` 已不存在（逻辑合并入 `match.ts`）
- **影响**: 按此文档定位文件会找不到
- **建议**: 全局替换旧路径：`src/lib/match.ts` → `src/agent/match.ts`，`src/lib/insight.ts` → `src/agent/insight.ts`，删除 `match-recommend.ts` 引用
- **关联原则**: 以代码为真

### 4. docs/tool-match-agent-redesign.md Phase 2-3 引用旧路径
- **严重级别**: P1
- **位置**: `docs/tool-match-agent-redesign.md:117-119, 148`
- **证据**:
  - 文档: `src/lib/match.ts`、`src/lib/match-recommend.ts`、`src/lib/insight.ts`
  - 代码: 同 #3，已迁移
- **影响**: 同 #3
- **建议**: 同 #3
- **关联原则**: 以代码为真

### 5. docs/tool-match-agent-to-do-list.md §9.1 引用旧路径
- **严重级别**: P1
- **位置**: `docs/tool-match-agent-to-do-list.md:379-386`
- **证据**:
  - 文档: `src/data/tool-profiles.ts` → 实际在 `src/profiles/tool-profiles.ts`
  - 文档: "新增站内资料索引文件" → 实际已存在于 `src/profiles/resource-index.ts`（旧名 `match-resource-index.ts`）
- **影响**: 按文档找文件路径不对
- **建议**: 更新路径引用
- **关联原则**: 以代码为真

### 6. docs/creator-system-plan.md P4 提到不存在的 API 文件
- **严重级别**: P1
- **位置**: `docs/creator-system-plan.md:570-571, 599, 635-637, 845`
- **证据**:
  - 文档: `src/pages/api/admin/content/index.ts`（POST 新建）、`src/pages/api/admin/content/preview.ts`（markdown 预览）
  - 代码: 只存在 `src/pages/api/admin/content/[slug].ts`（GET/PUT/DELETE），index.ts 和 preview.ts 不存在
- **影响**: 文档承诺的"新建"和"预览"功能未实现，按文档开发找不到入口
- **建议**: 标注这两个文件为"未实现"或从文档中移除
- **关联原则**: 以代码为真

### 7. docs/demand-intelligence-todo.md 现状快照标记过时
- **严重级别**: P1
- **位置**: `docs/demand-intelligence-todo.md:10-26`
- **证据**:
  - 文档: `ToolMatchChat.astro` 标记 "⚠️ 未跟踪"，`match.ts` 标记 "⚠️ 未跟踪"
  - 代码: 这些文件均已提交并跟踪（`src/components/tools/ToolMatchChat.astro`、`src/pages/api/match.ts` 存在且在 git 中）
  - 文档: "生产环境现状：Tools 页面没有 ToolMatchChat" — 实际已上线
- **影响**: 误导开发者以为核心功能尚未上线
- **建议**: 更新状态列为 "✅ 已上线"，更新生产环境现状描述
- **关联原则**: 以代码为真

---

## P2 — 命名/路径不一致或信息不完整

### 8. docs/README.md §1.3 路由列表不完整
- **严重级别**: P2
- **位置**: `docs/README.md:44`
- **证据**:
  - 文档: "当前主要路由：`/`、`/posts`、`/posts/[slug]`、`/tools`、`/ideas`、`/projects`、`/content`、`/about`"
  - 代码: 缺少 `/learn`、`/learn/guide/[level]/[tool]`、`/admin`、`/admin/insights`、`/admin/topics`、`/admin/ai-gateway`、`/admin/login`
- **影响**: 作为决策入口文档，路由列表遗漏了学习模块和管理后台
- **建议**: 补全路由列表
- **关联原则**: 以代码为真

### 9. docs/README.md §5 "下一步" 指向已完成的 Plan 1
- **严重级别**: P2
- **位置**: `docs/README.md:211-228`
- **证据**:
  - 文档: "当前马上执行：Plan 1：iwalk.pro 第一阶段落地"
  - 代码: Plan 1 所有执行标准已满足（`/content` 可访问、主导航存在、旧路由兼容、`llms.txt`/`walker-style.md`/`index.json` 可访问）
- **影响**: 文档仍指示"马上执行"已完成的工作
- **建议**: 标记 Plan 1 为 "✅ 已完成"，更新"下一步"指向当前实际工作
- **关联原则**: 以代码为真

### 10. docs/README.md §2 已解决清单缺少多项已完成项
- **严重级别**: P2
- **位置**: `docs/README.md:56-58`
- **证据**:
  - 文档: 只列出 2 条"已解决的问题"（AI 可读接口、数据台）
  - 实际已完成但未记录：管理后台（admin）、AI Gateway、对话持久化、选题库管理页、内联编辑、MCP server、需求匹配 Agent、需求洞察聚类
- **影响**: 决策文档无法反映真实进度
- **建议**: 批量补充已完成项到"已解决的问题"列表
- **关联原则**: 以代码为真

### 11. docs/tool-match-agent-to-do-list.md 全部 TODO 未勾选
- **严重级别**: P2
- **位置**: `docs/tool-match-agent-to-do-list.md:459-556`（P0-P3 全部 checkbox）
- **证据**:
  - 文档: 所有 `- [ ]` 未勾选
  - 代码: P0 安全项（XSS 防护、HTML 转义）已在 `ToolMatchChat.astro` 实现；P1 站内资料包已在 `match.ts` + `resource-index.ts` 实现；P2 匿名需求记录已在 `store.ts` + `insight.ts` 实现；P3 选题库已在 `admin/topics.astro` 实现
- **影响**: 无法判断哪些工作已完成、哪些仍在进行
- **建议**: 逐项验证并勾选已完成的 checkbox，标注未完成的
- **关联原则**: 以代码为真

### 12. docs/creator-system-plan.md P4 AdminEditBar 注入方式与实际不符
- **严重级别**: P2
- **位置**: `docs/creator-system-plan.md:538-555`
- **证据**:
  - 文档: "在 `src/layouts/Base.astro` 中检查 admin cookie，注入 `<AdminEditBar />`，所有页面都能看到"
  - 代码: `AdminEditBar` 只在 `src/pages/posts/[slug].astro` 中 import 和渲染，未注入 Base.astro
- **影响**: 文档承诺"所有页面可见"，实际只在文章详情页可见
- **建议**: 更新文档描述为"当前仅在文章详情页注入"，或按要求扩展到 Base.astro
- **关联原则**: 以代码为真

### 13. CLAUDE.md 未提及 AdminEditBar 组件
- **严重级别**: P2
- **位置**: `CLAUDE.md` 核心组件列表
- **证据**:
  - 文档: 核心组件列表未包含 `AdminEditBar.astro`
  - 代码: `src/components/admin/AdminEditBar.astro` 存在且在 `posts/[slug].astro` 中使用
- **影响**: 未来开发者不知道此组件存在
- **建议**: 在核心组件或模块架构章节补充 AdminEditBar 描述
- **关联原则**: 以代码为真

### 14. CLAUDE.md 未记录 `/api/match-feedback` API 路由
- **严重级别**: P2
- **位置**: `CLAUDE.md:75-93` API 路由表
- **证据**:
  - 文档: API 路由表未列出 `/api/match-feedback`
  - 代码: `src/pages/api/match-feedback.ts` 存在，接收用户对推荐结果的反馈（解决了/还卡着/不适合/想看教程）
- **影响**: API 路由表不完整
- **建议**: 添加行：`/api/match-feedback` | 推荐结果反馈 | 无
- **关联原则**: 以代码为真

### 15. docs/creator-system-plan.md 关键缺口表中 "没有内容编辑功能" 已解决
- **严重级别**: P2
- **位置**: `docs/creator-system-plan.md:67`
- **证据**:
  - 文档: "没有内容编辑功能 | 改文章只能改代码 + push" 标记为缺口
  - 代码: `src/pages/api/admin/content/[slug].ts`（CRUD via GitHub API）、`src/pages/admin/content/edit.astro`（编辑器页面）、`AdminEditBar.astro`（浮动编辑栏）均已实现
- **影响**: 缺口表不能反映当前状态
- **建议**: 标记为 "✅ 已解决 (P4)"
- **关联原则**: 以代码为真

### 16. docs/creator-system-plan.md 关键缺口 "Insights API 不认 admin cookie" 已解决
- **严重级别**: P2
- **位置**: `docs/creator-system-plan.md:63`
- **证据**:
  - 文档: "Insights API 不认 admin cookie | 管理员浏览器访问 401" 标记为缺口
  - 代码: `src/pages/api/insights.ts:14-15` 已加入 `isAdmin(request)` 检查
- **影响**: 同 #15
- **建议**: 标记为 "✅ 已解决 (P0)"
- **关联原则**: 以代码为真

### 17. docs/creator-system-plan.md 关键缺口 "没有选题库管理页" 已解决
- **严重级别**: P2
- **位置**: `docs/creator-system-plan.md:65`
- **证据**:
  - 文档: "没有选题库管理页 | 选题候选存在 Redis 但没有 UI"
  - 代码: `src/pages/admin/topics.astro` 已存在，含采纳/暂缓/忽略操作
- **影响**: 同 #15
- **建议**: 标记为 "✅ 已解决 (P3)"
- **关联原则**: 以代码为真

### 18. docs/creator-system-plan.md 关键缺口 "没有数据看板页" 已解决
- **严重级别**: P2
- **位置**: `docs/creator-system-plan.md:66`
- **证据**:
  - 文档: "没有数据看板页 | /admin/insights 链接存在但页面不存在"
  - 代码: `src/pages/admin/insights.astro` 已存在
- **影响**: 同 #15
- **建议**: 标记为 "✅ 已解决 (P2)"
- **关联原则**: 以代码为真

### 19. docs/creator-system-plan.md 关键缺口 "对话消息不持久" 需确认
- **严重级别**: P2
- **位置**: `docs/creator-system-plan.md:62`
- **证据**:
  - 文档: "对话消息不持久 | 用户看不到历史，管理员看不到原文"
  - 代码: `src/conversation/store.ts` 已有 `saveConversationMessages()`、`getConversationMessages()`、`getMultipleConversations()`，`src/pages/api/match.ts` 调用了 `saveConversationMessages()`
- **影响**: 此缺口可能已解决
- **建议**: 验证后标记为已解决或保留
- **关联原则**: 以代码为真

### 20. docs/creator-system-plan.md 关键缺口 "没有 AdminEditBar" 已解决
- **严重级别**: P2
- **位置**: `docs/creator-system-plan.md:68`
- **证据**:
  - 文档: "没有 AdminEditBar | 管理员在页面上看不到编辑入口"
  - 代码: `src/components/admin/AdminEditBar.astro` 已存在
- **影响**: 同 #15
- **建议**: 标记为 "✅ 已解决 (P4)"
- **关联原则**: 以代码为真

### 21. docs/iwalk-agent-system-full-redesign.md §12 Phase 2-5 均未实现且无状态标记
- **严重级别**: P2
- **位置**: `docs/iwalk-agent-system-full-redesign.md:533-598`
- **证据**:
  - 文档: Phase 2（业务拆分为 orchestrator/compliance/friction-layer 等模块）、Phase 3（规则候选池）、Phase 4（选题工作台）、Phase 5（评测集）
  - 代码: `src/agent/` 下只有 match.ts、insight.ts、privacy.ts、gateway.ts 等文件，无 orchestrator、compliance、friction-layer 等拆分模块
- **影响**: 无法判断哪些 Phase 已完成
- **建议**: 在每个 Phase 标题旁加 "✅ 已完成" / "🔲 未开始" 状态标记
- **关联原则**: 以代码为真

---

## P3 — 措辞/格式/链接小问题

### 22. docs/README.md §2 "当前问题" 部分过时
- **严重级别**: P3
- **位置**: `docs/README.md:50-53`
- **证据**:
  - 问题 1 "决策文档过多" — 已通过归档和 docs/README.md 统一入口解决
  - 问题 2 "当前路由和长期方向不一致" — 旧路由兼容保留，主导航已收敛
- **影响**: 问题列表不反映当前状态
- **建议**: 将已解决的问题移入"已解决的问题"列表
- **关联原则**: 以代码为真

### 23. docs/README.md §4 Plan 2-5 缺少完成状态
- **严重级别**: P3
- **位置**: `docs/README.md:129-209`
- **证据**:
  - 文档: Plan 2（内容迁移）、Plan 3（内容宇宙 UI）、Plan 4（反馈数据台）、Plan 5（AI 接口 v2）均无完成标记
  - 实际: Plan 6（MCP）已完成，Plan 4 部分完成（公开数据台在 about 页面）
- **影响**: 无法判断整体路线进度
- **建议**: 为每个 Plan 添加完成状态标记
- **关联原则**: 以代码为真

### 24. docs/adr/ADR-0001 未记录 `src/lib/` 残留文件
- **严重级别**: P3
- **位置**: `docs/adr/ADR-0001-agent-core-separation.md:18-31`
- **证据**:
  - 文档: 迁移表列出了 12 个文件的迁移路径
  - 代码: `src/lib/` 目录仍然存在，包含 `admin-auth.ts` 和 `theme.ts` 两个未迁移的文件
- **影响**: ADR 给人"已完成全量迁移"的印象，实际有遗留
- **建议**: 在 ADR 后果或补充说明中记录 `admin-auth.ts` 和 `theme.ts` 保留在 `src/lib/` 的原因
- **关联原则**: 以代码为真

### 25. CLAUDE.md "其他" 章节未记录 `src/lib/admin-auth.ts`
- **严重级别**: P3
- **位置**: `CLAUDE.md:216-227`
- **证据**:
  - 文档: "其他" 章节列出了 `theme.ts` 和 `types/nav.ts`，但未列出 `admin-auth.ts`
  - 代码: `src/lib/admin-auth.ts` 存在且被 insights API、admin 页面等广泛使用（`isAdmin()`、`signToken()`、`verifyToken()`）
- **影响**: 未来开发者可能不知道管理员认证逻辑在哪里
- **建议**: 在"其他"章节补充 `src/lib/admin-auth.ts` 的描述
- **关联原则**: 以代码为真

### 26. docs/tool-match-agent-to-do-list.md 仍提 "Codex" 特定文案
- **严重级别**: P3
- **位置**: `docs/tool-match-agent-to-do-list.md:84-85, 550`
- **证据**:
  - 文档: "别急着用 Codex，先说你要做什么"
  - 代码: `ToolMatchChat.astro` 中已无 "codex" 或 "Codex" 字样（0 匹配），说明文案已更新
  - 但 `resource-index.ts` 和 `tool-profiles.ts` 中仍有 `codex` 关键词作为匹配词典项（合理保留）
- **影响**: 文档中文案指引已过时
- **建议**: 更新文档中的入口文案描述为当前实际文案
- **关联原则**: 以代码为真

### 27. README.md (根) 提及 "xyzidea.com" 和 "xyzidea.cn"
- **严重级别**: P3
- **位置**: `README.md:15`
- **证据**:
  - 文档: "已独立上线 AI 辅助工具站 xyzidea.com，构建 Ferry 人机协作协议，筹备帮助人正确认识与使用 AI 的共创社区 xyzidea.cn"
  - 这些是外部项目，与 iwalk.pro 本仓库的代码和技术文档无关
- **影响**: 低，这是 GitHub profile README，描述个人背景合理
- **建议**: 无需修改，但建议区分个人介绍和项目技术文档
- **关联原则**: 无

### 28. docs/demand-intelligence-todo.md Phase 1 已完成但未标记
- **严重级别**: P3
- **位置**: `docs/demand-intelligence-todo.md:87-148`
- **证据**:
  - 文档: Phase 1 描述 store.ts 增加读取函数和洞察 API 端点
  - 代码: `store.ts` 已有 `getTopicCandidates()`、`getDemandStats()`；`src/pages/api/insights.ts` 已存在
- **影响**: 无法判断执行进度
- **建议**: 标记 Phase 1 为已完成
- **关联原则**: 以代码为真

### 29. docs/demand-intelligence-todo.md Phase 2 §2-3 "about 需求洞察 section" 已实现
- **严重级别**: P3
- **位置**: `docs/demand-intelligence-todo.md:215-229`
- **证据**:
  - 文档: "在'关于站'tab 中增加'需求洞察'折叠区"
  - 代码: `src/pages/about/index.astro` 已有 `需求洞察` section（含 KPI、类别分布条形图、选题列表）
- **影响**: 同 #28
- **建议**: 标记 §2-3 为已完成
- **关联原则**: 以代码为真

---

## 待证据补充

### 30. docs/creator-system-plan.md 环境变量名称与 Vercel 实际配置是否一致
- **严重级别**: 待证据补充
- **位置**: `docs/creator-system-plan.md:817-826`
- **证据**:
  - 文档: 列出 `UPSTASH_REDIS_REST_URL`、`UPSTASH_REDIS_REST_TOKEN`
  - CLAUDE.md: 列出 `KV_REST_API_URL`、`KV_REST_API_TOKEN`、`REDIS_URL`
  - 代码: `src/conversation/store.ts` 中使用 `KV_REST_API_URL` / `KV_REST_API_TOKEN`
- **影响**: 环境变量名不一致可能导致配置错误
- **建议**: 统一环境变量名称文档
- **关联原则**: 合同优先

---

## 修复建议优先级

### 立即修复（P1）
1. **#2** — CLAUDE.md MCP 工具数量 4→5，补充 walker_insights
2. **#3, #4, #5** — docs/ 中旧路径批量更新：`src/lib/match*` → `src/agent/`，`src/data/tool-profiles` → `src/profiles/`
3. **#1** — docs/README.md Plan 6 工具名替换为实际名称
4. **#6** — 标注 creator-system-plan.md 中未实现的 API 文件
5. **#7** — 更新 demand-intelligence-todo.md 状态列

### 短期修复（P2）
6. **#11** — tool-match-agent-to-do-list.md 逐项勾选已完成 checkbox
7. **#8, #9, #10** — docs/README.md 路由列表补全、Plan 1 标记完成、已解决问题补充
8. **#12, #13** — AdminEditBar 注入方式和组件描述更新
9. **#14** — CLAUDE.md API 路由表补 match-feedback
10. **#15-#20** — creator-system-plan.md 关键缺口表批量标记已解决

### 后续优化（P3）
11. **#21** — iwalk-agent-system-full-redesign.md 各 Phase 加状态标记
12. **#22-#29** — 各种过时描述和小修正
