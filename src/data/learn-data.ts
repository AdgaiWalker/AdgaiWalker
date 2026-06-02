// ---------------------------------------------------------------------------
// /learn section — data layer (Restructured)
// ---------------------------------------------------------------------------

/** A teaching section inside a tool guide. */
export interface ToolSection {
  title: string;
  content: string; // Markdown
}

/** One of the two learning levels/categories. */
export interface LearnLevel {
  id: '入门' | '学徒';
  title: string;
  subtitle: string;
  emoji: string;
  description: string;
  color: string;
}

/** A classic AI tool representing a guide under a level. */
export interface LearnTool {
  id: string;                 // unique slug (e.g. 'claude-code')
  levelId: '入门' | '学徒';    // parent level
  domainId: string;           // coding | design | video | office | etc
  domainLabel: string;        // e.g. '编程'
  title: string;              // tool title
  subtitle: string;           // tool subtitle
  emoji: string;              // emoji for display
  status: 'active' | 'coming-soon';
  description: string;        // card one-line description
  yValue: string;             // y-range value
  sections: ToolSection[];    // actual guide content sections
  graduation: string;         // graduation project
  safetyNote: string;         // safety reminder
  shareAction: string;        // sharing recommendation
}

// ---------------------------------------------------------------------------
// Levels (Categories)
// ---------------------------------------------------------------------------

export const learnLevels: LearnLevel[] = [
  {
    id: '入门',
    title: '入门',
    subtitle: 'Beginner',
    emoji: '🌱',
    description: '拿到"我居然做到了"的体验，用最经典的 AI 工具快速解决身边的小问题，建立前行的信心。',
    color: '#4ade80',
  },
  {
    id: '学徒',
    title: '学徒',
    subtitle: 'Apprentice',
    emoji: '🔧',
    description: '摆脱单一工具，学会追问与调整，探索工具间的配合，让重复工作稳定省时省力。',
    color: '#60a5fa',
  },
];

// ---------------------------------------------------------------------------
// Classic Tools under Levels
// ---------------------------------------------------------------------------

