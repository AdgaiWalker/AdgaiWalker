/**
 * backfill-article-versions — 既有文章补票：为每篇公开文章生成 v1（初始版本入库）。
 *
 * 用法：pnpm content:backfill-versions
 *
 * 纪律：
 * - 只追加：已有版本历史的文章跳过（readIndex 存在版本即不重写）。
 * - 写盘语义唯一：与线上发布链共用 FsArticleVersionStore.appendVersion（blob 'wx' + 原子索引），
 *   不另起第二份写盘逻辑。
 * - 公开纪律：只补 visibility=public 的文章——草稿/私密绝不进公开区。
 * - 变更说明统一「初始版本入库」；releaseId 用 backfill 标识（来源可解释）。
 * - 正文取当前 content/log 正本（即文章「此刻的样子」——此前算史前时代，不追）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import matter from 'gray-matter';
import { contentLogDir, repoRoot } from './lib/paths';
import { resolveVisibility } from '../packages/shared/src/content';
import { FsArticleVersionStore } from '../apps/api/src/adapters/fs-article-version-store';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// 落点固定到仓库根版本库（不依赖 cwd 探测）
process.env.ARTICLE_VERSIONS_DIR = path.join(repoRoot, 'content/versions');

const store = new FsArticleVersionStore();

async function main(): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;

  for (const file of fs.readdirSync(contentLogDir)) {
    if (!/\.(md|mdx)$/i.test(file)) continue;
    const slug = file.replace(/\.(md|mdx)$/i, '');
    if (!SLUG_RE.test(slug)) continue;

    const rawBody = fs.readFileSync(path.join(contentLogDir, file), 'utf8');

  // 公开纪律：只有公开文章才有公开版本历史——草稿/私密绝不进公开区（skill 公开五条之①）
    const { data } = matter(rawBody);
  if (resolveVisibility(data as Record<string, unknown>) !== 'public') {
    skipped++;
    continue;
  }

  const existing = await store.readIndex(slug);
  if (existing && existing.versions.length > 0) {
    skipped++;
    continue;
  }

  const result = await store.appendVersion({
    slug,
    rawBody,
    note: '初始版本入库',
    publishedAt: new Date().toISOString(),
    releaseId: `backfill_${randomUUID().slice(0, 12)}`,
  });
  if (result.created) {
    created++;
    console.log(`v1 ${slug}`);
  }
}

  return { created, skipped };
}

main()
  .then(({ created, skipped }) => {
    console.log(`补票完成：新建 ${created} 篇 v1，跳过 ${skipped} 篇`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
