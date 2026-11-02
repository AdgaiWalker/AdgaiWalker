#!/usr/bin/env node
/**
 * 极简新建文章 / 笔记脚本
 * 用途：在终端输入一条命令，自动创建带完整规范 Frontmatter 的 Markdown 文章。
 *
 * 用法：
 *   pnpm content:new "文章标题"
 *   pnpm content:new "我的思考" --slug my-thoughts --tags "随笔,AI"
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function autoSlug(text: string): string {
  const dateMatch = text.match(/\b(20\d{2})[-_./]?(\d{1,2})[-_./]?(\d{1,2})\b/);
  const datePart = dateMatch
    ? `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`
    : '';

  const latin = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .trim()
    .replace(/\s+/g, '-');

  if (SLUG_RE.test(latin)) return latin;
  if (datePart) return datePart;
  const today = new Date().toISOString().slice(0, 10);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${today}-${rand}`;
}

function parseArgs(argv: string[]) {
  let title = '';
  let slug = '';
  let tags = ['随想', '日记'];
  let summary = '待写完后提炼';

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--slug' || arg === '-s') {
      slug = argv[++i] ?? '';
    } else if (arg === '--tags' || arg === '-t') {
      const rawTags = argv[++i] ?? '';
      tags = rawTags.split(/[,，]/).map((t) => t.trim()).filter(Boolean);
    } else if (arg === '--summary' || arg === '-m') {
      summary = argv[++i] ?? summary;
    } else if (!arg.startsWith('-') && !title) {
      title = arg;
    }
  }

  if (!title) {
    const today = new Date().toISOString().slice(0, 10);
    title = `${today} 随记`;
  }
  if (!slug) {
    slug = autoSlug(title);
  }

  return { title, slug: slug.toLowerCase(), tags, summary };
}

function main() {
  const { title, slug, tags, summary } = parseArgs(process.argv.slice(2));

  if (!SLUG_RE.test(slug)) {
    console.error(`❌ 错误：Slug「${slug}」不合规。只支持小写英文、数字与短横线。`);
    process.exit(1);
  }

  const logDir = path.join(root, 'content/log');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const targetPath = path.join(logDir, `${slug}.md`);
  if (fs.existsSync(targetPath)) {
    console.error(`❌ 错误：文章「${targetPath}」已存在，未覆盖。请指定其他 slug。`);
    process.exit(1);
  }

  const today = new Date().toISOString().slice(0, 10);
  const content = `---
title: "${title.replace(/"/g, '\\"')}"
date: ${today}
updated: ${today}
tags: [${tags.map((t) => JSON.stringify(t)).join(', ')}]
type: knowledge
form: note
domain: life
intent: record
valueMode: existence
published: true
summary: "${summary.replace(/"/g, '\\"')}"
author: "duola"
aiUsePolicy:
  level: AI-2
  readable: true
  citable: true
  actionable: false
---

# ${title}

在此开始记录...
`;

  fs.writeFileSync(targetPath, content, 'utf8');

  console.log(`\n✨ 文章草稿创建成功！`);
  console.log(`📄 文件路径：content/log/${slug}.md`);
  console.log(`🔗 访问标识：${slug}`);
  console.log(`\n💡 写作与发布提示：`);
  console.log(`   1. 在你习惯的本地编辑器（Obsidian / VS Code / Cursor）中打开此文件编辑`);
  console.log(`   2. 写完后，运行 pnpm content:push 即可一键生成投影并推送到 GitHub 上线`);
  console.log(`   3. 或者登录后台 https://admin.iwalk.pro/content/${slug} 进行可视化发布\n`);
}

main();
