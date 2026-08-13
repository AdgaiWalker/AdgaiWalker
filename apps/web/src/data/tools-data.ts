/**
 * ToolsResourcesPage 的数据源
 * 新增/修改资源只改此文件；不做赛道/分类筛选。
 */

export interface Community {
  name: string;
  desc: string;
  badge: string;
  qrCode?: string;
  featured?: boolean;
  /** 博主名 — 有此字段表示通过关注博主加入 */
  blogger?: string;
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
    name: '点子共促',
    desc: '一起学 AI、聊点子、找合作。学以致用，把想法变成现实。',
    badge: '我的群',
    qrCode: '/images/qr/dianzi-gongcu.jpg',
    featured: true,
  },
  {
    name: 'AI 前沿信息一群',
    desc: '海外 AI 前沿资讯和学习资源，程序员为主，第一时间掌握行业动态。',
    badge: '前沿',
    blogger: '海哥',
  },
  {
    name: 'AI 设计氛围群',
    desc: 'AI 设计方向的学习氛围群，交流设计工具和工作流。',
    badge: '设计',
    blogger: '黄白',
  },
  {
    name: '西门聪明蛋的朋友们',
    desc: 'AI 编程、自媒体、AI 炒股，什么 AI 话题都聊。氛围自由，群友各有所长。',
    badge: '交流',
    blogger: '西门聪明蛋',
  },
  {
    name: '简老师 AI 变现群',
    desc: '每晚 23:00–凌晨直播，讲 AI 落地与变现。自由职业、独立做事的人多。抖音群，关注博主加入。',
    badge: '变现',
    blogger: '简老师讲AI',
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
  {
    name: 'Specship',
    desc: '国外域名注册，免备案，适合不想备案的场景。',
  },
  {
    name: '禾维 AI (hvoy.ai)',
    desc: 'API 中转站真假检测、价格对比，买中转前先测再选。',
    url: 'https://hvoy.ai/',
  },
  {
    name: '哪域名 (nazhumi)',
    desc: '域名比价，各后缀注册/续费/转入价格一目了然。',
    url: 'https://www.nazhumi.com/',
  },
];

export const bloggers: Blogger[] = [
  {
    name: '海哥（海拉鲁编程客）',
    platform: 'YouTube',
    desc: '科技博主、AI 工程师、猫咪奶爸。带我成长的人。维护 AI 前沿信息群。',
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
  {
    name: '黄白',
    platform: '小红书',
    desc: '大厂在职设计师，AIGC 创作者。分享有用的 AI 工具和工作流。',
    url: 'https://www.xiaohongshu.com/user/profile/5b85033f6e68470001debc86',
    avatar: '/images/黄白.webp',
    initial: '黄',
  },
  {
    name: '西门聪明蛋',
    platform: '抖音',
    desc: 'AI 编程 / vibe coding 实战派，维护 AI 产品学习社群。',
    url: 'https://www.douyin.com/user/MS4wLjABAAAACqJi0ISN_iKeH5JhOhbmqnf6WLx0Zt8MAa_h_DKUIVo',
    avatar: '/images/西门聪明蛋.jpeg',
    initial: '西',
  },
  {
    name: '简老师讲AI',
    platform: '抖音',
    desc: 'AI 落地方案与培训赋能。每晚 23:00–凌晨直播，讲 AI 机会和落地。有付费社群。',
    url: 'https://www.douyin.com/user/MS4wLjABAAAAtAsgejXkyl4XpbFXDsb0AirMkQLLeRegV3BSHHhgZ2NZSulv4-GFmMex15YcEuix',
    avatar: '/images/jian-teacher-ai.jpg',
    initial: '简',
  },
];

export const skills: SkillEntry[] = [
  {
    name: 'Agency-Craft',
    desc: 'Agent / 技能编排相关（自用与共创）。',
    url: 'https://github.com/AdgaiWalker/Agency-Craft',
  },
  {
    name: 'emilkowalski/skills',
    desc: 'Emil Kowalski 技能集（动效与设计工程等）。',
    url: 'https://github.com/emilkowalski/skills/tree/main',
  },
  {
    name: 'HAI Stack',
    desc: '从屎山代码到大师级应用。海哥出品。',
    url: 'https://github.com/hylarucoder/hai-stack/tree/main',
  },
];
