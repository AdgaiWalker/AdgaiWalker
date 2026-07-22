/**
 * 资源页分区配置（配置层）
 * 职责：旧站 /tools 资源分区导航与锚点；页面只遍历此表。
 */

export type ToolsSectionId =
  | 'info-source'
  | 'ai-tools'
  | 'skill'
  | 'infra'
  | 'bloggers';

export type ToolsSectionIconKey =
  | 'users'
  | 'bot'
  | 'zap'
  | 'server'
  | 'heart';

export interface ToolsSectionDef {
  id: ToolsSectionId;
  label: string;
  icon: ToolsSectionIconKey;
  hint?: string;
}

export const TOOLS_SECTIONS: readonly ToolsSectionDef[] = [
  {
    id: 'info-source',
    label: '信息源',
    icon: 'users',
    hint: '学习氛围群与省钱渠道；有码可扫，无码请关注对应博主。',
  },
  {
    id: 'ai-tools',
    label: 'AI 工具',
    icon: 'bot',
    hint: '按场景在用的工具，不是全面测评。',
  },
  {
    id: 'skill',
    label: 'Skill',
    icon: 'zap',
    hint: '可复用的技能与方法论。',
  },
  {
    id: 'infra',
    label: '基础设施',
    icon: 'server',
    hint: '服务器、域名与辅助站点。',
  },
  {
    id: 'bloggers',
    label: '博主推荐',
    icon: 'heart',
    hint: '引路人与持续输出者。',
  },
] as const;
