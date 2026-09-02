---
title: "vibe0s — 让 AI 帮你选 Skill、排流程、留方法"
date: 2026-08-20
updated: 2026-08-20
tags: [AI, Skill, 人机协作, 工作流]
type: project
hall: showcase
form: project
domain: ai
intent: share
valueMode: utility
published: true
summary: "面向不会挑 Skill、不会组织 AI 工作流的人：先把目标说清，再选择最少够用的能力推进，最后把做成的方法沉淀下来。当前仍在真实任务中验证。"
status: validating
series: 桌面项目
seriesOrder: 1
related: [goout, itab-agent-spaces, ferry-spec]
url: https://github.com/AdgaiWalker/vibe0s
aiUsePolicy:
  level: AI-4
  readable: true
  citable: true
  actionable: false
  reason: 项目本身是 AI Skill 协作协议；当前可阅读和试用，但效果仍需更多真实任务验证。
resources:
  - name: vibe0s GitHub
    url: https://github.com/AdgaiWalker/vibe0s
    type: github
    description: 三个 Skill、协作协议、案例与测试
---

## 项目定位

vibe0s 解决的不是“再做一个万能 Skill”，而是一个更靠前的问题：已经装了很多 Skill，却不知道当前任务该用哪个、先后怎么排、什么时候该停。

它把这件事拆成三个动作：

- **vibe-check**：把模糊感觉变成由人确认的目标；
- **vibe-flow**：从已有能力里选择最少够用的 Skill，安排依赖、顺序与并行；
- **vibe-recipe**：把一次做成的方法提炼出来，再换一个真实任务验证能否复用。

## 当前状态

**验证中。** 三件套、协议、案例和安装脚本已经存在，但“是否普遍减少学习成本、沟通轮次和 Token”还没有足够的跨用户数据，暂不把它写成已经成立的效果承诺。

## 现在能做什么

- 目标说不清时，把真正需要人决定的取舍收敛出来；
- 面对多个 Skill 时，先排除没有独特价值的能力，再安排执行网络；
- 在任务完成后，把固定步骤与可替换变量分开，形成可再次验证的方法；
- 用 Agency Contract 保存目标、边界、决策、验收和交接状态。

## 怎么使用

最简单的入口只有一句：

```text
使用 $vibe-flow，帮我选择合适的 Skill，把这件事推进到可以检查的结果。
```

如果目标仍然模糊，流程会转交给 `vibe-check`；如果结果值得复用，再进入 `vibe-recipe`。它不会替人决定真正想要什么，也不会自动接受风险或验收结果。

## 已有证据

2026-08-20 本地复核：55 项协议、合同、安装、卸载、身份和流程测试全部通过。仓库中已有真实 README 改写案例以及可检查的证据关联评估记录。

## 当前边界

- 目前证据主要来自项目作者自己的任务；
- 自动测试能证明结构和交接规则一致，不能证明所有人都会更快或做得更好；
- 仓库正在删减旧网站和旧设计材料，现阶段以 Skill、协议、案例与测试为核心。

## 下一步

继续用不同类型的真实任务验证三件套，记录失败、返工和人为裁决点，再决定哪些规则应该稳定下来，哪些只适合保留为实验。
