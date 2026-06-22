#!/usr/bin/env node
/**
 * 内容字段迁移校验脚本
 *
 * 遍历 src/content/log/ 下所有 .md 文件，用 gray-matter 解析 frontmatter，
 * 校验必需字段是否齐全，输出缺失字段的文件清单。
 *
 * 必需字段（已核对实际 frontmatter，字段名与 to-do 一致，无需调整）：
 *   form, domain, intent, valueMode, aiUsePolicy, updated, summary
 *
 * 退出码：
 *   0 = 全部字段齐全，或目录不存在/无 .md 文件
 *   1 = 存在缺失字段
 */
import { readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import matter from 'gray-matter';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');
const CONTENT_DIR = join(PROJECT_ROOT, 'src', 'content', 'log');

// 必需字段列表（以实际 frontmatter 为准，已与样本文件核对一致）
const REQUIRED_FIELDS = [
  'form',
  'domain',
  'intent',
  'valueMode',
  'aiUsePolicy',
  'updated',
  'summary',
];

/**
 * 递归收集目录下所有 .md 文件路径
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function collectMarkdownFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectMarkdownFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * 校验单个文件的 frontmatter 必需字段
 * @param {string} filePath
 * @returns {Promise<{ file: string, missing: string[] }>}
 */
async function checkFile(filePath) {
  const parsed = matter.read(filePath);
  const data = parsed.data || {};
  const missing = REQUIRED_FIELDS.filter(
    (field) =>
      data[field] === undefined ||
      data[field] === null ||
      (typeof data[field] === 'string' && data[field].trim() === '')
  );
  return { file: filePath, missing };
}

async function main() {
  // 1. 目录是否存在
  let dirStat;
  try {
    dirStat = await stat(CONTENT_DIR);
  } catch {
    console.log(`目录不存在：${relative(PROJECT_ROOT, CONTENT_DIR)}，跳过校验。`);
    process.exit(0);
  }

  if (!dirStat.isDirectory()) {
    console.log(`路径不是目录：${relative(PROJECT_ROOT, CONTENT_DIR)}，跳过校验。`);
    process.exit(0);
  }

  // 2. 递归收集 .md 文件
  const files = await collectMarkdownFiles(CONTENT_DIR);

  if (files.length === 0) {
    console.log(`未在 ${relative(PROJECT_ROOT, CONTENT_DIR)} 下找到 .md 文件，跳过校验。`);
    process.exit(0);
  }

  // 3. 逐个校验
  const results = await Promise.all(files.map(checkFile));
  const offenders = results.filter((r) => r.missing.length > 0);

  console.log(`共扫描 ${files.length} 个 .md 文件，必需字段：${REQUIRED_FIELDS.join(', ')}`);

  if (offenders.length === 0) {
    console.log('全部文件的必需字段齐全。');
    process.exit(0);
  }

  console.log(`\n以下 ${offenders.length} 个文件存在缺失字段：`);
  for (const { file, missing } of offenders) {
    const rel = relative(PROJECT_ROOT, file);
    console.log(`  ${rel} → 缺失：${missing.join(', ')}`);
  }
  process.exit(1);
}

main().catch((err) => {
  console.error('校验脚本异常退出：', err);
  process.exit(1);
});
