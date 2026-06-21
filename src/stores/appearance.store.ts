import { randomUUID } from 'node:crypto';
import type { Redis } from '@upstash/redis';

import { getRedis } from '@/conversation/store';
import { resolveStorageMode, type StorageMode } from '@/lib/storage-mode';
import type { AppearanceRepositoryPort, MediaAsset, ThemeProfile } from './ports';

const themes = new Map<string, ThemeProfile>();
const media = new Map<string, MediaAsset>();

type AppearanceRedis = Pick<Redis, 'get' | 'set' | 'lpush' | 'lrange' | 'lrem' | 'del'>;

interface AppearanceStoreOptions {
  redis?: AppearanceRedis | null;
  environment?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function hasInjectedRedis(options?: AppearanceStoreOptions): boolean {
  return Boolean(options && Object.prototype.hasOwnProperty.call(options, 'redis'));
}

function resolveRedis(options?: AppearanceStoreOptions): AppearanceRedis | null {
  return hasInjectedRedis(options) ? options?.redis ?? null : getRedis();
}

function themeKey(owner: string): string {
  return `appearance:theme:${owner}`;
}

function mediaKey(assetId: string): string {
  return `appearance:media:${assetId}`;
}

function mediaByOwnerKey(owner: string): string {
  return `appearance:media:owner:${owner}`;
}

export function createDefaultTheme(owner: string): ThemeProfile {
  const now = nowIso();
  return {
    profileId: `theme_${owner}`,
    owner,
    name: 'Walker 现代玻璃',
    accent: 'walker-jade',
    glass: 'apple-modern',
    density: 'low',
    readabilityOverlay: 0.42,
    reducedMotion: false,
    visibility: 'owner',
    createdAt: now,
    updatedAt: now,
  };
}

export function __resetMemoryAppearance(): void {
  themes.clear();
  media.clear();
}

export function createAppearanceStore(options?: AppearanceStoreOptions): AppearanceRepositoryPort {
  const getMode = (): StorageMode => {
    const redis = resolveRedis(options);
    return resolveStorageMode({ hasRedis: Boolean(redis), environment: options?.environment });
  };

  return {
    async getStorageMode(): Promise<StorageMode> {
      return getMode();
    },

    async getTheme(owner: string): Promise<ThemeProfile | null> {
      const redis = resolveRedis(options);
      if (redis) {
        const persisted = await redis.get<ThemeProfile>(themeKey(owner));
        if (persisted) {
          themes.set(owner, persisted);
          return persisted;
        }
      }
      return themes.get(owner) ?? null;
    },

    async saveTheme(theme: ThemeProfile): Promise<void> {
      const existing = themes.get(theme.owner);
      const next: ThemeProfile = {
        ...theme,
        profileId: existing?.profileId ?? theme.profileId,
        createdAt: existing?.createdAt ?? theme.createdAt,
        updatedAt: nowIso(),
        visibility: 'owner',
      };
      themes.set(theme.owner, next);
      const redis = resolveRedis(options);
      if (redis) await redis.set(themeKey(theme.owner), next);
    },

    async resetTheme(owner: string): Promise<ThemeProfile> {
      const theme = createDefaultTheme(owner);
      themes.set(owner, theme);
      const redis = resolveRedis(options);
      if (redis) await redis.set(themeKey(owner), theme);
      return theme;
    },

    async saveMedia(asset: MediaAsset): Promise<void> {
      const id = asset.assetId || `media_${randomUUID()}`;
      const existing = media.get(id);
      const next: MediaAsset = {
        ...asset,
        assetId: id,
        createdAt: existing?.createdAt ?? asset.createdAt,
        updatedAt: nowIso(),
        visibility: 'owner',
      };
      media.set(id, next);
      const redis = resolveRedis(options);
      if (redis) {
        const persisted = await redis.get<MediaAsset>(mediaKey(id));
        await redis.set(mediaKey(id), next);
        if (!persisted) await redis.lpush(mediaByOwnerKey(next.owner), id);
      }
    },

    async listMedia(owner: string): Promise<MediaAsset[]> {
      const redis = resolveRedis(options);
      if (redis) {
        const ids = await redis.lrange<string>(mediaByOwnerKey(owner), 0, 199);
        const items = await Promise.all(ids.map(id => redis.get<MediaAsset>(mediaKey(id))));
        const persisted = items
          .filter((asset): asset is MediaAsset => asset !== null && asset.owner === owner)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        for (const asset of persisted) media.set(asset.assetId, asset);
        return persisted;
      }
      return [...media.values()]
        .filter(asset => asset.owner === owner)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    async removeMedia(owner: string, assetId: string): Promise<void> {
      const asset = media.get(assetId);
      if (asset?.owner === owner) media.delete(assetId);
      const redis = resolveRedis(options);
      const theme = themes.get(owner) ?? (redis ? await redis.get<ThemeProfile>(themeKey(owner)) : null);
      if (theme?.backgroundAssetId === assetId) {
        const nextTheme = { ...theme, backgroundAssetId: undefined, updatedAt: nowIso() };
        themes.set(owner, nextTheme);
        if (redis) await redis.set(themeKey(owner), nextTheme);
      }
      if (redis) {
        await redis.del(mediaKey(assetId));
        await redis.lrem(mediaByOwnerKey(owner), 0, assetId);
      }
    },
  };
}
