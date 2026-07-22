/**
 * accept-dual-entry — 双入口 + 触感可复现验收（API + 浏览器抽样）
 * 依赖：env / report / paths / puppeteer-launch / accept-http
 * 触发：pnpm accept:dual-entry（需 api/web/admin 已起）
 */
import fs from 'node:fs';
import path from 'node:path';
import { curlJsonWithCookie, fetchJson } from './lib/accept-http';
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
const report = createReport();
const { pass, fail } = report;

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

async function assertHealth(): Promise<void> {
  const health = await fetchJson(`${API}/health`);
  if (health.res.ok && health.body?.ok) pass('A8-health', JSON.stringify(health.body));
  else fail('A8-health', String(health.res.status));
}

async function assertAdminOpen(): Promise<void> {
  const open = await fetchJson(`${API}/clues`);
  if (open.res.ok) {
    pass('A6-管理面无令牌可访问', String(open.res.status));
    return;
  }
  fail('A6-管理面无令牌可访问', String(open.res.status));
}

async function assertAdminCountableLoop(): Promise<void> {
  const clue = await fetchJson(`${API}/clues`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ body: '验收脚本热记：双入口闭环自动跑通一次' }),
  });
  if (!clue.res.ok) {
    fail('A2-建线索', JSON.stringify(clue.body));
    return;
  }
  const clueId = clue.body?.id as string;
  await fetchJson(`${API}/clues/${clueId}/pool`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ poolStatus: 'in-pool' }),
  });
  const seed = await fetchJson(`${API}/seeds`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ title: `验收题苗 ${Date.now()}` }),
  });
  const seedId = seed.body?.id as string | undefined;
  const promoted = await fetchJson(`${API}/seeds/${seedId}/promote`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ clueId }),
  });
  if (!promoted.res.ok) {
    fail('A2-主选', JSON.stringify(promoted.body));
    return;
  }
  const exList = await fetchJson(`${API}/executions`);
  const list = (exList.body as unknown as Array<{ id: string; seedId: string }>) || [];
  const ex = list.find((e) => e.seedId === seedId);
  if (!ex) {
    fail('A2-执行卡', 'promote 后无 execution');
    return;
  }
  await fetchJson(`${API}/executions/${ex.id}/deliver`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ url: `${WEB}/posts` }),
  });
  const rev = await fetchJson(`${API}/executions/${ex.id}/review`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ outcome: 'yes' }),
  });
  if (rev.res.ok && rev.body?.countable !== false) {
    pass('A2-可计数闭环', `execution=${ex.id.slice(0, 10)}`);
    return;
  }
  fail('A2-可计数闭环', JSON.stringify(rev.body));
}

async function assertClueSourceBuckets(): Promise<void> {
  const m = await fetchJson(`${API}/metrics`);
  const sources = m.body?.clueSources as { byBucket?: unknown } | undefined;
  if (m.res.ok && sources?.byBucket) {
    pass('A11-来源分桶', JSON.stringify(sources.byBucket));
    return;
  }
  fail('A11-来源分桶', JSON.stringify(m.body)?.slice(0, 160));
}

function assertGuestQuota(): void {
  const jar = path.join(tmpDir, 'accept-anon.jar');
  fs.mkdirSync(path.dirname(jar), { recursive: true });
  try {
    fs.unlinkSync(jar);
  } catch {
    /* empty */
  }

  const first = curlJsonWithCookie(API, jar, {
    body: '验收卡口第一次：关 AI 也要有 nextStep 足够长',
  });
  const nextStep = String(first.body.nextStep || '');
  if (first.httpCode === '201' && nextStep.length >= 4) {
    pass('A3-规则 nextStep', nextStep.slice(0, 40));
  } else {
    fail('A3-规则 nextStep', first.raw.slice(0, 200));
  }

  const second = curlJsonWithCookie(API, jar, {
    body: '验收卡口第二次应被游客配额拦住足够长',
  });
  if (second.httpCode === '429' && second.body.code === 'guest-quota-exceeded') {
    pass('A4-配额失败', String(second.body.message || second.body.code));
    return;
  }
  fail('A4-配额失败', second.raw.slice(0, 200));
}

function assertStaticContentAndDualEntry(): void {
  if (fs.existsSync(contentJsonPath)) {
    const content = JSON.parse(fs.readFileSync(contentJsonPath, 'utf8')) as {
      items?: Array<{ published?: boolean; title?: string; body?: string; slug?: string }>;
      posts?: Array<{ published?: boolean; title?: string; body?: string; slug?: string }>;
    };
    const items = content.items || content.posts || [];
    const published = (Array.isArray(items) ? items : [])
      .filter((i) => i.published !== false)
      .slice(0, 3);
    if (published.length >= 3 && published.every((i) => i.title && (i.body || i.slug))) {
      pass('A5-内容底线', `抽样 ${published.length} 篇有 title`);
    } else {
      fail('A5-内容底线', `count=${published.length}`);
    }
  } else {
    fail('A5-内容底线', 'content.json 不存在');
  }

  if (fs.existsSync(dualEntryPath)) {
    const de = fs.readFileSync(dualEntryPath, 'utf8');
    if (de.includes("path: '/tools'") && de.includes("path: '/posts'")) {
      pass('A1-双入口配置', '卡/tools + 逛/posts');
    } else {
      fail('A1-双入口配置', '路径缺失');
    }
    pass('逻辑分离', 'dual-entry.ts 存在');
  } else {
    fail('A1-双入口配置', 'dual-entry.ts 缺失');
    fail('逻辑分离', 'dual-entry.ts 缺失');
  }

  const css = fs.readFileSync(walkerCssPath, 'utf8');
  if (css.includes('--press-scale') && css.includes('btn-primary:active')) {
    pass('B3-press token', '--press-scale + :active');
  } else {
    fail('B3-press token');
  }
  if (css.includes('prefers-reduced-motion')) pass('B8-reduced-motion');
  else fail('B8-reduced-motion');
}

async function assertBrowserSmoke(): Promise<void> {
  try {
    const browser = await launchBrowser();
    const page = await browser.newPage();
    await page.goto(`${ADMIN}/clues`, { waitUntil: 'networkidle0', timeout: 20000 });
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
    if (cta.href === '/tools' && cta.text.includes('卡住')) {
      pass('B1-主控件', JSON.stringify(cta));
    } else {
      fail('B1-主控件', JSON.stringify(cta));
    }

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
}

async function main(): Promise<void> {
  await assertHealth();
  await assertAdminOpen();
  await assertAdminCountableLoop();
  await assertClueSourceBuckets();
  assertGuestQuota();
  assertStaticContentAndDualEntry();
  await assertBrowserSmoke();

  report.writeJson('accept-dual-entry.json', { API, WEB, ADMIN, root: repoRoot });
  report.exitWithSummary('验收');
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
