/**
 * build-web — content:gen → vite build → prerender → pagefind
 * 依赖：run、paths；调用：prerender-web
 * 触发：pnpm build:web
 */
import { spawnSync } from 'node:child_process';
import { repoRoot } from './lib/paths';
import { runOrExit } from './lib/run';

runOrExit('pnpm', ['check:content-fields']);
runOrExit('pnpm', ['content:gen']);
// 代码图谱产物（PRD-CODE-GRAPH §数据流）：与内容产物同一时机生成，web 只读
runOrExit('pnpm', ['code:gen']);
// 结构体检门禁：排在 vite 之前，违规就别浪费时间打包
runOrExit('pnpm', ['verify:architecture']);
runOrExit('pnpm', ['--filter', '@walker/web', 'build']);
runOrExit('pnpm', ['exec', 'tsx', 'scripts/prerender-web.ts']);
runOrExit('pnpm', ['exec', 'tsx', 'scripts/emit-static-feeds.ts']);
runOrExit('pnpm', ['exec', 'tsx', 'scripts/verify-geo.ts']);

const pf = spawnSync(
  'pnpm',
  ['exec', 'pagefind', '--site', 'apps/web/dist', '--output-path', 'apps/web/dist/pagefind'],
  { cwd: repoRoot, stdio: 'inherit', shell: process.platform === 'win32' },
);
if (pf.status !== 0) {
  console.error('pagefind failed');
  process.exit(pf.status ?? 1);
}
console.log('build:web complete (vite + prerender + feeds + pagefind)');
