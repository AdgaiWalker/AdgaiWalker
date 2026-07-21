/**
 * build-web — content:gen → vite build → prerender → pagefind
 * 依赖：run、paths；调用：prerender-web
 * 触发：pnpm build:web
 */
import { spawnSync } from 'node:child_process';
import { repoRoot } from './lib/paths';
import { runOrExit } from './lib/run';

runOrExit('pnpm', ['content:gen']);
runOrExit('pnpm', ['--filter', '@walker/web', 'build']);
runOrExit('pnpm', ['exec', 'tsx', 'scripts/prerender-web.ts']);

const pf = spawnSync(
  'pnpm',
  ['exec', 'pagefind', '--site', 'apps/web/dist', '--output-path', 'apps/web/dist/pagefind'],
  { cwd: repoRoot, stdio: 'inherit', shell: process.platform === 'win32' },
);
if (pf.status !== 0) {
  console.error('pagefind failed');
  process.exit(pf.status ?? 1);
}
console.log('build:web complete (vite + prerender + pagefind)');
