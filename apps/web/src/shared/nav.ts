/**
 * nav — 公开站侧栏分组配置（数据与渲染分离）
 * 依赖：lucide-react、dual-entry
 * 被调用：AppSidebar
 */
import type { LucideIcon } from 'lucide-react';
import {
  Bookmark,
  FolderKanban,
  Heart,
  LayoutGrid,
  Lightbulb,
  Rocket,
  User,
} from 'lucide-react';

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

export const evidenceNavGroup: NavGroup = {
  title: '证据库',
  items: [
    { label: '内容', href: '/content', icon: LayoutGrid, hint: 'Content' },
    { label: '学习', href: '/learn', icon: Rocket, hint: 'Learn' },
    { label: '点子', href: '/ideas', icon: Lightbulb, hint: 'Ideas' },
    { label: '项目', href: '/projects', icon: FolderKanban, hint: 'Projects' },
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
