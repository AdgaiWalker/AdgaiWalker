# Hai TDD: 可信基线、TOC 与后台状态真实性

## Target Behavior

本轮驱动三个最小行为：没有健康事实时后台显示“状态未知”；TOC 高亮滚动使用 canonical ContentShell 的 `.toc-sidebar-inner`；TOC 折叠用一个状态同时投影侧栏与两个按钮，并在 localStorage 不可用时保持交互。

## RED

- **Test added**: `src/components/admin/admin-shell-state.test.ts`
- **Behavior asserted**: 缺少 health fact 时返回 unknown；只有显式 operational 才显示系统可用；degraded 与 unknown 分开。
- **Command**: `npx vitest run src/components/admin/admin-shell-state.test.ts`
- **Observed failure**: `Cannot find module './admin-shell-state'`，0 tests。
- **Failure is correct because**: 项目此前没有系统健康展示合同，布局直接硬编码“系统可用”。

- **Test added**: `src/scripts/toc-highlight.logic.test.ts`
- **Behavior asserted**: TOC 必须优先选择 `.toc-sidebar-inner`，不存在时才回退自身。
- **Command**: `npx vitest run src/scripts/toc-highlight.logic.test.ts`
- **Observed failure**: `Cannot find module './toc-highlight.logic'`，0 tests。
- **Failure is correct because**: 现有实现直接寻找退役的 `.ghost-toc-inner`，没有 canonical 容器解析合同。

- **Test added**: `src/scripts/toc-collapse-state.test.ts`
- **Behavior asserted**: 一个 collapsed 值同步控制 class、收起按钮和展开按钮；storage 抛错时 UI 仍更新。
- **Command**: `npx vitest run src/scripts/toc-collapse-state.test.ts`
- **Observed failure**: `Cannot find module './toc-collapse-state'`，0 tests。
- **Failure is correct because**: 折叠状态仍在 ContentShell 内重复写三套 DOM/localStorage 操作，没有独立状态投影函数。

## GREEN

- **Minimal implementation**:
  - 新增 `getAdminSystemStatus()`，默认 unknown，并让 AdminLayout 接收显式 `systemHealth`。
  - 新增 `resolveTocScrollContainer()`，只认 canonical `.toc-sidebar-inner`，并由 `toc-highlight.ts` 使用。
  - 新增 `readTocCollapsedState()` / `applyTocCollapsedState()`，统一 UI 投影并捕获 storage 异常。
- **Command**: 分别运行三个新增测试文件。
- **Observed pass**: admin status 3 tests、TOC container 2 tests、TOC collapse 2 tests 全部通过。

## REFACTOR

- **Refactor done**: yes
- **Change**:
  - `toc-highlight.ts` 用 `Array.from(...).find()` 取得活跃链接，消除回调赋值导致的 `never` 类型错误。
  - ContentShell 用 `--cs-toc-offset` 取代两处 362px，删除重复窄屏规则和死 `.cs-layout`，修正过期 Phase 注释。
  - AdminLayout 使用已测试的 `registerLifecycle()` 和 AbortController，避免 View Transition 后累积 document 监听器；移除无事实源的头像“在线”标记。
  - `BlockDialogue` 改为 Astro `class:list`；删除零引用 `BLOCK_WIDTH_STYLES`。
  - 修正 owner 角色合同、Redis `smembers<string[]>` 泛型与 profile fake repository 缺失方法，恢复类型基线。
- **Command after refactor**: `npx vitest run src/components/admin/admin-shell-state.test.ts src/scripts/toc-highlight.logic.test.ts src/scripts/toc-collapse-state.test.ts src/scripts/with-lifecycle.test.ts`; `npm test`; `npx astro check`; `npm run build`
- **Observed result**:
  - 相关测试：4 files / 9 tests passed。
  - 全量测试：26 files / 167 tests passed。
  - Astro check：0 errors / 0 warnings / 11 hints。
  - Build：passed；Pagefind indexed 15 pages / 2270 words。

## Next Behavior

用 Playwright 验证真实页面中的后台状态文案、导航菜单生命周期、桌面 TOC 跟随/折叠/刷新恢复，以及窄屏正文与导航可达性。
