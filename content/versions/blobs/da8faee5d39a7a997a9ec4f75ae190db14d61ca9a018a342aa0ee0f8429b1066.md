---
title: 龙虾的核心价值
date: 2026-08-11
updated: 2026-08-11
tags:
  - OpenClaw
  - AGI
  - Gateway
  - Skill
  - 架构
type: knowledge
hall: lab
form: essay
domain: ai
intent: teach
valueMode: both
published: true
summary: >-
  OpenClaw（龙虾架构）的真正价值不在外壳，而在网关：上连模型与 Agent，下连软件与硬件，
  横向承接人类意图。刚性环节用代码保确定性，柔性环节用 Skill 保弹性——
  刚柔一体，Agent 才能从软件聊天走向物理世界生产力。
related:
  - walkcraft-skill-craft
  - on-people-and-skill
url: https://github.com/AdgaiWalker/vibe0s
aiUsePolicy:
  level: AI-2
  readable: true
  citable: true
  actionable: false
  reason: 架构观点与实践笔记，可供引用；不含可直接执行的完整流程。
resources:
  - name: vibe0s
    url: https://github.com/AdgaiWalker/vibe0s
    type: github
    description: 让小白不用学习、直接调用 Skill 的 Skill
---

## 许多人不知道龙虾真正的价值

OpenClaw（龙虾架构）的价值核心，不在「壳」，而在连接四面八方的枢纽——**网关**。  
它为 AGI 提供了一种可落地的可能性。

**网关是它的中枢神经。**

- **向上**：连接不同模态模型、不同 Agent  
- **向下**：连接软件、Skill、MCP、CLI、硬件设备  
- **横向**：承接人类意图——交互面板，以及微信、钉钉等聊天入口  
- **贯穿**：AI 状态、记忆、容错与约束

![OpenClaw 本地系统架构图：Gateway 居中路由，串联 Agent 与本地资源](/images/openclaw-gateway.jpg)

---

## 刚柔一体：不同环节，选不同要素

我最近在做一套让小白不用学习、直接调用 Skill 的 Skill——[vibe0s](https://github.com/AdgaiWalker/vibe0s)。

开发时碰到一个关键难点：

> **同一条业务链路的不同环节，需要不同的稳定性，才能保证安全。**

软件的结果确定性很高；Skill 则更像抽卡——有弹性，也有波动。

所以我决定：按业务特性，在不同环节选择不同要素。

### 刚性环节 · 高稳定性 → 用确定性代码

涉及资金扣费、数据写入、物理硬件控制等核心节点，**坚决零容错**。

### 柔性环节 · 高容错 / 高创造 → 用文字（提示词或 Skill）

涉及创意发散、UI 灵感、逻辑推理等，采取柔软政策：  
把 Skill 解耦为原子化的**「经验文字模块」**，按需轻量化加载——  
既享受高容错的红利，又大幅压低 Token 成本。

---

## 网关的真正价值

这正是网关（Gateway）充当中枢的真正价值——  
**让生态里的不同要素，各自发挥真正价值。**

| 要素 | 角色 |
|------|------|
| 文字 / Skill | 驱动创造性 |
| 代码 | 给予确定结果 |
| 规则 | 予以兜底 |

把确定性留给底层软件，把弹性留给 Skill。  
Agent 才能真正从「软件聊天」，走向「物理世界生产力」。

---

## 一个还没有答案的问题

但是，真正到达了 AGI，人该何去何从？  
我们是否要把「做与不做」的决策权交给 AI？

这件事，我还没有确切的答案。

---

**文字驱动创造性，代码给予确定结果，规则予以兜底。**
