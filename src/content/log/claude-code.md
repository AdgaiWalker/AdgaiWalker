---
title: Claude Code
date: 2026-06-02
tags: [AI编程, Claude, 命令行, 工具]
type: learn
level: 入门
emoji: 💻
subtitle: 官方命令行 AI 编程助手
description: Anthropic 官方推出的命令行 AI 助手。通过终端直接用自然语言让 AI 读取/修改代码、执行测试、运行命令。
yValue: y ≈ 0.5-1
graduation: 在本地项目终端中成功安装并启动 Claude Code，完成至少一次多文件代码修改和测试
safetyNote: 默认情况下，Claude Code 运行任何命令或修改文件前都会请求你的手动确认，安全性极高。不要轻易开启 YOLO 模式。
shareAction: 在你的终端截一张运行 Claude Code 的炫酷截图分享给学习群或朋友
published: true
series: AI 编程实战
seriesOrder: 1
related: [nl-programming, agent-coding, 平价AI社区]
---

## 什么是 Claude Code

Claude Code 是 Anthropic 官方推出的命令行 AI 编程助手。它不仅仅是一个聊天框，而是一个可以直接在你的终端里帮你想办法、写代码、查 Bug、跑命令的 agent。
- **直接操作**：它可以读取和理解你整个项目的代码文件。
- **环境融合**：可以在你的授权下自动运行测试、执行 git 提交、甚至在本地运行编译构建。
- **交互简单**：你只需要像跟人说话一样在命令行里吩咐它即可。

## 准备环境

运行 Claude Code 需要在电脑中提前装好以下环境：
- **Node.js**：版本需要满足 `Node.js 18+` 以上。可以在终端输入 `node -v` 检查版本。
- **Git**：需要安装好 git 工具用于版本控制。可以在终端输入 `git --version` 检查。
- **API 账户**：需要一个可用的 Anthropic API 账户（拥有 API Key 或控制台权限）。

## 安装与运行

环境准备就绪后，按照以下步骤在命令行中安装：
- **全局安装**：打开命令行终端（Windows 用户推荐 Windows Terminal / PowerShell，Mac 用户推荐 Terminal / iTerm2），运行命令：`npm install -g @anthropic-ai/claude-code`。
- **启动运行**：安装完成后，直接在你的项目根目录下输入命令：`claude` 即可启动它。

## 登录与授权

首次运行 `claude` 命令时，程序会要求进行身份验证：
- **授权网页打开**：终端会显示一个一次性代码，并自动在浏览器中打开 Anthropic 的授权页面。
- **完成绑定**：登录你的 Anthropic 账户并输入验证码进行确认授权，完成后终端会自动登录成功。
- **注意事项**：如果遇到连接超时，可以检查你的网络代理设置。

## 第一次对话与命令

进入 Claude Code 的交互式界面后，你可以开始发送自然语言指令，也可以使用一些专属的斜杠命令：
- **引用文件**：使用 `@文件名` 可以快速将特定文件作为上下文喂给它（例如：`@App.tsx 帮我重构这个组件`）。
- **退出交互**：输入 `/exit` 可以退出 Claude Code 的命令行会话。
- **重置会话**：输入 `/clear` 可以重置当前会话的上下文记忆。

## YOLO 模式与安全机制

默认情况下，Claude Code 在执行任何可能对文件或系统产生副作用的操作（如运行命令、修改文件、执行 git 提交等）前，都会向你请求二次确认：
- **手动确认**：你需要按 `y` 键允许它执行，或按 `n` 拒绝。这能最大化保障你的数据安全。
- **YOLO 模式**：如果你对它完全信任且不想频繁确认，可以在启动时带上 `--yolo` 标志。**警告**：这可能导致 AI 误删文件或执行破坏性操作，新手极其不建议开启！

## 常用快捷键与命令

Claude Code 内置了丰富的管理命令，在命令行中输入斜杠即可触发：
- **/config**：查看与更改配置，例如切换使用的基础模型或设置网络代理。
- **/mcp**：连接外部的 MCP 协议工具，让 Claude 拥有搜索网页、查数据库等更多能力。
- **/help**：获取关于所有斜杠命令 and 快捷键的帮助说明。
