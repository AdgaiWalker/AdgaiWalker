# CC入门

> 做一件以前做不到的事情！想接触CC，想接触命令行对话的你。了解ai或大概用过一阵子界面版ide，现在让我们驾驭agent。
> 
> 

本章内容：自动化安装CC及node全栈开发环境、选择外接模型、CC管理、基础命令

目的：掌握cc工具，而不是model本身，用马具更好的控制ai本身

### 常见问题与办法（提前预览，有问题即看）

1、看不懂英文。——浏览器下载飞书app，快捷键CTRL\+SHIFT\+S,点击翻译

2、CC用不了。去看4、

3、后缀\.md文档打不开或阅读困难  ——应用商店下载typedown

4、看不到做的界面——默认主要浏览器为Chrome浏览器，提示词“帮我启动项目”，如果没有画面，打开开发者模式修bug。

后续用ai更顺畅请到[0、得到一台好用的电脑 副本](https://lcndccjmtf4f.feishu.cn/wiki/J8jDwimY9ieoxSktXpCccVKhngf)，并且及力推荐勾画截图软件zoomit

# 0、token渠道

- Deepseek、GLM、Kimi、minimax等官网购买国产模型

- 个人自用GPT中转（省钱多学习）：https://sanyeee\.hnao\.me/（无利害关系！知识库我真名还在呢），9小时从调查到写3200字研究报告，6元消耗。

# 1、做一个以前不敢想的点子

先从一个身边触手可及的小事情开始。可以是一个个人博客、一个梦想中的马里奥、一个粒子交互的花朵，一件别人能做到原来你做不到的事情。
如果没想到，可以到blog主页https://www\.iwalk\.pro/抽（spark）一个点子！！！

# 2、下载Codebuddy

[戳这里安装。腾讯云代码助手 CodeBuddy \- AI 时代的智能编程伙伴](https://www.codebuddy.cn/ide/?fromSource=gwzcw.10537564.10537564.10537564&utm_medium=cpc&utm_id=gwzcw.10537564.10537564.10537564&bd_vid=3942624937702392537)

> 不需要apikei，有免费使用额度。安装时，哪有选项点哪里。
> 
> 

如果你只是想做ppt、excel，做做普通教学，CodeBuddy。最好就用Codex，科研人员都可以用。

# 3、在工作界面，自动化安装基础开发环境



![Image](https://internal-api-drive-stream.feishu.cn/space/api/box/stream/download/authcode/?code=ZTBiZmU5ZmI2MGE3NTVlYTIwNDNkMjg1ZGE2ZmZiZTVfYTM4OTBjM2I2Y2ZjMzZlODcwNTFlYzEyNDNmMjA2NmRfSUQ6NzY0NTEwMjI0MDE5MzI4NTA2M18xNzgxNjk0MTAwOjE3ODE3ODA1MDBfVjM)

```Plain Text
在 Windows（winget）或 macOS（brew）上自动检测并安装 Git、Node.js LTS、PostgreSQL 最新版，已安装的跳过；配置 npm registry 为国内镜像 https://registry.npmmirror.com；全局安装 @anthropic-ai/claude-code、@openai/codex、@google/gemini-cli；最后验证所有版本，全部安装成功，只需告诉结果。
```

```Plain Text
帮我安装git、最新版本node.js.lts、npm、postgresql
默认用户为国内环境，尽量用国内方式安装。
首先检测Windows系统环境，
如果没有，帮我安装wingrt。
帮我用 winget 装：
winget install Git.Git
winget install OpenJS.NodeJS.LTS
刷新环境后 npm config set registry [https://registry.npmmirror.com](https://registry.npmmirror.com/)
npm装完后，继续装三个 AI CLI：
npm install -g @anthropic-ai/claude-code
npm install -g @openai/codex
npm install -g @google/gemini-cli
最后验证版本。
如果没有安装成功，请自行决定。
```

手动安装Chrome浏览器[https://www\.google\.cn/chrome](https://www.google.cn/chrome)

科普：agent＝harness\+model



# 4、CC管理（按需而配，新手只配apikey）

一、下载cc swich——token apikey，管理mcp、skill等外接工具

\[CC\-Switch\-v3\.15\.0\-Windows\.msi\]

\[CC\-Switch\-v3\.15\.0\-macOS\.dmg\]

其他系统版本https://github\.com/farion1231/cc\-switch/releasescc 

cc swich官网https://ccswitch\.io/zh/

科普（制作中）：token apikey的本质、MCP是啥、skill

二、YOLO模式

claude code自由奔跑模式，不用点授权，但同时也有概率误删重要文件——ai通病。

- CC swinch安装（稳定推荐）

```Plain Text
{
 "permissions": {
   "defaultMode": "bypassPermissions"
 }
}
```

方法：[将上述代码块和cc swich中的代码发送，进行格式整合 \- DeepSeek](https://chat.deepseek.com/share/g3bjm19mb3j30y66bz)

- 提示词安装

```Plain Text
帮我在~/.claude/settings.json文件配置以下
{
 "permissions": {
   "defaultMode": "bypassPermissions"
 }
}
```

科普：关于模式本质——缰绳的松紧程度



# 5、对话常用基础命令——/和@

终端启动“Claude”

对话调用功能

@文件xxx

![Image](https://internal-api-drive-stream.feishu.cn/space/api/box/stream/download/authcode/?code=YzUyYmNhNzNmZTcyZjJlYzE0OGE4YzFlZjdlZWZhNTBfZGFjMDkxMzkzMjNiMzdiN2JmNWUyYzFmYTJlNTMyNDRfSUQ6NzY0NTMwMzM1Mzg4MjUxMjMzM18xNzgxNjk0MTAwOjE3ODE3ODA1MDBfVjM)



- 基础skill

必备skill：/superpower 一个说出想法，引领你想法成真的技能。

/init  调查工作区，生成Claude\.md文件，后续对话不用再

/clear 重置本次对话记忆



- /model

![Image](https://internal-api-drive-stream.feishu.cn/space/api/box/stream/download/authcode/?code=MTY0ODE5MGQwNWY4MTFjYzQ3NThjODFiNjNlZTBhYjVfNWY2M2U5ZWNmNjQ5YWU0MWExM2JkNGUwNDQzZDI2MWVfSUQ6NzY0NTI4NjU3ODA0NDA0NjU0Nl8xNzgxNjk0MTAwOjE3ODE3ODA1MDBfVjM)

- 切换历史聊天/resume

![Image](https://internal-api-drive-stream.feishu.cn/space/api/box/stream/download/authcode/?code=YTUyMTQyODc0NmFiNWEwZGNjNjA3YjEzZDQxMjIzZDVfN2NmMTg0MDY5MzFmMWU3OWNlNzNiNTgzM2Q0MDdiMWRfSUQ6NzY0NTI4ODIwMDc4ODkyMTU1N18xNzgxNjk0MTAwOjE3ODE3ODA1MDBfVjM)

---

好了，做到这。相信你，不仅敢信、也敢干了吧！！！哈哈哈，加入我们一起做学徒，为了做得更好！！一直更新的[iwalk\.pro](https://www.iwalk.pro/about)

![Image](https://internal-api-drive-stream.feishu.cn/space/api/box/stream/download/authcode/?code=ZTgwZWEwNWRhZDBlZDAwNjI4NjhkOTc4YWYxZDc4NjZfYjNmYzUxMzk0MGEyMTQ5NzlhMWVhNGJiMmJjM2YzMmVfSUQ6NzY0NjA0OTUxNjE5Nzc5Mjk1Nl8xNzgxNjk0MTAwOjE3ODE3ODA1MDBfVjM)



