/**
 * verify-doc-links.ts — 校验现行 Markdown 文档内的相对链接与待办时钟单一性
 * 
 * 作用：
 * 1. 扫描根目录、docs/（活跃文档）、apps/、ops/ 的核心 Markdown 文档；
 * 2. 提取所有内部相对链接并验证其目标文件是否存在（消灭 404 死链）；
 * 3. 校验单一活跃待办原则（除根 to-do.md 外，docs/ 活跃目录不得存在独立 TODO 清单）；
 * 4. 接入构建/CI 门禁。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './lib/paths.js';

interface LinkError {
  file: string;
  line: number;
  text: string;
  target: string;
  resolvedPath: string;
}

interface TodoError {
  file: string;
  message: string;
}

// 收集待检查的活跃 Markdown 文件（归档目录 archive/ 保持历史原貌，不纳入活跃链接强校验）
function collectActiveDocFiles(): string[] {
  const files: string[] = [];

  // 1. 根目录核心文档
  const rootFiles = ['README.md', 'AGENTS.md', 'PLAN.md', 'to-do.md'];
  for (const rf of rootFiles) {
    const full = path.join(repoRoot, rf);
    if (existsSync(full)) files.push(full);
  }

  // 2. docs 活跃目录（排除 archive/ 与 assets/）
  function walkDir(dir: string) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'archive' || entry.name === 'assets') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(full);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(full);
      }
    }
  }

  const docsDir = path.join(repoRoot, 'docs');
  if (existsSync(docsDir)) {
    walkDir(docsDir);
  }

  // 3. apps & ops 目录 README
  const extraDocs = [
    path.join(repoRoot, 'apps/agent/README.md'),
    path.join(repoRoot, 'ops/windows/README.md'),
  ];
  for (const ef of extraDocs) {
    if (existsSync(ef)) files.push(ef);
  }

  return files;
}

// 抽取并验证单文件内的链接
function verifyFileLinks(filePath: string): LinkError[] {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const errors: LinkError[] = [];

  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // 跳过代码块内容 (``` ... ```)
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    // 剔除行内代码 `...`，防止示例文档中的语法演示（如 `[text](note.md)`）被误判为实际链接
    const sanitizedLine = line.replace(/`[^`]+`/g, '');

    // 匹配 Markdown 链接 [text](url)
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match: RegExpExecArray | null;

    while ((match = linkRegex.exec(sanitizedLine)) !== null) {
      const text = match[1];
      const rawTarget = match[2].trim();

      // 忽略外部网络链接、邮箱及纯锚点链接
      if (
        rawTarget.startsWith('http://') ||
        rawTarget.startsWith('https://') ||
        rawTarget.startsWith('mailto:') ||
        rawTarget.startsWith('#')
      ) {
        continue;
      }

      // 剔除哈希与查询参数（如 path/to.md#section?foo=bar）
      let cleanTarget = rawTarget.split('#')[0].split('?')[0].trim();
      if (!cleanTarget) continue;

      try {
        cleanTarget = decodeURIComponent(cleanTarget);
      } catch {
        // 解码失败时沿用原文
      }

      let resolvedPath: string;
      if (cleanTarget.startsWith('/')) {
        resolvedPath = path.join(repoRoot, cleanTarget);
      } else {
        resolvedPath = path.resolve(path.dirname(filePath), cleanTarget);
      }

      if (!existsSync(resolvedPath)) {
        errors.push({
          file: path.relative(repoRoot, filePath),
          line: lineNum,
          text,
          target: rawTarget,
          resolvedPath: path.relative(repoRoot, resolvedPath),
        });
      }
    }
  }

  return errors;
}

// 检查单一活跃待办源（非 archive 目录下不应有遗留的独立 TODO 队列）
function verifySingleActiveTodo(): TodoError[] {
  const errors: TodoError[] = [];
  const docsDir = path.join(repoRoot, 'docs');
  if (!existsSync(docsDir)) return errors;

  const entries = readdirSync(docsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name.startsWith('TODO-') && entry.name.endsWith('.md')) {
      errors.push({
        file: `docs/${entry.name}`,
        message: `发现未归档的独立 TODO 文件。根 to-do.md 为唯一原子进度源，所有历史待办应移入 docs/archive/。`,
      });
    }
  }

  return errors;
}

async function main() {
  console.log('🔍 开始执行全仓现行文档链接与待办状态一致性校验...\n');

  const files = collectActiveDocFiles();
  const linkErrors: LinkError[] = [];

  for (const f of files) {
    const errs = verifyFileLinks(f);
    if (errs.length > 0) {
      linkErrors.push(...errs);
    }
  }

  const todoErrors = verifySingleActiveTodo();

  // 报告汇总
  console.log(`已扫描活跃 Markdown 文档: ${files.length} 个`);

  if (linkErrors.length > 0) {
    console.error(`\n❌ 发现 ${linkErrors.length} 处失效链接 (404 Dead Links):`);
    for (const err of linkErrors) {
      console.error(`  - ${err.file}:${err.line} -> "${err.target}" (解析路径: ${err.resolvedPath})`);
    }
  }

  if (todoErrors.length > 0) {
    console.error(`\n❌ 违反单一活跃待办源原则 (${todoErrors.length} 项):`);
    for (const err of todoErrors) {
      console.error(`  - ${err.file}: ${err.message}`);
    }
  }

  if (linkErrors.length > 0 || todoErrors.length > 0) {
    console.error('\n💥 文档校验失败，请修复上述问题后重试。');
    process.exit(1);
  }

  console.log('✔ 文档链接与单一待办源校验全部通过 (Zero Dead Links & Single SSOT Todo)。');
}

void main();
