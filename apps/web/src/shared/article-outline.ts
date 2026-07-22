/**
 * 文章大纲与阅读进度 — 纯函数，无 DOM/React。
 * 职责：从正文 HTML 抽出标题锚点、注入 id、计算阅读进度比例。
 */

export type TocItem = {
  id: string;
  level: 2 | 3;
  text: string;
};

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function slugifyHeading(text: string, index: number): string {
  const base = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return base ? `sec-${base}` : `sec-${index}`;
}

/**
 * 为 h2/h3 注入 id（已有 id 则保留），并生成 TOC。
 */
export function buildArticleOutline(html: string): {
  html: string;
  toc: TocItem[];
} {
  const toc: TocItem[] = [];
  const used = new Set<string>();
  let index = 0;

  const next = html.replace(
    /<h([23])(\s[^>]*)?>([\s\S]*?)<\/h\1>/gi,
    (_full, levelStr: string, attrs = '', inner: string) => {
      index += 1;
      const level = Number(levelStr) as 2 | 3;
      const text = stripTags(inner);
      const existing = attrs.match(/\sid\s*=\s*["']([^"']+)["']/i)?.[1];
      let id = existing?.trim() || slugifyHeading(text || 'section', index);
      if (used.has(id)) id = `${id}-${index}`;
      used.add(id);
      toc.push({ id, level, text: text || id });
      if (existing) {
        return `<h${level}${attrs}>${inner}</h${level}>`;
      }
      const rest = attrs.trim() ? ` ${attrs.trim()}` : '';
      return `<h${level}${rest} id="${id}">${inner}</h${level}>`;
    },
  );

  return { html: next, toc };
}

/** scrollTop / 可滚动高度 → 0..1 */
export function computeReadingProgress(
  scrollTop: number,
  viewportHeight: number,
  scrollHeight: number,
): number {
  const max = Math.max(1, scrollHeight - viewportHeight);
  const ratio = scrollTop / max;
  if (ratio <= 0) return 0;
  if (ratio >= 1) return 1;
  return ratio;
}

/**
 * 根据各标题距视口顶的 offsetTop 与当前 scroll，解析当前大纲 id。
 * 约定：offsetTops 与 toc 同序；scrollY 为文档滚动位置。
 */
export function resolveActiveTocId(
  scrollY: number,
  offsetTops: readonly number[],
  ids: readonly string[],
  offsetPad = 96,
): string | null {
  if (ids.length === 0 || offsetTops.length !== ids.length) return null;
  let active: string | null = ids[0] ?? null;
  for (let i = 0; i < offsetTops.length; i++) {
    if (offsetTops[i]! - offsetPad <= scrollY) {
      active = ids[i] ?? active;
    }
  }
  return active;
}
