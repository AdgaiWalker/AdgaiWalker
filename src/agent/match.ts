import {
  aiStageLabels,
  audienceGroupLabels,
  matchResources,
  needCategoryLabels,
  type AiStage,
  type AudienceGroup,
  type FitVerdict,
  type MatchResource,
  type NeedCategory,
  type ToolFit,
} from '@/profiles/resource-index';

export interface MatchContext {
  need: string;
  audienceGroup?: AudienceGroup;
  aiStage?: AiStage;
}

export interface MatchResult {
  categories: NeedCategory[];
  resources: MatchResource[];
  bridge: string;
  fitVerdict: FitVerdict;
  toolDirection: string;
  reason: string;
  codexMisuseLikely: boolean;
  toolFits: ToolFit[];
}

const categoryKeywords: Record<NeedCategory, string[]> = {
  coding: ['代码', '编程', '开发', '项目', '网站', '网页', '应用', 'bug', '报错', '仓库', '重构', '脚本', 'codex', 'claude code', 'cursor', 'ide'],
  'learn-ai': ['学 ai', '学习ai', '入门', '新手', '不会', '怎么开始', '从哪开始', '教程', '学习'],
  writing: ['写文章', '文案', '内容', '公众号', '小红书', '脚本', '标题', '润色', '总结', '翻译', '解释'],
  design: ['设计', '产品', 'ui', 'ux', '页面', '交互', '体验', '原型', '海报', '封面'],
  'image-video': ['图片', '画图', '视频', '剪辑', '生成图', '做图'],
  office: ['ppt', '表格', 'excel', 'word', '办公', '汇报', '文档', '报名表', '流程整理'],
  cost: ['便宜', '省钱', '低价', 'token', '中转', '额度', 'api key', '会员'],
  idea: ['点子', '想法', '创意', '落地', '做出来', '不知道怎么做'],
  automation: ['自动化', '工作流', '批处理', '定时', '流程', 'mcp', 'skill'],
  community: ['社群', '群', '同行', '合作', '反馈', '交流'],
  'content-navigation': ['资料', '文章', '内容', '看不懂', '哪里看', '索引', '推荐资料'],
};

const fitKeywords: Record<ToolFit, string[]> = {
  codex: ['改代码', '已有项目', '项目代码', '仓库', '报错', 'bug', '重构', '脚本执行', '命令行', '部署', '接口', '代码库', '拉取', '提交', 'commit'],
  'chat-ai': ['写文章', '公众号', '文案', '总结', '翻译', '解释', '润色', '聊天', '提纲', '标题', '选题', '思路'],
  office: ['ppt', '表格', 'excel', 'word', '报名表', '汇报', '文档', '办公', '流程整理'],
  design: ['设计', 'ui', 'ux', '页面', '海报', '封面', '原型', '配色'],
  learning: ['学 ai', '学习', '入门', '教程', '不会', '从哪开始', '怎么开始'],
  content: ['公众号', '小红书', '内容', '文章', '选题', '资料', '案例'],
  automation: ['自动化', '工作流', '批处理', '定时', 'mcp', 'skill', '流程'],
};

const notEnoughInfoKeywords = ['怎么用', '用什么', '帮我', '不知道', '推荐'];
const defaultCategoryOrder: NeedCategory[] = ['learn-ai', 'coding', 'cost', 'idea', 'content-navigation'];

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function countMatches(text: string, keywords: string[]): number {
  return keywords.reduce((sum, keyword) => sum + (text.includes(keyword.toLowerCase()) ? 1 : 0), 0);
}

