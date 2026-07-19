import {
  matchResources,
  type AbilityType,
  type AiStage,
  type AudienceGroup,
  type FrictionLayer,
  type MatchResource,
  type NeedCategory,
  type ToolFit,
} from '@/profiles/resource-index';
import { getToolById } from '@/profiles/tool-profiles';

export interface MatchContext {
  need: string;
  audienceGroup?: AudienceGroup;
  aiStage?: AiStage;
}

export type ResponseMode = 'greeting' | 'identity' | 'clarify' | 'diagnosis' | 'recommendation' | 'compliance';

export interface NeedFrame {
  purpose?: string;
  audience?: string;
  context?: string;
  outputForm?: string;
  materials?: string;
  constraints?: string;
  successSignal?: string;
  confidence: number;
}

export interface DiagnosisOption {
  label: string;
  text: string;
}

export interface RecommendedTool {
  id: string;
  name: string;
  tagline: string;
  useFor: string;
  nextStep: string;
  fit: 'best' | 'also-good' | 'fallback';
}

export interface ActionPlan {
  primaryTool?: RecommendedTool;
  backupTools: RecommendedTool[];
  prompt: string;
  nextStep: string;
}

export interface MatchResult {
  responseMode: ResponseMode;
  categories: NeedCategory[];
  resources: MatchResource[];
  recommendedTools: RecommendedTool[];
  needFrame: NeedFrame;
  diagnosisOptions: DiagnosisOption[];
  actionPlan?: ActionPlan;
  bridge: string;
  frictionLayer: FrictionLayer;
  recommendedAbilityType: AbilityType;
  toolDirection: string;
  reason: string;
  complianceRedirected: boolean;
  codeAgentMisuseLikely: boolean;
  toolFits: ToolFit[];
}

const categoryKeywords: Record<NeedCategory, string[]> = {
  coding: ['代码', '编程', '开发', '项目', '网站', '网页', '应用', 'bug', '报错', '仓库', '重构', '脚本', 'codex', 'claude code', 'cursor', 'ide'],
  'learn-ai': ['学 ai', '学习ai', '入门', '新手', '不会', '怎么开始', '从哪开始', '教程', '学习', '不会英文', '英文看不懂'],
  writing: ['写文章', '文案', '内容', '公众号', '小红书', '脚本', '标题', '润色', '总结', '翻译', '解释', '论文'],
  design: ['设计', '产品', 'ui', 'ux', '页面', '交互', '体验', '原型', '海报', '封面'],
  'image-video': ['图片', '画图', '视频', '剪辑', '生成图', '做图'],
  office: ['ppt', '表格', 'excel', 'word', '办公', '汇报', '文档', '报名表', '流程整理', '教案', '实训', '财会'],
  cost: ['便宜', '省钱', '低价', 'token', '中转', '额度', 'api key', 'apikey', '会员', '购买'],
  idea: ['点子', '想法', '创意', '落地', '做出来', '不知道怎么做'],
  automation: ['自动化', '工作流', '批处理', '定时', '流程', 'mcp', 'skill', '接管电脑'],
  community: ['社群', '群', '同行', '合作', '反馈', '交流'],
  'content-navigation': ['资料', '文章', '内容', '看不懂', '哪里看', '索引', '推荐资料', '官方渠道'],
};

const fitKeywords: Record<ToolFit, string[]> = {
  'code-agent': ['改代码', '已有项目', '项目代码', '仓库', '报错', 'bug', '重构', '脚本执行', '命令行', '部署', '接口', '代码库', '拉取', '提交', 'commit'],
  'chat-ai': ['写文章', '公众号', '文案', '总结', '翻译', '解释', '润色', '聊天', '提纲', '标题', '选题', '思路', '论文'],
  office: ['ppt', '表格', 'excel', 'word', '报名表', '汇报', '文档', '办公', '流程整理', '教案', '实训', '财会'],
  design: ['设计', 'ui', 'ux', '页面', '海报', '封面', '原型', '配色'],
  learning: ['学 ai', '学习', '入门', '教程', '不会', '从哪开始', '怎么开始', '不会英文', '英文看不懂'],
  content: ['公众号', '小红书', '内容', '文章', '选题', '资料', '案例'],
  automation: ['自动化', '工作流', '批处理', '定时', 'mcp', 'skill', '流程', '接管电脑'],
};

