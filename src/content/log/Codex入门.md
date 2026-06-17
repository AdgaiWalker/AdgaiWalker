---
title: Codex入门
date: 2026-06-17
type: learn
level: 入门
emoji: 🧪
description: 专业级 AI 编程——用 Codex 接入最强模型与大厂插件生态。
visibility: public
tags: [AI, Codex, 入门, agent]
category: 学习
domain: ai
form: lesson
intent: teach
---

本文适用一切网络环境，外接模型（DeepSeek、中转等）可正常使用 Codex 插件功能。

为什么需要 Codex？CodeBuddy 界面差不多，难道不行吗？——专业级生态和最强模型：CodeBuddy 有的，它有；CodeBuddy 没有的，许多专业级大厂插件都在里面。

**电脑要求**：至少能流畅玩 4399 小游戏，苹果 8G 内存单窗口可运行，其余系统一律 16G 往上。

## 一、token 渠道

**国内渠道：**

- DeepSeek、GLM、Kimi、MiniMax 等官网购买国产模型。
- 个人自用 GPT 中转（省钱多学习）：https://sanye.mom/ ——9 小时从调查到写 3200 字研究报告，6 元消耗。

**官方 GPT（需科学上网）：**

- 正版稳定自己直冲 Plus：[87 元开通 ChatGPT Plus 的保姆级教程（还白送 Codex）](https://chaojifeng.feishu.cn/wiki/WcNzwwqbHimSRJkuaQfcini9nWb)

> 直接充值会员就不需要手机验证。

## 二、Codex 安装——Windows 商店下载「Codex」

![Windows 商店下载 Codex](/learn/codex/img1.png)

在 Windows 商店搜索「Codex」下载安装。

## 三、下载 Codex++，用 Codex++ 启动 Codex

非官方登录缺功能，用 Codex++ 就能补全，和正版用着一样。充了官方 Plus 会员的不用看。

需要 token 售卖方提供：接入网址、api key。

- 安装包：`CodexPlusPlus-1.1.9-windows-x64-setup.exe`
- [备用下载链接（GitHub）](https://github.com/BigPizzaV3/CodexPlusPlus/releases)

## 四、英文改中文，改完重启

![Codex++ 设置界面](/learn/codex/img2.png)

![Codex++ 界面](/learn/codex/img3.png)

在 Codex++ 设置里把语言改为「中文（中国）」，工作模式可选「适用于编程」或「适用于日常」，权限按需开关。

如果依然不行，请在电脑下载飞书 app，屏幕翻译快捷键 `Ctrl+Shift+S`，或用手机夸克翻译直拍。

## 五、生产环境（按需删减）

**基础开发环境：**

先安装 Google 浏览器（[下载地址](https://www.google.cn/chrome)），然后把提示词发送给 Codex：

```plain text
在 Windows（winget）或 macOS（brew）上自动检测并安装 Git、Node.js LTS、PostgreSQL 最新版，已安装的跳过；配置 npm registry 为国内镜像 https://registry.npmmirror.com；全局安装 @anthropic-ai/claude-code、@openai/codex、@google/gemini-cli；最后验证所有版本，全部安装成功，只需告诉结果。
```

**MCP：** 帮我安装 Chrome DevTools MCP。

**非基础 skill 和 MCP：**

- 论文 nature skill：https://github.com/Yuan1z0825/nature-skills

---

> 认真做大众认可的教学。有问题，社群交流、学习、资源——[iwalk.pro/about](https://www.iwalk.pro/about)