function inferCategories(need: string): NeedCategory[] {
  const normalized = normalizeText(need);
  const scored = Object.entries(categoryKeywords)
    .map(([category, keywords]) => ({
      category: category as NeedCategory,
      score: countMatches(normalized, keywords),
    }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(item => item.category);

  return scored.length > 0 ? scored.slice(0, 3) : defaultCategoryOrder.slice(0, 2);
}

function inferToolFits(need: string): ToolFit[] {
  const normalized = normalizeText(need);
  const scored = Object.entries(fitKeywords)
    .map(([fit, keywords]) => ({
      fit: fit as ToolFit,
      score: countMatches(normalized, keywords),
    }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(item => item.fit);

  return scored.length > 0 ? scored.slice(0, 3) : ['learning', 'chat-ai'];
}

function isNotEnoughInfo(need: string): boolean {
  const normalized = normalizeText(need);
  if (normalized.includes('学 ai') || normalized.includes('学习ai') || normalized.includes('网站')) return false;
  const concreteSignals = Object.values(fitKeywords).flat().filter(keyword => normalized.includes(keyword.toLowerCase())).length;
  return normalized.length < 8 || (normalized.length < 16 && concreteSignals === 0 && countMatches(normalized, notEnoughInfoKeywords) > 0);
}

function inferFitVerdict(need: string, toolFits: ToolFit[]): FitVerdict {
  const normalized = normalizeText(need);
  if (isNotEnoughInfo(need)) return 'not-enough-info';

  if (toolFits[0] === 'codex') {
    if (normalized.includes('网站') && !normalized.includes('已有') && !normalized.includes('代码') && !normalized.includes('仓库')) {
      return 'codex-maybe';
    }
    return 'codex-fit';
  }

  if (normalized.includes('网站') || normalized.includes('应用') || normalized.includes('项目')) {
    return 'codex-maybe';
  }

  return 'codex-not-needed';
}

function createDirection(verdict: FitVerdict, toolFits: ToolFit[]): string {
  if (verdict === 'codex-fit') return '适合代码 Agent：用 Claude Code / Cursor 等工具进入项目上下文处理代码。';
  if (verdict === 'codex-maybe') return '需要更多信息：先确认是否有现成代码，再决定走代码 Agent 还是建站路线。';
  if (verdict === 'not-enough-info') return '先补充场景、目标和卡点，再判断工具方向。';

  const firstFit = toolFits[0];
  if (firstFit === 'chat-ai') return '适合聊天 AI：先把内容、思路或解释理顺。';
  if (firstFit === 'office') return '适合办公或自动化工具：先把表格、文档、流程跑通。';
  if (firstFit === 'design') return '适合设计或图像工具：先处理页面、原型或视觉。';
  if (firstFit === 'learning') return '适合学习路线：先知道从哪开始，再选具体工具。';
  if (firstFit === 'automation') return '适合自动化工作流：先拆流程，再决定是否需要代码 Agent。';
  return '适合站内资料路线：先把需求拆清楚，再找对应的工具。';
}

function createReason(verdict: FitVerdict, toolFits: ToolFit[]): string {
  if (verdict === 'codex-fit') return '因为描述的是代码、项目或执行层问题，需要工具进入代码上下文。';
  if (verdict === 'codex-maybe') return '因为可能涉及项目搭建，但不确定是否已有代码。';
  if (verdict === 'not-enough-info') return '描述还缺少场景、交付物或卡点，直接选工具容易选偏。';

  const firstFit = toolFits[0];
  if (firstFit === 'chat-ai') return '因为目标更像写作、总结、解释或思路整理，不需要动代码。';
  if (firstFit === 'office') return '因为目标更像表格、文档或流程交付，代码 Agent 不是第一选择。';
  if (firstFit === 'design') return '因为目标更像视觉或产品表达，先用设计工具更直接。';
  if (firstFit === 'learning') return '因为现在更需要学习路径，而不是直接进入工具使用。';
  return '因为这个需求先要拆目标和流程，再决定用什么工具。';
}

function scoreResource(resource: MatchResource, context: MatchContext, categories: NeedCategory[], toolFits: ToolFit[]): number {
  const normalized = normalizeText(context.need);
  let score = 0;

  for (const category of categories) {
    if (resource.categories.includes(category)) score += 8;
  }

  for (const fit of toolFits) {
    if (resource.toolFit?.includes(fit)) score += 6;
  }

  for (const keyword of resource.keywords) {
    if (normalized.includes(keyword.toLowerCase())) score += 5;
  }

  if (context.audienceGroup && resource.audienceGroups?.includes(context.audienceGroup)) score += 2;
  if (context.aiStage && resource.aiStages?.includes(context.aiStage)) score += 2;
  if (resource.id === 'learn-ai-life' && (!context.aiStage || context.aiStage === 'beginner')) score += 3;
  if (resource.id === 'tools-ai-tools') score += 1;

  return score;
}

function createBridge(categories: NeedCategory[], resources: MatchResource[], context: MatchContext): string {
  const categoryText = categories.map(category => needCategoryLabels[category]).join('、');
  const stageText = context.aiStage && context.aiStage !== 'prefer-not-say'
    ? `，你现在更接近「${aiStageLabels[context.aiStage]}」`
    : '';
  const audienceText = context.audienceGroup && context.audienceGroup !== 'prefer-not-say'
    ? `，使用场景偏「${audienceGroupLabels[context.audienceGroup]}」`
    : '';
  const path = resources.slice(0, 3).map(resource => resource.title).join(' → ');
  return `你的问题主要落在「${categoryText}」${audienceText}${stageText}：先看 ${path}，按这个顺序能更快判断需求、选工具、走下一步。`;
}

export function matchSiteResources(context: MatchContext): MatchResult {
  const categories = inferCategories(context.need);
  const toolFits = inferToolFits(context.need);
  const fitVerdict = inferFitVerdict(context.need, toolFits);
  const resources = matchResources
    .map(resource => ({ resource, score: scoreResource(resource, context, categories, toolFits) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(item => item.resource)
    .slice(0, 4);

  const fallbackResources = resources.length > 0
    ? resources
    : matchResources.filter(resource => ['learn-ai-life', 'tools-ai-tools', 'content-universe'].includes(resource.id));

  return {
    categories,
    resources: fallbackResources,
    bridge: createBridge(categories, fallbackResources, context),
    fitVerdict,
    toolDirection: createDirection(fitVerdict, toolFits),
    reason: createReason(fitVerdict, toolFits),
    codexMisuseLikely: fitVerdict === 'codex-not-needed' && normalizeText(context.need).includes('codex'),
    toolFits,
  };
}
