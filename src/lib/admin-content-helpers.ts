import {
  createGitHubContentFileStore,
  createLocalContentFileStore,
  type ContentFileStore,
} from '@/lib/admin-content-store';

const GITHUB_OWNER = 'AdgaiWalker';
const GITHUB_REPO = 'AdgaiWalker';
export const CONTENT_PATH_PREFIX = 'src/content/log/';

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export function getToken(): string | null {
  return import.meta.env.GITHUB_TOKEN || null;
}

export function getContentStore(): ContentFileStore {
  const token = getToken();
  if (import.meta.env.DEV && !token) {
    return createLocalContentFileStore();
  }
  return createGitHubContentFileStore({ owner: GITHUB_OWNER, repo: GITHUB_REPO, token });
}

export function validateSlug(slug: string): boolean {
  return /^[\p{Script=Han}\w\s.-]+$/u.test(slug)
    && !slug.includes('..')
    && !slug.includes('/')
    && !slug.includes('\\');
}

export function getPath(slug: string): string {
  const hasKnownExt = slug.endsWith('.md') || slug.endsWith('.mdx');
  return `${CONTENT_PATH_PREFIX}${hasKnownExt ? slug : `${slug}.md`}`;
}

export function getContentId(slug: string): string {
  return slug.replace(/\.(md|mdx)$/i, '');
}
