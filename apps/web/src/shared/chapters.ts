/**
 * 三章骨架（SSOT）：看见 → 用好 → 造物。
 * 纯函数，只读现有 frontmatter（type / hall），不新增内容字段。
 */

export type ChapterId = 'see' | 'use' | 'make';

export type ChapterDef = {
  id: ChapterId;
  /** 序号，用于版面上的 01 / 02 / 03 */
  no: string;
  label: string;
  /** 一句话：这一章回答什么 */
  dek: string;
};

export const CHAPTERS: readonly ChapterDef[] = [
  { id: 'see', no: '01', label: '看见', dek: '为什么注意力是第一资源，以及我怎么看人和 AI。' },
  { id: 'use', no: '02', label: '用好', dek: '上手、省钱、避坑：把 AI 和工具真正用顺。' },
  { id: 'make', no: '03', label: '造物', dek: '用更少的注意力，做出来的点子和项目。' },
];

export const CHAPTER_IDS: readonly ChapterId[] = CHAPTERS.map((c) => c.id);

const MAKE_TYPES = new Set(['project', 'idea', 'tool']);
const MAKE_HALLS = new Set(['showcase', 'exchange']);
const USE_TYPES = new Set(['learn']);
const USE_HALLS = new Set(['condition', 'kit']);

export type ChapterSource = { type: string; hall?: string };

export function chapterOf(item: ChapterSource): ChapterId {
  const hall = item.hall?.trim() ?? '';
  if (MAKE_TYPES.has(item.type) || MAKE_HALLS.has(hall)) return 'make';
  if (USE_TYPES.has(item.type) || USE_HALLS.has(hall)) return 'use';
  return 'see';
}

export function chapterById(id: ChapterId): ChapterDef {
  return CHAPTERS.find((c) => c.id === id) ?? CHAPTERS[0]!;
}

export function parseChapterId(raw: string | null | undefined): ChapterId | null {
  const key = raw?.trim().toLowerCase();
  return key && (CHAPTER_IDS as readonly string[]).includes(key) ? (key as ChapterId) : null;
}

/** 按三章分组，组内保持传入顺序（调用方负责按时间排序）。 */
export function groupByChapter<T extends ChapterSource>(
  items: readonly T[],
): { chapter: ChapterDef; items: T[] }[] {
  return CHAPTERS.map((chapter) => ({
    chapter,
    items: items.filter((item) => chapterOf(item) === chapter.id),
  }));
}
