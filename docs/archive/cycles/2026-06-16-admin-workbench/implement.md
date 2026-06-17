# Implement — admin 工作台补全 cycle（2026-06-16）

## 上游

- prd / plan / todo：`.agents/skills/walker-northstar/references/working/prd.md` + `to-do.md`
- 范围：`to-do.md` 剩余任务 U6 / U7 / U8 / U9 / U10 / U11 / U12 / U14（个人站范围；U15 运维、U13 可选、U5 手动数据未在代码层处理）

## 实际改动

### U9 规则候选池
- `src/pages/api/admin/rules.ts`（提交，PR #17 遗留的未跟踪文件）：CRUD + 状态推进；补 existing 合并，避免部分更新（回填准确率）覆盖 `createdAt` / 正反例 / 来源
- `src/pages/admin/rules.astro`（新）：规则池 admin 页，状态推进链 observed→candidate→validated→stable→retired、准确率回填、状态筛选

### U10 经验验证系统
- `src/conversation/store.ts`：补 `updateExperienceEvent`（复盘 / 模式标记 / 成熟度 / 反馈结果通用更新）
- `src/pages/api/admin/experience-events.ts`：加 `?action=update`
- `src/pages/admin/experiences.astro`（新）：经验复盘页 + 模式分析（来源 / 反馈 / 成熟度聚类）+ 成熟度推进 + 转 Skill 候选衔接

### U11 Skill 准入与 Agent 路由
- `src/conversation/store.ts`：补 SkillCandidate 四函数（save / findRecent / findByAdmission / updateAdmission）
- `src/pages/api/admin/skills.ts`（新）：Skill 候选 CRUD + 准入判断
- `src/pages/admin/skills.astro`（新）：Skill 候选页 + 准入 / 降级方法卡 + 从经验转入 + 版本迭代

### U7 反馈台
- `src/services/hit-rate.service.ts`：加 `feedbackBreakdown`（8 类反馈细分）+ `getLikeLeaderboard`（点赞排行 scan Redis）
- `src/pages/admin/hit-rate.astro`：Tab 双视图（反馈矩阵 + 热门内容），标题改为「内容反馈台」

### U6 内容宇宙 UI
- `src/components/content-universe/ContentUniverseCard.astro`：domain 11 领域配色 + 点子状态徽章（thinking/validating/building/verified/archived 常驻显示）

### U8 Tools / Observability
- `src/agent/tools-manifest.ts`（新）：工具契约清单（输入 / 输出 / 权限 / 失败返回 / 是否可重试 / 是否写数据），对齐六模块 §4 权限表
- `src/agent/tools-manifest.test.ts`（新）：契约完整性回归 + 公开统计白名单（PUBLIC_STATS_FIELDS 严格收口）

### U12 内容意图工程化
- `src/pages/admin/content/edit.astro`：draftTemplate 两版加 `aiUsePolicy`（AI 边界进创作流程）+ 保存前原文正则软校验

### U14 MCP 私有验收
- `src/knowledge/content-query.ts`：export `isAiReadableParsed`（AI-0 边界统一到查询引擎）
- `src/mcp/index.ts`：复用 content-query 的 `isAiReadableParsed`（删除内部重复定义）
- `src/knowledge/content-query.test.ts`（新）：公开边界 + AI-0 边界测试

### 仪表盘
- `src/pages/admin/index.astro`：导航 + 快捷入口加规则池 / 经验 / Skill

## 验证

- `npx astro check`：0 errors
- `npm run build`：Complete
- `npm run test`：76 passed（新增 tools-manifest 9 + content-query 10）
- `npm run build:mcp`：✓

## git

- 本次会话改动，commit 见 `git log`（admin 工作台补全）。
