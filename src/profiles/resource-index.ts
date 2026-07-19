import { CONTENT, IDEAS, LEARN, POSTS, PROJECTS, TOOLS } from '@/shared/routes';

export type NeedCategory =
  | 'coding'
  | 'learn-ai'
  | 'writing'
  | 'design'
  | 'image-video'
  | 'office'
  | 'cost'
  | 'idea'
  | 'automation'
  | 'community'
  | 'content-navigation';

export type AudienceGroup =
  | 'student'
  | 'office-worker'
  | 'creator'
  | 'developer'
  | 'freelancer-founder'
  | 'teacher'
  | 'parent'
  | 'minor'
  | 'other'
  | 'prefer-not-say';

export type AiStage =
  | 'beginner'
  | 'chat-user'
  | 'ide-user'
  | 'cli-user'
  | 'builder'
  | 'prefer-not-say';

export type FrictionLayer =
  | 'compliance-entry'
  | 'account-config'
  | 'tool-understanding'
  | 'scenario-match'
  | 'value-understanding'
  | 'practice-deepening'
  | 'unclear';

export type ToolFit =
  | 'code-agent'
  | 'chat-ai'
  | 'office'
  | 'design'
  | 'learning'
  | 'content'
  | 'automation';

export type AbilityType =
  | 'compliance-path'
  | 'chat-ai'
  | 'code-agent'
  | 'office'
  | 'design'
  | 'automation'
  | 'learning-path'
  | 'content-navigation'
  | 'clarify';

export interface MatchResource {
  id: string;
  title: string;
  href: string;
  kind: 'article' | 'tool-section' | 'guide' | 'community' | 'project' | 'content-hub';
  useFor: string;
  summary: string;
  keywords: string[];
  categories: NeedCategory[];
  audienceGroups?: AudienceGroup[];
  aiStages?: AiStage[];
  toolFit?: ToolFit[];
}

export const audienceGroupLabels: Record<AudienceGroup, string> = {
  student: '学生',
  'office-worker': '职场办公',
  creator: '内容创作者',
  developer: '开发者 / 技术从业者',
  'freelancer-founder': '自由职业 / 创业者',
  teacher: '老师 / 培训者',
  parent: '家长',
  minor: '青少年 / 未成年',
  other: '其他',
  'prefer-not-say': '不想说',
};

export const aiStageLabels: Record<AiStage, string> = {
  beginner: '刚开始',
  'chat-user': '会用聊天 AI',
  'ide-user': '会用 IDE',
  'cli-user': '会用命令行',
  builder: '能做完整项目',
  'prefer-not-say': '不想说',
};

export const needCategoryLabels: Record<NeedCategory, string> = {
  coding: 'AI 编程',
  'learn-ai': 'AI 入门学习',
  writing: '写作与内容',
  design: '产品与设计',
  'image-video': '图片与视频',
  office: '办公提效',
  cost: '低成本用 AI',
  idea: '点子落地',
  automation: '自动化工作流',
  community: '社群与同行者',
  'content-navigation': '站内内容导航',
};

export const frictionLayerLabels: Record<FrictionLayer, string> = {
  'compliance-entry': '合规入口层',
  'account-config': '账号与配置层',
  'tool-understanding': '工具认知层',
  'scenario-match': '场景匹配层',
  'value-understanding': '价值理解层',
  'practice-deepening': '实践深化层',
  unclear: '还不清楚',
};

export const abilityTypeLabels: Record<AbilityType, string> = {
  'compliance-path': '合规路径优先',
  'chat-ai': '聊天 AI 优先',
  'code-agent': '代码 Agent 优先',
  office: '办公工具优先',
  design: '设计工具优先',
  automation: '自动化流程优先',
  'learning-path': '学习路径优先',
  'content-navigation': '站内导航优先',
  clarify: '继续澄清',
};

