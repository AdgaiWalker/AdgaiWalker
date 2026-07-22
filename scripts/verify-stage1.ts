/**
 * verify-stage1 — Stage1 工程门禁（结构 + 测试 + build:web 抽样）
 * 依赖：run、paths
 * 触发：pnpm verify:stage1
 */
import fs from 'node:fs';
import path from 'node:path';
import { contentJsonPath, fromRoot, repoRoot, webDistDir } from './lib/paths';
import { run } from './lib/run';

let failed = 0;

function ok(msg: string): void {
  console.log('✓', msg);
}
function bad(msg: string): void {
  console.error('✗', msg);
  failed += 1;
}

function mustExist(rel: string): void {
  if (fs.existsSync(path.join(repoRoot, rel))) ok(`exists ${rel}`);
  else bad(`missing ${rel}`);
}

mustExist('pnpm-workspace.yaml');
mustExist('apps/web');
mustExist('apps/admin');
mustExist('apps/api');
mustExist('packages/shared');
mustExist('docs/PRODUCT.md');
mustExist('docs/ENGINEERING.md');
mustExist('docs/STATUS.md');
mustExist('docs/api/README.md');

const pkg = JSON.parse(fs.readFileSync(fromRoot('package.json'), 'utf8')) as {
  packageManager?: string;
  engines?: { node?: string };
};
if (pkg.packageManager?.includes('pnpm')) ok('packageManager pnpm');
else bad('packageManager');
if (pkg.engines?.node?.includes('20')) ok('engines node>=20');
else bad('engines');

const apiPkg = JSON.parse(fs.readFileSync(fromRoot('apps/api/package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const deps = { ...apiPkg.dependencies, ...apiPkg.devDependencies };
if (Object.keys(deps).some((k) => /redis/i.test(k))) bad('redis required dep');
else ok('no redis required dep');

const eng = fs.readFileSync(fromRoot('docs/ENGINEERING.md'), 'utf8');
for (const k of ['依赖', '调用', '触发', '实现']) {
  if (eng.includes(k)) ok(`ENGINEERING has ${k}`);
  else bad(`ENGINEERING missing ${k}`);
}

if (run('pnpm', ['test:shared']) === 0) ok('shared tests');
else bad('shared tests');
if (run('pnpm', ['test:api']) === 0) ok('api tests');
else bad('api tests');
if (run('pnpm', ['build:web']) === 0) ok('build:web');
else bad('build:web');

const content = JSON.parse(fs.readFileSync(contentJsonPath, 'utf8')) as {
  items?: Array<{ slug: string; title: string }>;
  posts?: Array<{ slug: string; title: string }>;
};
const docs = content.items || content.posts || [];
for (const d of docs.slice(0, 3)) {
  const htmlPath = path.join(webDistDir, 'posts', d.slug, 'index.html');
  if (!fs.existsSync(htmlPath)) {
    bad(`prerender missing ${d.slug}`);
    continue;
  }
  const html = fs.readFileSync(htmlPath, 'utf8');
  if (html.includes(d.title)) ok(`title in html: ${d.title.slice(0, 20)}`);
  else bad(`title not in html: ${d.slug}`);
}
if (fs.existsSync(path.join(webDistDir, 'pagefind'))) ok('pagefind/ exists');
else bad('pagefind/ missing');

console.log(failed === 0 ? '\nStage1 verify PASS' : `\nStage1 verify FAIL (${failed})`);
process.exit(failed === 0 ? 0 : 1);