const complianceKeywords = [
  '梯子', 'vpn', '翻墙', '科学上网', '绕过', '代注册', '代验证', '接码',
  '小黄鱼', '闲鱼买号', '买号', '共享账号', '灰色账号', '验证码怎么过',
];

const accountConfigKeywords = [
  '账号', '注册', '登录', 'api key', 'apikey', 'key 连不上', '中转',
  '客户端', '购买', '渠道', '连不上', 'google', '谷歌', '验证码',
];

const toolUnderstandingKeywords = [
  'codex', '插件', '功能齐全', '手机上', '手机可以', 'agent', '接管电脑', 'claude code',
];

const valueUnderstandingKeywords = [
  '普通人', '有啥用', '有什么用', '能干嘛', '为什么用', '好奇', '不知道 ai',
];

const practiceDeepeningKeywords = [
  '已有项目', '仓库', '自动化', '工作流', 'mcp', 'skill', '部署', '接口', '脚本',
];

const notEnoughInfoKeywords = ['怎么用', '用什么', '帮我', '不知道', '推荐'];
const greetingKeywords = ['你好', '您好', '嗨', '哈喽', 'hello', 'hi', '在吗', '在不在'];
const identityKeywords = ['你是谁', '你是什么', '你是什么模型', '小秋是谁', '你叫什么', '你能做什么'];
const directActionKeywords = ['直接一点', '直接点', '直接推荐', '直接推', '给我工具', '推荐工具', '推本地', '本地有的工具', '别问', '少废话'];
const defaultCategoryOrder: NeedCategory[] = ['learn-ai', 'content-navigation', 'cost', 'idea'];

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function countMatches(text: string, keywords: string[]): number {
  return keywords.reduce((sum, keyword) => sum + (text.includes(keyword.toLowerCase()) ? 1 : 0), 0);
}

function containsAny(text: string, keywords: string[]): boolean {
  return countMatches(text, keywords) > 0;
}

function compactIntentText(text: string): string {
  return normalizeText(text).replace(/[，。！？、；：,.!?;:\s]/g, '');
}

function countConcreteTaskSignals(text: string): number {
  const normalized = normalizeText(text);
  const fitSignals = Object.values(fitKeywords).flat().filter(keyword => normalized.includes(keyword.toLowerCase())).length;
  const categorySignals = Object.values(categoryKeywords).flat().filter(keyword => normalized.includes(keyword.toLowerCase())).length;
  return fitSignals + categorySignals;
}

function hasConcreteTaskSignal(text: string): boolean {
  return countConcreteTaskSignals(text) > 0;
}

function isGreetingOnly(need: string): boolean {
  const normalized = normalizeText(need);
  const compacted = compactIntentText(need);
  return !hasConcreteTaskSignal(need)
    && greetingKeywords.some(keyword => normalized.includes(keyword) || compacted === keyword);
}

function isIdentityOnly(need: string): boolean {
  const normalized = normalizeText(need);
  return !hasConcreteTaskSignal(need) && containsAny(normalized, identityKeywords);
}

function isDirectActionRequest(need: string): boolean {
  return containsAny(normalizeText(need), directActionKeywords);
}

function isComplianceNeed(need: string): boolean {
  const normalized = normalizeText(need);
  if (containsAny(normalized, complianceKeywords)) return true;

  const mentionsVerification = containsAny(normalized, ['验证码', '手机验证', '账号验证', '验证']);
  const asksToBypass = containsAny(normalized, ['怎么过', '如何过', '绕过', '跳过', '代验证', '接码', '买号', '共享账号']);
  return mentionsVerification && asksToBypass;
}

