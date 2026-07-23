/**
 * 内容空间配置（配置层）
 * 职责：内容宇宙 / 卡牌的分型标签与图标键；页面与块只读此表。
 */

export type ContentSpaceId =
  | 'all'
  | 'knowledge'
  | 'idea'
  | 'project'
  | 'learn'
  | 'tool';

/** Lucide 图标名（展示层映射为组件，配置层不 import React） */
export type SpaceIconKey =
  | 'layout-grid'
  | 'book-open'
  | 'lightbulb'
  | 'folder-kanban'
  | 'graduation-cap'
  | 'wrench';

export interface ContentSpace {
  id: ContentSpaceId;
  label: string;
  hint: string;
  types: readonly string[] | null;
  color: string;
  icon: SpaceIconKey;
}

export const CONTENT_SPACES: readonly ContentSpace[] = [
  {
    id: 'all',
    label: '全部',
    hint: '公开内容流',
    types: null,
    color: 'var(--color-brand)',
    icon: 'layout-grid',
  },
  {
    id: 'knowledge',
    label: '笔记',
    hint: '沉淀与证据',
    types: ['knowledge'],
    color: '#8ab4f8',
    icon: 'book-open',
  },
  {
    id: 'idea',
    label: '点子',
    hint: '驱动力',
    types: ['idea'],
    color: '#f5c542',
    icon: 'lightbulb',
  },
  {
    id: 'project',
    label: '项目',
    hint: '做成的事',
    types: ['project'],
    color: '#81c995',
    icon: 'folder-kanban',
  },
  {
    id: 'learn',
    label: '学习',
    hint: '以用促学',
    types: ['learn'],
    color: '#c58af9',
    icon: 'graduation-cap',
  },
  {
    id: 'tool',
    label: '工具',
    hint: '可复用能力',
    types: ['tool'],
    color: '#f28b82',
    icon: 'wrench',
  },
] as const;

/** 逛页类型 chip：不含 tool（资源在 /tools/resources） */
export const BROWSE_SPACES: readonly ContentSpace[] = CONTENT_SPACES.filter(
  (s) => s.id !== 'tool',
);

export function spaceForType(type: string): ContentSpace {
  return (
    CONTENT_SPACES.find((s) => s.types?.includes(type)) ?? CONTENT_SPACES[0]
  );
}

export function filterBySpace(
  items: readonly { type: string }[],
  spaceId: ContentSpaceId,
): readonly { type: string }[] {
  const space = CONTENT_SPACES.find((s) => s.id === spaceId) ?? CONTENT_SPACES[0];
  if (!space.types) return items;
  return items.filter((i) => space.types!.includes(i.type));
}
