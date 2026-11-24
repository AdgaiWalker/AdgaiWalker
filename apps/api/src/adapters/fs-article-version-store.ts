/**
 * 文件系统文章版本库 — content/versions 只追加存储。
 *
 * 布局：
 *   content/versions/<slug>/index.json   —— 版本索引（投影，可全量重写）
 *   content/versions/<slug>/blobs/<hash>.md —— 正文 blob（不可变，内容寻址，只写一次）
 *
 * 纪律：
 * - 本文件没有任何 delete/unlink/rm 调用 —— 公开区无删除路径。
 * - blob 用 'wx' 标志写入：已存在即跳过（内容寻址幂等），绝不覆盖。
 * - index.json 用临时文件 + rename 原子替换。
 * - 并发安全：per-slug 进程内串行锁（与 FsContentFileRepository 同一模式）。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  appendArticleVersion,
  isArticleVersionIndex,
  isContentSha256,
  isValidContentSlug,
  normalizeLf,
  verifyArticleVersionIndex,
  type ArticleVersionIndex,
} from '@walker/shared';
import { sha256Hex } from '../common/crypto';
import { atomicWriteFile, createKeyedLock } from '../common/fs-atomic';
import { ApiError } from '../common/http-error';
import type { ArticleVersionStorePort } from '../ports/article-version-store.port';
import { resolveArticleVersionsDir } from './article-versions-dir';

const withVersionLock = createKeyedLock();

export class FsArticleVersionStore implements ArticleVersionStorePort {
  async readIndex(slug: string): Promise<ArticleVersionIndex | null> {
    if (!isValidContentSlug(slug)) return null;
    const dir = await resolveArticleVersionsDir();
    try {
      const raw = await fs.readFile(path.join(dir, slug, 'index.json'), 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      if (!isArticleVersionIndex(parsed)) {
        throw new ApiError('article-version-index-invalid', 500, '版本索引损坏');
      }
      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async readBody(contentHash: string): Promise<string | null> {
    if (!isContentSha256(contentHash)) return null;
    const dir = await resolveArticleVersionsDir();
    // blob 共享目录按 hash 全局寻址——相同内容跨文章、跨版本也只存一份。
    try {
      return await fs.readFile(path.join(dir, 'blobs', `${contentHash}.md`), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async appendVersion(input: {
    slug: string;
    rawBody: string;
    note: string;
    publishedAt: string;
    releaseId: string;
  }): Promise<{ index: ArticleVersionIndex; created: boolean }> {
    const slug = input.slug.trim();
    if (!isValidContentSlug(slug)) throw new ApiError('invalid-slug', 400, 'slug 须为小写 ascii 短横线');
    const normalizedRawBody = normalizeLf(input.rawBody);
    const dir = await resolveArticleVersionsDir();
    return withVersionLock(path.join(path.resolve(dir), slug), async () => {
      const existing = await this.readIndex(slug) ?? { slug, versions: [] };
      const contentHash = sha256Hex(normalizedRawBody);
      const next = appendArticleVersion(existing, {
        contentHash,
        note: input.note,
        publishedAt: input.publishedAt,
        releaseId: input.releaseId,
      });
      if (!next) return { index: existing, created: false };

      // 1) 写 blob（'wx'：已存在即跳过，绝不覆盖）
      const blobsDir = path.join(dir, 'blobs');
      await fs.mkdir(blobsDir, { recursive: true });
      const blobPath = path.join(blobsDir, `${contentHash}.md`);
      try {
        const handle = await fs.open(blobPath, 'wx', 0o644);
        try {
          await handle.writeFile(normalizedRawBody, 'utf8');
          await handle.sync();
        } finally {
          await handle.close();
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        // 已存在：内容寻址幂等，校验内容一致防哈希碰撞（兼容旧 CRLF blob 归一化）
        const existingBody = normalizeLf(await fs.readFile(blobPath, 'utf8'));
        if (sha256Hex(existingBody) !== contentHash) {
          throw new ApiError('article-version-hash-collision', 500, '内容哈希碰撞');
        }
      }

      // 2) 原子重写索引（索引是投影，blob 才是不可变事实）
      const problems = verifyArticleVersionIndex(next);
      if (problems.length > 0) {
        throw new ApiError('article-version-index-invalid', 500, problems.join('；'));
      }
      const slugDir = path.join(dir, slug);
      await fs.mkdir(slugDir, { recursive: true });
      await atomicWriteFile(path.join(slugDir, 'index.json'), JSON.stringify(next, null, 2));
      return { index: next, created: true };
    });
  }

  async listSlugs(): Promise<string[]> {
    const dir = await resolveArticleVersionsDir();
    let names: string[];
    try {
      names = await fs.readdir(dir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const out: string[] = [];
    for (const name of names) {
      if (!isValidContentSlug(name)) continue;
      if (name === 'blobs') continue; // 保留目录：共享内容寻址 blob 库，不是文章
      try {
        const stat = await fs.stat(path.join(dir, name));
        if (stat.isDirectory()) out.push(name);
      } catch { /* skip */ }
    }
    return out.sort();
  }
}