function hasAudienceOrContextSignal(need: string): boolean {
  const normalized = normalizeText(need);
  return containsAny(normalized, [
    '学校', '作业', '论文', '课堂', '课程', '老师', '学生',
    '工作', '汇报', '公司', '老板', '客户', '商业', '路演',
    '朋友圈', '小红书', '公众号', '直播', '活动', '产品', '商品',
  ]);
}

function wantsTutorialOrResources(need: string): boolean {
  const normalized = normalizeText(need);
  return containsAny(normalized, ['教程', '资料', '资源', '哪里看', '怎么学', '不会用', '看不懂']);
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
  const concreteSignals = countConcreteTaskSignals(need);
  return concreteSignals === 0 && (normalized.length < 8 || (normalized.length < 16 && countMatches(normalized, notEnoughInfoKeywords) > 0));
}

function inferResponseMode(need: string, frictionLayer: FrictionLayer): ResponseMode {
  if (frictionLayer === 'compliance-entry') return 'compliance';
  if (isGreetingOnly(need)) return 'greeting';
  if (isIdentityOnly(need)) return 'identity';
  if (isDirectActionRequest(need)) return 'recommendation';
  if (shouldDiagnoseNeed(need)) return 'diagnosis';
  if (isNotEnoughInfo(need)) return 'clarify';
  return 'recommendation';
}

function shouldDiagnoseNeed(need: string): boolean {
  const normalized = normalizeText(need);
  if (normalized.includes('ppt') && !hasAudienceOrContextSignal(need)) return true;
  if (containsAny(normalized, ['母亲节', '父亲节', '教师节', '节日主题', '主题产品', '做个东西', '做一个东西'])) return true;
  if (containsAny(normalized, ['活动', '宣传', '产品']) && !containsAny(normalized, ['海报', '视频', '文章', 'ppt', '网页', '表格'])) return true;
  return false;
}

function inferFrictionLayer(need: string): FrictionLayer {
  const normalized = normalizeText(need);
  if (isComplianceNeed(need)) return 'compliance-entry';
  if (normalized.includes('不会英文') || normalized.includes('英文看不懂')) return 'tool-understanding';
  if (containsAny(normalized, practiceDeepeningKeywords)) return 'practice-deepening';
  if (containsAny(normalized, accountConfigKeywords)) return 'account-config';
  if (containsAny(normalized, valueUnderstandingKeywords)) return 'value-understanding';
  if (containsAny(normalized, toolUnderstandingKeywords)) return 'tool-understanding';
  if (isNotEnoughInfo(need)) return 'unclear';
  return 'scenario-match';
}

function inferAbilityType(frictionLayer: FrictionLayer, toolFits: ToolFit[]): AbilityType {
  if (frictionLayer === 'compliance-entry') return 'compliance-path';
  if (frictionLayer === 'account-config') return 'learning-path';
  if (frictionLayer === 'unclear') return 'clarify';

  const firstFit = toolFits[0];
  if (firstFit === 'code-agent') return 'code-agent';
  if (firstFit === 'office') return 'office';
  if (firstFit === 'design') return 'design';
  if (firstFit === 'automation') return 'automation';
  if (firstFit === 'learning') return 'learning-path';
  if (firstFit === 'content') return 'content-navigation';
  return 'chat-ai';
}

