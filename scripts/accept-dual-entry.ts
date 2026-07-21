/**
 * accept-dual-entry — 双入口 + 触感可复现验收（API + 浏览器抽样）
 * 依赖：env / report / paths / puppeteer-launch
 * 触发：pnpm accept:dual-entry（需 api/web/admin 已起）
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { loadAdminToken } from './lib/env';
import {
  contentJsonPath,
  dualEntryPath,
  repoRoot,
  tmpDir,
  walkerCssPath,
} from './lib/paths';
import { launchBrowser } from './lib/puppeteer-launch';
import { createReport } from './lib/report';

const API = process.env.API_BASE || 'http://127.0.0.1:8788';
const WEB = process.env.WEB_BASE || 'http://127.0.0.1:5173';
const ADMIN = process.env.ADMIN_BASE || 'http://127.0.0.1:5174';
const TOKEN = loadAdminToken();
const { pass, fail, writeJson, exitWithSummary } = createReport();

async function json(
  url: string,
  init: RequestInit = {},
): Promise<{ res: Response; body: Record<string, unknown> | null }> {
  const res = await fetch(url, init);
  let body: Record<string, unknown> | null = null;
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = null;
  }
  return { res, body };
}

async function main(): Promise<void> {
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
    const auth = {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    };
    const clue = await json(`${API}/clues`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ body: '验收脚本热记：双入口闭环自动跑通一次' }),
    });
    if (!clue.res.ok) fail('A2-建线索', JSON.stringify(clue.body));
    else {
      const clueId = clue.body?.id as string;
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
      const seedId = seed.body?.id as string | undefined;
      const promoted = await json(`${API}/seeds/${seedId}/promote`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ clueId }),
      });
      if (!promoted.res.ok) fail('A2-主选', JSON.stringify(promoted.body));
      else {
        const exList = await json(`${API}/executions`, { headers: auth });
        const list = (exList.body as unknown as Array<{ id: string; seedId: string }>) || [];
        const ex = list.find((e) => e.seedId === seedId);
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
    const sources = m.body?.clueSources as { byBucket?: unknown } | undefined;
    if (m.res.ok && sources?.byBucket) {
      pass('A11-来源分桶', JSON.stringify(sources.byBucket));
    } else fail('A11-来源分桶', JSON.stringify(m.body)?.slice(0, 160));
  }

  const jar = path.join(tmpDir, 'accept-anon.jar');
  fs.mkdirSync(path.dirname(jar), { recursive: true });
  try {
    fs.unlinkSync(jar);
  } catch {
    /* empty */
  }
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
  const lines1 = (intake1.stdout || '').trim().split('\n');
  const code1 = lines1.pop();
  let body1: { nextStep?: string } = {};
  try {
    body1 = JSON.parse(lines1.join('\n')) as { nextStep?: string };
  } catch {
    /* empty */
  }
  if (code1 === '201' && (body1.nextStep || '').length >= 4) {
    pass('A3-规则 nextStep', (body1.nextStep || '').slice(0, 40));
  } else fail('A3-规则 nextStep', (intake1.stdout || '').slice(0, 200));

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
  const lines2 = (intake2.stdout || '').trim().split('\n');
  const code2 = lines2.pop();
  let body2: { code?: string; message?: string } = {};
  try {
    body2 = JSON.parse(lines2.join('\n')) as { code?: string; message?: string };
  } catch {
    /* empty */
  }
  if (code2 === '429' && body2.code === 'guest-quota-exceeded') {
    pass('A4-配额失败', body2.message || body2.code);
  } else fail('A4-配额失败', (intake2.stdout || '').slice(0, 200));

  if (fs.existsSync(contentJsonPath)) {
    const content = JSON.parse(fs.readFileSync(contentJsonPath, 'utf8')) as {
      items?: Array<{ published?: boolean; title?: string; body?: string; slug?: string }>;
      posts?: Array<{ published?: boolean; title?: string; body?: string; slug?: string }>;
    };
    const items = content.items || content.posts || [];
    const list = Array.isArray(items) ? items : [];
    const published = list.filter((i) => i.published !== false).slice(0, 3);
    if (published.length >= 3 && published.every((i) => i.title && (i.body || i.slug))) {
      pass('A5-内容底线', `抽样 ${published.length} 篇有 title`);
    } else fail('A5-内容底线', `count=${published.length}`);
  } else fail('A5-内容底线', 'content.json 不存在');

  if (fs.existsSync(dualEntryPath)) {
    const de = fs.readFileSync(dualEntryPath, 'utf8');
    if (de.includes("path: '/tools'") && de.includes("path: '/posts'")) {
      pass('A1-双入口配置', '卡/tools + 逛/posts');
    } else fail('A1-双入口配置', '路径缺失');
    pass('逻辑分离', 'dual-entry.ts 存在');
  } else {
    fail('A1-双入口配置', 'dual-entry.ts 缺失');
    fail('逻辑分离', 'dual-entry.ts 缺失');
  }

  const css = fs.readFileSync(walkerCssPath, 'utf8');
  if (css.includes('--press-scale') && css.includes('btn-primary:active')) {
    pass('B3-press token', '--press-scale + :active');
  } else fail('B3-press token');
  if (css.includes('prefers-reduced-motion')) pass('B8-reduced-motion');
  else fail('B8-reduced-motion');

  try {
    const browser = await launchBrowser();
    const page = await browser.newPage();
    await page.goto(`${ADMIN}/login`, { waitUntil: 'networkidle0', timeout: 20000 });
    if (TOKEN) {
      await page.type('#token', TOKEN);
      await page.click('button');
      await page.waitForFunction(() => location.pathname.includes('clues'), {
        timeout: 8000,
      });
    }
    const h1 = await page.$eval('h1', (el) => el.textContent || '').catch(() => '');
    const deferred = await page
      .$eval('nav', (el) => el.textContent || '')
      .catch(() => '');
    if (h1 === '线索') pass('A9-Admin 线索页', h1);
    else fail('A9-Admin 线索页', h1);
    if (deferred.includes('未迁')) pass('A9-未迁说明');
    else fail('A9-未迁说明');

    await page.goto(`${WEB}/`, { waitUntil: 'networkidle0', timeout: 20000 });
    const cta = await page.$eval('a.btn-primary', (el) => ({
      text: (el.textContent || '').replace(/\s+/g, ' ').trim(),
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
      (el) => (el as HTMLButtonElement).disabled,
    );
    if (disabledShort) pass('校验-短文禁用');
    else fail('校验-短文禁用');

    await browser.close();
  } catch (e) {
    fail('浏览器验收', e instanceof Error ? e.message : String(e));
  }

  writeJson('accept-dual-entry.json', { API, WEB, ADMIN, report: undefined, root: repoRoot });
  // re-read createReport items already in writeJson via items key
  exitWithSummary('验收');
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
