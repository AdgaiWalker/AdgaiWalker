/**
 * 构建期扫描 content/log → apps/web/src/generated/content.json
 * 纯 Markdown/MDX 真相源；剥离旧 Astro 组件 import，React 站不消费 .astro
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = path.join(root, 'content/log');
const outDir = path.join(root, 'apps/web/src/generated');
const outFile = path.join(outDir, 'content.json');

function resolveVisibility(data) {
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
function stripLegacyAstroImports(body) {
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

const docs = [];
if (fs.existsSync(contentDir)) {
  for (const file of fs.readdirSync(contentDir)) {
    if (!/\.(md|mdx)$/i.test(file)) continue;
    const raw = fs.readFileSync(path.join(contentDir, file), 'utf8');
    const { data, content } = matter(raw);
    const slug = file.replace(/\.(md|mdx)$/i, '');
    const visibility = resolveVisibility(data);
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
        ? data.tags.filter((t) => typeof t === 'string')
        : [],
      level: data.level ? String(data.level) : '',
      emoji: data.emoji ? String(data.emoji) : '',
      visibility,
      published: true,
    });
  }
}

docs.sort((a, b) => (a.date < b.date ? 1 : -1));
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  outFile,
  JSON.stringify({ generatedAt: new Date().toISOString(), items: docs }, null, 2),
);
console.log(`wrote ${docs.length} items → ${outFile}`);
