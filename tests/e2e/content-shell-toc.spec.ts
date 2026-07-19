import { expect, test } from 'playwright/test';

/**
 * H0 内容详情页 Playwright 浏览器验收
 *
 * 覆盖 H0-01 / H0-04 / H0 统一验收：
 *  - 桌面长目录滚动时活跃项进入目录可视区（toc-sidebar-inner）
 *  - 折叠 / 展开 / 刷新恢复四场景
 *  - 移动端 TOC 入口与正文宽度（≤1180px TOC 隐藏，正文不溢出）
 *  - prefers-reduced-motion 无异常（无 GSAP 动画报错、indicator 仍定位）
 *
 * 固定用真实长文 side-hustle-blueprint（8 个 h2/h3 标题，英文 slug 可路由）。
 */

const POST = '/posts/side-hustle-blueprint';

test.describe('H0 桌面 TOC（1440 宽）', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('H0-01：滚动长文章时活跃目录项始终进入目录可视区', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));

    await page.goto(POST);
    await expect(page.locator('#toc-sidebar')).toBeVisible();
    await expect(page.locator('.toc-sidebar-inner')).toBeVisible();

    const tocLinks = page.locator('[data-toc-slug]');
    const count = await tocLinks.count();
    expect(count).toBeGreaterThanOrEqual(5); // 长文章至少 5 个目录项

    // 核心验收：在多个滚动位置，活跃项始终在 toc-sidebar-inner 可视区内。
    // 遍历每个标题滚动到位，检查 active 项是否在容器可视范围。
    for (let i = 0; i < count; i++) {
      const slug = await tocLinks.nth(i).getAttribute('data-toc-slug');
      // 用属性选择器而非 #id，避免数字开头的 id（如 "8-阶段流程"）触发 CSS 选择器语法错误
      await page.locator(`[id="${slug}"]`).scrollIntoViewIfNeeded();
      await page.waitForTimeout(500); // 等 IntersectionObserver + GSAP

      const activeLinks = page.locator('[data-toc-slug].active');
      await expect(activeLinks).toHaveCount(1);

      const inView = await page.evaluate(() => {
        const container = document.querySelector('.toc-sidebar-inner') as HTMLElement | null;
        const active = document.querySelector('[data-toc-slug].active') as HTMLElement | null;
        if (!container || !active) return false;
        const top = active.offsetTop - container.offsetTop;
        return top >= -8 && top <= container.clientHeight + 8;
      });
      expect(inView, `滚动到 ${slug} 时活跃项应在 toc-sidebar-inner 可视区内`).toBe(true);
    }

    // 滚动到文档绝对底部，验证最后一个标题被激活（接近底部逻辑）
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
    await page.waitForTimeout(700);
    const lastSlug = await tocLinks.nth(count - 1).getAttribute('data-toc-slug');
    await expect(page.locator('[data-toc-slug].active')).toHaveAttribute('data-toc-slug', lastSlug!);

    // 滚动回顶部，验证首个标题激活
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(700);
    const firstSlug = await tocLinks.first().getAttribute('data-toc-slug');
    await expect(page.locator('[data-toc-slug].active')).toHaveAttribute('data-toc-slug', firstSlug!);

    expect(errors.filter(m => !m.includes('favicon'))).toEqual([]);
  });

  test('H0-04：折叠 / 展开 / 刷新恢复四场景', async ({ page }) => {
    // 用全新上下文确保 localStorage 干净（不通过 addInitScript，避免 reload 时重复清除）
    const ctx = page.context();
    await ctx.clearCookies();

    await page.goto(POST);
    // goto 后再清 localStorage 并刷新，保证初始是展开态
    await page.evaluate(() => { try { localStorage.removeItem('walker-toc-collapsed'); } catch { /* ignore */ } });

    const sidebar = page.locator('#toc-sidebar');
    const collapseBtn = page.locator('#toc-collapse-btn');
    const expandBtn = page.locator('#toc-expand-btn');

    // 场景 1：默认展开 —— sidebar 可见、collapseBtn 可见、expandBtn 隐藏
    await expect(sidebar).not.toHaveClass(/is-collapsed/);
    await expect(collapseBtn).toBeVisible();
    await expect(expandBtn).toBeHidden();

    // 场景 2：折叠 —— 点 collapse，sidebar 加 is-collapsed、collapseBtn 隐藏、expandBtn 可见
    await collapseBtn.click();
    await expect(sidebar).toHaveClass(/is-collapsed/);
    await expect(collapseBtn).toBeHidden();
    await expect(expandBtn).toBeVisible();
    // localStorage 已写入偏好
    const collapsedStored = await page.evaluate(() => localStorage.getItem('walker-toc-collapsed'));
    expect(collapsedStored).toBe('true');

    // 场景 3：展开 —— 点 expand，恢复展开态
    await expandBtn.click();
    await expect(sidebar).not.toHaveClass(/is-collapsed/);
    await expect(collapseBtn).toBeVisible();
    await expect(expandBtn).toBeHidden();

    // 场景 4：刷新恢复 —— 先折叠，再 reload，刷新后仍为折叠态（偏好持久化）
    await collapseBtn.click();
    await expect(sidebar).toHaveClass(/is-collapsed/);
    await page.reload();
    // 刷新后偏好恢复：sidebar 应带 is-collapsed、expandBtn 可见
    await expect(page.locator('#toc-sidebar')).toHaveClass(/is-collapsed/);
    await expect(page.locator('#toc-expand-btn')).toBeVisible();
  });

  test('H0 统一验收：TOC 位置跟随正文右侧，不挤占正文宽度', async ({ page }) => {
    await page.goto(POST);
    const sidebar = page.locator('#toc-sidebar');
    const content = page.locator('.reading-content');

    await expect(sidebar).toBeVisible();
    // 布局测量需等字体加载 + GSAP 入场动画落定，否则负载下读到过渡态尺寸（flake）。
    await page.evaluate(() => (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready);
    await expect(content).toBeVisible();
    // 等正文宽度稳定（入场动画结束 → 接近 max-width 700）
    await expect.poll(async () => {
      const box = await content.boundingBox();
      return box ? Math.round(box.width) : 0;
    }, { timeout: 5000 }).toBeGreaterThan(600);
    const sidebarBox = await sidebar.boundingBox();
    const contentBox = await content.boundingBox();
    expect(sidebarBox).toBeTruthy();
    expect(contentBox).toBeTruthy();

    // 正文居中且 TOC 在正文右边缘右侧（left > content 右边缘）
    expect(contentBox!.x + contentBox!.width).toBeLessThanOrEqual(sidebarBox!.x + 5);
    // 正文不因 TOC 变窄（接近 max-width 700）
    expect(contentBox!.width).toBeLessThanOrEqual(720);
    // 正文不溢出视口
    expect(contentBox!.x).toBeGreaterThanOrEqual(0);
    expect(contentBox!.x + contentBox!.width).toBeLessThanOrEqual(1440);
  });
});

