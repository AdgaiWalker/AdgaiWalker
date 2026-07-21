/**
 * 双入口小生产 + 触感：可复现验收（依赖本机已起 api/web）
 * 用法：node scripts/accept-dual-entry.mjs
 * 环境：API_BASE ADMIN_API_TOKEN WEB_BASE（可选）
 */
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = process.env.API_BASE || 'http://127.0.0.1:8788';
const WEB = process.env.WEB_BASE || 'http://127.0.0.1:5173';
const ADMIN = process.env.ADMIN_BASE || 'http://127.0.0.1:5174';

function loadToken() {
  if (process.env.ADMIN_API_TOKEN) return process.env.ADMIN_API_TOKEN;
  const envPath = path.join(root, 'apps/api/.env');
  if (!fs.existsSync(envPath)) return '';
  const line = fs
    .readFileSync(envPath, 'utf8')
    .split('\n')
    .find((l) => l.startsWith('ADMIN_API_TOKEN='));
  return line ? line.slice('ADMIN_API_TOKEN='.length).trim() : '';
}

const TOKEN = loadToken();
let failed = 0;
const report = [];

function pass(name, detail = '') {
  report.push({ name, ok: true, detail });
  console.log('PASS', name, detail ? `— ${detail}` : '');
}
function fail(name, detail = '') {
  failed += 1;
  report.push({ name, ok: false, detail });
  console.error('FAIL', name, detail ? `— ${detail}` : '');
}

async function json(url, init = {}) {
  const res = await fetch(url, init);
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { res, body };
}

