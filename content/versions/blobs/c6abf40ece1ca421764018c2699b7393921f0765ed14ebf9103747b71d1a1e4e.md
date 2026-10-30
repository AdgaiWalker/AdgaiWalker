---
title: "iTab Agent Spaces — 把新标签页变成 Agent 任务空间"
date: 2026-08-20
updated: 2026-08-20
tags: [Agent, 工作台, 浏览器, DeepSeek Harness]
type: idea
hall: showcase
form: idea
domain: product
intent: share
valueMode: utility
published: true
summary: "由 iTab 持有桌面、Space、Page 和 Card 的产品外壳，由 DeepSeek Harness 负责模型、会话与执行，让任务、文件和运行结果留在同一个空间里。"
status: building
series: 桌面点子
seriesOrder: 3
related: [vibe0s, goout, molan-ai-file-assistant]
url: https://github.com/AdgaiWalker/itab
aiUsePolicy:
  level: AI-4
  readable: true
  citable: true
  actionable: false
  reason: 本地闭环和合同已有测试；仍依赖开发环境与 Harness，不作为稳定成品推荐。
resources:
  - name: iTab GitHub
    url: https://github.com/AdgaiWalker/itab
    type: github
    description: Agent Spaces 产品外壳与本地任务空间
  - name: DeepSeek Harness
    url: https://github.com/AdgaiWalker/deepseek-harness
    type: github
    description: 模型、Workspace、Session、Run 与完整执行追溯
---

## 项目定位

iTab Agent Spaces 把熟悉的新标签页改造成一个本地 Agent 任务空间：壁纸、时钟、搜索、网址和组件仍属于 iTab；模型配置、Workspace、Session、Run 和完整 Conversation 仍由 DeepSeek Harness 持有。

两个系统通过同源 Bridge 协作，不在浏览器状态里复制第二份执行真相。

## 当前状态

**实现中。** Space、Page、Card、Desk I/O、Agent Command Bar、运行投影和 Harness 桥接已经形成闭环，当前仍在推进任意工作台的时空交互和插件化。

## 现在能做什么

- 在一个 Space 里建立多个网格或专注 Page；
- 把网址、文件路径、Workspace 和运行痕迹作为 Card 组织；
- 明确选择本次允许 Agent 读取的资源，而不是默认倾倒整个工作区；
- 执行前预览当前桌、Handle 和写回文件；
- 启动、查看、取消 Harness Session，并把完成结果固定回来源 Page；
- 对移动、缩放、删除等结构操作执行撤销。

## 怎么使用

当前需要本地启动两个服务：先启动 DeepSeek Harness 的 Web profile，再启动 iTab。iTab 开发服务器通过同一 Origin 代理 Harness RPC；模型、Reasoning 和凭据仍在 Harness 中配置。

没有有效文件 Handle 时不会创建 Session；运行痕迹卡只保存 `sessionId`，内容继续从 Harness 读取。

## 已有证据

2026-08-20 本地复核：iTab 自身 43 项测试全部通过，覆盖数据迁移、Page/Card 结构、Desk I/O、插件贡献、Harness RPC、运行状态、任务取消、失败草稿、结果提取、引用去重和同源代理。

内嵌的 DeepSeek Harness 工作树独立维护，本地比其远端多 1 个提交。

## 当前边界

- 仍是本地开发者工作台，不是公开部署的网站；
- iTab 主仓本地比远端多 2 个提交，并有一批未提交的新结构；
- 文件 Card 保存的是本地路径引用，不复制文件内容；跨设备同步尚不在当前闭环内；
- Shell 与 Harness 的职责虽然已拆开，但仍需继续用真实长任务验证恢复和写回体验。

## 下一步

先把当前 Page/Card/Presentation 改造收成可回退的提交，再验证长任务、失败恢复和多桌切换；插件化只接真实出现的第三类能力，不提前造空扩展点。
