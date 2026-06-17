const PREFIX = 'walker:draft:';

export interface Draft {
  content: string;
  ts: number;
}

/** 读取未保存草稿。localStorage 不可用或损坏时返回 null。 */
export function loadDraft(slug: string): Draft | null {
  try {
    const raw = localStorage.getItem(PREFIX + slug);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Draft>;
    if (typeof parsed?.content !== 'string') return null;
    return { content: parsed.content, ts: Number(parsed.ts) || 0 };
  } catch {
    return null;
  }
}

/** 暂存未保存草稿。 */
export function saveDraft(slug: string, content: string): void {
  try {
    localStorage.setItem(PREFIX + slug, JSON.stringify({ content, ts: Date.now() }));
  } catch {
    /* localStorage 不可用（隐私模式/满），静默降级 */
  }
}

/** 保存成功后清除草稿。 */
export function clearDraft(slug: string): void {
  try {
    localStorage.removeItem(PREFIX + slug);
  } catch {
    /* ignore */
  }
}
