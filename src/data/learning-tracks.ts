// ---------------------------------------------------------------------------
// Learning Tracks — 学习轨道数据层
// 三层架构：认知层（理解世界）→ 手艺层（表达与构建）→ 探索层（拓展边界）
// ---------------------------------------------------------------------------

/** 学习层次 */
export type LearningLayer = 'cognition' | 'craft' | 'exploration';

/** 轨道状态 */
export type TrackStatus = 'backlog' | 'active' | 'paused' | 'completed';

/** AI 对话平台 */
export type AiPlatform = 'deepseek' | 'chatgpt' | 'claude' | 'doubao' | 'tongyi' | 'gemini';

/** 学习笔记 = 一次 AI 对话 */
export interface LearningNote {
  title: string;
  date: string;
  aiConversation?: {
    platform: AiPlatform;
    url: string;
  };
  takeaways?: string[];
  /** 如果对话催生了正式文章 */
  postSlug?: string;
}

/** 学习资料 */
export interface LearningResource {
  name: string;
  url?: string;
  type: 'paper' | 'book' | 'course' | 'doc' | 'video';
}

/** 里程碑 */
export interface Milestone {
  title: string;
  done: boolean;
}

/** 学习轨道 */
export interface LearningTrack {
  id: string;
  title: string;
  layer: LearningLayer;
  status: TrackStatus;
  domain: string;
  motivation: string;
  startedDate?: string;
  completedDate?: string;
  milestones: Milestone[];
  /** 学习笔记 = AI 对话链接 */
  notes: LearningNote[];
  /** 实践反思文章 = post slug */
  articles: string[];
  /** 参考资料 = 喂给 AI 的输入 */
  resources: LearningResource[];
}

// ---------------------------------------------------------------------------
// 元数据映射
// ---------------------------------------------------------------------------

export const learningLayerMeta: Record<LearningLayer, {
  label: string;
  description: string;
  icon: string;
}> = {
  cognition:   { label: '认知层', description: '理解世界',   icon: 'lucide:brain' },
  craft:       { label: '手艺层', description: '表达与构建', icon: 'lucide:wrench' },
  exploration: { label: '探索层', description: '拓展边界',   icon: 'lucide:compass' },
};

export const learningLayers: LearningLayer[] = ['cognition', 'craft', 'exploration'];

export const trackStatusMeta: Record<TrackStatus, {
  label: string;
  color: string;
  icon: string;
}> = {
  active:    { label: '在学', color: '#4ade80', icon: 'lucide:play' },
  paused:    { label: '暂停', color: '#fbbf24', icon: 'lucide:pause' },
  completed: { label: '已完', color: '#60a5fa', icon: 'lucide:check-circle-2' },
  backlog:   { label: '待学', color: '#94a3b8', icon: 'lucide:clock' },
};

export const aiPlatformMeta: Record<AiPlatform, { label: string; icon: string }> = {
  deepseek:  { label: 'DeepSeek', icon: 'lucide:message-square' },
  chatgpt:   { label: 'ChatGPT',  icon: 'lucide:message-circle' },
  claude:    { label: 'Claude',    icon: 'lucide:bot' },
  doubao:    { label: '豆包',      icon: 'lucide:sparkles' },
  tongyi:    { label: '通义',      icon: 'lucide:zap' },
  gemini:    { label: 'Gemini',    icon: 'lucide:gem' },
};

export const resourceTypeLabels: Record<LearningResource['type'], string> = {
  paper: '论文',
  book: '书籍',
  course: '课程',
  doc: '文档',
  video: '视频',
};

/** 计算轨道进度（0-100） */
export function getTrackProgress(track: LearningTrack): number {
  if (track.milestones.length === 0) return 0;
  return Math.round(
    (track.milestones.filter(m => m.done).length / track.milestones.length) * 100,
  );
}

// ---------------------------------------------------------------------------
// 初始数据
// ---------------------------------------------------------------------------

export const learningTracks: LearningTrack[] = [
  {
    id: 'marxism-philosophy',
    title: '马克思主义哲学',
    layer: 'cognition',
    status: 'active',
    domain: 'philosophy',
    motivation: '指导实践',
    startedDate: '2026-05-01',
    milestones: [
      { title: '唯物论与辩证法', done: true },
      { title: '认识论与实践论', done: true },
      { title: '历史唯物主义', done: false },
      { title: '政治经济学基础', done: false },
      { title: '实践应用与反思', done: false },
    ],
    notes: [],
    articles: [],
    resources: [
      { name: '《资本论》', type: 'book' },
      { name: '《德意志意识形态》', type: 'book' },
    ],
  },
  {
    id: 'ai-math',
    title: 'AI 相关数学',
    layer: 'cognition',
    status: 'active',
    domain: 'ai',
    motivation: '抽象描述世界，减轻记忆量',
    startedDate: '2026-05-15',
    milestones: [
      { title: '线性代数与矩阵分解', done: true },
      { title: '概率论与统计推断', done: true },
      { title: '微积分与优化', done: false },
      { title: '信息论基础', done: false },
      { title: '图论与网络', done: false },
      { title: '数学在 AI 模型中的应用', done: false },
      { title: '抽象建模实践', done: false },
      { title: '融会贯通', done: false },
    ],
    notes: [],
    articles: [],
    resources: [],
  },
  {
    id: 'design-light-color-space',
    title: '设计：光色与空间',
    layer: 'craft',
    status: 'active',
    domain: 'design',
    motivation: '提升审美表达与空间感知',
    startedDate: '2026-06-01',
    milestones: [
      { title: '色彩理论基础', done: false },
      { title: '光影与空间关系', done: false },
      { title: '设计实践', done: false },
    ],
    notes: [],
    articles: [],
    resources: [],
  },
  {
    id: 'agent-engineering',
    title: 'Agent 工程',
    layer: 'craft',
    status: 'active',
    domain: 'ai',
    motivation: '构建 AI 智能体的工程能力',
    startedDate: '2026-04-01',
    milestones: [
      { title: 'LLM 基础与 Prompt 工程', done: true },
      { title: 'Tool Calling 与 Function Calling', done: true },
      { title: 'MCP 协议与 Server 构建', done: true },
      { title: 'RAG 与知识库集成', done: false },
      { title: '多智能体协作', done: false },
      { title: '生产级 Agent 架构', done: false },
    ],
    notes: [],
    articles: ['渡论构建', 'CLI命令面板'],
    resources: [
      { name: 'Anthropic: Building Effective Agents', url: 'https://www.anthropic.com/engineering/building-effective-agents', type: 'doc' },
    ],
  },
  {
    id: 'agent-hardware',
    title: 'Agent 应用与智能硬件',
    layer: 'exploration',
    status: 'backlog',
    domain: 'ai',
    motivation: '探索 Agent 在硬件端的落地场景',
    milestones: [
      { title: '嵌入式 AI 基础', done: false },
      { title: '语音交互 Agent', done: false },
      { title: '硬件原型搭建', done: false },
    ],
    notes: [],
    articles: [],
    resources: [],
  },
];
