/** 访客站主导航：提问按钮独立于四个内容入口。 */
import type { LucideIcon } from 'lucide-react';
import { Bookmark, Compass, PenLine, User } from 'lucide-react';
import { dualEntry } from './dual-entry';
import { WEB_ROUTES } from './routes';

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  primary?: boolean;
  children?: readonly NavItem[];
};

export type NavGroup = {
  title: string;
  items: NavItem[];
};

export const sidebarNavGroups: NavGroup[] = [{
  title: '',
  items: [
    { label: '探索', href: WEB_ROUTES.explore, icon: Compass, primary: true },
    { label: dualEntry.browse.label, href: dualEntry.browse.path, icon: PenLine },
    { label: '资源', href: WEB_ROUTES.toolsResources, icon: Bookmark },
    { label: '关于', href: WEB_ROUTES.me, icon: User },
  ],
}];

export const sidebarFooterLinks: readonly { label: string; href: string }[] = [];
