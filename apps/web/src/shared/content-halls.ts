/**
 * 内容生产链五厅（配置 SSOT）
 * 物质→器具→意识→产品→交换；与旧 type 正交。
 */
export type ContentHallId =
  | 'condition'
  | 'kit'
  | 'lab'
  | 'showcase'
  | 'exchange';

export type ContentHallDef = {
  id: ContentHallId;
  label: string;
  /** 侧栏/短 hint */
  hint: string;
  /** 一句话定义（进厅判决） */
  blurb: string;
  /** WEB_ROUTES 键 */
  routeKey: 'condition' | 'kit' | 'lab' | 'showcase' | 'exchange';
};

export const CONTENT_HALLS: readonly ContentHallDef[] = [
  {
    id: 'condition',
    label: '条件',
    hint: 'Matter',
    blurb: '信息、教程与物质争取——做事之前先搞到条件。',
    routeKey: 'condition',
  },
  {
    id: 'kit',
    label: '器具',
    hint: 'Means',
    blurb: '方法、工具与跟学——完成活动的条件基础。',
    routeKey: 'kit',
  },
  {
    id: 'lab',
    label: '实验室',
    hint: 'Mind',
    blurb: '经验与思考——被物质与实践决定的意识沉淀。',
    routeKey: 'lab',
  },
  {
    id: 'showcase',
    label: '探索',
    hint: 'Work',
    blurb: '向外做事：点子可以持续推进，项目是被明确立项的持续交付。',
    routeKey: 'showcase',
  },
  {
    id: 'exchange',
    label: '交换',
    hint: 'Value',
    blurb: '知人所不知、帮得上人——对外的社会价值与商业面。',
    routeKey: 'exchange',
  },
] as const;

const HALL_IDS = new Set<string>(CONTENT_HALLS.map((h) => h.id));

export function isContentHallId(value: string): value is ContentHallId {
  return HALL_IDS.has(value);
}

export function hallDef(id: ContentHallId): ContentHallDef {
  return CONTENT_HALLS.find((h) => h.id === id) ?? CONTENT_HALLS[0];
}

/**
 * 无 frontmatter hall 时的推断（与归属表一致；显式 hall 优先）。
 */
export function inferContentHall(input: {
  hall?: string;
  type?: string;
  form?: string;
  series?: string;
}): ContentHallId {
  const explicit = (input.hall ?? '').trim();
  if (isContentHallId(explicit)) return explicit;

  const type = (input.type ?? '').trim();
  const form = (input.form ?? '').trim();
  const series = (input.series ?? '').trim();

  if (type === 'idea' || type === 'project') return 'showcase';
  if (type === 'learn' || type === 'tool') return 'kit';
  if (form === 'tutorial') return 'condition';
  if (form === 'resource') return 'kit';
  if (
    series === '前进三部曲' ||
    series === '设计思考' ||
    series === '站志' ||
    form === 'article' ||
    form === 'diary'
  ) {
    return 'lab';
  }
  if (series === 'Ferry' && type === 'knowledge') return 'lab';
  if (series === 'Ferry') return 'showcase';
  return 'lab';
}
