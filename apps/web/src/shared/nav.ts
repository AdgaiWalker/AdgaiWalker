/**
 * nav — 侧栏
 * 读 · 拿 · 实验 · 关于（站 / 我→硬件 / 支持）
 */
import type { LucideIcon } from 'lucide-react';
import {
  Bookmark,
  BookOpen,
  Compass,
  Cpu,
  FlaskConical,
  Globe,
  Heart,
  MessageCircle,
  PenLine,
  User,
} from 'lucide-react';
import { dualEntry } from './dual-entry';
import { WEB_ROUTES } from './routes';

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  primary?: boolean;
  /** 二级项（挂在「我」下等） */
  children?: readonly NavItem[];
};

export type NavGroup = {
  title: string;
  items: NavItem[];
};

export const readNavGroup: NavGroup = {
  title: '',
  items: [
    {
      label: dualEntry.browse.label,
      href: dualEntry.browse.path,
      icon: PenLine,
      primary: true,
    },
    {
      label: '小影',
      href: WEB_ROUTES.assistant,
      icon: MessageCircle,
    },
  ],
};

export const useNavGroup: NavGroup = {
  title: '拿',
  items: [
    {
      label: '资源',
      href: WEB_ROUTES.toolsResources,
      icon: Bookmark,
    },
    {
      label: '教程',
      href: WEB_ROUTES.tutorials,
      icon: BookOpen,
    },
  ],
};

export const experimentNavGroup: NavGroup = {
  title: '实验',
  items: [
    {
      label: '探索',
      href: WEB_ROUTES.explore,
      icon: Compass,
    },
    {
      label: '札记',
      href: WEB_ROUTES.lab,
      icon: FlaskConical,
    },
  ],
};

/** 关于：站 · 我（下挂硬件）· 支持 */
export const aboutNavGroup: NavGroup = {
  title: '关于',
  items: [
    {
      label: '站',
      href: WEB_ROUTES.about,
      icon: Globe,
    },
    {
      label: '我',
      href: WEB_ROUTES.me,
      icon: User,
      children: [
        {
          label: '硬件',
          href: WEB_ROUTES.gear,
          icon: Cpu,
        },
      ],
    },
    {
      label: '支持',
      href: WEB_ROUTES.support,
      icon: Heart,
    },
  ],
};

export const sidebarNavGroups: NavGroup[] = [
  readNavGroup,
  useNavGroup,
  experimentNavGroup,
  aboutNavGroup,
];

export const sidebarFooterLinks: readonly { label: string; href: string }[] =
  [];
