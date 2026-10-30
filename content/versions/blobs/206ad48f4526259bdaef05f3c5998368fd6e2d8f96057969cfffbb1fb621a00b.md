---
title: "GoOut — 多场景个人统筹 Agent"
date: 2026-08-20
updated: 2026-08-20
tags: [AI Agent, 统筹规划, iOS, 确定性]
type: idea
hall: showcase
form: idea
domain: product
intent: share
valueMode: utility
published: true
summary: "把同一天的创作、外出和生活需求编译成可验证、可执行、可恢复的行动计划。LLM 负责理解和解释，确定性代码负责约束、求解与复核。"
status: building
series: 桌面点子
seriesOrder: 2
related: [vibe0s, itab-agent-spaces, molan-ai-file-assistant]
url: https://github.com/AdgaiWalker/goout
aiUsePolicy:
  level: AI-4
  readable: true
  citable: true
  actionable: false
  reason: 架构、合同和测试证据可读；产品仍在实现中，暂不作为可直接依赖的成品推荐。
resources:
  - name: GoOut GitHub
    url: https://github.com/AdgaiWalker/goout
    type: github
    description: Web 验证闭环、后端、iOS、合同与研究证据
---

## 项目定位

GoOut 是一个单人自用的个人统筹 Agent。它不把创作、外出和生活拆成三个互不相干的模式，而是把它们放进同一天、同一组资源和同一套约束里统一排程。

核心分工是：LLM 负责把自然语言结构化、发现需要澄清的地方并解释结果；时间窗、依赖、地点、交通、资源冲突、求解和可行性复核交给确定性代码。

## 当前状态

**实现中。** 当前优先用本地 Web Demo 验证最小闭环，iOS 保留原生能力和本地数据边界，Python 后端承载合同、规划、事件、记忆、Research Tool 与持久化证据。

## 现在能做什么

- 把混合的创作、出行和生活要求整理成统一 Canonical Scenario；
- 对硬时间窗、依赖、资源容量和主动/被动并行做确定性排程；
- 对事件影响的未来子图局部重排，并生成 PlanVersion 与 Diff；
- 区分可行、不可行和信息不足，不让 LLM 假装证明可行；
- 保存可见、可修改、可禁用和可删除的用户记忆候选。

## 怎么使用

目前适合开发验证，不是面向普通用户的一键安装产品。开发者需要分别启动后端和本地 Web Demo；模型与 Research Tool 使用各自的 BYOK 配置。iOS 侧仍以 Simulator 和本地边界验证为主。

## 已有证据

2026-08-20 本地复核：后端共收集 148 项测试，其中 142 项通过。143 项非 PostgreSQL 测试中有 1 项失败；另外 5 项 PostgreSQL 集成测试因为本次环境没有提供 `TEST_DATABASE_URL` 而失败。

已有的工程证据覆盖 Schema、事件、计划版本、局部重排、独立复核、记忆生命周期、SSE、BYOK 隔离和固定 ScenarioBench。

## 当前边界

- “今天”的计划开始时间目前存在一个真实回归：没有按当前本地时间截断；
- PostgreSQL 集成证据需要带测试数据库重新运行；
- 物理 iPhone、公开分发和 30 天自然使用验证尚未完成；
- 当前 GitHub 版本还没有包含全部本地推进内容。

## 下一步

先修复当天开始时间回归并恢复全绿，再完成带 PostgreSQL 的集成复核；之后继续用真实日程验证局部重排、长期记忆和移动端体验，而不是先扩更多场景名词。