async function main() {
  const health = await json(`${API}/health`);
  if (health.res.ok && health.body?.ok) pass('A8-health', JSON.stringify(health.body));
  else fail('A8-health', String(health.res.status));

  const noAuth = await json(`${API}/clues`);
  if (noAuth.res.status === 401 || noAuth.res.status === 403) {
    pass('A6-无令牌拒绝', String(noAuth.res.status));
  } else fail('A6-无令牌拒绝', String(noAuth.res.status));

  if (!TOKEN || TOKEN.length < 16) {
    fail('A2-令牌', '缺少 ADMIN_API_TOKEN');
  } else {
    const auth = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
    const clue = await json(`${API}/clues`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ body: '验收脚本热记：双入口闭环自动跑通一次' }),
    });
    if (!clue.res.ok) fail('A2-建线索', JSON.stringify(clue.body));
    else {
      const clueId = clue.body.id;
      await json(`${API}/clues/${clueId}/pool`, {
        method: 'PATCH',
        headers: auth,
        body: JSON.stringify({ poolStatus: 'in-pool' }),
      });
      const seed = await json(`${API}/seeds`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ title: `验收题苗 ${Date.now()}` }),
      });
      const seedId = seed.body?.id;
      const promoted = await json(`${API}/seeds/${seedId}/promote`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ clueId }),
      });
      if (!promoted.res.ok) fail('A2-主选', JSON.stringify(promoted.body));
      else {
        const exList = await json(`${API}/executions`, { headers: auth });
        const ex = (exList.body || []).find((e) => e.seedId === seedId);
        if (!ex) fail('A2-执行卡', 'promote 后无 execution');
        else {
          await json(`${API}/executions/${ex.id}/deliver`, {
            method: 'POST',
            headers: auth,
            body: JSON.stringify({ url: `${WEB}/posts` }),
          });
          const rev = await json(`${API}/executions/${ex.id}/review`, {
            method: 'POST',
            headers: auth,
            body: JSON.stringify({ outcome: 'yes' }),
          });
          if (rev.res.ok && rev.body?.countable !== false) {
            pass('A2-可计数闭环', `execution=${ex.id.slice(0, 10)}`);
          } else fail('A2-可计数闭环', JSON.stringify(rev.body));
        }
      }
    }
  }

  if (TOKEN && TOKEN.length >= 16) {
    const m = await json(`${API}/metrics`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (m.res.ok && m.body?.clueSources?.byBucket) {
      pass('A11-来源分桶', JSON.stringify(m.body.clueSources.byBucket));
    } else fail('A11-来源分桶', JSON.stringify(m.body)?.slice(0, 160));
  }

  const jar = path.join(root, 'tmp', 'accept-anon.jar');
  fs.mkdirSync(path.dirname(jar), { recursive: true });
  try {
    fs.unlinkSync(jar);
  } catch {}
  const intake1 = spawnSync(
    'curl',
    [
      '-s',
      '-c',
      jar,
      '-b',
      jar,
      '-H',
      'Content-Type: application/json',
      '-d',
      JSON.stringify({ body: '验收卡口第一次：关 AI 也要有 nextStep 足够长' }),
      '-w',
      '\n%{http_code}',
      `${API}/intake`,
    ],
    { encoding: 'utf8' },
  );
  const lines1 = intake1.stdout.trim().split('\n');
  const code1 = lines1.pop();
  let body1 = {};
  try {
    body1 = JSON.parse(lines1.join('\n'));
  } catch {}
  if (code1 === '201' && (body1.nextStep || '').length >= 4) {
    pass('A3-规则 nextStep', body1.nextStep.slice(0, 40));
  } else fail('A3-规则 nextStep', intake1.stdout.slice(0, 200));

  const intake2 = spawnSync(
    'curl',
    [
      '-s',
      '-c',
      jar,
      '-b',
      jar,
      '-H',
      'Content-Type: application/json',
      '-d',
      JSON.stringify({ body: '验收卡口第二次应被游客配额拦住足够长' }),
      '-w',
      '\n%{http_code}',
      `${API}/intake`,
    ],
    { encoding: 'utf8' },
  );
  const lines2 = intake2.stdout.trim().split('\n');
  const code2 = lines2.pop();
  let body2 = {};
  try {
    body2 = JSON.parse(lines2.join('\n'));
  } catch {}
  if (code2 === '429' && body2.code === 'guest-quota-exceeded') {
    pass('A4-配额失败', body2.message || body2.code);
  } else fail('A4-配额失败', intake2.stdout.slice(0, 200));

  const contentPath = path.join(root, 'apps/web/src/generated/content.json');
  if (fs.existsSync(contentPath)) {
    const content = JSON.parse(fs.readFileSync(contentPath, 'utf8'));
    const items = content.items || content.posts || content;
    const list = Array.isArray(items) ? items : [];
    const published = list.filter((i) => i.published !== false).slice(0, 3);
    if (published.length >= 3 && published.every((i) => i.title && (i.body || i.slug))) {
      pass('A5-内容底线', `抽样 ${published.length} 篇有 title`);
    } else fail('A5-内容底线', `count=${published.length}`);
  } else fail('A5-内容底线', 'content.json 不存在');

  const dualEntry = path.join(root, 'apps/web/src/shared/dual-entry.ts');
  if (fs.existsSync(dualEntry)) {
    const de = fs.readFileSync(dualEntry, 'utf8');
    if (de.includes("path: '/tools'") && de.includes("path: '/posts'")) {
      pass('A1-双入口配置', '卡/tools + 逛/posts');
    } else fail('A1-双入口配置', '路径缺失');
    pass('逻辑分离', 'dual-entry.ts 存在');
  } else {
    fail('A1-双入口配置', 'dual-entry.ts 缺失');
    fail('逻辑分离', 'dual-entry.ts 缺失');
  }

  const tactile = path.join(root, 'apps/web/src/styles/walker.css');
  const css = fs.readFileSync(tactile, 'utf8');
  if (css.includes('--press-scale') && css.includes('btn-primary:active')) {
    pass('B3-press token', '--press-scale + :active');
  } else fail('B3-press token');
  if (css.includes('prefers-reduced-motion')) pass('B8-reduced-motion');
  else fail('B8-reduced-motion');

  // Admin UI 登录 + 线索页
  try {
    const require = createRequire(
      path.join(
        process.env.HOME || '',
        '.local/node/lib/node_modules/devloop-mcp/package.json',
      ),
    );
    const puppeteer = require('puppeteer');
    const chrome =
      process.env.PUPPETEER_EXECUTABLE_PATH ||
      path.join(
        process.env.HOME || '',
        '.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
      );
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: fs.existsSync(chrome) ? chrome : undefined,
      args: ['--no-sandbox'],
    });
    const page = await browser.newPage();
    await page.goto(`${ADMIN}/login`, { waitUntil: 'networkidle0', timeout: 20000 });
    if (TOKEN) {
      await page.type('#token', TOKEN);
      await page.click('button');
      await page.waitForFunction(() => location.pathname.includes('clues'), {
        timeout: 8000,
      });
    }
    const h1 = await page.$eval('h1', (el) => el.textContent).catch(() => '');
    const deferred = await page
      .$eval('nav', (el) => el.textContent)
      .catch(() => '');
    if (h1 === '线索') pass('A9-Admin 线索页', h1);
    else fail('A9-Admin 线索页', h1);
    if (deferred.includes('未迁')) pass('A9-未迁说明');
    else fail('A9-未迁说明');

    await page.goto(`${WEB}/`, { waitUntil: 'networkidle0', timeout: 20000 });
    const cta = await page.$eval('a.btn-primary', (el) => ({
      text: el.textContent.replace(/\s+/g, ' ').trim(),
      href: el.getAttribute('href'),
    }));
    if (cta.href === '/tools' && cta.text.includes('卡住')) pass('B1-主控件', JSON.stringify(cta));
    else fail('B1-主控件', JSON.stringify(cta));

    await page.goto(`${WEB}/tools`, { waitUntil: 'networkidle0', timeout: 20000 });
    await page.focus('#need');
    await page.evaluate(() => {
      const el = document.querySelector('#need');
      if (!el) return;
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value',
      )?.set;
      setter?.call(el, '短');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await new Promise((r) => setTimeout(r, 100));
    const disabledShort = await page.$eval(
      '.instrument-actions button.btn-primary',
      (el) => el.disabled,
    );
    if (disabledShort) pass('校验-短文禁用');
    else fail('校验-短文禁用');

    await browser.close();
  } catch (e) {
    fail('浏览器验收', e instanceof Error ? e.message : String(e));
  }

  const outDir = path.join(root, 'tmp');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'accept-dual-entry.json'),
    JSON.stringify({ at: new Date().toISOString(), API, WEB, ADMIN, report }, null, 2),
  );

  console.log(
    failed === 0
      ? `\n验收 PASS (${report.length})`
      : `\n验收 FAIL ${failed}/${report.length}`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
