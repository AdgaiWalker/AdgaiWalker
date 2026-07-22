/**
 * 内容发布管线
 * 职责：content:gen → 展示 Git 状态 → 可选 commit / push（生产靠 Vercel）。
 *
 * 依赖：git、content:gen
 * 触发：pnpm content:publish [--commit] [--push] [--message "..."]
 * 实现：子进程；默认只 gen+status，不静默改远程
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

function run(
  cmd: string,
  args: string[],
  opts?: { capture?: boolean },
): { status: number; stdout: string } {
  const r = spawnSync(cmd, args, {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
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
  const gen = run('pnpm', ['content:gen']);
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

或手动：
  git add content/log content/support-config.json apps/web/src/generated/content.json
  git commit -m "content: …"
  git push origin main

说明：网站 Admin 改文 ≠ 自动进 GitHub；本脚本是同步入口。
`);
    process.exit(0);
  }

  console.log('\n== 3/3 commit ==');
  const add = run('git', ['add', ...CONTENT_PATHS]);
  if (add.status !== 0) process.exit(add.status);

  const staged = run('git', ['diff', '--cached', '--quiet'], { capture: true });
  // exit 1 means there is a diff
  if (staged.status === 0) {
    console.log('暂存区无内容变更，跳过 commit。');
  } else {
    const c = run('git', ['commit', '-m', message]);
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
