/**
 * nav — 公开站侧栏分组配置（数据与渲染分离）
 * 证据类型只在逛内分段；侧栏不重复点子/项目/学习。
 */
import type { LucideIcon } from 'lucide-react';
import { Bookmark, Heart, Rocket, User } from 'lucide-react';

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  hint: string;
};

export type NavGroup = {
  title: string;
  items: NavItem[];
};

/** 与「逛」正交的证据深页——非第二总览 */
export const evidenceNavGroup: NavGroup = {
  title: '更多',
  items: [
    { label: 'Ferry', href: '/projects/ferry', icon: Rocket, hint: 'Protocol' },
    { label: '资源', href: '/tools/resources', icon: Bookmark, hint: 'Tools' },
  ],
};

export const siteNavGroup: NavGroup = {
  title: '站',
  items: [
    { label: '关于', href: '/about', icon: User, hint: 'About' },
    { label: '支持', href: '/support', icon: Heart, hint: 'Support' },
  ],
};

export const sidebarNavGroups: NavGroup[] = [evidenceNavGroup, siteNavGroup];
