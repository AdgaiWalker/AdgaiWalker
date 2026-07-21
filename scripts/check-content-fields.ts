/**
 * check-content-fields — 校验 content/log frontmatter 必需字段
 * 依赖：gray-matter、paths.contentLogDir
 * 触发：可选手工 / CI
 */
import { readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import matter from 'gray-matter';
import { contentLogDir, repoRoot } from './lib/paths';

const REQUIRED_FIELDS = [
  'form',
  'domain',
  'intent',
  'valueMode',
  'aiUsePolicy',
  'updated',
  'summary',
] as const;

async function collectMarkdownFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectMarkdownFiles(fullPath)));
    } else if (entry.isFile() && /\.(md|mdx)$/i.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

async function checkFile(filePath: string): Promise<{ file: string; missing: string[] }> {
  const parsed = matter.read(filePath);
  const data = (parsed.data || {}) as Record<string, unknown>;
  const missing = REQUIRED_FIELDS.filter((field) => {
    const v = data[field];
    return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
  });
  return { file: filePath, missing: [...missing] };
}

async function main(): Promise<void> {
  let dirStat;
  try {
    dirStat = await stat(contentLogDir);
  } catch {
    console.log(`目录不存在：${relative(repoRoot, contentLogDir)}，跳过校验。`);
    process.exit(0);
  }

  if (!dirStat.isDirectory()) {
    console.log(`路径不是目录：${relative(repoRoot, contentLogDir)}，跳过校验。`);
    process.exit(0);
  }

  const files = await collectMarkdownFiles(contentLogDir);
  if (files.length === 0) {
    console.log(`未在 ${relative(repoRoot, contentLogDir)} 下找到 .md 文件，跳过校验。`);
    process.exit(0);
  }

  const results = await Promise.all(files.map(checkFile));
  const offenders = results.filter((r) => r.missing.length > 0);

  console.log(`共扫描 ${files.length} 个内容文件，必需字段：${REQUIRED_FIELDS.join(', ')}`);

  if (offenders.length === 0) {
    console.log('全部文件的必需字段齐全。');
    process.exit(0);
  }

  console.log(`\n以下 ${offenders.length} 个文件存在缺失字段：`);
  for (const { file, missing } of offenders) {
    console.log(`  ${relative(repoRoot, file)} → 缺失：${missing.join(', ')}`);
  }
  process.exit(1);
}

main().catch((err: unknown) => {
  console.error('校验脚本异常退出：', err);
  process.exit(1);
});
