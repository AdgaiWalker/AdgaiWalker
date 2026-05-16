/**
 * 路由常量 — 所有页面路径的单一来源
 */

// 列表页
export const POSTS = '/posts' as const;
export const DOCK = '/explore' as const;

// AI 子页面
export const AI_LEARN = '/ai/learn' as const;
export const AI_IDEAS = '/ai/ideas' as const;
export const AI_TOOLKIT = '/ai/toolkit' as const;
export const AI_SOURCES = '/ai/sources' as const;

// 工具函数
export const postSlug = (id: string) => `${POSTS}/${id}` as const;
export const dockSlug = (id: string) => `${DOCK}/${id}` as const;
