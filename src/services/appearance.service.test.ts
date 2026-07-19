import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { MediaObjectStoragePort } from '@/lib/admin-media-storage';
import { __resetMemoryAppearance, createAppearanceStore } from '@/stores/appearance.store';
import { AppearanceService, createAppearanceService } from './appearance.service';

class FakeRedis {
  values = new Map<string, unknown>();
  lists = new Map<string, string[]>();

  async get<T>(key: string): Promise<T | null> {
    return (this.values.get(key) as T | undefined) ?? null;
  }

  async set(key: string, value: unknown): Promise<'OK'> {
    this.values.set(key, value);
    return 'OK';
  }

  async lpush<TData>(key: string, ...elements: TData[]): Promise<number> {
    const list = this.lists.get(key) ?? [];
    for (const element of elements) list.unshift(String(element));
    this.lists.set(key, list);
    return list.length;
  }

  async lrange<T = string>(key: string, start: number, stop: number): Promise<T[]> {
    const list = this.lists.get(key) ?? [];
    const end = stop < 0 ? list.length : stop + 1;
    return list.slice(start, end) as T[];
  }

  async lrem<TData>(key: string, _count: number, value: TData): Promise<number> {
    const list = this.lists.get(key) ?? [];
    const target = String(value);
    const next = list.filter(item => item !== target);
    this.lists.set(key, next);
    return list.length - next.length;
  }

  async del(key: string): Promise<number> {
    const existed = this.values.delete(key);
    return existed ? 1 : 0;
  }
}

class FakeMediaStorage implements MediaObjectStoragePort {
  removed: string[] = [];
  objects = new Map<string, Uint8Array>();
  mode: ReturnType<MediaObjectStoragePort['getStorageMode']> = 'local-development';

  getStorageMode(): ReturnType<MediaObjectStoragePort['getStorageMode']> {
    return this.mode;
  }

  async save(input: { owner: string; filename: string; mimeType: string; bytes: ArrayBuffer }) {
    expect(input.bytes.byteLength).toBeGreaterThan(0);
    const storageKey = `${input.owner}/${input.filename}`;
    this.objects.set(storageKey, new Uint8Array(input.bytes));
    return { storageKey, publicUrl: `/media/${input.owner}/${input.filename}` };
  }

  async read(storageKey: string): Promise<Uint8Array> {
    const bytes = this.objects.get(storageKey);
    if (!bytes) throw new Error('not-found');
    return bytes;
  }

  async remove(storageKey: string): Promise<void> {
    this.removed.push(storageKey);
    this.objects.delete(storageKey);
  }
}

function bytes(size = 4): ArrayBuffer {
  return new Uint8Array(size).buffer;
}

