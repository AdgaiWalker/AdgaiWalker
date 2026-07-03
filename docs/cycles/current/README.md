# Cycles 当前阶段记录

本目录承载一轮工作包的**可回放链路**（Spec Kit / OpenSpec 桥接，U17）。让一轮工作在产品仓库也有可回放痕迹——blueprint 在 walker-northstar skill 仓库，reality + 阶段记录在产品仓库。

## 文件流（一轮工作包）

```
prd.md       — 需求分析 + 功能设计 + 架构设计
plan.md      — 开发规划、阶段顺序、依赖关系
todo.md      — 可执行、可验收任务清单
implement.md — 实际发生的改动（指向 git commit）
retro.md     — 复盘（做成了什么 / 偏差 / 下次要改的规则）
```

## 流程

1. 一轮工作从 `prd.md` 开始（需求 → 功能设计 → 架构）
2. `plan.md` 拆阶段、依赖
3. `todo.md` 可执行、可验收清单
4. 实施后 `implement.md` 记录实际改动（指向 git commit sha）
5. `retro.md` 复盘：做成了什么 / 偏差 / 规则沉淀
6. 一轮结束后，整个目录归档到 `docs/archive/cycles/YYYY-MM-DD-topic/`

## 与 walker-northstar skill 的关系

当前执行三件套在 `.agents/skills/walker-northstar/references/working/`（prd.md / plan.md / to-do list.md，skill 仓库保护 blueprint）。

本目录是**产品仓库侧**的阶段记录入口：每轮工作包完成后，从 skill 工作区把阶段产物同步一份到产品仓库（或写 summary 指针），保证产品仓库的 `docs/cycles/` 也有可回放链路，不只在 skill 仓库里。

## 验收（U17 §22.5）

- [x] 一条真实需求能完整走完 prd → architecture → plan → todo → implement → log（2026-06-16 admin 工作台补全 cycle；2026-07-04 doc-debt-and-u6u7-closure 第二次跑通）
- [x] 每个阶段都有输出物（prd / plan / todo 在 skill `working/`，implement.md / retro.md 在本目录）
- [x] 每次实现能回到对应 prd / plan / todo（implement.md 每项标注上游 U 编号）
- [x] 每轮结束能更新 execution log 和 cycle ledger（2026-07-04 本轮已同步 skill `references/reflection/`）
- [x] 可重复经验能进入 skill 候选（retro.md 标注 rule candidate；「核实先于派生 to-do」pattern 二次观察）
