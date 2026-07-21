/**
 * generate-content — 扫描 content/log → apps/web/src/generated/content.json
 * 依赖：gray-matter、paths
 * 触发：pnpm content:gen / build-web / dev:web
 */
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { contentLogDir, contentJsonPath, webGeneratedDir } from './lib/paths';

type Visibility = 'public' | 'draft' | 'private';

export type ContentItem = {
  slug: string;
  title: string;
  date: string;
  type: string;
  status: string;
  summary: string;
  body: string;
  tags: string[];
  level: string;
  emoji: string;
  visibility: Visibility;
  published: boolean;
};

function resolveVisibility(data: Record<string, unknown>): Visibility {
  if (
    data.visibility === 'public' ||
    data.visibility === 'draft' ||
    data.visibility === 'private'
  ) {
    return data.visibility;
  }
  if (data.published === false) return 'draft';
  return 'public';
}

/** 去掉 MDX 顶部对 Astro 组件的 import，避免正文出现运行时噪音 */
function stripLegacyAstroImports(body: string): string {
  return body
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      if (!t.startsWith('import ')) return true;
      if (/\.astro['"]\s*;?\s*$/.test(t)) return false;
      if (/from\s+['"]@\/components\//.test(t) && t.includes('astro')) return false;
      return true;
    })
    .join('\n')
    .replace(/^\s*\n+/, '')
    .trim();
}

const docs: ContentItem[] = [];
if (fs.existsSync(contentLogDir)) {
  for (const file of fs.readdirSync(contentLogDir)) {
    if (!/\.(md|mdx)$/i.test(file)) continue;
    const raw = fs.readFileSync(path.join(contentLogDir, file), 'utf8');
    const { data, content } = matter(raw);
    const slug = file.replace(/\.(md|mdx)$/i, '');
    const visibility = resolveVisibility(data as Record<string, unknown>);
    if (visibility !== 'public') continue;
    docs.push({
      slug,
      title: typeof data.title === 'string' ? data.title : slug,
      date:
        data.date instanceof Date
          ? data.date.toISOString()
          : String(data.date || ''),
      type: String(data.type || 'knowledge'),
      status: data.status ? String(data.status) : '',
      summary: String(data.summary || data.description || ''),
      body: stripLegacyAstroImports(content),
      tags: Array.isArray(data.tags)
        ? data.tags.filter((t): t is string => typeof t === 'string')
        : [],
      level: data.level ? String(data.level) : '',
      emoji: data.emoji ? String(data.emoji) : '',
      visibility,
      published: true,
    });
  }
}

docs.sort((a, b) => (a.date < b.date ? 1 : -1));
fs.mkdirSync(webGeneratedDir, { recursive: true });
fs.writeFileSync(
  contentJsonPath,
  JSON.stringify({ generatedAt: new Date().toISOString(), items: docs }, null, 2),
);
console.log(`wrote ${docs.length} items → ${contentJsonPath}`);