export const matchResources: MatchResource[] = [
  {
    id: 'learn-ai-life',
    title: 'AI 赋能生活',
    href: LEARN,
    kind: 'guide',
    useFor: '判断自己处在哪个 AI 使用阶段，以及下一步该从哪里开始。',
    summary: '以用促学，先拿到结果，再按需求补能力。',
    keywords: ['学 ai', '入门', '新手', '不会', '从哪开始', 'ai学习', '怎么学'],
    categories: ['learn-ai', 'coding', 'office', 'idea'],
    audienceGroups: ['student', 'office-worker', 'creator', 'minor', 'prefer-not-say'],
    aiStages: ['beginner', 'chat-user', 'prefer-not-say'],
    toolFit: ['learning', 'chat-ai'],
  },
  {
    id: 'tools-ai-tools',
    title: '资源页：AI 工具',
    href: `${TOOLS}#ai-tools`,
    kind: 'tool-section',
    useFor: '快速查看我按场景实际在用的 AI 工具。',
    summary: '按通用编程、Agent 开发、写文章、做图、做视频、学习等场景列工具。',
    keywords: ['工具', '用什么', '推荐', 'codex', 'claude', 'gemini', 'ppt', '表格', '办公', '教案', '写文章', '做视频', '做图'],
    categories: ['coding', 'writing', 'image-video', 'office', 'learn-ai', 'content-navigation'],
    aiStages: ['beginner', 'chat-user', 'ide-user', 'cli-user'],
    toolFit: ['code-agent', 'chat-ai', 'office', 'content', 'design'],
  },
  {
    id: 'tools-low-cost-ai',
    title: '资源页：省钱用 AI',
    href: `${TOOLS}#info-source`,
    kind: 'tool-section',
    useFor: '解决 token、额度、中转和低价使用 AI 的问题。',
    summary: '记录我实际在用的低价 AI 资源群和工具渠道。',
    keywords: ['便宜', '低价', '省钱', 'token', '中转', '额度', 'api', 'key', '会员'],
    categories: ['cost', 'coding', 'learn-ai'],
    audienceGroups: ['student', 'creator', 'developer', 'freelancer-founder'],
    aiStages: ['chat-user', 'ide-user', 'cli-user', 'builder'],
    toolFit: ['chat-ai', 'learning'],
  },
  {
    id: 'tools-skills',
    title: '资源页：Skill',
    href: `${TOOLS}#skill`,
    kind: 'tool-section',
    useFor: '当你已经会用 Agent，想把经验变成可复用流程时看这里。',
    summary: '收集能让 AI Agent 更稳定执行的技能与方法。',
    keywords: ['skill', '技能', 'agent', '流程', '模板', '复用', '自动化'],
    categories: ['automation', 'coding', 'idea'],
    audienceGroups: ['developer', 'freelancer-founder', 'creator'],
    aiStages: ['cli-user', 'builder'],
    toolFit: ['code-agent', 'automation'],
  },
  {
    id: 'article-cli-panel',
    title: 'CLI 命令面板：卡牌式技能加载器',
    href: `${POSTS}/CLI命令面板`,
    kind: 'article',
    useFor: '理解“按场景把 Skill、MCP、工具装到槽位里”的产品想法。',
    summary: '把命令行能力做成可点选的卡牌式技能加载器。',
    keywords: ['cli', '命令面板', 'mcp', 'skill', '卡牌', '企业', '工具市场'],
    categories: ['automation', 'design', 'coding', 'idea'],
    audienceGroups: ['developer', 'freelancer-founder', 'office-worker'],
    aiStages: ['cli-user', 'builder'],
    toolFit: ['code-agent', 'automation'],
  },
  {
    id: 'article-design-bridge',
    title: '设计为人与内容搭桥',
    href: `${POSTS}/设计为人与内容搭桥`,
    kind: 'article',
    useFor: '当你想做页面、产品或内容入口，但不知道怎么降低认知成本时看。',
    summary: '设计的活是让人最快找到对症的那帖药。',
    keywords: ['设计', '产品', 'ui', 'ux', '页面', '入口', '认知成本', '用户体验'],
    categories: ['design', 'idea', 'content-navigation'],
    audienceGroups: ['creator', 'developer', 'freelancer-founder'],
    aiStages: ['chat-user', 'ide-user', 'cli-user', 'builder'],
    toolFit: ['design', 'content'],
  },
  {
    id: 'article-my-fear',
    title: '我的畏惧，也是动力',
    href: `${POSTS}/我的畏惧也是动力`,
    kind: 'article',
    useFor: '理解工具库、点子库、思考库怎样在真实需求里互相调用。',
    summary: '需求来了，从工具库、点子库和思考库里取材料。',
    keywords: ['工具库', '点子库', '思考库', '需求', '动力', '前进系统'],
    categories: ['idea', 'learn-ai', 'content-navigation'],
    audienceGroups: ['student', 'creator', 'freelancer-founder'],
    aiStages: ['beginner', 'chat-user', 'ide-user'],
    toolFit: ['learning', 'content'],
  },
  {
    id: 'article-idea-asset',
    title: '点子是不分时空的资产',
    href: `${POSTS}/点子超越时间`,
    kind: 'article',
    useFor: '当你有点子但不知道什么时候、怎么拿出来用时看。',
    summary: '过去存的点子、未来某刻的需求和 AI 执行能力碰在一起，就会生成价值。',
    keywords: ['点子', '灵感', '资产', '想法', '做出来', '项目'],
    categories: ['idea', 'learn-ai', 'community'],
    audienceGroups: ['student', 'creator', 'freelancer-founder'],
    aiStages: ['beginner', 'chat-user', 'ide-user'],
    toolFit: ['chat-ai', 'content'],
  },
  {
    id: 'community-idea-co-build',
    title: '点子共促',
    href: `${POSTS}/点子共促`,
    kind: 'community',
    useFor: '当你有点子但缺少同行者、反馈和学习氛围时看。',
    summary: '一个免费学习氛围群，核心目的是帮普通人把点子做出来。',
    keywords: ['社群', '群', '同行', '点子', '学习氛围', '合作', '反馈'],
    categories: ['community', 'idea', 'learn-ai'],
    audienceGroups: ['student', 'creator', 'freelancer-founder', 'prefer-not-say'],
    aiStages: ['beginner', 'chat-user', 'ide-user'],
    toolFit: ['learning', 'content'],
  },
  {
    id: 'article-ferry',
    title: 'Ferry 理论建构：从差距到行动的映射',
    href: `${POSTS}/渡论构建`,
    kind: 'article',
    useFor: '当你想理解“目标、现实、行动、偏差”这套底层方法时看。',
    summary: '世界是一个巨大的 f(x)=y，差距驱动行动。',
    keywords: ['ferry', '方法论', '目标', '行动', '偏差', '复盘', '哲学'],
    categories: ['idea', 'automation', 'learn-ai'],
    audienceGroups: ['developer', 'freelancer-founder', 'creator'],
    aiStages: ['cli-user', 'builder'],
    toolFit: ['automation', 'learning'],
  },
  {
    id: 'content-universe',
    title: '内容宇宙',
    href: CONTENT,
    kind: 'content-hub',
    useFor: '当你不知道具体该看哪篇时，先从这里按内容空间进入。',
    summary: '把文章、工具、项目、点子与生活记录放回同一个系统里。',
    keywords: ['内容', '文章', '资料', '找不到', '索引', '导航', '全部'],
    categories: ['content-navigation', 'learn-ai', 'idea'],
    aiStages: ['beginner', 'chat-user', 'prefer-not-say'],
    toolFit: ['content', 'learning'],
  },
  {
    id: 'ideas-index',
    title: '点子',
    href: IDEAS,
    kind: 'content-hub',
    useFor: '当你想看还没完全成型但值得保存的想法时进入。',
    summary: '点子火花和正在验证的想法。',
    keywords: ['点子', '想法', '创意', '灵感', '验证'],
    categories: ['idea', 'design'],
    audienceGroups: ['creator', 'freelancer-founder', 'student'],
    aiStages: ['beginner', 'chat-user', 'ide-user'],
    toolFit: ['content', 'chat-ai'],
  },
  {
    id: 'projects-index',
    title: '项目',
    href: PROJECTS,
    kind: 'project',
    useFor: '当你想看点子如何变成实际作品时进入。',
    summary: '已经做出来或正在推进的项目与作品。',
    keywords: ['项目', '作品', '落地', '案例', '网站', '应用'],
    categories: ['coding', 'idea', 'design'],
    audienceGroups: ['developer', 'creator', 'freelancer-founder'],
    aiStages: ['ide-user', 'cli-user', 'builder'],
    toolFit: ['code-agent', 'design'],
  },
];
