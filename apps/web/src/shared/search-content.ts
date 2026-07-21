/**
 * 内容搜索纯函数（规则层 · 无 React / 无 IO）
 */
export type SearchHit = { url: string; title: string };

export type SearchableItem = {
  slug: string;
  title: string;
  summary: string;
  body: string;
};

export type SearchScope = 'title-summary' | 'full';

/**
 * 默认只搜标题+摘要（轻量）；full 含正文
 */
export function searchContentItems(
  items: readonly SearchableItem[],
  query: string,
  limit = 12,
  scope: SearchScope = 'title-summary',
): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return items
    .filter((i) => {
      if (i.title.toLowerCase().includes(q) || i.summary.toLowerCase().includes(q)) {
        return true;
      }
      if (scope === 'full' && i.body.toLowerCase().includes(q)) return true;
      return false;
    })
    .slice(0, limit)
    .map((i) => ({
      url: `/posts/${encodeURIComponent(i.slug)}`,
      title: i.title,
    }));
}
