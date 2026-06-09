import { createHash } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const GITHUB_API = 'https://api.github.com';

export interface ContentFile {
  content: string;
  sha: string;
  name?: string;
}

export interface ContentWriteInput {
  path: string;
  content: string;
  message: string;
  sha?: string;
}

export interface ContentFileStore {
  read(path: string): Promise<ContentFile>;
  write(input: ContentWriteInput): Promise<{ sha?: string }>;
  delete(path: string, sha: string, message: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}

export class ContentStoreError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'ContentStoreError';
  }
}

function fileSha(content: string): string {
  return createHash('sha1').update(content).digest('hex');
}

function resolveWorkspacePath(rootDir: string, path: string): string {
  const root = resolve(rootDir);
  const target = resolve(root, path);
  if (target !== root && !target.startsWith(`${root}\\`) && !target.startsWith(`${root}/`)) {
    throw new ContentStoreError('无效的文件路径。', 400);
  }
  return target;
}

function contentApiPath(owner: string, repo: string, path: string): string {
  const encodedPath = path.split('/').map(segment => encodeURIComponent(segment)).join('/');
  return `/repos/${owner}/${repo}/contents/${encodedPath}`;
}

async function parseGitHubError(response: Response, fallback: string): Promise<ContentStoreError> {
  const body = await response.json().catch(() => ({})) as { message?: string };
  return new ContentStoreError(body.message || fallback, response.status);
}

export function createGitHubContentFileStore(options: {
  owner: string;
  repo: string;
  token?: string | null;
}): ContentFileStore {
  const { owner, repo, token } = options;

  async function request(path: string, init: RequestInit): Promise<Response> {
    if (!token) {
      throw new ContentStoreError('GITHUB_TOKEN 未配置。', 503);
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'Walker-Admin',
      ...(init.headers as Record<string, string> | undefined),
    };

    return fetch(`${GITHUB_API}${path}`, { ...init, headers });
  }

  async function read(path: string): Promise<ContentFile> {
    const response = await request(contentApiPath(owner, repo, path), { method: 'GET' });
    if (!response.ok) throw await parseGitHubError(response, '文件不存在。');

    const data = await response.json() as { content: string; sha: string; name?: string };
    return {
      content: Buffer.from(data.content, 'base64').toString('utf-8'),
      sha: data.sha,
      name: data.name,
    };
  }

  return {
    read,
    async write(input) {
      const response = await request(contentApiPath(owner, repo, input.path), {
        method: 'PUT',
        body: JSON.stringify({
          message: input.message,
          content: Buffer.from(input.content).toString('base64'),
          ...(input.sha ? { sha: input.sha } : {}),
        }),
      });
      if (!response.ok) throw await parseGitHubError(response, '保存失败。');

      const data = await response.json().catch(() => ({})) as { content?: { sha?: string } };
      return { sha: data.content?.sha };
    },

    async delete(path, sha, message) {
      const response = await request(contentApiPath(owner, repo, path), {
        method: 'DELETE',
        body: JSON.stringify({ message, sha }),
      });
      if (!response.ok) throw await parseGitHubError(response, '删除失败。');
    },

    async exists(path) {
      try {
        await read(path);
        return true;
      } catch (error) {
        if (error instanceof ContentStoreError && error.status === 404) return false;
        throw error;
      }
    },
  };
}

export function createLocalContentFileStore(rootDir = process.cwd()): ContentFileStore {
  return {
    async read(path) {
      const filePath = resolveWorkspacePath(rootDir, path);
      try {
        const content = await readFile(filePath, 'utf-8');
        return {
          content,
          sha: fileSha(content),
          name: filePath.split(/[\\/]/).at(-1),
        };
      } catch {
        throw new ContentStoreError('文件不存在。', 404);
      }
    },

    async write(input) {
      const filePath = resolveWorkspacePath(rootDir, input.path);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, input.content, 'utf-8');
      return { sha: fileSha(input.content) };
    },

    async delete(path) {
      const filePath = resolveWorkspacePath(rootDir, path);
      try {
        await unlink(filePath);
      } catch {
        throw new ContentStoreError('文件不存在。', 404);
      }
    },

    async exists(path) {
      try {
        await this.read(path);
        return true;
      } catch (error) {
        if (error instanceof ContentStoreError && error.status === 404) return false;
        throw error;
      }
    },
  };
}