describe('AppearanceService（UX1 外观与媒体个人化）', () => {
  beforeEach(() => __resetMemoryAppearance());
  afterEach(() => __resetMemoryAppearance());

  it('默认主题使用 Apple 现代玻璃、Walker 翡翠青与低密度', async () => {
    const state = await createAppearanceService().getState('walker');
    expect(state.theme.glass).toBe('apple-modern');
    expect(state.theme.accent).toBe('walker-jade');
    expect(state.theme.density).toBe('low');
    expect(state.theme.visibility).toBe('owner');
  });

  it('保存主题时限制可读性遮罩范围，并只引用当前用户媒体', async () => {
    const svc = new AppearanceService(createAppearanceStore(), new FakeMediaStorage());
    const media = await svc.addMedia('walker', {
      filename: 'bg.webp',
      mimeType: 'image/webp',
      sizeBytes: 1024,
      bytes: bytes(1024),
    });
    expect(media.ok).toBe(true);
    const saved = await svc.saveTheme('walker', {
      accent: 'mint',
      density: 'comfortable',
      backgroundAssetId: media.data!.assetId,
      readabilityOverlay: 0.99,
      reducedMotion: true,
    });
    expect(saved.ok).toBe(true);
    expect(saved.data!.readabilityOverlay).toBe(0.82);
    expect(saved.data!.backgroundAssetId).toBe(media.data!.assetId);
    expect(saved.data!.reducedMotion).toBe(true);

    const missing = await svc.saveTheme('walker', { backgroundAssetId: 'media_missing' });
    expect(missing.ok).toBe(false);
    expect(missing.code).toBe('not-found');

    const read = await svc.readMedia('walker', media.data!.assetId);
    expect(read.ok).toBe(true);
    expect(Array.from(read.data!.bytes)).toEqual(Array.from(new Uint8Array(bytes(1024))));
  });

  it('媒体上传限制类型与大小，移除背景引用时会恢复空引用', async () => {
    const storage = new FakeMediaStorage();
    const svc = new AppearanceService(createAppearanceStore(), storage);
    const unsupported = await svc.addMedia('walker', { filename: 'x.txt', mimeType: 'text/plain', sizeBytes: 10, bytes: bytes(10) });
    expect(unsupported.code).toBe('unsupported-media');
    const tooLarge = await svc.addMedia('walker', { filename: 'big.png', mimeType: 'image/png', sizeBytes: 21 * 1024 * 1024, bytes: bytes(1) });
    expect(tooLarge.code).toBe('too-large');

    const media = await svc.addMedia('walker', { filename: 'bg.png', mimeType: 'image/png', sizeBytes: 128, bytes: bytes(128) });
    await svc.saveTheme('walker', { backgroundAssetId: media.data!.assetId });
    const removed = await svc.removeMedia('walker', media.data!.assetId);
    expect(removed.ok).toBe(true);
    expect(storage.removed).toContain(media.data!.storageKey);
    const state = await svc.getState('walker');
    expect(state.media).toHaveLength(0);
    expect(state.theme.backgroundAssetId).toBeUndefined();
  });

  it('Redis 路径持久化主题与媒体，内存清空后仍可读回', async () => {
    const redis = new FakeRedis();
    const svc = new AppearanceService(createAppearanceStore({ redis, environment: 'production' }), new FakeMediaStorage());
    const media = await svc.addMedia('walker', {
      filename: 'persistent.webp',
      mimeType: 'image/webp',
      sizeBytes: 512,
      bytes: bytes(512),
    });
    expect(media.ok).toBe(true);
    const saved = await svc.saveTheme('walker', {
      name: 'Redis 主题',
      accent: 'mint',
      backgroundAssetId: media.data!.assetId,
    });
    expect(saved.ok).toBe(true);

    __resetMemoryAppearance();

    const nextSvc = new AppearanceService(createAppearanceStore({ redis, environment: 'production' }), new FakeMediaStorage());
    const state = await nextSvc.getState('walker');
    expect(state.storageMode).toBe('redis');
    expect(state.theme.name).toBe('Redis 主题');
    expect(state.theme.backgroundAssetId).toBe(media.data!.assetId);
    expect(state.media.map(asset => asset.filename)).toContain('persistent.webp');

    const removed = await nextSvc.removeMedia('walker', media.data!.assetId);
    expect(removed.ok).toBe(true);
    __resetMemoryAppearance();
    const finalState = await new AppearanceService(createAppearanceStore({ redis, environment: 'production' }), new FakeMediaStorage()).getState('walker');
    expect(finalState.theme.backgroundAssetId).toBeUndefined();
    expect(finalState.media).toHaveLength(0);
  });

  it('生产环境缺少 Redis 时拒绝保存外观与媒体，不静默写内存', async () => {
    const svc = new AppearanceService(createAppearanceStore({ redis: null, environment: 'production' }));
    const theme = await svc.saveTheme('walker', { accent: 'mint' });
    expect(theme.ok).toBe(false);
    expect(theme.code).toBe('storage-unavailable');

    const media = await svc.addMedia('walker', {
      filename: 'bg.png',
      mimeType: 'image/png',
      sizeBytes: 128,
      bytes: bytes(128),
    });
    expect(media.ok).toBe(false);
    expect(media.code).toBe('storage-unavailable');

    const state = await svc.getState('walker');
    expect(state.storageMode).toBe('unavailable');
    expect(state.theme.accent).toBe('walker-jade');
    expect(state.media).toHaveLength(0);
  });

  it('生产环境 Redis 可用但 Blob 不可用时，主题可保存而媒体上传被拒绝', async () => {
    const redis = new FakeRedis();
    const mediaStorage = new FakeMediaStorage();
    mediaStorage.mode = 'unavailable';
    const svc = new AppearanceService(createAppearanceStore({ redis, environment: 'production' }), mediaStorage);

    const theme = await svc.saveTheme('walker', { name: '只有主题可保存', accent: 'mint' });
    expect(theme.ok).toBe(true);

    const media = await svc.addMedia('walker', {
      filename: 'bg.png',
      mimeType: 'image/png',
      sizeBytes: 128,
      bytes: bytes(128),
    });
    expect(media.ok).toBe(false);
    expect(media.code).toBe('storage-unavailable');

    const state = await svc.getState('walker');
    expect(state.storageMode).toBe('redis');
    expect(state.mediaStorageMode).toBe('unavailable');
    expect(state.theme.name).toBe('只有主题可保存');
    expect(state.media).toHaveLength(0);
  });
});
