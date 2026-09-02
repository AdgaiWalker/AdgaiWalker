/**
 * 管理端导航（配置层）
 * 过程四面 + 今日 + 内容 + 系统；不迁旧六域。
 */
import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  ClipboardList,
  FileText,
  Inbox,
  LayoutDashboard,
  MessageCircle,
  Server,
  Sprout,
} from 'lucide-react';
import { ADMIN_ROUTES } from './routes';

export type AdminNavItem = {
  path: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
};

export type AdminNavGroup = {
  title: string;
  items: AdminNavItem[];
};

export const adminNavGroups: AdminNavGroup[] = [
  {
    title: '焦点',
    items: [
      {
        path: ADMIN_ROUTES.workstation,
        label: '工作台',
        icon: LayoutDashboard,
      },
      {
        path: ADMIN_ROUTES.today,
        label: '今日',
        icon: LayoutDashboard,
        end: true,
      },
    ],
  },
  {
    title: '过程',
    items: [
      { path: ADMIN_ROUTES.clues, label: '线索', icon: Inbox },
      { path: ADMIN_ROUTES.assistant, label: '助手问题', icon: MessageCircle },
      { path: ADMIN_ROUTES.seeds, label: '题苗', icon: Sprout },
      { path: ADMIN_ROUTES.executions, label: '执行', icon: ClipboardList },
      { path: ADMIN_ROUTES.metrics, label: '数', icon: BarChart3 },
    ],
  },
  {
    title: '站',
    items: [
      { path: ADMIN_ROUTES.content, label: '内容', icon: FileText },
      { path: ADMIN_ROUTES.aiGateway, label: '系统', icon: Server },
    ],
  },
];

/** 兼容旧 import */
export const adminPrimaryNav = adminNavGroups.flatMap((g) =>
  g.items.map((i) => ({ path: i.path, label: i.label })),
);
export const adminSecondaryNav: { path: string; label: string }[] = [];

export const adminDeferredNote =
  '过程：线索 → 题苗 → 执行。一人可养四面；不迁 WorkItem / Match / Skill 巨石。';
