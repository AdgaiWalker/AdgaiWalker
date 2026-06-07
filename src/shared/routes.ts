/**
 * Route constants: single source of truth for page paths.
 */

export const HOME = '/' as const;
export const POSTS = '/posts' as const;
export const TOOLS = '/tools' as const;
export const IDEAS = '/ideas' as const;
export const PROJECTS = '/projects' as const;
export const CONTENT = '/content' as const;
export const ABOUT = '/about' as const;
export const LEARN = '/learn' as const;
export const FERRY = '/projects/ferry' as const;

export const buildPostPath = (id: string) => `${POSTS}/${id}` as const;
export const buildContentSpacePath = (space: string) => `${CONTENT}?space=${space}` as const;
export const buildLearnGuidePath = (level: string, tool: string) => `${LEARN}/guide/${level}/${tool}` as const;