function createDirection(abilityType: AbilityType, frictionLayer: FrictionLayer): string {
  if (abilityType === 'compliance-path') return '先走合规路径：不处理绕过限制或灰色渠道，把问题转回可正常完成的学习、办公或创作任务。';
  if (frictionLayer === 'account-config') return '先补概念地图：弄清账号、API Key、模型、客户端和中转的关系，再决定是否真的需要配置。';
  if (abilityType === 'code-agent') return '直接用代码 Agent：已有项目、报错、接口、部署，优先让工具读项目再改。';
  if (abilityType === 'office') return '直接用聊天 AI 起稿：先出结构和内容，再放进你常用的办公软件排版。';
  if (abilityType === 'design') return '直接用设计/生成工具：先把图、页面或原型做出来，再细修。';
  if (abilityType === 'automation') return '直接先拆流程：重复步骤多就用自动化工具，少量一次性任务用聊天 AI 就够。';
  if (abilityType === 'learning-path') return '直接从低门槛聊天 AI 开始：先问明白，再按教程补能力。';
  if (abilityType === 'content-navigation') return '直接看工具页：先拿到可用工具，再补教程。';
  return '先澄清目标：补一句你想完成的任务、交付物或当前卡点，我再帮你选工具。';
}

function createReason(abilityType: AbilityType, frictionLayer: FrictionLayer, toolFits: ToolFit[]): string {
  if (abilityType === 'compliance-path') return '因为问题触及入口、账号或访问边界，不能提供绕过限制或灰色渠道，只能转向合规可用路径。';
  if (frictionLayer === 'account-config') return '因为你现在更像卡在账号、API、模型或连接概念上，还没到直接选工具的阶段。';
  if (abilityType === 'code-agent') return '因为描述的是代码、仓库、报错、部署或接口问题，需要工具进入项目上下文。';
  if (abilityType === 'office') return '因为目标更像 PPT、表格、教案、文档或实训作业，先跑通任务流程比上代码 Agent 更直接。';
  if (abilityType === 'design') return '因为目标更像视觉、页面或产品表达，设计工具更贴近交付物。';
  if (abilityType === 'automation') return '因为需求里有重复流程或工作流信号，应该先拆步骤再决定工具。';
  if (abilityType === 'learning-path') return '因为当前更需要建立 AI 使用路线，而不是立刻进入复杂工具。';
  if (abilityType === 'content-navigation') return '因为这个需求先看已有资料更高效，能降低试错成本。';
  return toolFits.length > 0 ? '信息还不足以稳定判断，但已经有初步方向。' : '描述还缺少任务目标或交付物。';
}

function inferNeedFrame(need: string): NeedFrame {
  const normalized = normalizeText(need);
  const outputForm = normalized.includes('ppt') ? 'PPT'
    : containsAny(normalized, ['短视频', '视频']) ? '短视频'
    : containsAny(normalized, ['海报', '封面', '图片']) ? '海报/图片'
    : containsAny(normalized, ['文章', '公众号', '小红书']) ? '文章/图文'
    : containsAny(normalized, ['网站', '网页', '报名表']) ? '网站/表单'
    : undefined;
  const audience = containsAny(normalized, ['学校', '作业', '学生', '课堂']) ? '学校/课堂'
    : containsAny(normalized, ['工作', '汇报', '公司', '老板']) ? '工作汇报'
    : containsAny(normalized, ['客户', '商业', '路演', '产品', '商品']) ? '商业展示'
    : containsAny(normalized, ['朋友圈', '小红书', '公众号']) ? '社交发布'
    : undefined;
  const materials = containsAny(normalized, ['资料', '文档', '论文', '数据', '图片']) ? '已有材料' : undefined;
  const constraints = containsAny(normalized, ['今天', '明天', '马上', '快速', '不会', '手机']) ? '低门槛/时间紧' : undefined;
  const confidence = [outputForm, audience, materials, constraints].filter(Boolean).length / 4;

  return {
    purpose: need.trim() || undefined,
    audience,
    context: audience,
    outputForm,
    materials,
    constraints,
    successSignal: outputForm ? `做出第一版${outputForm}` : '选定一个可交付形式并做出第一版',
    confidence,
  };
}

