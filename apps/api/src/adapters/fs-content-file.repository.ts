/**
 * 文件系统内容仓储 — 读写 monorepo content/log
 * 实现 ContentFileRepositoryPort（无 gray-matter 依赖，轻量解析 title/type）
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  ContentFileDetail,
  ContentFileMeta,
  ContentFileRepositoryPort,
} from '../ports/content-file.repository';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function fmField(raw: string, key: string): string | undefined {
  const re = new RegExp(`^${key}:\\s*(.+)$`, 'm');
  const m = raw.match(re);
  if (!m) return undefined;
  return m[1]!.trim().replace(/^["']|["']$/g, '');
}

async function pickExistingDir(): Promise<string> {
  const fromEnv = process.env.CONTENT_LOG_DIR?.trim();
  if (fromEnv) {
    const p = path.resolve(fromEnv);
    await fs.access(p);
    return p;
  }
  const candidates = [
    path.resolve(process.cwd(), 'content/log'),
    path.resolve(process.cwd(), '../../content/log'),
    path.resolve(process.cwd(), '../content/log'),
  ];
  for (const c of candidates) {
    try {
      await fs.access(c);
      return c;
    } catch {
      /* next */
    }
  }
  throw new Error('content-log-unavailable');
}

export class FsContentFileRepository implements ContentFileRepositoryPort {
  async list(): Promise<ContentFileMeta[]> {
    const dir = await pickExistingDir();
    const names = await fs.readdir(dir);
    const out: ContentFileMeta[] = [];
    for (const name of names) {
      if (!/\.(md|mdx)$/i.test(name)) continue;
      const full = path.join(dir, name);
      const st = await fs.stat(full);
      if (!st.isFile()) continue;
      const raw = await fs.readFile(full, 'utf8');
      const slug = name.replace(/\.(md|mdx)$/i, '');
      out.push({
        slug,
        title: fmField(raw, 'title') ?? slug,
        type: fmField(raw, 'type') ?? 'knowledge',
        updatedAt: st.mtime.toISOString(),
      });
    }
    return out.sort((a, b) => a.slug.localeCompare(b.slug));
  }

  async get(slug: string): Promise<ContentFileDetail | null> {
    if (!SLUG_RE.test(slug)) return null;
    const dir = await pickExistingDir();
    for (const ext of ['.md', '.mdx'] as const) {
      const full = path.join(dir, `${slug}${ext}`);
      try {
        const raw = await fs.readFile(full, 'utf8');
        const st = await fs.stat(full);
        return {
          slug,
          title: fmField(raw, 'title') ?? slug,
          type: fmField(raw, 'type') ?? 'knowledge',
          updatedAt: st.mtime.toISOString(),
          raw,
          ext,
        };
      } catch {
        /* next */
      }
    }
    return null;
  }

  async save(slug: string, raw: string): Promise<ContentFileDetail> {
    if (!SLUG_RE.test(slug)) throw new Error('invalid-slug');
    if (!raw.trimStart().startsWith('---')) throw new Error('invalid-frontmatter');
    const dir = await pickExistingDir();
    let ext: '.md' | '.mdx' = '.md';
    let full = path.join(dir, `${slug}.md`);
    try {
      await fs.access(path.join(dir, `${slug}.mdx`));
      ext = '.mdx';
      full = path.join(dir, `${slug}.mdx`);
    } catch {
      /* keep .md */
    }
    await fs.writeFile(full, raw, 'utf8');
    const st = await fs.stat(full);
    return {
      slug,
      title: fmField(raw, 'title') ?? slug,
      type: fmField(raw, 'type') ?? 'knowledge',
      updatedAt: st.mtime.toISOString(),
      raw,
      ext,
    };
  }
}
