/**
 * tools/index.astro 的数据源
 * 新增/修改资源只改此文件，不改页面组件
 */

export interface Community {
  name: string;
  desc: string;
  badge: string;
  qrCode?: string;
  featured?: boolean;
}

export interface AIResource {
  name: string;
  desc: string;
  badge: string;
  qrCode?: string;
}

export interface AIToolEntry {
  category: string;
  tools: string;
}

export interface InfraEntry {
  name: string;
  desc: string;
  url?: string;
}

export interface Blogger {
  name: string;
  platform: string;
  desc: string;
  url: string;
  avatar?: string;
  initial: string;
}

export interface SkillEntry {
  name: string;
  desc: string;
  url: string;
}

export const communities: Community[] = [
  {
    name: '点子工作组',
    desc: '我自己建的核心群。把点子做出来的人在这里碰撞，分享实战进度。',
    badge: '我的群',
    qrCode: '/images/qr/dianzi-gongcu.jpg',
    featured: true,
  },
  {
    name: 'AI 设计氛围群',
    desc: 'AI 设计方向的学习氛围群，交流设计工具和工作流。',
    badge: '设计',
  },
  {
    name: 'AI 产品经理氛围群',
    desc: 'AI 产品方向的学习氛围群，讨论产品思路和行业趋势。',
    badge: '产品',
  },
  {
    name: 'AI 前沿信息一群',
    desc: 'AI 前沿资讯和学习资源分享，第一时间了解行业动态。',
    badge: '前沿',
  },
];

export const aiResources: AIResource[] = [
  {
    name: 'Antigravity 官方群 (1025957317)',
    desc: '切号插件官方群，解决多账号切换。',
    badge: '切号工具',
    qrCode: '/images/qr/1025957317.png',
  },
  {
    name: '廉价 AI 探索群 (644241363)',
    desc: '极致挖掘最高性价比 AI 方案，群友探索到好渠道就分享。',
    badge: '极客探索',
    qrCode: '/images/qr/644241363.png',
  },
  {
    name: 'Codex 中转群 (874615899)',
    desc: 'API 中转服务，我目前稳定在用的一家。',
    badge: 'API中转',
    qrCode: '/images/qr/874615899.png',
  },
  {
    name: 'Cockpit 插件交流群 (921917596)',
    desc: '用 Cockpit 买 Gemini token，低价 Gemini 额度。',
    badge: 'Gemini Token',
    qrCode: '/images/qr/921917596.png',
  },
];

export const aiTools: AIToolEntry[] = [
  { category: '通用编程', tools: 'GLM + GPT + Gemini' },
  { category: 'Agent 开发', tools: 'Claude CLI、Codex、CodeBuddy' },
  { category: '写文章', tools: 'Claude、GLM' },
  { category: '图片参考', tools: 'Midjourney' },
  { category: '设计 / 图片生成', tools: 'image2（gpt-image-2）' },
  { category: '做视频', tools: 'OiiOii → Seedence' },
  { category: '日常学习', tools: 'Gemini' },
];

export const infra: InfraEntry[] = [
  { name: '雨云', desc: '国内服务器，性价比高。' },
  { name: '腾讯云', desc: '国内服务器，配合 CodeBuddy 自动部署。' },
  { name: '阿里云', desc: '国内服务器。' },
  { name: 'Specship', desc: '国外域名注册，免备案，适合不想备案的场景。' },
  { name: '禾维 AI (hvoy.ai)', desc: 'API 中转站真假检测、价格对比，买中转前先测再选。', url: 'https://hvoy.ai/' },
  { name: '哪域名 (nazhumi)', desc: '域名比价，各后缀注册/续费/转入价格一目了然。', url: 'https://www.nazhumi.com/' },
];

export const bloggers: Blogger[] = [
  {
    name: '海哥（海拉鲁编程客）',
    platform: 'YouTube',
    desc: '科技博主、AI 工程师、猫咪奶爸。带我成长的人。',
    url: 'https://www.youtube.com/@hylarucoder',
    avatar: '/images/海拉鲁编程客.png',
    initial: '海',
  },
  {
    name: '秋芝2046',
    platform: 'B站',
    desc: 'AI 科普博主，产品经理出身。引我入门的人。',
    url: 'https://space.bilibili.com/385670211',
    avatar: '/images/秋芝.jpg',
    initial: '秋',
  },
];

export const skills: SkillEntry[] = [
  {
    name: 'Superpowers',
    desc: 'AI 编程代理的技能框架。像产品经理一样，通过对话一步步引导出需求和设计，然后自动拆分任务、驱动子代理开发。让 AI 从"直接写代码"变成"先想清楚再做"。',
    url: 'https://github.com/obra/superpowers',
  },
  {
    name: 'HAI Stack',
    desc: '从屎山代码到大师级应用。海哥出品，非专业 vibe 人都应该下载。',
    url: 'https://github.com/hylarucoder/hai-stack',
  },
];
