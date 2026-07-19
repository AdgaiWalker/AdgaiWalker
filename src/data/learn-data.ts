// ---------------------------------------------------------------------------
// /learn section — data layer (Restructured & Focused)
// ---------------------------------------------------------------------------

/** A teaching section inside a tool guide. */
export interface ToolSection {
  title: string;
  content: string; // Markdown
}

/** One of the learning levels/categories. */
export interface LearnLevel {
  id: '入门' | '学徒' | '专家';
  title: string;
  subtitle: string;
  emoji: string;
  description: string;
  color: string;
}

/** A classic AI tool representing a guide under a level. */
export interface LearnTool {
  id: string;                 // unique slug (e.g. 'claude-code')
  levelId: '入门' | '学徒' | '专家';    // parent level
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
    description: '拿到"我居然做到了"的体验，用最经典的 AI 命令行工具快速解决身边的小问题，建立信心。',
    color: '#4ade80',
  },
  {
    id: '学徒',
    title: '学徒',
    subtitle: 'Apprentice',
    emoji: '🔧',
    description: '摆脱单一工具限制，学会追问与调整，探索以用促学的自学循环，实现省时省力。',
    color: '#60a5fa',
  },
  {
    id: '专家',
    title: '专家',
    subtitle: 'Expert',
    emoji: '⚡',
    description: '最擅长的高阶 AI 编程。利用自主智能体（Agent）进行全自动构建，解决工程级难题。',
    color: '#f59e0b',
  },
];

// ---------------------------------------------------------------------------
// Classic Tools under Levels (Now empty, migrated to Markdown)
// ---------------------------------------------------------------------------

export const learnTools: LearnTool[] = [];

// ---------------------------------------------------------------------------
// Safety table (simplified for 3 levels)
// ---------------------------------------------------------------------------

export const safetyTable = [
  { stage: '入门', risk: '尚未接触系统性代码修改，没有风险', consequence: '安全无感，基本零风险' },
  { stage: '学徒', risk: '多文件修改覆盖 / 逻辑死循环', consequence: '误删或覆盖代码，需靠 Git 恢复' },
  { stage: '专家', risk: '智能体执行越权终端操作 / 数据泄露', consequence: '影响本地主机安全与生产数据，需强力的手动验证站与备份机制' },
];
