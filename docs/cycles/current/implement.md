> **历史文档**：本文描述的是已退役的 Astro 单应用时代方案/记录。  
> **当前运行栈**见 `README.md`、`docs/architecture-modules.md`（React monorepo）。  
> 请勿按本文路径（`src/pages/*.astro`、`npx astro check`）施工。

# Implement — 2026-07-04 doc-debt-and-u6u7-closure

上游：skill 仓库 `references/working/prd.md` §3 U 表（U6/U7）+ 文档债清理需求。

本轮无独立 plan.md —— 范围由代码现实核实驱动，任务在执行中确定（见 retro 对此的复盘）。

## 实际改动（指向 git commit）

### U7 搜索缺口上台面 — commit `dd09a48`

- `src/pages/admin/hit-rate.astro`：
  - 新增第四视图 `?view=gaps`，消费 `getSearchMisses`（src/stores/search.store.ts，已存在但此前无 UI 消费）。
  - view switch 从三元扩为四元（matrix / outcome / popular / gaps）。
  - gaps 视图：高频无结果查询按频率排序 + 「搜 N 次」+ 最近日期 + 链接带入选题池/需求复盘。
  - 新增 `.gap-*` 样式。

### U6 内容宇宙多视图恢复 — commit `5190f25`

- `src/pages/content/index.astro`：
  - 新增视图切换器（流式 / 网格），URL `?view=grid` 持久化。
  - 客户端 JS：`applyView` + `bindViewSwitcher`，复用现有 abort/popstate 生命周期。
  - 网格布局用 `[data-view-list][data-mode="grid"]` 选择器 + `:global()` 重排 ContentStreamItem，不改 ContentStreamItem 本身。
  - prerender 保持 true，SSR 阶段不读 URL（静态生成），客户端按 `?view=` 切换避免 hydration 闪烁。

### 文档债清理（主仓库 + skill 仓库）

- 主仓库 `README.md`：当前定位段重写，如实反映已落地的个人站工作链（commit `2ecf643`）。
- 主仓库清理：删 `design-qa.md`（blocked 模板）、`wiki/`（占位空壳）、docx 移出仓库（commit `43893e9`）。
- skill 仓库 `project-docs-index.md` §1.4：后台模块成熟度审计（15 core / 1 scaffolded）。
- skill 仓库 `prd.md` §3：U 表整表按代码现实刷新。
- skill 仓库 `to-do.md`：顶部新增本轮 + 真实剩余段，旧内容降级历史。
- skill 仓库 `current-cycle-state.md` / `cycle-ledger.md`：补本轮，修 dianzi 轮日期。

## 验证

```
npx astro check = 6 errors / 0 warnings / 19 hints
  （6 个既存错误，全部在本轮未触碰的文件：BlockFeedback.astro / ideas/index.astro / posts/[slug].astro；零新增）
npm test = 61 files / 528 tests passed
npm run build = Complete（Pagefind 15 pages）
```

## 上游 U 编号回连

- U7 反馈数据台 v1 → 本轮闭合（搜索缺口上台面）
- U6 内容宇宙 UI/UX → 本轮达标（多视图基线）
- U17 Spec Kit 桥接 → 本轮通过此文件 + retro.md 验证链路
