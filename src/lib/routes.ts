/**
 * Route constants: single source of truth for page paths.
 */

export const POSTS = '/posts' as const;
export const TOOLS = '/tools' as const;

export const postSlug = (id: string) => `${POSTS}/${id}` as const;
