> **历史文档**：本文描述的是已退役的 Astro 单应用时代方案/记录。  
> **当前运行栈**见 `README.md`、`docs/architecture-modules.md`（React monorepo）。  
> 请勿按本文路径（`src/pages/*.astro`、`npx astro check`）施工。

# Retro — 2026-07-04 doc-debt-and-u6u7-closure

## 做成了什么

1. **代码现实核实**：逐文件核实 U1-U18 真实完成度，发现 prd.md 把 5 个已完成项（U9/U10/U11/U13/U15）误标「未开始/基础」，纠正后整张 U 表重新可信。
2. **两个真实缺口闭合**：U7（搜索缺口采集了但没上台面）、U6（内容宇宙退回单视图）——都是「临门一脚」性质，工作量小但文档一直挂着，本轮顺手收掉。
3. **文档债清理**：README 叙事对齐、prd/to-do/ledger 三份决策文档刷新、后台模块成熟度审计落地。
4. **U17 链路再次跑通**：本轮 implement.md + retro.md 按模板回填，验证 spec 桥接可重复。

## 偏差 / 坑

### JSX 嵌套三元改四元的括号陷阱

改 hit-rate.astro 时，把三元 view 切换从三层（matrix/outcome/popular）扩到四层（加 gaps），第一版写成 `A?B:C?D:(E):(F)`——语法错误，astro check 报 `}` expected，反复改了两次才意识到：**每个 `:` 后要么是终结值，要么必须是新的 `cond ? `**，不能直接 `(分支):(分支)`。正确写法 `A?B:C?D:E?F:G`。

教训：嵌套三元超过三层就该考虑抽组件或用对象查找表，别硬撸。本轮因为懒没抽，多花了 15 分钟。

### 「核实先于派生 to-do」第二次出现

6-16 ledger 已记这条 pattern 候选，本轮再次验证：如果一开始就相信过期文档，会去重做 U9/U10/U11（它们标「未开始」）。因为坚持逐文件读 store/API/页面源码，才避免重复劳动。

再观察一次就晋升为 pattern。

### 日期漂移

current-cycle-state 把 dianzi 轮标 7-3，实际 commit `819fb75` 是 7-4 00:28。文档手写日期容易跨日漂移，应以 commit 时间为准。

## 下次要改的规则

- **改任何 .ts/.astro 后立即三重验证**（astro check + test + build）——6-16 已沉淀为铁律，本轮遵守了，但第一版 hit-rate 括号错就是没及时 astro check 导致改两次。规则记牢但执行要更早。
- **prd §3 U 表改为「按代码核实」而非「按记忆/文档」**：每次刷新 U 表前，必须有一轮代码核实（读 store/API/页面文件），不能凭印象改状态。
- **嵌套三元上限三层**：超过就抽组件或对象查找，这条可作 rule candidate。

## Skill 候选

- 无新增。本轮是文档+小功能收口，没有可重复的方法论沉淀超出已有 skill。
- 「核实先于派生 to-do」继续观察，尚未晋升。
