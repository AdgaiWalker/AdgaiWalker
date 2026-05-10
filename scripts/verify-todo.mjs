import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));

const checks = [];

function check(name, predicate) {
  checks.push({ name, ok: Boolean(predicate()) });
}

check('404 page exists and uses Base layout', () => {
  if (!exists('src/pages/404.astro')) return false;
  const page = read('src/pages/404.astro');
  return page.includes("import Base") && page.includes('返回首页') && page.includes('lucide:');
});

check('coral color is defined in Tailwind theme', () => read('src/styles/global.css').includes('--color-coral:'));

check('custom cursor and reading mode duplicate CSS blocks are consolidated', () => {
  const css = read('src/styles/global.css');
  const cursorBlocks = css.match(/^#custom-cursor\s*\{/gm) ?? [];
  const readingPanelBlocks = css.match(/^\.reading-mode nav,\s*\n\.reading-mode \.panel-glass\s*\{/gm) ?? [];
  return cursorBlocks.length === 1 && readingPanelBlocks.length === 1;
});

check('site is configured for iwalk.pro', () => read('astro.config.mjs').includes("site: 'https://iwalk.pro'"));

check('fonts use the domestic Google Fonts mirror', () => {
  const base = read('src/layouts/Base.astro');
  return base.includes('fonts.googleapis.cn') && !base.includes('fonts.googleapis.com');
});

check('social links and email are real addresses', () => {
  const source = ['src/pages/index.astro', 'src/components/SocialLinks.astro', 'src/components/Navigation.astro']
    .map(read)
    .join('\n');
  return source.includes('https://v.douyin.com/8wQaZ_xO0JA/')
    && source.includes('https://github.com/AdgaiWalker')
    && source.includes('https://space.bilibili.com/1029612512')
    && source.includes('https://www.xiaohongshu.com/user/profile/689dd905000000001802921e')
    && source.includes('https://zhihu.com/people/aigcqiuzhi')
    && source.includes('praxiswalker@gmail.com')
    && !source.includes('href="#"')
    && !source.includes('contact@example.com');
});

check('Base layout emits Open Graph, Twitter Card, canonical, and RSS discovery tags', () => {
  const base = read('src/layouts/Base.astro');
  return ['og:title', 'og:description', 'og:image', 'og:url', 'og:type', 'twitter:card', 'twitter:title', 'twitter:image', 'rel="canonical"', 'application/rss+xml']
    .every((needle) => base.includes(needle));
});

check('log detail page passes article OG fields', () => {
  const page = read('src/pages/log/[...slug].astro');
  return page.includes('ogTitle={entry.data.title}') && page.includes('ogDescription={entry.data.summary ?? entry.data.description');
});

check('RSS route and dependency are present', () => {
  const pkg = JSON.parse(read('package.json'));
  return exists('src/pages/rss.xml.ts') && Boolean(pkg.dependencies?.['@astrojs/rss']);
});

check('sitemap integration and robots.txt are present', () => {
  const pkg = JSON.parse(read('package.json'));
  return Boolean(pkg.dependencies?.['@astrojs/sitemap'])
    && read('astro.config.mjs').includes('sitemap()')
    && exists('public/robots.txt')
    && read('public/robots.txt').includes('https://iwalk.pro/sitemap-index.xml');
});

check('unused components were removed', () => {
  const removed = [
    'ClockWidget.astro',
    'HeroBanner.astro',
    'HeroVideo.astro',
    'SectionCard.astro',
    'ActivityFeed.astro',
    'IdeaTagFilter.astro',
    'DockCategoryFilter.astro',
    'DimensionFilter.astro',
    'PlatformFilter.astro',
    'TagFilter.astro',
    'HarborAbout.astro',
    'DomainEntries.astro',
    'LatestContent.astro',
  ];
  return removed.every((file) => !exists(`src/components/${file}`));
});

check('log schema includes optional summary', () => read('src/content.config.ts').includes('summary: z.string().optional()'));

check('WalkerProfile navigation labels are updated', () => {
  const profile = read('src/components/WalkerProfile.astro');
  return profile.includes('航海日志') && profile.includes('补给舱') && profile.includes('指南针')
    && !profile.includes('近期文章') && !profile.includes('推荐分享') && !profile.includes('优秀博客');
});

check('Supabase likes front end and API are wired', () => {
  const pkg = JSON.parse(read('package.json'));
  return exists('src/components/LikeCounter.astro')
    && exists('src/pages/api/likes.ts')
    && Boolean(pkg.dependencies?.['@supabase/supabase-js'])
    && read('src/pages/index.astro').includes('LikeCounter');
});

const failed = checks.filter((item) => !item.ok);

for (const item of checks) {
  console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.name}`);
}

if (failed.length) {
  console.error(`\n${failed.length} todo acceptance check(s) failed.`);
  process.exit(1);
}
