/**
 * accept-deep — 浏览器深度验收：web 双入口触感 + admin 闭环 + A11
 * 依赖：env / report / paths / puppeteer-launch
 * 触发：pnpm accept:deep（前置 api:8788 web:5173 admin:5174）
 */
import { launchBrowser, type PageLike } from './lib/puppeteer-launch';
import { createReport } from './lib/report';

const WEB = process.env.WEB_BASE || 'http://127.0.0.1:5173';
const ADMIN = process.env.ADMIN_BASE || 'http://127.0.0.1:5174';
const API = process.env.API_BASE || 'http://127.0.0.1:8788';
const report = createReport();
const { pass, fail } = report;

function setTextarea(page: PageLike, selector: string, text: string): Promise<void> {
  return page.evaluate(
    (sel: string, value: string) => {
      const el = document.querySelector(sel);
      if (!el) return;
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value',
      )?.set;
      setter?.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
    selector,
    text,
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function assertHomeDualEntry(page: PageLike): Promise<void> {
  await page.goto(`${WEB}/`, { waitUntil: 'networkidle0', timeout: 20000 });
  const home = await page.evaluate(() => ({
    primary: [...document.querySelectorAll('a.btn-primary')].map((a) => ({
      t: (a.textContent || '').trim().replace(/\s+/g, ' '),
      h: a.getAttribute('href'),
    })),
    secondary: [...document.querySelectorAll('a.btn-secondary')].map((a) => ({
      t: (a.textContent || '').trim().replace(/\s+/g, ' '),
      h: a.getAttribute('href'),
    })),
    press: getComputedStyle(document.documentElement).getPropertyValue('--press-scale').trim(),
  }));
  if (home.primary.some((p) => p.h === '/tools' && p.t.includes('卡住'))) pass('home-primary-卡');
  else fail('home-primary-卡', JSON.stringify(home.primary));
  if (home.secondary.some((p) => p.h === '/posts')) pass('home-secondary-逛');
  else fail('home-secondary-逛');
  if (home.press === '0.97') pass('press-scale');
  else fail('press-scale', home.press);
}

async function assertAboutDualEntry(page: PageLike): Promise<void> {
  await page.goto(`${WEB}/about`, { waitUntil: 'networkidle0', timeout: 20000 });
  const about = await page.evaluate(() => ({
    hasCta: !!document.querySelector('a.btn-primary[href="/tools"]'),
    hasBrowse: !!document.querySelector('a.btn-secondary[href="/posts"]'),
    text: document.body.innerText.includes('两种用法'),
  }));
  if (about.hasCta && about.hasBrowse && about.text) pass('about-双入口');
  else fail('about-双入口', JSON.stringify(about));
}

async function assertToolsIntake(page: PageLike): Promise<void> {
  const client = await page.createCDPSession();
  await client.send('Network.clearBrowserCookies');
  await page.goto(`${WEB}/tools`, { waitUntil: 'networkidle0', timeout: 20000 });
  await setTextarea(
    page,
    '#need',
    '深度测试：想学用 AI 写周报，每天只有半小时，请给可执行下一步。',
  );
  await page.click('.instrument-actions button.btn-primary');
  await page.waitForSelector('.success-hero .next-step', { timeout: 12000 });
  const step = await page.$eval('.success-hero .next-step', (el) =>
    (el.textContent || '').trim(),
  );
  if (step.length >= 4) pass('卡-成功nextStep', step.slice(0, 40));
  else fail('卡-成功nextStep', step);

  await setTextarea(page, '#need', '第二次提交应配额失败，需要足够长的文字。');
  await page.click('.instrument-actions button.btn-primary');
  await page.waitForSelector('.alert-fail', { timeout: 12000 });
  const failText = await page.$eval('.alert-fail', (el) => (el.textContent || '').trim());
  if (/游客|配额|用完/.test(failText)) pass('卡-失败态');
  else fail('卡-失败态', failText);

  const nav = await page.evaluate(() => {
    const a = document.querySelector('a.nav-cta-ask');
    const side = document.querySelector('.app-sidebar');
    return {
      active: a?.classList.contains('is-active'),
      blur: side ? getComputedStyle(side).backdropFilter : '',
    };
  });
  if (nav.active && nav.blur.includes('blur')) pass('侧栏-卡active+L1');
  else fail('侧栏-卡active+L1', JSON.stringify(nav));
}

async function assertBrowseDetail(page: PageLike): Promise<void> {
  await page.goto(`${WEB}/posts`, { waitUntil: 'networkidle0', timeout: 20000 });
  const postHref = await page.$eval('main a[href^="/posts/"]', (a) => a.getAttribute('href'));
  await page.goto(`${WEB}${postHref}`, { waitUntil: 'networkidle0', timeout: 20000 });
  const detail = await page.evaluate(() => {
    const end = document.querySelector('.article-end');
    const body = document.querySelector('.article-body, .prose-md');
    const like = document.querySelector('.article-end button');
    return {
      title: document.querySelector('.article-shell h1')?.textContent,
      hasEnd: !!end,
      likeClass: like?.className || '',
      proseLen: body?.textContent?.trim().length || 0,
      endAfter: !!(
        end &&
        body &&
        end.getBoundingClientRect().top > body.getBoundingClientRect().top
      ),
    };
  });
  if (detail.proseLen > 50 && detail.hasEnd && detail.endAfter) {
    pass('逛-详情底线', detail.title?.slice(0, 24) || '');
  } else {
    fail('逛-详情底线', JSON.stringify(detail));
  }
  if (detail.likeClass.includes('btn-ghost')) pass('逛-赞安静');
  else fail('逛-赞安静', detail.likeClass);

  await page.click('.article-end button');
  await sleep(900);
  const likeAfter = await page.$eval('.article-end button', (el) =>
    (el.textContent || '').trim(),
  );
  if (/赞\s*\d+/.test(likeAfter)) pass('点赞', likeAfter);
  else fail('点赞', likeAfter);

  const fb = await page.$('.feedback-quiet button');
  if (fb) {
    await fb.click();
    await sleep(900);
    const done = await page.evaluate(() => document.body.innerText.includes('已收到'));
    if (done) pass('内容反馈');
    else fail('内容反馈');
  } else {
    fail('内容反馈', '无区');
  }

  const scriptsInProse = await page.$$eval('.prose-md script', (els) => els.length);
  if (scriptsInProse === 0) pass('消毒-无script');
  else fail('消毒-无script', String(scriptsInProse));
}

async function assertMobileCta(page: PageLike): Promise<void> {
  await page.setViewport({ width: 390, height: 844, isMobile: true });
  await page.goto(`${WEB}/`, { waitUntil: 'networkidle0', timeout: 20000 });
  const mobileOk = await page.evaluate(() =>
    [...document.querySelectorAll('a.btn-primary')].some((a) => {
      const r = a.getBoundingClientRect();
      return (
        (a.textContent || '').includes('卡住') && r.top >= 0 && r.bottom <= innerHeight
      );
    }),
  );
  if (mobileOk) pass('移动-卡可见');
  else fail('移动-卡可见');
}

async function assertAdminLoop(page: PageLike): Promise<void> {
  await page.setViewport({ width: 1280, height: 900, isMobile: false });
  await page.goto(`${ADMIN}/clues`, { waitUntil: 'networkidle0', timeout: 20000 });

  const hasSource = await page.$('#clue-source');
  if (hasSource) {
    await page.evaluate(() => {
      const sel = document.querySelector('#clue-source') as HTMLSelectElement | null;
      if (sel) {
        sel.value = 'wechat';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    pass('Admin-来源选择器');
  } else {
    fail('Admin-来源选择器');
  }

  await setTextarea(page, 'textarea', '深度Admin闭环：外贴来源线索用于A11分桶。');
  await page.evaluate(() => {
    [...document.querySelectorAll('button')]
      .find((b) => (b.textContent || '').trim() === '入库')
      ?.click();
  });
  await sleep(1000);
  const rows = await page.$$eval('table tbody tr', (trs) => trs.length);
  if (rows > 0) pass('Admin-线索列表', `rows=${rows}`);
  else fail('Admin-线索列表');

  await page.evaluate(() => {
    const buttons = [
      ...document.querySelectorAll<HTMLButtonElement>('table tbody tr:first-child button'),
    ];
    buttons.find((b) => (b.textContent || '').includes('入池'))?.click();
  });
  await sleep(800);

  await page.goto(`${ADMIN}/seeds`, { waitUntil: 'networkidle0', timeout: 20000 });
  await page.type('input', `深度闭环题苗 ${Date.now()}`);
  await page.evaluate(() => {
    [...document.querySelectorAll('button')]
      .find((b) => (b.textContent || '').trim() === '新建')
      ?.click();
  });
  await sleep(1000);
  const promoted = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) =>
      (x.textContent || '').includes('主选'),
    );
    if (!b) return false;
    b.click();
    return true;
  });
  if (promoted) pass('Admin-主选');
  else fail('Admin-主选');
  await sleep(1000);

  await page.goto(`${ADMIN}/executions`, { waitUntil: 'networkidle0', timeout: 20000 });
  await page.evaluate(() => {
    [...document.querySelectorAll('button')]
      .find((b) => (b.textContent || '').trim() === '交付')
      ?.click();
  });
  await sleep(900);
  await page.evaluate(() => {
    [...document.querySelectorAll('button')]
      .find((b) => (b.textContent || '').includes('检验有用'))
      ?.click();
  });
  await sleep(900);
  const msg = await page.evaluate(() => document.body.innerText);
  if (/可计数|已交付|有用/.test(msg)) pass('Admin-交付检验');
  else fail('Admin-交付检验', msg.slice(0, 120));

  await page.goto(`${ADMIN}/metrics`, { waitUntil: 'networkidle0', timeout: 20000 });
  const metricsText = await page.evaluate(() => document.body.innerText);
  if (/线索来源|访客卡口/.test(metricsText)) pass('Admin-A11指标');
  else fail('Admin-A11指标', metricsText.slice(0, 160));

  const mRes = await fetch(`${API}/metrics`);
  const m = (await mRes.json()) as { clueSources?: { byBucket?: unknown } };
  if (m.clueSources?.byBucket) pass('API-clueSources', JSON.stringify(m.clueSources.byBucket));
  else fail('API-clueSources');
}

async function main(): Promise<void> {
  const browser = await launchBrowser({ width: 1280, height: 900 });
  const page = await browser.newPage();
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  await assertHomeDualEntry(page);
  await assertAboutDualEntry(page);
  await assertToolsIntake(page);
  await assertBrowseDetail(page);
  await assertMobileCta(page);
  await assertAdminLoop(page);

  const open = await fetch(`${API}/clues`);
  if (open.ok) pass('API-管理面无令牌可访问');
  else fail('API-管理面无令牌可访问', String(open.status));

  if (pageErrors.length) fail('pageerror', pageErrors.slice(0, 3).join(' | '));
  else pass('无pageerror');

  await browser.close();
  report.writeJson('accept-deep.json', {});
  report.exitWithSummary('DEEP');
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
