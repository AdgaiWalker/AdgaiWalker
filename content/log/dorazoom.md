---
title: "DoraZoom — macOS 屏幕讲解与标注工具"
date: 2026-08-20
updated: 2026-08-20
tags: [macOS, 屏幕缩放, 标注, 录屏]
type: project
hall: showcase
form: project
domain: product
intent: share
valueMode: utility
published: true
summary: "哆啦个人版 macOS 屏幕讲解工具：快速缩放、圈画、白板/黑板、截图、OCR、录屏、摄像头画中画和滚动长截图。当前已完成并进入本地日常使用。"
status: verified
series: 桌面项目
seriesOrder: 5
related: [molan-ai-file-assistant, itab-agent-spaces]
url: https://github.com/AdgaiWalker/zoomit
aiUsePolicy:
  level: AI-4
  readable: true
  citable: true
  actionable: true
  reason: 项目已有可运行 macOS App、交付脚本和自动化证据；公开下载仍需使用最新源码重新打包。
resources:
  - name: DoraZoom GitHub
    url: https://github.com/AdgaiWalker/zoomit
    type: github
    description: macOS 源码、产品文档、测试与交付脚本
---

## 项目定位

DoraZoom 是哆啦个人版的 macOS 屏幕讲解工具，基于 Microsoft Sysinternals ZoomIt for Mac 官方源码改造。它把 Windows ZoomIt 的高频讲解体验带到 Mac，并针对输入法、权限、剪贴板、录屏和多显示器做原生适配。

## 当前状态

**已完成，可投入本地使用。** 当前有日常版 `DoraZoom.app` 和隔离权限的开发版 `DoraZoom Dev.app`；功能实现与本地自动化验收已经收口。

## 现在能做什么

- 静态缩放、实时缩放、原比例绘画；
- 自由画笔、直线、矩形、椭圆、箭头、高亮、模糊、实色遮挡和编号标记；
- 使用 AppKit 原生文本系统输入中日韩文字；
- 白板、黑板、休息计时器和 DemoType；
- 全屏、区域和窗口录制，支持摄像头画中画；
- 截图到剪贴板或文件、OCR、滚动长截图；
- 通过权限中心、状态菜单和可配置快捷键管理日常使用。

## 怎么使用

日常版使用 `Control+1` 到 `Control+8` 进入缩放、绘画、计时、录屏、截图、DemoType 和长截图等功能。白板、黑板和文字标注是在画布内使用的工具，不是新的全局快捷键。

当前项目所有者可以直接运行本地日常版。外部用户目前应从源码构建；稳定的公众下载地址需要用当前最新源码重新生成安装包后再开放。

## 已有证据

2026-08-20 本地复核：`swift test` 构建成功，219 项测试全部通过。测试覆盖缩放、标注、隐私遮挡、多显示器、原生文字编辑、截图、录屏、权限、设置、计时、DemoType、产品身份和生命周期。

本地已存在可运行 App 和 ZIP 产物，项目也提供统一交付脚本进行构建、验签、打包和残留审计。

## 当前边界

- 自动化主要通过进程内模拟边界验证，不能冒充真实 TCC、真实全局输入、真实麦克风/摄像头和外部播放器验收；
- 现有 ZIP 早于当前源码，本页暂不提供可能过期的二进制下载；
- 当前源码有大量尚未提交的新迭代，公开分发前应重新运行完整交付门禁并生成新包；
- 本项目保留上游 MIT 许可证与归属。

## 下一步

产品功能不再扩张。下一步只做交付收口：冻结当前源码、运行完整交付门禁、生成与源码一致的新 ZIP，再补稳定下载地址和最短安装说明。
