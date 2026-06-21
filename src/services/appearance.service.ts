import { randomUUID } from 'node:crypto';

import { createAdminMediaStorage, type MediaObjectStoragePort, type MediaStorageMode } from '@/lib/admin-media-storage';
import { createAppearanceStore, createDefaultTheme } from '@/stores/appearance.store';
import type { AppearanceRepositoryPort, MediaAsset, ThemeProfile } from '@/stores/ports';

const MAX_MEDIA_BYTES = 20 * 1024 * 1024;
const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/webm'];

export interface AppearanceState {
  theme: ThemeProfile;
  media: MediaAsset[];
  storageMode: 'redis' | 'memory-development' | 'unavailable';
  mediaStorageMode: MediaStorageMode;
}

export interface AppearanceResult<T> {
  ok: boolean;
  code: 'ok' | 'invalid-input' | 'unsupported-media' | 'too-large' | 'not-found' | 'storage-unavailable';
  message?: string;
  data?: T;
}

export interface ReadMediaResult {
  asset: MediaAsset;
  bytes: Uint8Array;
}

function ok<T>(data: T): AppearanceResult<T> {
  return { ok: true, code: 'ok', data };
}

function fail<T>(code: AppearanceResult<T>['code'], message: string): AppearanceResult<T> {
  return { ok: false, code, message };
}

function clampOverlay(value: number): number {
  if (!Number.isFinite(value)) return 0.42;
  return Math.min(0.82, Math.max(0.28, value));
}

export class AppearanceService {
  constructor(
    private readonly store: AppearanceRepositoryPort = createAppearanceStore(),
    private readonly mediaStorage: MediaObjectStoragePort = createAdminMediaStorage(),
  ) {}

  private async ensureWritable<T>(): Promise<AppearanceResult<T> | null> {
    const mode = await this.store.getStorageMode();
    if (mode === 'unavailable') {
      return fail('storage-unavailable', '生产环境缺少持久化存储，外观与媒体未保存。');
    }
    return null;
  }

  async getState(owner: string): Promise<AppearanceState> {
    const theme = (await this.store.getTheme(owner)) ?? createDefaultTheme(owner);
    const media = await this.store.listMedia(owner);
    const storageMode = await this.store.getStorageMode();
    const mediaStorageMode = this.mediaStorage.getStorageMode();
    return { theme, media, storageMode, mediaStorageMode };
  }

  async saveTheme(owner: string, input: Partial<ThemeProfile>): Promise<AppearanceResult<ThemeProfile>> {
    const blocked = await this.ensureWritable<ThemeProfile>();
    if (blocked) return blocked;
    const current = (await this.store.getTheme(owner)) ?? createDefaultTheme(owner);
    const backgroundAssetId = typeof input.backgroundAssetId === 'string' && input.backgroundAssetId
      ? input.backgroundAssetId
      : undefined;
    if (backgroundAssetId) {
      const media = await this.store.listMedia(owner);
      if (!media.some(asset => asset.assetId === backgroundAssetId)) {
        return fail('not-found', '背景媒体不存在或不属于当前用户。');
      }
    }
    const theme: ThemeProfile = {
      ...current,
      name: typeof input.name === 'string' && input.name.trim() ? input.name.trim() : current.name,
      accent: input.accent ?? current.accent,
      glass: 'apple-modern',
      density: input.density ?? current.density,
      backgroundAssetId,
      readabilityOverlay: clampOverlay(Number(input.readabilityOverlay ?? current.readabilityOverlay)),
      reducedMotion: Boolean(input.reducedMotion),
      owner,
      visibility: 'owner',
      updatedAt: new Date().toISOString(),
    };
    await this.store.saveTheme(theme);
    return ok(theme);
  }

  async resetTheme(owner: string): Promise<AppearanceResult<ThemeProfile>> {
    const blocked = await this.ensureWritable<ThemeProfile>();
    if (blocked) return blocked;
    return ok(await this.store.resetTheme(owner));
  }

  async addMedia(owner: string, input: {
    filename: string;
    mimeType: string;
    sizeBytes: number;
    bytes: ArrayBuffer;
    width?: number;
    height?: number;
  }): Promise<AppearanceResult<MediaAsset>> {
    const blocked = await this.ensureWritable<MediaAsset>();
    if (blocked) return blocked;
    if (!input.filename.trim()) return fail('invalid-input', '文件名不能为空。');
    if (!ALLOWED_MIME.includes(input.mimeType)) return fail('unsupported-media', '只支持常见图片与 mp4/webm 视频。');
    if (input.sizeBytes <= 0 || input.bytes.byteLength <= 0) return fail('invalid-input', '媒体文件不能为空。');
    if (input.sizeBytes > MAX_MEDIA_BYTES || input.bytes.byteLength > MAX_MEDIA_BYTES) return fail('too-large', '媒体文件不能超过 20MB。');
    if (this.mediaStorage.getStorageMode() === 'unavailable') {
      return fail('storage-unavailable', '当前环境缺少真实媒体文件存储，不能保存图片或视频。');
    }
    let saved;
    try {
      saved = await this.mediaStorage.save({
        owner,
        filename: input.filename.trim(),
        mimeType: input.mimeType,
        bytes: input.bytes,
      });
    } catch {
      return fail('storage-unavailable', '媒体文件写入失败，未保存元数据。');
    }
    const now = new Date().toISOString();
    const assetId = `media_${randomUUID()}`;
    const asset: MediaAsset = {
      assetId,
      owner,
      filename: input.filename.trim(),
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      width: input.width,
      height: input.height,
      kind: input.mimeType.startsWith('video/') ? 'video' : 'image',
      source: 'upload',
      visibility: 'owner',
      storageKey: saved.storageKey,
      publicUrl: `/api/admin/appearance/media?assetId=${encodeURIComponent(assetId)}`,
      createdAt: now,
      updatedAt: now,
    };
    await this.store.saveMedia(asset);
    return ok(asset);
  }

  async readMedia(owner: string, assetId: string): Promise<AppearanceResult<ReadMediaResult>> {
    const media = await this.store.listMedia(owner);
    const asset = media.find(asset => asset.assetId === assetId);
    if (!asset) return fail('not-found', '媒体不存在或不属于当前用户。');
    if (this.mediaStorage.getStorageMode() === 'unavailable') {
      return fail('storage-unavailable', '当前环境缺少真实媒体文件存储，不能读取文件本体。');
    }
    try {
      const bytes = await this.mediaStorage.read(asset.storageKey);
      return ok({ asset, bytes });
    } catch {
      return fail('not-found', '媒体文件本体不存在或不可读取。');
    }
  }

  async removeMedia(owner: string, assetId: string): Promise<AppearanceResult<void>> {
    const blocked = await this.ensureWritable<void>();
    if (blocked) return blocked;
    const media = await this.store.listMedia(owner);
    const asset = media.find(asset => asset.assetId === assetId);
    if (!asset) return fail('not-found', '媒体不存在或不属于当前用户。');
    if (this.mediaStorage.getStorageMode() === 'unavailable') {
      return fail('storage-unavailable', '当前环境缺少真实媒体文件存储，不能删除文件本体。');
    }
    try {
      await this.mediaStorage.remove(asset.storageKey);
    } catch {
      return fail('storage-unavailable', '媒体文件本体删除失败，未移除元数据。');
    }
    await this.store.removeMedia(owner, assetId);
    return ok(undefined);
  }
}

export function createAppearanceService(): AppearanceService {
  return new AppearanceService();
}
