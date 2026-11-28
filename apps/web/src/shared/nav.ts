/** 公开站导航与页脚配置（参考 Felix Rieseberg：关于 / 作品 / 文章 / 在线 + 右侧「问」胶囊）。 */
import { dualEntry } from './dual-entry';
import { WEB_ROUTES } from './routes';

export type NavItem = {
  label: string;
  href: string;
  /** 匹配此路径前缀时点亮当前项；仅锚点跳转不点亮 */
  matchPrefix?: string;
};

export const primaryNavItems: readonly NavItem[] = [
  { label: '关于', href: WEB_ROUTES.me, matchPrefix: WEB_ROUTES.me },
  { label: '作品', href: '/#work' },
  { label: dualEntry.browse.label, href: '/#posts', matchPrefix: dualEntry.browse.path },
  { label: '在线', href: '/#online' },
];

export const footerNavItems: readonly NavItem[] = [
  { label: '首页', href: WEB_ROUTES.home },
  { label: '关于', href: WEB_ROUTES.me },
  { label: '作品', href: '/#work' },
  { label: dualEntry.browse.label, href: dualEntry.browse.path },
  { label: '脉络', href: WEB_ROUTES.graph },
  { label: '在线', href: '/#online' },
];
