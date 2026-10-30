---
title: "墨览 — 跨手机与电脑的 AI 文件助手"
date: 2026-08-20
updated: 2026-08-20
tags: [文件阅读, AI, 跨端, Office 转换]
type: idea
hall: showcase
form: idea
domain: product
intent: share
valueMode: utility
published: true
summary: "手机先把收到的文件读起来，再把主动收集的文件同步到电脑，转换成 AI 可读内容，并让处理结果回到手机。覆盖原生移动端、桌面端、CLI 与共享合同。"
status: building
series: 桌面点子
seriesOrder: 4
related: [itab-agent-spaces, goout, dorazoom]
url: https://github.com/AdgaiWalker/molan-ai-file-assistant
aiUsePolicy:
  level: AI-4
  readable: true
  citable: true
  actionable: false
  reason: 文件合同、转换工具和桌面能力可检查；公开安装、跨端真实环境与发布链仍在推进。
resources:
  - name: 墨览 GitHub
    url: https://github.com/AdgaiWalker/molan-ai-file-assistant
    type: github
    description: Android、iOS、Electron、CLI、合同与验证记录
---

## 项目定位

墨览不是单纯的 Markdown 阅读器，也不是把文件全量上传到云端的网盘。它从“手机收到文件后不好读、电脑上的 AI 又拿不到整洁材料”这个断点出发，建立阅读、收集、转换、同步和 AI 使用的跨端链路。

默认原则是文件留在本地，用户主动选择收集与同步；跨平台共享的是版本化合同，不复制一套含糊的数据模型。

## 当前状态

**实现中。** 上一阶段任务清单已经收口，但桌面提示词工作台、原生端展示和官网仍有新的本地改动，所以它属于“阶段完成后继续推进”，不是整个产品完结。

## 现在能做什么

- 在 Android、iOS 和 Electron 侧打开并阅读 Markdown、JSON 等文件；
- 用桌面端与 `molan` CLI 把 Office、PDF、PPT、Excel 等材料转成 Markdown 或结构化 JSON；
- 通过本地收件箱执行 `push`、`pull`、`read`，让 AI/Agent 使用稳定的 JSON 输出；
- 管理提示词快贴、文件索引、转换结果与本地同步状态；
- 用共享 JSON Schema 约束文档、版本、文件对象、派生产物和 AI 结果。

## 怎么使用

当前最稳定的入口是桌面端和 CLI。桌面端提供阅读、转换、收件箱与提示词界面；CLI 面向 AI/Agent，通过 `--json` 返回可解析结果。移动端仍应按各自原生工程运行和验收，不把旧移动基线当作当前主实现。

## 已有证据

2026-08-20 本地复核：当前 TODO 快照为 46/46；桌面 TypeScript 检查通过，7 个测试文件中的 41 项测试全部通过，覆盖转换、错误呈现、收件箱、桌面同步和提示词展示逻辑。

仓库还保存 Android、iOS、合同、CLI 和发布批次的独立验证入口。

## 当前边界

- 当前没有可供公众直接下载的统一安装包；
- 真机、账号主体、正式同步环境、真实 AI 客户端和发布渠道属于不同外部批次，不能用本地模板代替；
- 本地目录约 15 GB，其中包含依赖、构建产物和视频证据，不代表源码体量；
- 官网是内嵌独立 Git 工作树，当前没有独立远端，发布归属需要先收口。

## 下一步

先完成正在推进的桌面提示词工作台与原生端展示改造，再把官网、产品身份、安装包和跨端真实证据分别收口；不把“本地测试全绿”直接写成“已经公开发布”。
