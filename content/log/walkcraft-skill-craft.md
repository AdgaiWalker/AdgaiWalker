---
title: "Walkcraft-Skill-Craft — 健壮技能制作方法论"
date: 2026-05-18
updated: 2026-06-07
tags:
  - AI
  - 方法论
  - 技能工程
  - 迭代
  - Claude-Code
type: project
form: project
domain: ai
intent: teach
valueMode: both
published: true
summary: "从真实测试中迭代出健壮技能的方法论。6 阶段流程：问题建模 → 草稿 → 真实测试 → 审计分级 → 做减法 → 通用化。核心观点：第一版必然基于错误假设，只有真实测试才能暴露问题。"
status: verified
series: Ferry计划
seriesOrder: 2
related: [Ferry渡轮, side-hustle-blueprint, 渡论构建, 减法对话]
url: https://github.com/AdgaiWalker/Walkcraft-Skill-Craft
aiUsePolicy:
  level: AI-4
  readable: true
  citable: true
  actionable: true
  reason: 技能制作方法论本身就是面向 AI 可读的，所有内容天然可供 AI 引用和执行。
resources:
  - name: Skill-Craft 仓库
    url: https://github.com/AdgaiWalker/Walkcraft-Skill-Craft
    type: github
    description: 技能制作方法论源码、经验库与完整文档
---

## 来自 Ferry 的实践

Skill-Craft 不是凭空发明的。它来自 Ferry 五公理的实践落地：

- **做减法** → Phase 5 三把刀（离去/转化/迁移）
- **熵减命令** → 经验库把混乱经验变成有序规则
- **螺旋进化** → 案例→模式→新案例→更精确的模式，每转一圈 f 本身变强
- **否定之否定** → 每个被证伪的假设都是进化燃料

## 6 阶段流程

```
Phase 1: 问题建模（10 分钟，省 3 小时）
↓
Phase 2: 草稿
↓
Phase 3: 真实测试（最重要）
↓
Phase 4: 审计分级 — P0/P1/P2
↓
Phase 5: 做减法（三把刀）
↓
Phase 6: 通用化
```

## 核心原则

1. **假设是最大敌人**：第一版必然基于假设，代码审查看不出来（逻辑自洽），只有真实测试才能暴露
2. **发现 > 执行**：好的技能帮用户看见盲区，而不是执行已知操作
3. **做减法不是只有删**：三把刀 — 离去（删）、转化（变）、迁移（移）
4. **修根因**：同一类问题出现第三次就该重构
5. **SKILL 是守门员不是知识库**：主文件只放决策逻辑和路由，具体数据放 references

## 经验库

每次变换完成后，案例记入 `references/cases/`，决策规则记入 `references/patterns/`。规则指导下一次变换，案例验证规则是否站得住脚。

当前积累：
- 案例 001：astro-component-diagnosis（React→Astro 组件诊断适配）
- 案例 002：side-hustle-blueprint（副业蓝图技能的架构进化）
- 模式 1：框架组件评估
- 模式 2：技能即守门员
