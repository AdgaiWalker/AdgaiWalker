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

export function searchContentItems(
  items: readonly SearchableItem[],
  query: string,
  limit = 12,
): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return items
    .filter(
      (i) =>
        i.title.toLowerCase().includes(q) ||
        i.summary.toLowerCase().includes(q) ||
        i.body.toLowerCase().includes(q),
    )
    .slice(0, limit)
    .map((i) => ({
      url: `/posts/${encodeURIComponent(i.slug)}`,
      title: i.title,
    }));
}
