/** 公开站极简主导航：4 个主入口（文章 / 探索 / 图谱 / 提问）+ utility 关于。 */
import type { LucideIcon } from 'lucide-react';
import {
  Compass,
  MessageCircleQuestion,
  Network,
  PenLine,
} from 'lucide-react';
import { dualEntry } from './dual-entry';
import { WEB_ROUTES } from './routes';

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export const primaryNavItems: readonly NavItem[] = [
  { label: dualEntry.browse.label, href: dualEntry.browse.path, icon: PenLine },
  { label: '探索', href: WEB_ROUTES.explore, icon: Compass },
  { label: '图谱', href: WEB_ROUTES.graph, icon: Network },
  { label: dualEntry.ask.label, href: dualEntry.ask.path, icon: MessageCircleQuestion },
];

export const utilityAboutItem = {
  label: '关于',
  href: WEB_ROUTES.me,
} as const;
