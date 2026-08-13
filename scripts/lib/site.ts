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
  '/ideas',
  '/projects',
  '/lab',
  '/tools/resources',
  '/about',
  '/me',
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
