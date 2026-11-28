/**
 * 公开站身份与 URL 单一配置。
 * 构建脚本共用，避免 sitemap / canonical / feeds 各写一套域名与作者。
 */
import {
  SITE_AUTHOR,
  SITE_DESCRIPTION,
  SITE_LANGUAGE,
  SITE_NAME,
  SITE_ORIGIN,
  SITE_ROUTE_METADATA,
  SITE_TITLE,
  siteAbsoluteUrl,
} from '../../packages/shared/src/site-identity';
import { LEGACY_REDIRECTS } from '../../apps/web/src/shared/routes';

export { SITE_ORIGIN, SITE_NAME, SITE_TITLE, SITE_DESCRIPTION, SITE_LANGUAGE };

/** 这些路由在构建期拥有独立静态正文与 metadata，可以进入 sitemap。 */
export const INDEXABLE_STATIC_ROUTES = ['/', '/posts', '/graph', '/me'] as const;

const SPA_SHELL_PATHS = ['/tools', '/tools/result'] as const;

/** 有独立首屏、但不进 sitemap 的客户端路由。禁止 rewrite 到首页 HTML。 */
export const SPA_SHELL_ROUTES = SPA_SHELL_PATHS.map((pathname) => {
  const meta = SITE_ROUTE_METADATA[pathname]!;
  return {
    pathname,
    title: meta.title,
    heading: meta.heading ?? meta.title,
    description: meta.description,
  };
});

/** 旧兼容路径：生产必须 301，禁止先吐首页再靠客户端跳（SSOT 在 web routes，vercel.json 由 web 测试守护）。 */
export { LEGACY_REDIRECTS };

/** Walker 是站名；人是 Dora。 */
export const AUTHOR = SITE_AUTHOR;

export const absoluteUrl = siteAbsoluteUrl;
