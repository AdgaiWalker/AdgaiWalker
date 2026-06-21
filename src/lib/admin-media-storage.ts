import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { del as blobDelete, get as blobGet, put as blobPut } from '@vercel/blob';

import { resolveStorageMode } from '@/lib/storage-mode';

export type MediaStorageMode = 'local-development' | 'vercel-blob' | 'unavailable';

export interface SaveMediaObjectInput {
  owner: string;
  filename: string;
  mimeType: string;
  bytes: ArrayBuffer;
}

export interface SavedMediaObject {
  storageKey: string;
  publicUrl: string;
}

export interface MediaObjectStoragePort {
  getStorageMode(): MediaStorageMode;
  save(input: SaveMediaObjectInput): Promise<SavedMediaObject>;
  read(storageKey: string): Promise<Uint8Array>;
  remove(storageKey: string): Promise<void>;
}

export interface FileMediaStorageOptions {
  environment?: string;
  rootDir?: string;
  publicBaseUrl?: string;
}

interface BlobPutResult {
  pathname: string;
  url: string;
}

interface BlobGetResult {
  statusCode: 200 | 304;
  stream: ReadableStream<Uint8Array> | null;
}

interface VercelBlobClient {
  put(pathname: string, body: Buffer, options: {
    access: 'private';
    contentType: string;
    multipart: boolean;
    token?: string;
  }): Promise<BlobPutResult>;
  get(pathname: string, options: { access: 'private'; useCache: false; token?: string }): Promise<BlobGetResult | null>;
  del(pathname: string, options?: { token?: string }): Promise<void>;
}

export interface VercelBlobMediaStorageOptions {
  environment?: string;
  token?: string;
  client?: VercelBlobClient;
}

function currentEnvironment(explicit?: string): string {
  if (explicit) return explicit;
  if (typeof import.meta !== 'undefined') {
    const mode = (import.meta as { env?: { MODE?: unknown } }).env?.MODE;
    if (typeof mode === 'string' && mode) return mode;
  }
  if (typeof process !== 'undefined' && process.env?.NODE_ENV) return process.env.NODE_ENV;
  return 'production';
}

function configuredRootDir(options?: FileMediaStorageOptions): string | undefined {
  return options?.rootDir
    ?? (typeof process !== 'undefined' ? process.env?.ADMIN_MEDIA_STORAGE_DIR : undefined);
}

function configuredPublicBaseUrl(options?: FileMediaStorageOptions): string | undefined {
  return options?.publicBaseUrl
    ?? (typeof process !== 'undefined' ? process.env?.ADMIN_MEDIA_PUBLIC_BASE_URL : undefined);
}

function configuredBlobToken(options?: VercelBlobMediaStorageOptions): string | undefined {
  return options?.token
    ?? (typeof process !== 'undefined' ? process.env?.BLOB_READ_WRITE_TOKEN : undefined);
}

function sanitizeSegment(value: string): string {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'walker';
}

function extensionFromFilename(filename: string, mimeType: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (/^\.(png|jpe?g|webp|gif|mp4|webm)$/.test(ext)) return ext;
  const map: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
  };
  return map[mimeType] ?? '.bin';
}

function joinPublicUrl(base: string, storageKey: string): string {
  const trimmed = base.replace(/\/+$/, '');
  return `${trimmed}/${storageKey.split('/').map(encodeURIComponent).join('/')}`;
}

function blobStorageKey(owner: string, filename: string, mimeType: string): string {
  const safeOwner = sanitizeSegment(owner);
  const ext = extensionFromFilename(filename, mimeType);
  return `admin-media/${safeOwner}/${randomUUID()}${ext}`;
}

async function readStreamFully(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      length += value.byteLength;
    }
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

const defaultBlobClient: VercelBlobClient = {
  put: blobPut,
  get: blobGet,
  del: blobDelete,
};

