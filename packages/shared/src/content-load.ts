/**
 * Node 侧内容扫描（构建期）。依赖 gray-matter + fs。
 * Web 运行时只消费生成后的 JSON，不直连本模块 I/O。
 */
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import {
  isPostType,
  isPublicDoc,
  toContentDoc,
  type ContentDoc,
} from './content.js';

export function loadAllFromDir(contentDir: string): ContentDoc[] {
  if (!fs.existsSync(contentDir)) return [];
  const files = fs.readdirSync(contentDir);
  const docs: ContentDoc[] = [];
  for (const file of files) {
    if (!/\.(md|mdx)$/i.test(file)) continue;
    const full = path.join(contentDir, file);
    const raw = fs.readFileSync(full, 'utf8');
    const { data, content } = matter(raw);
    const slug = file.replace(/\.(md|mdx)$/i, '');
    docs.push(toContentDoc(slug, data as Record<string, unknown>, content));
  }
  return docs.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function loadPublishedPosts(contentDir: string): ContentDoc[] {
  return loadAllFromDir(contentDir).filter(
    (d) => isPublicDoc(d) && isPostType(d.type),
  );
}

export function findPublishedBySlug(
  contentDir: string,
  slug: string,
): ContentDoc | undefined {
  return loadPublishedPosts(contentDir).find((d) => d.slug === slug);
}
