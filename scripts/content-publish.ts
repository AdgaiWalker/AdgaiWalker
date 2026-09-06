/**
 * 内容发布管线
 * 职责：content:gen → 展示 Git 状态 → 可选 commit / push（生产靠 Vercel）。
 *
 * 依赖：git、content:gen
 * 触发：pnpm content:publish [--commit] [--push] [--message "..."]
 * 实现：子进程；默认只 gen+status，不静默改远程
 *
 * 提交边界：commit 用 pathspec 限定内容路径，且暂存区存在无关文件时明确拒绝——
 * 两者共同保证内容提交永不夹带代码改动上线。
 *
 * 说明：Admin 保存只写本机 content/log；要上 www 必须走本脚本或手动 git push。
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const CONTENT_PATHS = [
  'content/log',
  'content/support-config.json',
  'apps/web/src/generated/content.json',
] as const;

function isContentPath(file: string): boolean {
  return CONTENT_PATHS.some((p) => file === p || file.startsWith(`${p}/`));
}

function run(
  cmd: string,
  args: string[],
  opts?: { capture?: boolean; shell?: boolean },
): { status: number; stdout: string } {
  const r = spawnSync(cmd, args, {
    cwd: root,
    encoding: 'utf8',
    // git 在 Windows 是 git.exe，一律免 shell；只有 pnpm（.cmd shim）在 win32 需要 shell，
    // 且其参数为固定常量，不含任何外部文本
    shell: opts?.shell ?? false,
    stdio: opts?.capture ? 'pipe' : 'inherit',
  });
  return {
    status: r.status ?? 1,
    stdout: (r.stdout ?? '') + (r.stderr ?? ''),
  };
}

function parseArgs(argv: string[]) {
  let commit = false;
  let push = false;
  let message = `content: 发布内容 ${new Date().toISOString().slice(0, 10)}`;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--commit') commit = true;
    else if (a === '--push') {
      commit = true;
      push = true;
    } else if (a === '--message' || a === '-m') {
      message = argv[++i] ?? message;
    }
  }
  // 环境变量显式打开（CI/习惯）
  if (process.env.CONTENT_PUBLISH_COMMIT === 'true') commit = true;
  if (process.env.CONTENT_PUBLISH_PUSH === 'true') {
    commit = true;
    push = true;
  }
  return { commit, push, message };
}

function main(): void {
  const { commit, push, message } = parseArgs(process.argv.slice(2));

  console.log('== 1/3 content:gen ==');
  const gen = run('pnpm', ['content:gen'], { shell: process.platform === 'win32' });
  if (gen.status !== 0) process.exit(gen.status);

  console.log('\n== 2/3 Git 状态（内容相关）==');
  run('git', ['status', '--short', ...CONTENT_PATHS]);

  const porcelain = run('git', ['status', '--porcelain', ...CONTENT_PATHS], {
    capture: true,
  });
  const dirty = porcelain.stdout
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (dirty.length === 0) {
    console.log('\n内容路径无未提交变更。生产已与 Git 一致（若已 push）。');
    console.log(
      '提示：Admin 保存只写本机磁盘；要上线必须 commit + push 后等 Vercel。',
    );
    process.exit(0);
  }

  console.log(`\n检测到 ${dirty.length} 条内容相关变更。`);

  if (!commit) {
    console.log(`
== 未提交（安全默认）==
本机已 gen。要同步 GitHub / Vercel，请任选：

  pnpm content:publish --commit
  pnpm content:publish --push

说明：网站 Admin 改文 ≠ 自动进 GitHub；本脚本是同步入口。
`);
    process.exit(0);
  }

  console.log('\n== 3/3 commit ==');

  // 暂存区存在内容路径之外的文件时拒绝提交：即使下面用了 pathspec，也先明确停住，
  // 避免无关改动留在暂存区被误认为已随本次发布处理
  const stagedBefore = run('git', ['diff', '--cached', '--name-only'], { capture: true });
  if (stagedBefore.status !== 0) process.exit(stagedBefore.status);
  const unrelated = stagedBefore.stdout
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((f) => !isContentPath(f));
  if (unrelated.length > 0) {
    console.error(`\n暂存区存在 ${unrelated.length} 个非内容文件，拒绝提交（防止夹带上线）：`);
    for (const f of unrelated) console.error(`  ${f}`);
    console.error('请先单独处理（git commit 或 git restore --staged），再重跑 content:publish。');
    process.exit(1);
  }

  const add = run('git', ['add', ...CONTENT_PATHS]);
  if (add.status !== 0) process.exit(add.status);

  const staged = run('git', ['diff', '--cached', '--quiet'], { capture: true });
  // exit 1 means there is a diff
  if (staged.status === 0) {
    console.log('暂存区无内容变更，跳过 commit。');
  } else {
    // pathspec 限定提交范围：无论暂存区状态如何，提交永远只包含内容路径
    const c = run('git', ['commit', '-m', message, '--', ...CONTENT_PATHS]);
    if (c.status !== 0) process.exit(c.status);
  }

  if (push) {
    console.log('\n== push origin ==');
    const p = run('git', ['push', 'origin', 'HEAD']);
    if (p.status !== 0) process.exit(p.status);
    console.log('已 push。Vercel 将自动部署 web。');
  } else {
    console.log('\n已 commit。上线请再执行：git push origin main');
  }
}

main();
