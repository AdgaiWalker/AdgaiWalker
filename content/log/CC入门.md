---
title: CC入门
date: 2026-06-17
type: learn
level: 入门
emoji: 🤖
description: 做一件以前做不到的事——从零驾驭 Claude Code 命令行 agent，自动化装好全栈开发环境。
visibility: public
tags: [AI, Claude Code, 入门, agent]
category: 学习
domain: ai
form: lesson
intent: teach
---

> 做一件以前做不到的事情！想接触 CC、想接触命令行对话的你——了解 AI 或大概用过一阵子界面版 IDE，现在让我们驾驭 agent。

**本章内容**：自动化安装 CC 及 node 全栈开发环境、选择外接模型、CC 管理、基础命令。

**目的**：掌握 CC 工具，而不是 model 本身，用马具更好地控制 AI。

## 常见问题与办法（提前预览，有问题即看）

1. 看不懂英文——浏览器下载飞书 app，快捷键 `Ctrl+Shift+S`，点击翻译。
2. CC 用不了——去看第 4 节。
3. 后缀 `.md` 文档打不开或阅读困难——应用商店下载 Typedown。
4. 看不到做的界面——默认浏览器为 Chrome，提示词「帮我启动项目」，如果没有画面，打开开发者模式修 bug。

> 后续用 AI 更顺畅，推荐看 [0、得到一台好用的电脑](https://lcndccjmtf4f.feishu.cn/wiki/J8jDwimY9ieoxSktXpCccVKhngf)，并推荐截图勾画软件 ZoomIt。

## 0、token 渠道

- DeepSeek、GLM、Kimi、MiniMax 等官网购买国产模型。
- 个人自用 GPT 中转（省钱多学习）：https://sanyeee.hnao.me/ ——9 小时从调查到写 3200 字研究报告，6 元消耗。

## 1、做一个以前不敢想的点子

先从一个身边触手可及的小事开始：一个个人博客、一个梦想中的马里奥、一个粒子交互的花朵——一件别人能做到、原来你做不到的事情。

如果没想到，可以到 https://www.iwalk.pro/ 抽（Spark）一个点子！

## 2、下载 CodeBuddy

[戳这里安装：腾讯云代码助手 CodeBuddy](https://www.codebuddy.cn/ide/)

> 不需要 API key，有免费使用额度。安装时，哪有选项点哪里。

如果你只是想做 PPT、Excel、普通教学，CodeBuddy 够用；科研人员最好用 Codex。

## 3、在工作界面，自动化安装基础开发环境

![CodeBuddy 工作界面](/learn/cc/img1.png)

给 agent 发这段提示词，让它自动装好环境：

```plain text
在 Windows（winget）或 macOS（brew）上自动检测并安装 Git、Node.js LTS、PostgreSQL 最新版，已安装的跳过；配置 npm registry 为国内镜像 https://registry.npmmirror.com；全局安装 @anthropic-ai/claude-code、@openai/codex、@google/gemini-cli；最后验证所有版本，全部安装成功，只需告诉结果。
```

或更细的版本：

```plain text
帮我安装 git、最新版本 node.js.lts、npm、postgresql
默认用户为国内环境，尽量用国内方式安装。
首先检测 Windows 系统环境，如果没有，帮我安装 winget。
帮我用 winget 装：
winget install Git.Git
winget install OpenJS.NodeJS.LTS
刷新环境后 npm config set registry https://registry.npmmirror.com
npm 装完后，继续装三个 AI CLI：
npm install -g @anthropic-ai/claude-code
npm install -g @openai/codex
npm install -g @google/gemini-cli
最后验证版本。如果没有安装成功，请自行决定。
```

手动安装 Chrome 浏览器：https://www.google.cn/chrome

> 科普：agent = harness + model

## 4、CC 管理（按需而配，新手只配 apikey）

### 一、下载 cc-switch

管理 token apikey、MCP、skill 等外接工具。

- Windows：`CC-Switch-v3.15.0-Windows.msi`
- macOS：`CC-Switch-v3.15.0-macOS.dmg`
- 其他系统版本：https://github.com/farion1231/cc-switch/releases
- cc-switch 官网：https://ccswitch.io/zh/

### 二、YOLO 模式

Claude Code 自由奔跑模式，不用点授权，但也有概率误删重要文件——AI 通病。

**cc-switch 安装（稳定推荐）**，配置：

```json
{
  "permissions": {
    "defaultMode": "bypassPermissions"
  }
}
```

**或提示词安装**：

```plain text
帮我在 ~/.claude/settings.json 文件配置以下
{
  "permissions": {
    "defaultMode": "bypassPermissions"
  }
}
```

> 科普：关于模式本质——缰绳的松紧程度。

## 5、对话常用基础命令——/ 和 @

终端启动：`claude`

对话调用文件：`@文件xxx`

![CC 操作手册目录](/learn/cc/img2.png)

**基础 skill：**

- `/superpower`——一个说出想法、引领你想法成真的技能。
- `/init`——调查工作区，生成 `CLAUDE.md`，后续对话不用再介绍项目。
- `/clear`——重置本次对话记忆。
- `/model`——切换模型。

![/model 设置界面](/learn/cc/img3.png)

- `/resume`——切换历史聊天。

![/resume 历史会话](/learn/cc/img4.png)

---

做到这，相信你不仅敢信、也敢干了吧！加入我们一起做学徒，为了做得更好。一直更新的 [iwalk.pro](https://www.iwalk.pro/about)。
