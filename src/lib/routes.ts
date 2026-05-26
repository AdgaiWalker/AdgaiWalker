/**
 * Route constants: single source of truth for page paths.
 */

export const POSTS = '/posts' as const;
export const TOOLS = '/tools' as const;
export const IDEAS = '/ideas' as const;
export const PROJECTS = '/projects' as const;

export const buildPostPath = (id: string) => `${POSTS}/${id}` as const;