export const learnTools: LearnTool[] = [
  // ── 入门阶段工具 ────────────────────────────────────────────────────────
  {
    id: 'claude-code',
    levelId: '入门',
    domainId: 'coding',
    domainLabel: '编程',
    title: 'Claude Code / CodeBuddy',
    subtitle: '命令行与代码助手经典入门',
    emoji: '💻',
    status: 'active',
    description: '最经典的 AI 命令行对话与编码工具。使用自然语言，让 AI 直接读取代码、自动搭建环境和修改项目。',
    yValue: 'y ≈ 0.5-1',
    sections: [
      {
        title: '做一件以前不敢想的事',
        content:
          '先从一个身边触手可及的小事情开始。可以是一个个人博客、一个梦想中的马里奥、一个粒子交互的花朵，一件别人能做到原来你做不到的事情。\n\n如果没想到，可以到 blog 主页 [iwalk.pro](https://www.iwalk.pro/) 抽一个点子！',
      },
      {
        title: '选工具',
        content:
          '按需求选工具，不限死某一个。\n\n- 如果你只是想做 PPT、Excel、做做普通教学 → CodeBuddy 就够了\n- 如果你想接触命令行对话、驾驭 agent → Claude Code / Codex / Gemini CLI\n- 科研人员推荐 Codex\n\n科普：agent = harness（马具）+ model（马）。掌握的是工具，而不是模型本身。用马具更好地控制 AI。',
      },
      {
        title: '安装 CodeBuddy',
        content:
          '安装地址：[腾讯云代码助手 CodeBuddy](https://www.codebuddy.cn)\n\n不需要 apikey，有免费使用额度。安装时，哪有选项点哪里，全部勾选。\n\n就这两步。先拿到"我居然跟 AI 对话了"的体验。',
      },
      {
        title: '安装基础开发环境',
        content:
          '打开 CodeBuddy 的工作界面，直接把下面这段话发给 AI，它会帮你自动安装一切：\n\n"帮我安装 git、最新版本 node.js LTS、npm。默认用户为国内环境，尽量用国内方式安装。如果没有 winget，帮我安装。npm 装完后配置国内镜像 registry.npmmirror.com。最后验证版本。"\n\n手动安装 Chrome 浏览器：https://www.google.cn/chrome',
      },
      {
        title: '第一次对话',
        content:
          '让 AI 做一件跟你相关的、有惊喜感的事——比如"用我的名字写一首藏头诗"或"帮我编一个以我为角色的短故事"。\n\n先感到惊奇，实用从学徒阶段开始。',
      },
      {
        title: '各模型擅长',
        content:
          '了解完后，根据需要，选择获取合适模型的 apikey。\n\n科普：apikey 在模型生态中是一道钥匙——有了它，你的工具才能调用对应的模型。',
      },
      {
        title: 'CC 管理',
        content:
          '按需而配，新手只配 apikey 即可。\n\n推荐下载 CC Switch 管理工具——管理 token、apikey、MCP、skill 等外接工具。\n\n官网：[ccswitch.io](https://ccswitch.io/zh/)\n\nYOLO 模式：Claude Code 自由奔跑模式，不用点授权，但同时也有概率误删重要文件——AI 通病。新手建议先不开。',
      },
      {
        title: '对话常用基础命令',
        content:
          '终端启动 Claude Code 后，常用命令：\n\n- @文件xxx — 引用某个文件让 AI 阅读\n- /init — 调查工作区，生成 Claude.md 文件\n- /clear — 重置本次对话记忆\n- /model — 切换模型\n- /resume — 切换历史聊天',
      },
      {
        title: '常见问题与办法',
        content:
          '1. 看不懂英文 → 浏览器下载沉浸式翻译插件，或飞书快捷键 Ctrl+Shift+S 翻译\n2. CC 用不了 → 检查 apikey 配置和网络\n3. 后缀 .md 文档打不开 → 应用商店下载 Typora 或 TypeDown\n4. 看不到做的界面 → 默认主浏览器设为 Chrome，提示词"帮我启动项目"，如果没有画面打开开发者模式修 bug',
      },
      {
        title: '认知前提',
        content:
          'AI 不是在思考，它是在预测。它的回答可能对也可能不对，你需要自己判断。',
      },
    ],
    graduation: '用 AI 完成一件你以前做不到的事（如搭建并运行一个个人网页或小工具）',
    safetyNote: 'IDE 天然兜底，不会轻易执行破坏性系统操作，起步非常安全。',
    shareAction: '把你第一次用 AI 做出来的东西截图或打包分享给一个朋友看',
  },
  {
    id: 'figma-ai',
    levelId: '入门',
    domainId: 'design',
    domainLabel: '设计',
    title: 'Figma AI / 视觉界面',
    subtitle: '像素级创意的智能辅助',
    emoji: '🎨',
    status: 'coming-soon',
    description: '使用自然语言或提示语生成高保真交互界面、海报和设计素材，让非设计师也能迅速实现创意像素级还原。',
    yValue: 'y ≈ 0.5-1',
    sections: [],
    graduation: '用 Figma AI 生成一个属于你自己的极简博客界面框架',
    safetyNote: '设计草稿会自动保存在云端，随时可以按 Ctrl+Z 撤销和恢复',
    shareAction: '将设计导出的高保真原型图片，展示在微信群中听取反馈',
  },
  {
    id: 'midjourney',
    levelId: '入门',
    domainId: 'video',
    domainLabel: '视觉',
    title: 'Midjourney / 画面生成',
    subtitle: '将你的想象瞬间视觉化',
    emoji: '🎬',
    status: 'coming-soon',
    description: '最经典的 AI 画面生成工具。输入意境描述，即可一键生成电影级质感的高清画作与配图。',
    yValue: 'y ≈ 0.5-1',
    sections: [],
    graduation: '用自然语言描述一个“赛博朋克风的未来中国水乡”，生成一张电影海报级配图',
    safetyNote: '图像生成无破坏性，多尝试不同提示词，每次都是全新的开始',
    shareAction: '将你最满意的一张画面设为手机壁纸，或直接发朋友圈分享',
  },
  {
    id: 'wps-ai',
    levelId: '入门',
    domainId: 'office',
    domainLabel: '办公',
    title: 'WPS AI / 智能办公',
    subtitle: '文档与表格的效率革命',
    emoji: '📝',
    status: 'coming-soon',
    description: '集成在办公套件中的助手。智能总结长文档、一键由提纲生成 PPT、用口语公式处理复杂账单表格。',
    yValue: 'y ≈ 0.5-1',
    sections: [],
    graduation: '用 WPS AI 将一份 3000 字的主题大纲一键自动扩展并排版为 10 页的汇报 PPT',
    safetyNote: '修改前建议另存为新版本文件，保障原始文档完整性',
    shareAction: '给同事或老板演示一次一键生成 PPT 的过程，震惊他们',
  },

  // ── 学徒阶段工具 ────────────────────────────────────────────────────────
  {
    id: 'cursor',
    levelId: '学徒',
    domainId: 'coding',
    domainLabel: '编程',
    title: 'Cursor / 进阶 IDE',
    subtitle: 'AI 原生集成开发环境',
    emoji: '💻',
    status: 'coming-soon',
    description: '进阶 AI 原生编辑器，支持整个项目级的代码分析、多文件联动编辑、一键生成整个模块。',
    yValue: 'y ≈ 1-3',
    sections: [],
    graduation: '用 Cursor 制作并跑通一个包含前端与后端简单接口交互的小计算器应用',
    safetyNote: '学会 git 提交！每一次让 AI 修改前务必先 commit 存底，防止修改失控无法恢复',
    shareAction: '用本地开发服务器启动你的小工具，并邀请他人在线访问测试',
  },
  {
    id: 'stable-diffusion',
    levelId: '学徒',
    domainId: 'design',
    domainLabel: '设计',
    title: 'Stable Diffusion / 图像控制',
    subtitle: '高自由度的创意精准控制',
    emoji: '🎨',
    status: 'coming-soon',
    description: '利用 ControlNet 等插件实现极高自由度的姿态控制、线稿上色与精准深度图渲染。',
    yValue: 'y ≈ 1-3',
    sections: [],
    graduation: '根据一张手绘简易线稿，使用 ControlNet 渲染出一张写实风格的科幻飞船效果图',
    safetyNote: '注意显存温度与生成参数设置，控制单次渲染数量以防卡死',
    shareAction: '将手绘线稿与最终渲染的 3D 实景图做一张 Before/After 对比图发出来',
  },
  {
    id: 'capcut-ai',
    levelId: '学徒',
    domainId: 'video',
    domainLabel: '视频',
    title: '剪映 AI / 智能剪辑',
    subtitle: '流媒体与视频剪辑进阶',
    emoji: '🎬',
    status: 'coming-soon',
    description: '智能识别字幕、自动配音、基于文字脚本智能匹配素材剪辑，大幅缩短短视频创作流。',
    yValue: 'y ≈ 1-3',
    sections: [],
    graduation: '准备一段 500 字的短文案，用剪映 AI 自动生成包含智能配音、自动字幕和匹配画面的 1 分钟短视频',
    safetyNote: 'AI 匹配的画面素材库可能包含版权风险，商用视频前需人工确认或替换版权图',
    shareAction: '将自动生成的视频上传发布，观察首个 AI 视频的播放反馈',
  },
];

// ---------------------------------------------------------------------------
// Safety table (simplified for 2 levels)
// ---------------------------------------------------------------------------

export const safetyTable = [
  { stage: '入门', risk: '尚未接触系统性代码修改，没有风险', consequence: '安全无感，基本零风险' },
  { stage: '学徒', risk: 'AI 批量修改覆盖多文件 / 逻辑死循环', consequence: '误删或覆盖代码，需靠 Git 恢复' },
];
