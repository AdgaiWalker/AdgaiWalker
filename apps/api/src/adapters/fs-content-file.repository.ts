/**
 * 文件系统内容仓储 — 读写 monorepo content/log
 * 实现 ContentFileRepositoryPort（无 gray-matter 依赖，轻量解析 title/type）
 */
import fs from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { ApiError, validationError } from '../common/http-error';
import { isContentSha256 } from '@walker/shared';
import type {
  ContentFileDetail,
  ContentFileMeta,
  ContentFileRepositoryPort,
} from '../ports/content-file.repository';
import { resolveContentLogDir } from './content-log-dir';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const contentLocks = new Map<string, Promise<void>>();

type ContentTargetFile = { full: string; ext: '.md' | '.mdx'; mode: number };

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function withContentLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = contentLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  contentLocks.set(key, current);
  return previous.then(operation).finally(() => {
    release();
    if (contentLocks.get(key) === current) contentLocks.delete(key);
  });
}

async function existingTarget(dir: string, slug: string): Promise<ContentTargetFile | null> {
  const found: ContentTargetFile[] = [];
  for (const ext of ['.md', '.mdx'] as const) {
    const full = path.join(dir, `${slug}${ext}`);
    try {
      const stat = await fs.lstat(full);
      if (!stat.isFile()) throw new ApiError('content-file-invalid', 409, '内容目标不是普通文件');
      found.push({ full, ext, mode: stat.mode & 0o777 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  if (found.length > 1) throw new ApiError('content-file-ambiguous', 409, '同一内容 slug 同时存在 md 与 mdx 文件');
  return found[0] ?? null;
}

function fmField(raw: string, key: string): string | undefined {
  const re = new RegExp(`^${key}:\\s*(.+)$`, 'm');
  const m = raw.match(re);
  if (!m) return undefined;
  return m[1]!.trim().replace(/^["']|["']$/g, '');
}

export class FsContentFileRepository implements ContentFileRepositoryPort {
  async list(): Promise<ContentFileMeta[]> {
    const dir = await resolveContentLogDir();
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
    const dir = await resolveContentLogDir();
    const target = await existingTarget(dir, slug);
    if (!target) return null;
    const bytes = await fs.readFile(target.full);
    const stat = await fs.stat(target.full);
    return detail(slug, bytes.toString('utf8'), sha256(bytes), target.ext, stat.mtime);
  }

  async save(slug: string, raw: string, expectedHash: string | null): Promise<ContentFileDetail> {
    if (!SLUG_RE.test(slug)) throw new ApiError('invalid-slug', 400, 'slug 须为小写 ascii 短横线');
    if (!raw.trimStart().startsWith('---')) throw new ApiError('invalid-frontmatter', 400, '正文须以 YAML frontmatter --- 开头');
    if (expectedHash !== null && !isContentSha256(expectedHash)) throw validationError('expectedHash 必须是正文 SHA-256 或 null');
    const dir = await resolveContentLogDir();
    const lockKey = path.join(path.resolve(dir), slug);
    return withContentLock(lockKey, async () => {
      const existing = await existingTarget(dir, slug);
      const previousBytes = existing ? await fs.readFile(existing.full) : null;
      const currentHash = previousBytes ? sha256(previousBytes) : null;
      if (currentHash !== expectedHash) {
        throw new ApiError('content-version-conflict', 409, '内容已变化，请重新读取后再保存');
      }
      const ext = existing?.ext ?? '.md';
      const full = existing?.full ?? path.join(dir, `${slug}${ext}`);
      const temporary = path.join(dir, `.${slug}.${randomUUID()}.tmp`);
      let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
      try {
        handle = await fs.open(temporary, 'wx', existing?.mode ?? 0o644);
        await handle.writeFile(raw, 'utf8');
        await handle.sync();
        await handle.close();
        handle = undefined;
        await fs.rename(temporary, full);
      } catch (error) {
        await handle?.close().catch(() => undefined);
        await fs.rm(temporary, { force: true }).catch(() => undefined);
        throw error;
      }
      const stat = await fs.stat(full);
      const bytes = Buffer.from(raw, 'utf8');
      return detail(slug, raw, sha256(bytes), ext, stat.mtime);
    });
  }
}

function detail(slug: string, raw: string, hash: string, ext: '.md' | '.mdx', mtime: Date): ContentFileDetail {
  return {
    slug,
    title: fmField(raw, 'title') ?? slug,
    type: fmField(raw, 'type') ?? 'knowledge',
    updatedAt: mtime.toISOString(),
    raw,
    hash,
    ext,
  };
}
