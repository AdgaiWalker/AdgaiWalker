/**
 * 公开站固定路径（与 dual-entry 并列：卡/逛见 dual-entry，其余见此）
 */
import { dualEntry } from './dual-entry';

export const WEB_ROUTES = {
  home: '/',
  login: '/login',
  /** 兼容旧链；App 内 redirect → dualEntry.browse */
  content: '/content',
  about: '/about',
  /** 关于我（人）；关于本站见 about */
  me: '/me',
  support: '/support',
  learn: '/learn',
  ideas: '/ideas',
  projects: '/projects',
  /** 内容五类：教程（渠道/跟学等） */
  tutorials: '/tutorials',
  /** 札记（原实验室枢纽） */
  lab: '/lab',
  /** 兼容旧生产链路径 */
  condition: '/condition',
  kit: '/kit',
  showcase: '/showcase',
  exchange: '/exchange',
  ferry: '/projects/ferry',
  /** 前进三部曲：畏惧/点子/未来 — 实验室专线 */
  advanceTrilogy: '/advance',
  toolsResources: '/tools/resources',
  gear: '/gear',
  ask: dualEntry.ask.path,
  browse: dualEntry.browse.path,
} as const;