test.describe('H0 移动端 TOC（375 宽）', () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test('移动端：TOC 隐藏（屏幕放不下），正文宽度不溢出', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));

    await page.goto(POST);
    // ≤1180px 时 TOC 与展开按钮均 display:none
    await expect(page.locator('#toc-sidebar')).toBeHidden();
    await expect(page.locator('#toc-expand-btn')).toBeHidden();

    // 正文不水平溢出
    const content = page.locator('.reading-content');
    await expect(content).toBeVisible();
    const box = await content.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.x).toBeGreaterThanOrEqual(-1);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375 + 1);

    // 反馈区也不溢出（与 content-feedback 测试互补）
    const feedback = page.locator('[data-block-feedback]');
    if (await feedback.isVisible()) {
      const fbBox = await feedback.boundingBox();
      expect(fbBox!.x).toBeGreaterThanOrEqual(-1);
      expect(fbBox!.x + fbBox!.width).toBeLessThanOrEqual(375 + 1);
    }

    expect(errors.filter(m => !m.includes('favicon'))).toEqual([]);
  });
});

test.describe('H0 减少动效（prefers-reduced-motion）', () => {
  test.use({
    viewport: { width: 1440, height: 900 },
    contextOptions: { reducedMotion: 'reduce' as const },
  });

  test('prefers-reduced-motion 下 TOC 高亮与折叠无异常', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));

    await page.goto(POST);
    await expect(page.locator('#toc-sidebar')).toBeVisible();

    // 滚动到中间标题，验证有且仅有一个 active 项（IntersectionObserver 不依赖动画完成）
    const tocLinks = page.locator('[data-toc-slug]');
    const mid = Math.floor((await tocLinks.count()) / 2);
    const midSlug = await tocLinks.nth(mid).getAttribute('data-toc-slug');
    await page.locator(`[id="${midSlug}"]`).scrollIntoViewIfNeeded();
    await page.waitForTimeout(700);
    // reduced-motion 下 active 切换仍正常（可能是 mid 或相邻项，关键是稳定单选）
    await expect(page.locator('[data-toc-slug].active')).toHaveCount(1);
    const activeSlug = await page.locator('[data-toc-slug].active').first().getAttribute('data-toc-slug');
    expect(activeSlug).toBeTruthy();

    // 滚动到末尾，active 跟随变化（证明 reduced-motion 不破坏跟随逻辑）
    const lastSlug = await tocLinks.last().getAttribute('data-toc-slug');
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
    await page.waitForTimeout(700);
    await expect(page.locator('[data-toc-slug].active')).toHaveAttribute('data-toc-slug', lastSlug!);

    // 折叠/展开仍可交互
    await page.locator('#toc-collapse-btn').click();
    await expect(page.locator('#toc-sidebar')).toHaveClass(/is-collapsed/);
    await page.locator('#toc-expand-btn').click();
    await expect(page.locator('#toc-sidebar')).not.toHaveClass(/is-collapsed/);

    // 无 GSAP / 脚本报错（reduced-motion 不应触发未捕获异常）
    expect(errors.filter(m => !m.includes('favicon'))).toEqual([]);
  });
});
