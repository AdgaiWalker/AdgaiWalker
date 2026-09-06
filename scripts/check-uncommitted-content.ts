/**
 * 部署前内容保护检查
 * 用途：在 git pull / git reset --hard 之前运行，确认 content/ 与生成物没有
 * 未提交修改、也没有未推送的内容提交。Admin 保存的文章直接写 content/log，
 * 一旦 reset --hard 到远端即永久丢失，本脚本把这条人工记忆变成可执行门禁。
 *
 * 触发：pnpm check:content-dirty
 * 退出码：0 = 安全可拉代码；1 = 存在未发布内容，必须先发布或备份，禁止覆盖。
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const CONTENT_PATHS = ['content', 'apps/web/src/generated/content.json'] as const;

function git(args: string[]): { status: number; stdout: string } {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', shell: false });
  return { status: r.status ?? 1, stdout: r.stdout ?? '' };
}

function main(): void {
  let blocked = false;

  // 1) 未提交的内容修改 / 新文件
  const status = git(['status', '--porcelain', ...CONTENT_PATHS]);
  const dirty = status.stdout.split('\n').map((l) => l.trim()).filter(Boolean);
  if (dirty.length > 0) {
    blocked = true;
    console.error(`[内容保护] content/ 下有 ${dirty.length} 条未提交变更：`);
    for (const line of dirty) console.error(`  ${line}`);
    console.error('  → 先发布（pnpm content:publish --push）或备份到 data 目录，再拉代码。');
  }

  // 2) 已提交但未推送的内容提交（reset --hard origin/main 同样会丢掉它们）
  const unpushed = git(['log', 'origin/main..HEAD', '--oneline', '--', ...CONTENT_PATHS]);
  const unpushedLines = unpushed.stdout.split('\n').map((l) => l.trim()).filter(Boolean);
  if (unpushedLines.length > 0) {
    blocked = true;
    console.error(`[内容保护] 有 ${unpushedLines.length} 个未推送的内容提交：`);
    for (const line of unpushedLines) console.error(`  ${line}`);
    console.error('  → 先 git push origin main（等 Vercel 部署），再拉代码。');
  }

  if (blocked) {
    console.error('\n禁止在本状态下执行 git reset --hard / 强制覆盖——先处理上述内容再继续。');
    process.exit(1);
  }

  console.log('[内容保护] content/ 无未提交、未推送变更，可以安全拉代码。');
}

main();
