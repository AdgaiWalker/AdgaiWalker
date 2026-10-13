/**
 * 文件系统内容台账仓储 — 读 content/log 的「文件事实」（PRD A1）
 * frontmatter 解析用 gray-matter：与 scripts/check-content-fields.ts、build:web 门禁同一个解析器，
 * 保证后台判定的门禁口径与构建门禁一致（PRD §3.7 末条）。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import type {
  ContentLedgerRepositoryPort,
  ContentLedgerSourceEntry,
} from '../ports/content-ledger.repository';
import { resolveContentLogDir } from './content-log-dir';

/** 与既有内容仓储同一 slug 形状约束（读侧口径一致） */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function toEntry(
  fileName: string,
  raw: string,
  mtime: Date,
): ContentLedgerSourceEntry {
  const slug = fileName.replace(/\.(md|mdx)$/i, '');
  const parsed = matter(raw);
  const data = (parsed.data ?? {}) as Record<string, unknown>;
  const title = typeof data.title === 'string' && data.title.trim() ? data.title : slug;
  const type = typeof data.type === 'string' && data.type.trim() ? data.type : 'knowledge';
  return {
    slug,
    title,
    type,
    frontmatter: data,
    body: parsed.content,
    updatedAt: mtime.toISOString(),
  };
}

export class FsContentLedgerRepository implements ContentLedgerRepositoryPort {
  async list(): Promise<ContentLedgerSourceEntry[]> {
    const dir = await resolveContentLogDir();
    const names = await fs.readdir(dir);
    const out: ContentLedgerSourceEntry[] = [];
    for (const name of names) {
      if (!/\.(md|mdx)$/i.test(name)) continue;
      const full = path.join(dir, name);
      const st = await fs.stat(full);
      if (!st.isFile()) continue;
      const raw = await fs.readFile(full, 'utf8');
      out.push(toEntry(name, raw, st.mtime));
    }
    return out.sort((a, b) => a.slug.localeCompare(b.slug));
  }

  async get(slug: string): Promise<ContentLedgerSourceEntry | null> {
    if (!SLUG_RE.test(slug)) return null;
    const dir = await resolveContentLogDir();
    for (const ext of ['.md', '.mdx'] as const) {
      const full = path.join(dir, `${slug}${ext}`);
      try {
        const raw = await fs.readFile(full, 'utf8');
        const st = await fs.stat(full);
        return toEntry(`${slug}${ext}`, raw, st.mtime);
      } catch {
        /* next */
      }
    }
    return null;
  }
}
