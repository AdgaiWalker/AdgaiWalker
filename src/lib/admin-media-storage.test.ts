import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createAdminMediaStorage, createFileMediaStorage, createVercelBlobMediaStorage } from './admin-media-storage';

class FakeBlobClient {
  objects = new Map<string, Uint8Array>();
  savedOptions: unknown[] = [];
  deleted: string[] = [];

  async put(pathname: string, body: Buffer, options: unknown) {
    this.savedOptions.push(options);
    this.objects.set(pathname, new Uint8Array(body));
    return { pathname, url: `https://blob.example/${pathname}` };
  }

  async get(pathname: string) {
    const bytes = this.objects.get(pathname);
    if (!bytes) return null;
    return {
      statusCode: 200 as const,
      stream: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }),
    };
  }

  async del(pathname: string) {
    this.deleted.push(pathname);
    this.objects.delete(pathname);
  }
}

const tempDirs: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'walker-admin-media-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

describe('admin media storage', () => {
  it('开发环境把媒体文件写入本地目录并返回公开 URL', async () => {
    const rootDir = await tempDir();
    const storage = createFileMediaStorage({ environment: 'development', rootDir, publicBaseUrl: '/uploads/admin-media' });
    expect(storage.getStorageMode()).toBe('local-development');

    const saved = await storage.save({
      owner: 'Walker Owner',
      filename: 'background.webp',
      mimeType: 'image/webp',
      bytes: new Uint8Array([1, 2, 3]).buffer,
    });

    expect(saved.storageKey).toMatch(/^walker-owner\/.+\.webp$/);
    expect(saved.publicUrl).toContain('/uploads/admin-media/walker-owner/');
    await expect(readFile(path.join(rootDir, saved.storageKey))).resolves.toEqual(Buffer.from([1, 2, 3]));

    await storage.remove(saved.storageKey);
    await expect(readFile(path.join(rootDir, saved.storageKey))).rejects.toThrow();
  });

  it('生产环境没有显式媒体存储配置时拒绝写入', async () => {
    const storage = createFileMediaStorage({ environment: 'production' });
    expect(storage.getStorageMode()).toBe('unavailable');
    await expect(storage.save({
      owner: 'walker',
      filename: 'background.png',
      mimeType: 'image/png',
      bytes: new Uint8Array([1]).buffer,
    })).rejects.toThrow('media-storage-unavailable');
  });

  it('生产环境默认使用 Vercel Blob，缺少 token 时拒绝写入', async () => {
    const storage = createAdminMediaStorage('production');
    expect(storage.getStorageMode()).toBe('unavailable');
    await expect(storage.save({
      owner: 'walker',
      filename: 'background.png',
      mimeType: 'image/png',
      bytes: new Uint8Array([1]).buffer,
    })).rejects.toThrow('media-storage-unavailable');
  });

  it('生产环境有 Blob token 时写入、读回并删除私有 Blob', async () => {
    const client = new FakeBlobClient();
    const storage = createVercelBlobMediaStorage({ environment: 'production', token: 'blob-token', client });
    expect(storage.getStorageMode()).toBe('vercel-blob');

    const saved = await storage.save({
      owner: 'Walker Owner',
      filename: 'hero.mp4',
      mimeType: 'video/mp4',
      bytes: new Uint8Array([7, 8, 9]).buffer,
    });

    expect(saved.storageKey).toMatch(/^admin-media\/walker-owner\/.+\.mp4$/);
    expect(saved.publicUrl).toBe(`https://blob.example/${saved.storageKey}`);
    expect(client.savedOptions[0]).toMatchObject({ access: 'private', contentType: 'video/mp4', token: 'blob-token' });
    await expect(storage.read(saved.storageKey)).resolves.toEqual(new Uint8Array([7, 8, 9]));

    await storage.remove(saved.storageKey);
    expect(client.deleted).toContain(saved.storageKey);
    await expect(storage.read(saved.storageKey)).rejects.toThrow('media-object-not-found');
  });
});
