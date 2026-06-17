import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
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

export interface ContentHistoryEntry {
  sha: string;
  date: string;
  message: string;
  author: string;
}

export interface ContentReadOptions {
  ref?: string;
}

export interface ContentFileStore {
  read(path: string, opts?: ContentReadOptions): Promise<ContentFile>;
  write(input: ContentWriteInput): Promise<{ sha?: string }>;
  delete(path: string, sha: string, message: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  listHistory(path: string, opts?: { perPage?: number }): Promise<ContentHistoryEntry[]>;
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

  async function read(path: string, opts?: ContentReadOptions): Promise<ContentFile> {
    const query = opts?.ref ? `?ref=${encodeURIComponent(opts.ref)}` : '';
    const response = await request(`${contentApiPath(owner, repo, path)}${query}`, { method: 'GET' });
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

    async listHistory(path, opts) {
      const perPage = Math.min(Math.max(opts?.perPage ?? 30, 1), 100);
      const query = new URLSearchParams({ path, per_page: String(perPage) });
      const response = await request(
        `/repos/${owner}/${repo}/commits?${query.toString()}`,
        { method: 'GET' },
      );
      if (!response.ok) throw await parseGitHubError(response, '历史读取失败。');
      const data = await response.json() as Array<{
        sha: string;
        commit: { message: string; author?: { name?: string; date?: string } };
      }>;
      return data.map(c => ({
        sha: c.sha,
        date: c.commit.author?.date ?? '',
        message: c.commit.message ?? '',
        author: c.commit.author?.name ?? '',
      }));
    },
  };
}

export function createLocalContentFileStore(rootDir = process.cwd()): ContentFileStore {
  return {
    async read(path, opts) {
      const filePath = resolveWorkspacePath(rootDir, path);
      if (opts?.ref) {
        try {
          const relPath = path.replace(/\\/g, '/');
          const content = execFileSync('git', ['-C', rootDir, 'show', `${opts.ref}:${relPath}`], { encoding: 'utf-8' });
          return { content, sha: opts.ref, name: filePath.split(/[\\/]/).at(-1) };
        } catch {
          throw new ContentStoreError('版本不存在。', 404);
        }
      }
      try {
        const content = await readFile(filePath, 'utf-8');
        return { content, sha: fileSha(content), name: filePath.split(/[\\/]/).at(-1) };
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

    async listHistory(path, opts) {
      const perPage = Math.min(Math.max(opts?.perPage ?? 30, 1), 100);
      const relPath = path.replace(/\\/g, '/');
      try {
        const out = execFileSync(
          'git',
          ['-C', rootDir, 'log', `-n`, String(perPage), `--format=%H|%cI|%an|%s`, '--', relPath],
          { encoding: 'utf-8' },
        );
        return out.trim().split('\n').filter(Boolean).map(line => {
          const [sha, date, author, ...msgParts] = line.split('|');
          return { sha, date, author, message: msgParts.join('|') };
        });
      } catch {
        return [];
      }
    },
  };
}