function createDiagnosisOptions(need: string): DiagnosisOption[] {
  const normalized = normalizeText(need);
  if (normalized.includes('ppt')) {
    return [
      { label: '学校作业', text: '这是学校作业 PPT，帮我做一个可以交作业的版本' },
      { label: '工作汇报', text: '这是工作汇报 PPT，帮我做一个给领导或同事看的版本' },
      { label: '课程教案', text: '这是课程教案 PPT，帮我做一个适合上课讲的版本' },
      { label: '商业展示', text: '这是商业展示 PPT，帮我做一个能说服客户的版本' },
    ];
  }

  if (containsAny(normalized, ['母亲节', '父亲节', '教师节', '节日主题', '主题产品'])) {
    return [
      { label: '祝福海报', text: '我想做一张母亲节祝福海报，用来发朋友圈或展示' },
      { label: '短视频', text: '我想做一个母亲节短视频，用来表达祝福或宣传' },
      { label: '商品文案', text: '我想做母亲节商品文案或活动宣传，用来促进转化' },
    ];
  }

  return [
    { label: '做成图文', text: '我想把这个目的做成一篇图文内容' },
    { label: '做成视频', text: '我想把这个目的做成一个短视频' },
    { label: '做成 PPT', text: '我想把这个目的做成一份 PPT' },
  ];
}

function createActionPrompt(need: string, abilityType: AbilityType, frame: NeedFrame): string {
  const normalized = normalizeText(need);
  if (normalized.includes('ppt')) {
    return '请帮我做一份关于「主题」的 10 页 PPT 大纲。每页包含：标题、3 个要点、配图建议和 60 秒讲稿。先问我用途和听众，再开始生成。';
  }
  if (containsAny(normalized, ['母亲节', '父亲节', '教师节'])) {
    return '我想做一个「母亲节」主题内容。请先给我 3 种成品方向：海报、短视频、商品文案，并分别说明适合的场景、需要的素材和第一步怎么做。';
  }
  if (abilityType === 'code-agent') {
    return '请先阅读这个项目结构，告诉我它是怎么组织的；然后根据我的目标，列出最小修改计划，等我确认后再改。';
  }
  if (abilityType === 'design') {
    return '请根据我的目标，先给 3 个视觉方向，每个方向包含用途、画面元素、文案和配色建议。';
  }
  return `我想完成「${frame.purpose ?? '这个任务'}」。请先判断最适合做成什么形式，再给我一个可以立刻执行的第一步。`;
}

function createActionPlan(need: string, recommendedTools: RecommendedTool[], abilityType: AbilityType, frame: NeedFrame): ActionPlan | undefined {
  const primaryTool = recommendedTools[0];
  const backupTools = recommendedTools.slice(1, 3);
  if (abilityType === 'compliance-path') return undefined;
  return {
    primaryTool,
    backupTools,
    prompt: createActionPrompt(need, abilityType, frame),
    nextStep: primaryTool
      ? `先打开 ${primaryTool.name}，复制这条提示词，把「主题」替换成你的真实内容。`
      : '先选一个成品方向，再进入具体工具。',
  };
}

function createTool(id: string, useFor: string, nextStep: string, fit: RecommendedTool['fit']): RecommendedTool | null {
  const tool = getToolById(id);
  if (!tool) return null;
  return {
    id: tool.id,
    name: tool.name,
    tagline: tool.tagline,
    useFor,
    nextStep,
    fit,
  };
}

function pickTools(items: Array<RecommendedTool | null>): RecommendedTool[] {
  const seen = new Set<string>();
  const picked: RecommendedTool[] = [];
  for (const item of items) {
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    picked.push(item);
  }
  return picked.slice(0, 3);
}

