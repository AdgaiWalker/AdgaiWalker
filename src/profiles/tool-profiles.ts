/**
 * 工具画像数据 — 需求索引匹配器
 *
 * 每个工具的结构化画像，供 Agent 匹配时引用。
 * 字段设计原则：能回答"这个工具适合谁、不适合谁、为什么"。
 */

export interface ToolProfile {
  id: string;
  name: string;
  /** 一句话定位 */
  tagline: string;
  /** 大类 */
  category: 'agent' | 'editor' | 'chat' | 'generator' | 'workflow' | 'learning';
  /** 最适合的场景 — 匹配加分 */
  bestFor: string[];
  /** 不适合的场景 — 匹配扣分 */
  avoidWhen: string[];
  /** 核心优势（推荐理由） */
  strengths: string[];
  /** 局限性（劝退理由） */
  limitations: string[];
  /** 门槛：true 表示需要这个条件 */
  requires: {
    cli: boolean;       // 需要命令行
    localSetup: boolean; // 需要本地环境配置
    coding: boolean;    // 需要编程知识
    paid: boolean;      // 需要付费才能用核心功能
  };
  /** 替代工具 id 列表 */
  alternatives: string[];
  /** 推荐下一步动作 */
  nextSteps: string[];
}

export const toolProfiles: ToolProfile[] = [
  // ===== Agent 类 =====
  {
    id: 'claude-code',
    name: 'Claude Code',
    tagline: '命令行 AI 编程 Agent，能读项目、改代码、跑命令',
    category: 'agent',
    bestFor: [
      '改已有项目',
      '多文件重构',
      '持续开发和维护',
      '调试和修复 bug',
      '阅读理解整个代码库',
      '执行多步工程任务',
    ],
    avoidWhen: [
      '不会用命令行',
      '只想问一个简单问题',
      '做一次性网页原型',
      '完全不会代码',
      '只用手机',
    ],
    strengths: [
      '能理解整个项目上下文',
      '能直接修改多个文件',
      '能运行终端命令并验证结果',
      '支持多轮工程对话',
      '适合长期项目维护',
    ],
    limitations: [
      '需要命令行基础',
      '需要本地开发环境',
      '付费工具（需要 Anthropic API 或 Max 订阅）',
      'Windows 支持不如 Mac/Linux 成熟',
    ],
    requires: { cli: true, localSetup: true, coding: true, paid: true },
    alternatives: ['cursor', 'codex', 'windsurf'],
    nextSteps: [
      '打开终端，进入项目目录',
      '输入 claude 启动',
      '先让它「读一下项目结构，告诉我这个项目是怎么组织的」',
      '然后逐步提出修改需求',
    ],
  },
  {
    id: 'codex',
    name: 'Codex (OpenAI)',
    tagline: 'OpenAI 出品的云端代码生成 Agent',
    category: 'agent',
    bestFor: [
      '代码生成和补全',
      '单点任务：写函数、写脚本',
      '快速原型验证',
      '已经明确知道要写什么代码',
      '不想本地配置环境',
    ],
    avoidWhen: [
      '需要理解整个项目上下文',
      '多文件联动修改',
      '需要运行命令验证',
      '长期项目维护',
      '中文编程环境',
    ],
    strengths: [
      '云端运行，不需要本地环境',
      '代码生成速度快',
      '适合明确的编码任务',
    ],
    limitations: [
      '对项目上下文理解有限',
      '不适合复杂多文件修改',
      '不能直接运行和验证代码',
      '中文支持不如 Claude',
    ],
    requires: { cli: false, localSetup: false, coding: true, paid: true },
    alternatives: ['claude-code', 'cursor'],
    nextSteps: [
      '打开 chatgpt.com 或 codex 页面',
      '描述你要生成的代码功能',
      '复制生成的代码到你的项目',
      '本地测试验证',
    ],
  },
  {
    id: 'cursor',
    name: 'Cursor',
    tagline: 'AI 增强的代码编辑器，在 IDE 里边写边问',
    category: 'editor',
    bestFor: [
      '边写代码边问 AI',
      '代码补全和局部修改',
      '在编辑器里直接对话',
      '自己主导开发，AI 辅助',
      '从 VSCode 迁移的用户',
    ],
    avoidWhen: [
      '不需要写代码',
      '只想做网页原型',
      '预算有限（Pro 版较贵）',
      '不想装新编辑器',
    ],
    strengths: [
      'IDE 内集成，工作流顺畅',
      '代码补全体验好',
      '支持多种 AI 模型',
      'VSCode 生态兼容',
    ],
    limitations: [
      '免费额度有限',
      '不适合非开发者',
      '对项目级理解不如 Claude Code',
      '需要下载安装编辑器',
    ],
    requires: { cli: false, localSetup: true, coding: true, paid: false },
    alternatives: ['claude-code', 'windsurf', 'vscode-copilot'],
    nextSteps: [
      '下载安装 Cursor 编辑器',
      '打开你的项目文件夹',
      '用 Cmd+K 调出 AI 对话',
      '描述你想修改或添加的代码',
    ],
  },
  {
    id: 'windsurf',
    name: 'Windsurf (Codeium)',
    tagline: '免费 AI 代码编辑器，Cursor 的平替',
    category: 'editor',
    bestFor: [
      '想免费体验 AI 编程',
      '代码补全和辅助编写',
      '不想付费的初学者',
      '边写边问的工作流',
    ],
    avoidWhen: [
      '需要最强的 AI 能力',
      '复杂项目维护',
      '已经习惯 Cursor',
    ],
    strengths: [
      '免费使用',
      '上手门槛低',
      '支持多种语言',
    ],
    limitations: [
      'AI 能力不如 Claude/GPT 系列',
      '复杂任务表现一般',
      '生态不如 Cursor 成熟',
    ],
    requires: { cli: false, localSetup: true, coding: true, paid: false },
    alternatives: ['cursor', 'vscode-copilot'],
    nextSteps: [
      '下载安装 Windsurf',
      '打开项目文件夹',
      '使用 AI 助手功能开始编码',
    ],
  },
  {
    id: 'vscode-copilot',
    name: 'GitHub Copilot',
    tagline: 'VSCode 内的 AI 代码补全助手',
    category: 'editor',
    bestFor: [
      '已经在用 VSCode',
      '代码补全和自动建议',
      '写函数时自动补全',
      '日常开发辅助',
    ],
    avoidWhen: [
      '不用 VSCode',
      '需要对话式交互',
      '需要理解项目结构',
    ],
    strengths: [
      'VSCode 原生体验',
      '补全速度快',
      '支持多种语言',
    ],
    limitations: [
      '主要是补全，不是 Agent',
      '不能执行复杂任务',
      '需要 GitHub 订阅',
    ],
    requires: { cli: false, localSetup: true, coding: true, paid: true },
    alternatives: ['cursor', 'windsurf'],
    nextSteps: [
      '在 VSCode 中安装 Copilot 扩展',
      '登录 GitHub 账号',
      '开始写代码，它会自动建议补全',
    ],
  },

  // ===== 生成器类 =====
  {
    id: 'lovable',
    name: 'Lovable',
    tagline: '对话式网页应用生成器，从描述到成品',
    category: 'generator',
    bestFor: [
      '不会代码但想做应用',
      '快速出网页原型',
      '个人作品集 / 落地页',
      '小工具和简单 SaaS',
      '从零开始做项目',
    ],
    avoidWhen: [
      '需要修改已有代码库',
      '复杂后端逻辑',
      '需要完全控制代码',
      '项目已有成熟架构',
    ],
    strengths: [
      '不用写代码',
      '从描述直接生成',
      '可以在线预览和部署',
      '上手极快',
    ],
    limitations: [
      '生成的代码可控性有限',
      '复杂应用会碰到天花板',
      '免费额度有限',
      '不适合维护已有项目',
    ],
    requires: { cli: false, localSetup: false, coding: false, paid: false },
    alternatives: ['bolt', 'v0', 'framer'],
    nextSteps: [
      '打开 lovable.dev',
      '用自然语言描述你想做的应用',
      '查看生成的预览',
      '继续对话调整细节',
    ],
  },
  {
    id: 'bolt',
    name: 'Bolt.new',
    tagline: '浏览器里的全栈开发环境，AI 驱动',
    category: 'generator',
    bestFor: [
      '快速做网页应用',
      '不想配本地环境',
      '原型验证和 MVP',
      '学习前后端开发',
    ],
    avoidWhen: [
      '需要连接已有数据库',
      '复杂的企业级应用',
      '需要完全控制部署',
    ],
    strengths: [
      '浏览器内直接开发运行',
      '支持全栈（前端+后端）',
      '不用配环境',
      '可以即时预览',
    ],
    limitations: [
      '免费额度有限',
      '复杂项目会卡',
      '不能直接接已有项目',
    ],
    requires: { cli: false, localSetup: false, coding: false, paid: false },
    alternatives: ['lovable', 'v0'],
    nextSteps: [
      '打开 bolt.new',
      '描述你想做的应用',
      '在浏览器中预览和迭代',
    ],
  },
  {
    id: 'v0',
    name: 'v0 (Vercel)',
    tagline: 'Vercel 出品的 AI UI 生成器',
    category: 'generator',
    bestFor: [
      '生成 React/Next.js 组件',
      '快速做 UI 界面',
      '前端原型',
      'Vercel 生态用户',
    ],
    avoidWhen: [
      '需要后端逻辑',
      '不用 React/Next.js',
      '需要完整应用而不只是 UI',
    ],
    strengths: [
      '生成的 UI 质量高',
      '基于 shadcn/ui 组件',
      '可以直接部署到 Vercel',
    ],
    limitations: [
      '主要生成 UI，不是完整应用',
      '绑定 React 生态',
      '免费额度有限',
    ],
    requires: { cli: false, localSetup: false, coding: false, paid: false },
    alternatives: ['lovable', 'bolt', 'framer'],
    nextSteps: [
      '打开 v0.dev',
      '描述你想要的界面',
      '复制生成的代码到你的项目',
    ],
  },
  {
    id: 'framer',
    name: 'Framer',
    tagline: '设计驱动的无代码建站工具',
    category: 'generator',
    bestFor: [
      '做展示型网站',
      '设计师出身',
      '不想碰任何代码',
      '做落地页 / 作品集',
    ],
    avoidWhen: [
      '需要复杂交互逻辑',
      '需要后端功能',
      '需要自定义代码',
      '预算非常有限',
    ],
    strengths: [
      '设计体验极好',
      '可视化编辑',
      '响应式设计自动适配',
      '动画效果出色',
    ],
    limitations: [
      '免费版有限制',
      '复杂功能需要付费',
      '不适合动态应用',
    ],
    requires: { cli: false, localSetup: false, coding: false, paid: false },
    alternatives: ['lovable', 'webflow'],
    nextSteps: [
      '打开 framer.com',
      '选择模板或从空白开始',
      '用可视化编辑器设计页面',
    ],
  },

  // ===== 聊天类 =====
  {
    id: 'claude-chat',
    name: 'Claude 网页版',
    tagline: 'Anthropic 的 AI 助手，擅长分析和写作',
    category: 'chat',
    bestFor: [
      '问概念和学习',
      '写文章和文案',
      '分析和总结内容',
      '头脑风暴',
      '翻译和润色',
      '不需要直接操作文件',
    ],
    avoidWhen: [
      '需要直接修改代码文件',
      '需要运行程序',
      '需要理解整个项目',
    ],
    strengths: [
      '中文理解能力出色',
      '长文分析能力强',
      '推理和逻辑清晰',
      '免费版就能用',
    ],
    limitations: [
      '不能直接操作你的文件',
      '不能运行代码',
      '对话有长度限制',
    ],
    requires: { cli: false, localSetup: false, coding: false, paid: false },
    alternatives: ['chatgpt', 'gemini-chat', 'glm'],
    nextSteps: [
      '打开 claude.ai',
      '直接输入你的问题或需求',
      '可以上传文件让它分析',
    ],
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    tagline: 'OpenAI 的 AI 助手，全能型对话工具',
    category: 'chat',
    bestFor: [
      '通用问答',
      '写代码片段',
      '学习和解释概念',
      '日常各种问题',
      '图片生成（DALL·E / GPT Image）',
    ],
    avoidWhen: [
      '需要理解中文深层语境',
      '超长文档分析',
      '需要直接修改项目',
    ],
    strengths: [
      '功能最全面',
      '插件和 GPTs 生态丰富',
      '支持图片生成',
      '免费版功能已很强',
    ],
    limitations: [
      '中文写作不如 Claude 自然',
      '免费版有使用限制',
      '不能直接操作你的项目',
    ],
    requires: { cli: false, localSetup: false, coding: false, paid: false },
    alternatives: ['claude-chat', 'gemini-chat'],
    nextSteps: [
      '打开 chatgpt.com',
      '直接输入你的问题',
      '试试 GPT-4o 的图片生成功能',
    ],
  },
  {
    id: 'gemini-chat',
    name: 'Gemini',
    tagline: 'Google 的 AI 助手，免费额度大，长上下文',
    category: 'chat',
    bestFor: [
      '日常学习和问答',
      '长文档处理',
      '免费大量使用',
      'Google 生态用户',
      '多模态（图片+文字）',
    ],
    avoidWhen: [
      '需要深度中文写作',
      '需要精确的代码生成',
      '对推理准确度要求高',
    ],
    strengths: [
      '免费额度非常大',
      '支持超长上下文',
      '多模态能力强',
      'Google 搜索整合',
    ],
    limitations: [
      '中文写作质量一般',
      '代码能力不如 Claude/GPT',
      '有时候会"幻觉"',
    ],
    requires: { cli: false, localSetup: false, coding: false, paid: false },
    alternatives: ['claude-chat', 'chatgpt'],
    nextSteps: [
      '打开 gemini.google.com',
      '直接开始对话',
      '可以上传图片和文件让它处理',
    ],
  },
  {
    id: 'glm',
    name: 'GLM (智谱清言)',
    tagline: '国产 AI 助手，中文场景优化，免费好用',
    category: 'chat',
    bestFor: [
      '中文写作和对话',
      '国内网络直接用',
      '免费日常使用',
      '中文内容生成',
    ],
    avoidWhen: [
      '复杂代码任务',
      '英文场景',
      '需要最强推理能力',
    ],
    strengths: [
      '中文能力强',
      '国内直接访问',
      '完全免费',
      '支持多模态',
    ],
    limitations: [
      '推理能力不如 Claude/GPT',
      '代码能力有限',
      '生态不如海外产品丰富',
    ],
    requires: { cli: false, localSetup: false, coding: false, paid: false },
    alternatives: ['claude-chat', 'chatgpt', 'doubao'],
    nextSteps: [
      '打开 chatglm.cn',
      '直接开始对话',
    ],
  },
  {
    id: 'doubao',
    name: '豆包',
    tagline: '字节跳动出品的 AI 助手，国内使用体验好',
    category: 'chat',
    bestFor: [
      '日常中文对话',
      '国内网络环境',
      '免费使用',
      '图片生成',
      '语音对话',
    ],
    avoidWhen: [
      '专业代码任务',
      '需要精确推理',
      '英文场景',
    ],
    strengths: [
      '国内访问快',
      '免费功能丰富',
      '图片生成质量不错',
      '语音交互体验好',
    ],
    limitations: [
      '代码能力一般',
      '推理深度有限',
      '专业场景不够强',
    ],
    requires: { cli: false, localSetup: false, coding: false, paid: false },
    alternatives: ['glm', 'claude-chat'],
    nextSteps: [
      '打开 doubao.com',
      '直接开始对话或生成图片',
    ],
  },

  // ===== 图片/设计类 =====
  {
    id: 'midjourney',
    name: 'Midjourney',
    tagline: '顶级 AI 图片生成工具，艺术风格最强',
    category: 'generator',
    bestFor: [
      '生成高质量图片',
      '艺术风格插画',
      '设计参考和灵感',
      '品牌视觉素材',
    ],
    avoidWhen: [
      '需要精确控制内容',
      '不想用 Discord',
      '预算有限',
      '需要中文界面',
    ],
    strengths: [
      '图片质量业界顶尖',
      '艺术风格独特',
      '社区灵感丰富',
    ],
    limitations: [
      '需要付费',
      '通过 Discord 操作',
      '不支持中文提示词',
      '不能精确控制细节',
    ],
    requires: { cli: false, localSetup: false, coding: false, paid: true },
    alternatives: ['gpt-image', 'jimeng'],
    nextSteps: [
      '加入 Midjourney Discord 服务器',
      '在频道中输入 /imagine 加英文描述',
      '选择满意的图片进行放大或变体',
    ],
  },
  {
    id: 'gpt-image',
    name: 'GPT Image (image2)',
    tagline: 'ChatGPT 内的图片生成，理解力强',
    category: 'generator',
    bestFor: [
      '根据描述生成图片',
      '中文描述生成图片',
      '设计稿和 UI 素材',
      '产品图和营销图',
    ],
    avoidWhen: [
      '需要极致艺术风格',
      '需要批量生成',
      '纯图片工作流',
    ],
    strengths: [
      '中文理解好',
      '文字渲染能力强',
      '可以多轮对话调整',
      '和 ChatGPT 无缝整合',
    ],
    limitations: [
      '需要 ChatGPT Plus',
      '生成速度较慢',
      '艺术感不如 Midjourney',
    ],
    requires: { cli: false, localSetup: false, coding: false, paid: true },
    alternatives: ['midjourney', 'jimeng'],
    nextSteps: [
      '打开 ChatGPT',
      '直接用中文描述你想生成的图片',
      '反复对话调整细节',
    ],
  },
  {
    id: 'jimeng',
    name: '即梦 (字节)',
    tagline: '国产 AI 图片/视频生成，中文友好',
    category: 'generator',
    bestFor: [
      '中文描述生成图片',
      '国内直接使用',
      '图片和视频生成',
      '免费体验 AI 绘图',
    ],
    avoidWhen: [
      '需要顶级画质',
      '专业设计工作',
      '英文提示词场景',
    ],
    strengths: [
      '中文提示词效果好',
      '国内访问快',
      '免费额度充足',
      '图片+视频都能做',
    ],
    limitations: [
      '画质不如 Midjourney',
      '细节控制有限',
      '专业场景不够',
    ],
    requires: { cli: false, localSetup: false, coding: false, paid: false },
    alternatives: ['gpt-image', 'midjourney'],
    nextSteps: [
      '打开 jimeng.jianying.com',
      '用中文描述你想生成的图片',
      '选择风格后生成',
    ],
  },

  // ===== 自动化/工作流 =====
  {
    id: 'n8n',
    name: 'n8n',
    tagline: '开源工作流自动化工具，可视化编排',
    category: 'workflow',
    bestFor: [
      '自动化重复工作',
      '连接多个工具和服务',
      '数据处理和流转',
      '定时任务',
    ],
    avoidWhen: [
      '一次性简单任务',
      '不想搭建服务',
      '只是问 AI 问题',
    ],
    strengths: [
      '开源免费',
      '可视化拖拽编排',
      '支持 400+ 集成',
      '可以自部署',
    ],
    limitations: [
      '需要一定的技术基础',
      '自部署需要服务器',
      '学习曲线不短',
    ],
    requires: { cli: false, localSetup: true, coding: false, paid: false },
    alternatives: ['make', 'zapier'],
    nextSteps: [
      '访问 n8n.io 了解更多',
      '选择云版或自部署',
      '从简单工作流开始搭建',
    ],
  },

  // ===== 学习类 =====
  {
    id: 'learn-walker',
    name: 'Walker 学习指南',
    tagline: '站内 AI 工具学习指南，按阶段进阶',
    category: 'learning',
    bestFor: [
      '想系统学习 AI 工具',
      '不知道从哪开始',
      '需要学习路径规划',
      '想跟做项目学',
    ],
    avoidWhen: [
      '已经有明确任务要做',
      '只需要工具推荐',
    ],
    strengths: [
      '按能力分级（入门/学徒/专家）',
      '有实战项目',
      '中文原生',
      '免费',
    ],
    limitations: [
      '内容在持续更新',
      '覆盖范围有限',
    ],
    requires: { cli: false, localSetup: false, coding: false, paid: false },
    alternatives: ['claude-chat', 'glm'],
    nextSteps: [
      '访问 iwalk.pro/learn',
      '从「入门」阶段开始',
      '按顺序跟做指南里的项目',
    ],
  },
];

/** 按 id 查找工具 */
export function getToolById(id: string): ToolProfile | undefined {
  return toolProfiles.find(t => t.id === id);
}

/** 获取所有工具 id 和名称（供 system prompt 引用） */
export function getToolIndex(): string {
  return toolProfiles
    .map(t => `- ${t.id} (${t.name}): ${t.tagline}`)
    .join('\n');
}
