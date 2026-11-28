/**
 * 公开站固定路径（与 dual-entry 并列：问 / 文章 见 dual-entry，其余见此）。
 * 2026-11-27 纸页重构：只留 5 个面；旧路径统一由 LEGACY_REDIRECTS 301 到新落点。
 */
import { dualEntry } from './dual-entry';

export const WEB_ROUTES = {
  home: '/',
  browse: dualEntry.browse.path,
  ask: dualEntry.ask.path,
  /** 问的结果页：nextStep 的独立呈现（noindex 壳；结果只在本机会话可还原） */
  toolsResult: `${dualEntry.ask.path}/result`,
  /** 脉络：文章正文互引结构（Obsidian Graph View 对齐） */
  graph: '/graph',
  /** 关于（人 + 站合一） */
  me: '/me',
  /** 旧「关于本站」，已并入 /me，仅保留给 301 与 metadata 兼容 */
  about: '/about',
} as const;

/** 文章目录按章节筛选的查询键：/posts?c=see|use|make */
export const CHAPTER_QUERY_KEY = 'c';

/**
 * 旧路径 → 新落点（SSOT）。
 * 生产由 vercel.json 301（scripts/lib/site.ts 复用本表，web 测试守护两边一致）；
 * 客户端路由同表兜底，dev / 旧书签都不会落进 404。
 */
export const LEGACY_REDIRECTS = [
  { source: '/about', destination: '/me' },
  { source: '/gear', destination: '/posts/dora-gear' },
  { source: '/support', destination: '/me' },
  { source: '/login', destination: '/' },
  { source: '/ask', destination: dualEntry.ask.path },
  { source: '/ideas/new', destination: dualEntry.ask.path },
  { source: '/content', destination: '/posts' },
  { source: '/architecture', destination: '/graph' },
  { source: '/lab', destination: '/posts?c=see' },
  { source: '/advance', destination: '/posts?c=see' },
  { source: '/tutorials', destination: '/posts?c=use' },
  { source: '/learn', destination: '/posts?c=use' },
  { source: '/condition', destination: '/posts?c=use' },
  { source: '/kit', destination: '/posts?c=use' },
  { source: '/tools/resources', destination: '/posts/idea-cocreate' },
  { source: '/explore', destination: '/posts?c=make' },
  { source: '/showcase', destination: '/posts?c=make' },
  { source: '/ideas', destination: '/posts?c=make' },
  { source: '/projects', destination: '/posts?c=make' },
  { source: '/projects/ferry', destination: '/posts?c=make' },
  { source: '/exchange', destination: '/posts?c=make' },
] as const;