function inferRecommendedTools(need: string, abilityType: AbilityType): RecommendedTool[] {
  const normalized = normalizeText(need);
  const isPpt = normalized.includes('ppt') || normalized.includes('汇报') || normalized.includes('演示');
  const hasLongMaterial = normalized.includes('资料') || normalized.includes('论文') || normalized.includes('文档') || normalized.includes('长文');

  if (abilityType === 'office') {
    if (isPpt) {
      return pickTools([
        createTool('chatgpt', 'PPT 大纲、每页标题、讲稿和配图提示词。', '把主题丢进去，让它先给 8-12 页结构。', 'best'),
        createTool('claude-chat', '长资料整理成清楚的演示逻辑。', '有资料就先让它提炼“听众、结论、页结构”。', 'also-good'),
        createTool('glm', '中文低门槛起稿。', '直接让它生成第一页到最后一页的文案初稿。', 'also-good'),
        createTool('gemini-chat', '资料很多时做长文整理。', '先上传或粘贴资料，让它压成 PPT 提纲。', 'fallback'),
      ]);
    }
    return pickTools([
      createTool('chatgpt', '办公文档、表格思路、流程和汇报初稿。', '先让它给结构，再人工核对事实。', 'best'),
      createTool('glm', '中文办公任务快速起稿。', '直接描述交付物，让它给可复制的初稿。', 'also-good'),
      createTool('claude-chat', '教案、论文、长文档和复杂材料整理。', '把资料和要求一起给它，让它先拆结构。', 'also-good'),
      createTool('gemini-chat', '长上下文资料处理。', '资料很多时先用它做归纳。', 'fallback'),
    ]);
  }

  if (abilityType === 'code-agent') {
    return pickTools([
      createTool('claude-code', '已有项目、多文件修改、报错定位。', '先让它读项目结构，再交代一个小目标。', 'best'),
      createTool('cursor', '边写代码边问，适合局部修改。', '打开项目文件夹后直接描述要改哪里。', 'also-good'),
      createTool('codex', '明确的小代码任务、脚本、函数生成。', '把目标、输入输出和约束说清楚。', 'also-good'),
      createTool('windsurf', '免费体验 AI 编程。', '预算有限就先用它跑通简单改动。', 'fallback'),
    ]);
  }

  if (abilityType === 'design') {
    return pickTools([
      createTool('gpt-image', '中文生成图片、设计稿和 UI 素材。', '直接描述画面和用途。', 'best'),
      createTool('jimeng', '中文图片/视频生成。', '需要国内友好体验时先用它。', 'also-good'),
      createTool('midjourney', '高质量风格图和灵感参考。', '追求画面风格时再用。', 'fallback'),
      createTool('v0', '生成 UI 界面。', '要页面组件时描述界面结构。', 'fallback'),
    ]);
  }

  if (abilityType === 'automation') {
    return pickTools([
      createTool('n8n', '重复工作流、定时任务和多工具连接。', '先把触发条件、步骤、输出写成清单。', 'best'),
      createTool('claude-code', '需要脚本或项目级自动化。', '让它先读项目，再生成可运行脚本。', 'also-good'),
      createTool('chatgpt', '先拆流程和写自动化方案。', '把重复步骤写出来，让它判断是否值得自动化。', 'fallback'),
    ]);
  }

  if (abilityType === 'learning-path') {
    return pickTools([
      createTool('glm', '中文入门问答，门槛低。', '先问“我想用 AI 做 X，第一步怎么做”。', 'best'),
      createTool('gemini-chat', '免费额度大，适合反复练。', '把教程原文丢进去，让它用例子讲。', 'also-good'),
      createTool('learn-walker', '站内学习路径。', '有方向后再按阶段补课。', 'also-good'),
    ]);
  }

  if (abilityType === 'content-navigation') {
    return pickTools([
      createTool('chatgpt', '快速解释资料和生成操作步骤。', '把看不懂的内容丢进去，让它举例说明。', 'best'),
      createTool('glm', '中文解释和低门槛替代。', '先让它把术语翻成生活例子。', 'also-good'),
      createTool('learn-walker', '站内内容导航。', '工具不清楚时再看学习指南。', 'fallback'),
    ]);
  }

  if (abilityType === 'chat-ai') {
    return pickTools([
      createTool('claude-chat', hasLongMaterial ? '长文分析、写作和总结。' : '写作、选题、润色和思路整理。', '把目标、受众和限制说清楚。', 'best'),
      createTool('chatgpt', '通用问答、提纲、代码片段和图片能力。', '直接描述你要交付的东西。', 'also-good'),
      createTool('glm', '中文初稿和日常对话。', '想省事就先用它出第一版。', 'also-good'),
      createTool('gemini-chat', '长资料和大量免费使用。', '资料多时先让它整理。', 'fallback'),
    ]);
  }

  return [];
}

