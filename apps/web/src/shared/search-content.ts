/**
 * 内容搜索纯函数（规则层 · 无 React / 无 IO）
 */
import { dualEntry } from './dual-entry';

export type SearchHit = { url: string; title: string };

export type SearchableItem = {
  slug: string;
  title: string;
  summary: string;
  body: string;
};

export type SearchScope = 'title-summary' | 'full';

const STOP_ZH = /[的了是在我你他她它这那有和与或把被从到去来不没怎么什么哪儿里吗呢吧啊]/g;

function extractTokens(query: string): string[] {
  const tokens = new Set<string>();
  const asciiMatches = query.match(/[a-z0-9]{2,}/g);
  if (asciiMatches) {
    for (const word of asciiMatches) tokens.add(word);
  }
  const cjkRuns = query.replace(STOP_ZH, ' ').match(/[\u4e00-\u9fff]{2,}/g);
  if (cjkRuns) {
    for (const run of cjkRuns) {
      for (let i = 0; i < run.length - 1; i++) {
        tokens.add(run.slice(i, i + 2));
      }
    }
  }
  return [...tokens];
}

function toHit(item: SearchableItem): SearchHit {
  return {
    url: `${dualEntry.browse.path}/${encodeURIComponent(item.slug)}`,
    title: item.title,
  };
}

/**
 * 默认只搜标题+摘要（轻量）；full 含正文。
 * 长句无精确子串命中时，退回分词打分匹配（不改短词语义）。
 */
export function searchContentItems(
  items: readonly SearchableItem[],
  query: string,
  limit = 12,
  scope: SearchScope = 'title-summary',
): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const exact = items
    .filter((i) => {
      if (i.title.toLowerCase().includes(q) || i.summary.toLowerCase().includes(q)) {
        return true;
      }
      if (scope === 'full' && i.body.toLowerCase().includes(q)) return true;
      return false;
    })
    .slice(0, limit)
    .map(toHit);

  if (exact.length > 0 || q.length < 4) return exact;

  const tokens = extractTokens(q);
  if (tokens.length === 0) return [];

  return items
    .map((item) => {
      const title = item.title.toLowerCase();
      const summary = item.summary.toLowerCase();
      const body = scope === 'full' ? item.body.toLowerCase() : '';
      let score = 0;
      for (const token of tokens) {
        if (title.includes(token)) score += 3;
        else if (summary.includes(token)) score += 1;
        else if (body && body.includes(token)) score += 1;
      }
      return { item, score };
    })
    .filter((entry) => entry.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => toHit(entry.item));
}
