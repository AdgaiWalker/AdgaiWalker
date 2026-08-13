/**
 * 公开站身份与 URL 单一配置。
 * 构建脚本共用，避免 sitemap / canonical / feeds 各写一套域名与作者。
 */
export const SITE_ORIGIN = 'https://www.iwalk.pro';
export const SITE_NAME = 'Walker';
export const SITE_TITLE = 'Walker · 用 AI 走自己的路';
export const SITE_DESCRIPTION =
  'duola 的个人知识与行动样板站：把真实卡点变成可检验的下一步，把走过的路收成教程、资源、项目与札记。';
export const SITE_LANGUAGE = 'zh-CN';

/** 这些路由在构建期拥有独立静态正文与 metadata，可以进入 sitemap。 */
export const INDEXABLE_STATIC_ROUTES = [
  '/',
  '/posts',
  '/tutorials',
  '/learn',
  '/ideas',
  '/projects',
  '/projects/ferry',
  '/lab',
  '/advance',
  '/tools/resources',
  '/gear',
  '/about',
  '/me',
] as const;

/** 有独立首屏、但不进 sitemap 的客户端路由。禁止 rewrite 到首页 HTML。 */
export const SPA_SHELL_ROUTES = [
  {
    pathname: '/tools',
    title: '卡 · Walker',
    heading: '你卡在哪？',
    description: '说清一个真实卡点，拿到可以立即开始的下一步。',
  },
  {
    pathname: '/support',
    title: '支持 · Walker',
    heading: '支持 / 赞赏',
    description: '支持 Walker 继续记录、实践与公开分享。',
  },
  {
    pathname: '/login',
    title: '登录 · Walker',
    heading: '账号',
    description: 'Walker 账户入口。',
  },
  {
    pathname: '/exchange',
    title: '交换 · Walker',
    heading: '交换',
    description: '围绕真实问题、成果与经验建立联系。',
  },
] as const;

/** 旧兼容路径：生产必须 301，禁止先吐首页再靠客户端跳。 */
export const LEGACY_REDIRECTS = [
  { source: '/condition', destination: '/tutorials' },
  { source: '/kit', destination: '/tutorials' },
  { source: '/showcase', destination: '/projects' },
  { source: '/content', destination: '/posts' },
  { source: '/ideas/new', destination: '/tools' },
] as const;

/** Walker 是站名；人是 duola。 */
export const AUTHOR = {
  name: 'duola',
  url: `${SITE_ORIGIN}/me`,
  image: `${SITE_ORIGIN}/images/duola.jpg`,
} as const;

export function absoluteUrl(pathname: string): string {
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${SITE_ORIGIN}${path === '/' ? '/' : path.replace(/\/$/, '')}`;
}