export function createVercelBlobMediaStorage(options?: VercelBlobMediaStorageOptions): MediaObjectStoragePort {
  const env = currentEnvironment(options?.environment);
  const token = configuredBlobToken(options);
  const modeFromEnv = resolveStorageMode({ hasRedis: Boolean(token), environment: env });
  const client = options?.client ?? defaultBlobClient;
  const isDevLike = env === 'development' || env === 'test';
  const mode: MediaStorageMode = !isDevLike && token && modeFromEnv === 'redis' ? 'vercel-blob' : 'unavailable';

  function ensureAvailable(): void {
    if (mode === 'unavailable') throw new Error('media-storage-unavailable');
  }

  return {
    getStorageMode(): MediaStorageMode {
      return mode;
    },

    async save(input: SaveMediaObjectInput): Promise<SavedMediaObject> {
      ensureAvailable();
      const storageKey = blobStorageKey(input.owner, input.filename, input.mimeType);
      const saved = await client.put(storageKey, Buffer.from(input.bytes), {
        access: 'private',
        contentType: input.mimeType,
        multipart: input.bytes.byteLength >= 8 * 1024 * 1024,
        token,
      });
      return { storageKey: saved.pathname || storageKey, publicUrl: saved.url };
    },

    async read(storageKey: string): Promise<Uint8Array> {
      ensureAvailable();
      const result = await client.get(storageKey, { access: 'private', useCache: false, token });
      if (!result || result.statusCode !== 200 || !result.stream) throw new Error('media-object-not-found');
      return readStreamFully(result.stream);
    },

    async remove(storageKey: string): Promise<void> {
      ensureAvailable();
      await client.del(storageKey, { token });
    },
  };
}

export function createFileMediaStorage(options?: FileMediaStorageOptions): MediaObjectStoragePort {
  const env = currentEnvironment(options?.environment);
  const isDevLike = env === 'development' || env === 'test';
  const configuredRoot = configuredRootDir(options);
  const configuredBase = configuredPublicBaseUrl(options);
  const rootDir = configuredRoot ?? path.resolve(process.cwd(), 'public', 'uploads', 'admin-media');
  const publicBaseUrl = configuredBase ?? '/uploads/admin-media';

  const mode: MediaStorageMode = isDevLike ? 'local-development' : 'unavailable';

  function ensureAvailable(): void {
    if (mode === 'unavailable') {
      throw new Error('media-storage-unavailable');
    }
  }

  function absolutePathFor(storageKey: string): string {
    const resolved = path.resolve(rootDir, storageKey);
    const root = path.resolve(rootDir);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
      throw new Error('invalid-storage-key');
    }
    return resolved;
  }

  return {
    getStorageMode(): MediaStorageMode {
      return mode;
    },

    async save(input: SaveMediaObjectInput): Promise<SavedMediaObject> {
      ensureAvailable();
      const owner = sanitizeSegment(input.owner);
      const ext = extensionFromFilename(input.filename, input.mimeType);
      const storageKey = `${owner}/${randomUUID()}${ext}`;
      const target = absolutePathFor(storageKey);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, Buffer.from(input.bytes));
      return { storageKey, publicUrl: joinPublicUrl(publicBaseUrl, storageKey) };
    },

    async read(storageKey: string): Promise<Uint8Array> {
      ensureAvailable();
      return readFile(absolutePathFor(storageKey));
    },

    async remove(storageKey: string): Promise<void> {
      ensureAvailable();
      await rm(absolutePathFor(storageKey), { force: true });
    },
  };
}

export function createAdminMediaStorage(environment?: string): MediaObjectStoragePort {
  const env = currentEnvironment(environment);
  if (env === 'development' || env === 'test') return createFileMediaStorage({ environment: env });
  return createVercelBlobMediaStorage({ environment: env });
}

export function isMediaStoragePersistent(mode: MediaStorageMode): boolean {
  return mode === 'vercel-blob';
}
