import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

run('pnpm', ['content:gen']);
run('pnpm', ['--filter', '@walker/web', 'build']);
run('node', ['scripts/prerender-web.mjs']);
// pagefind 索引
const pf = spawnSync(
  'pnpm',
  ['exec', 'pagefind', '--site', 'apps/web/dist', '--output-path', 'apps/web/dist/pagefind'],
  { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' },
);
if (pf.status !== 0) {
  console.error('pagefind failed');
  process.exit(pf.status ?? 1);
}
console.log('build:web complete (vite + prerender + pagefind)');
