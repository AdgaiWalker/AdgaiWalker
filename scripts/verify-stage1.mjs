/**
 * Stage 1 可自动验收脚本（工程门禁）
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;

function ok(msg) {
  console.log('✓', msg);
}
function bad(msg) {
  console.error('✗', msg);
  failed += 1;
}

function mustExist(rel) {
  if (fs.existsSync(path.join(root, rel))) ok(`exists ${rel}`);
  else bad(`missing ${rel}`);
}

mustExist('pnpm-workspace.yaml');
mustExist('apps/web');
mustExist('apps/admin');
mustExist('apps/api');
mustExist('packages/shared');
mustExist('docs/architecture-modules.md');
mustExist('docs/cutover-runbook.md');
mustExist('docs/stage1-retro.md');
mustExist('docs/s1-go-live.md');
mustExist('docs/feature-keys.md');
mustExist('docs/redirects.md');

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (pkg.packageManager?.includes('pnpm')) ok('packageManager pnpm');
else bad('packageManager');
if (pkg.engines?.node?.includes('20')) ok('engines node>=20');
else bad('engines');

const apiPkg = JSON.parse(
  fs.readFileSync(path.join(root, 'apps/api/package.json'), 'utf8'),
);
const deps = { ...apiPkg.dependencies, ...apiPkg.devDependencies };
if (Object.keys(deps).some((k) => /redis/i.test(k))) bad('redis required dep');
else ok('no redis required dep');

// modules doc keywords
const arch = fs.readFileSync(path.join(root, 'docs/architecture-modules.md'), 'utf8');
for (const k of ['依赖', '调用', '触发', '实现']) {
  if (arch.includes(k)) ok(`arch has ${k}`);
  else bad(`arch missing ${k}`);
}

// run tests
function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: true });
  return r.status === 0;
}
if (run('pnpm', ['test:shared'])) ok('shared tests');
else bad('shared tests');
if (run('pnpm', ['test:api'])) ok('api tests');
else bad('api tests');

// build web + check prerender titles + pagefind
if (run('pnpm', ['build:web'])) ok('build:web');
else bad('build:web');

const content = JSON.parse(
  fs.readFileSync(path.join(root, 'apps/web/src/generated/content.json'), 'utf8'),
);
const docs = content.items || content.posts || [];
const sample = docs.slice(0, 3);
for (const d of sample) {
  const htmlPath = path.join(root, 'apps/web/dist/posts', d.slug, 'index.html');
  if (!fs.existsSync(htmlPath)) {
    bad(`prerender missing ${d.slug}`);
    continue;
  }
  const html = fs.readFileSync(htmlPath, 'utf8');
  if (html.includes(d.title)) ok(`title in html: ${d.title.slice(0, 20)}`);
  else bad(`title not in html: ${d.slug}`);
}
if (fs.existsSync(path.join(root, 'apps/web/dist/pagefind'))) ok('pagefind/ exists');
else bad('pagefind/ missing');

console.log(failed === 0 ? '\nStage1 verify PASS' : `\nStage1 verify FAIL (${failed})`);
process.exit(failed === 0 ? 0 : 1);