function limitResourcesForDirectTools(
  resources: MatchResource[],
  recommendedTools: RecommendedTool[],
  abilityType: AbilityType,
): MatchResource[] {
  if (!recommendedTools.length) return resources;

  const preferredIds: Partial<Record<AbilityType, string[]>> = {
    office: ['tools-ai-tools'],
    'code-agent': ['tools-ai-tools', 'tools-skills', 'article-cli-panel'],
    design: ['tools-ai-tools', 'article-design-bridge'],
    automation: ['tools-skills', 'tools-ai-tools', 'article-cli-panel'],
    'learning-path': ['learn-ai-life', 'tools-ai-tools'],
    'content-navigation': ['tools-ai-tools', 'content-universe'],
    'chat-ai': ['tools-ai-tools', 'content-universe'],
  };
  const ids = preferredIds[abilityType] ?? ['tools-ai-tools'];
  const picked = resources.filter(resource => ids.includes(resource.id)).slice(0, 2);
  return picked.length > 0 ? picked : resources.slice(0, 1);
}

function scoreResource(resource: MatchResource, context: MatchContext, categories: NeedCategory[], toolFits: ToolFit[], frictionLayer: FrictionLayer): number {
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
  if (frictionLayer === 'compliance-entry' && resource.id === 'learn-ai-life') score += 8;
  if (frictionLayer === 'account-config' && resource.id === 'tools-low-cost-ai') score += 6;
  if (resource.id === 'learn-ai-life' && (!context.aiStage || context.aiStage === 'beginner')) score += 3;
  if (resource.id === 'tools-ai-tools') score += 1;
  if (categories.includes('office') && resource.id === 'tools-ai-tools') score += 10;
  if (toolFits.includes('office') && resource.id === 'tools-ai-tools') score += 8;
  if (normalized.includes('ppt') && resource.id === 'tools-ai-tools') score += 10;

  return score;
}

function createBridge(input: {
  categories: NeedCategory[];
  resources: MatchResource[];
  context: MatchContext;
  responseMode: ResponseMode;
  frictionLayer: FrictionLayer;
  abilityType: AbilityType;
  complianceRedirected: boolean;
}): string {
  const { context, responseMode, abilityType, complianceRedirected } = input;
  if (responseMode === 'greeting') {
    return '嗨，我是小秋。你可以只说目的，不用先想工具或形式；比如“给妈妈做个节日惊喜”“把课堂内容讲清楚”，我会帮你收窄成一个能开做的小行动。';
  }
  if (responseMode === 'identity') {
    return '我是 iwalk.pro 的 AI 实践导航助手小秋，主要帮你把真实任务拆清楚，再变成一个能验证的 AI 小行动。你现在想完成什么？';
  }
  if (complianceRedirected) {
    return '这个方向我不能协助绕过限制、验证码或账号规则。你可以换成要完成的真实任务，比如写作、做课件、整理资料或改代码，我会按合规可用的路径帮你做。';
  }

  const normalized = normalizeText(context.need);
  if (responseMode === 'diagnosis') {
    if (normalized.includes('ppt')) {
      return '可以做。先确认用途：学校作业、工作汇报、课程教案，还是商业展示？不同用途会决定页数、语气和内容结构。';
    }
    if (containsAny(normalized, ['母亲节', '父亲节', '教师节', '节日主题', '主题产品'])) {
      return '这个先别急着定工具，更关键是成品形式。它可能是祝福海报、短视频，也可能是商品文案；你选一个更接近的方向，我再给你最短开做步骤。';
    }
    return '我先把它收窄成一个能交付的东西。你更想做成图文、短视频，还是 PPT？选一个方向就能继续往下做。';
  }
  if (responseMode === 'clarify' || abilityType === 'clarify') {
    return '我还差一个关键信息：你想达成什么结果？可以只说目的，比如“给学生讲清楚一个知识点”或“把活动宣传出去”。';
  }

  if (abilityType === 'office' && normalized.includes('ppt')) {
    return '直接用 ChatGPT 先出第一版 PPT 结构；如果资料很长，再换 Claude 或 Gemini 做整理。';
  }
  if (abilityType === 'office') {
    return '这类办公任务先用聊天 AI 做结构和初稿，再放进你常用的办公软件里排版核对。';
  }
  if (abilityType === 'code-agent') {
    return '这像已有项目里的代码任务，优先用 Claude Code 或 Cursor 读项目上下文；目标很小很明确时再用 Codex。';
  }
  if (abilityType === 'design') {
    return '先用设计/生成工具做第一版画面或页面，再根据用途细修。';
  }
  if (abilityType === 'automation') {
    return '先把重复流程拆成触发、步骤和输出，再决定用 n8n、脚本还是聊天 AI。';
  }
  if (abilityType === 'learning-path') {
    return '先用低门槛聊天 AI 问明白一个具体任务，跑通后再补工具和概念。';
  }
  if (abilityType === 'content-navigation') {
    return '先让聊天 AI 把材料讲成生活例子；需要教程时再看站内资料。';
  }
  return '先用聊天 AI 把目的变成第一版交付物；做出来以后再判断要不要换更专门的工具。';
}

