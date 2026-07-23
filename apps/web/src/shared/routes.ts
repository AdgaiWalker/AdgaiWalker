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
  support: '/support',
  learn: '/learn',
  ideas: '/ideas',
  projects: '/projects',
  ferry: '/projects/ferry',
  toolsResources: '/tools/resources',
  ask: dualEntry.ask.path,
  browse: dualEntry.browse.path,
} as const;