export function matchSiteResources(context: MatchContext): MatchResult {
  const categories = inferCategories(context.need);
  const toolFits = inferToolFits(context.need);
  const frictionLayer = inferFrictionLayer(context.need);
  const responseMode = inferResponseMode(context.need, frictionLayer);
  const recommendedAbilityType = inferAbilityType(frictionLayer, toolFits);
  const complianceRedirected = frictionLayer === 'compliance-entry' && isComplianceNeed(context.need);
  const needFrame = inferNeedFrame(context.need);
  const diagnosisOptions = responseMode === 'diagnosis' ? createDiagnosisOptions(context.need) : [];
  const recommendedTools = responseMode === 'recommendation'
    ? inferRecommendedTools(context.need, recommendedAbilityType)
    : [];
  const resources = matchResources
    .map(resource => ({ resource, score: scoreResource(resource, context, categories, toolFits, frictionLayer) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(item => item.resource)
    .slice(0, 4);

  const fallbackResources = resources.length > 0
    ? resources
    : matchResources.filter(resource => ['learn-ai-life', 'tools-ai-tools', 'content-universe'].includes(resource.id));
  const recommendationResources = limitResourcesForDirectTools(fallbackResources, recommendedTools, recommendedAbilityType);
  const visibleResources = responseMode === 'recommendation' && wantsTutorialOrResources(context.need)
    ? recommendationResources
    : [];
  const actionPlan = responseMode === 'recommendation' || responseMode === 'diagnosis'
    ? createActionPlan(context.need, recommendedTools, recommendedAbilityType, needFrame)
    : undefined;

  const codeAgentMisuseLikely = normalizeText(context.need).includes('codex') && recommendedAbilityType !== 'code-agent';

  return {
    responseMode,
    categories: responseMode === 'recommendation' ? categories : [],
    resources: visibleResources,
    recommendedTools,
    needFrame,
    diagnosisOptions,
    actionPlan,
    bridge: createBridge({
      categories,
      resources: visibleResources,
      context,
      responseMode,
      frictionLayer,
      abilityType: recommendedAbilityType,
      complianceRedirected,
    }),
    frictionLayer,
    recommendedAbilityType,
    toolDirection: createDirection(recommendedAbilityType, frictionLayer),
    reason: createReason(recommendedAbilityType, frictionLayer, toolFits),
    complianceRedirected,
    codeAgentMisuseLikely,
    toolFits,
  };
}
