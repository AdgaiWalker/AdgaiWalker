/**
 * AssetEvidenceLink Store — 实现 AssetEvidenceLinkRepositoryPort（P2-B）
 *
 * 资产晋升证据链存储的真正实现（Redis + 内存降级）。
 * 存储逻辑从 conversation/store.ts 迁移至此，成为 AssetEvidenceLink 域的权威存储入口。
 *
 * Key 约定：
 *   asset-link:event:{id}               单条晋升记录
 *   asset-link:by-asset:{kind}:{assetId}  某资产的所有晋升记录（按时间倒序）
 *   asset-link:recent                    最近晋升记录索引
 */
import { getRedis } from '@/stores/redis-client';

import type { AssetEvidenceLink, AssetEvidenceLinkRepositoryPort, AssetKind } from './ports';

// ---------------------------------------------------------------------------
// 内存降级存储（Redis 不可用时兜底）
// ---------------------------------------------------------------------------

const memoryAssetEvidenceLinks = new Map<string, AssetEvidenceLink>();

// ---------------------------------------------------------------------------
// Redis key 约定
// ---------------------------------------------------------------------------

function assetLinkKey(linkId: string): string {
  return `asset-link:event:${linkId}`;
}
function assetLinkByAssetKey(kind: AssetKind, assetId: string): string {
  return `asset-link:by-asset:${kind}:${assetId}`;
}
const ASSET_LINK_RECENT = 'asset-link:recent';

/** 仅测试用：清空内存 AssetEvidenceLink */
export function __resetMemoryAssetLinks(): void {
  memoryAssetEvidenceLinks.clear();
}

export async function saveAssetEvidenceLink(link: AssetEvidenceLink): Promise<void> {
  memoryAssetEvidenceLinks.set(link.linkId, link);
  const redis = getRedis();
  if (!redis) return;
  await redis.set(assetLinkKey(link.linkId), link);
  await redis.lpush(assetLinkByAssetKey(link.assetKind, link.assetId), link.linkId);
  await redis.lpush(ASSET_LINK_RECENT, link.linkId);
  await redis.ltrim(ASSET_LINK_RECENT, 0, 499);
}

export async function findAssetEvidenceLinks(kind: AssetKind, assetId: string): Promise<AssetEvidenceLink[]> {
  const redis = getRedis();
  let ids: string[];
  if (redis) {
    ids = await redis.lrange<string>(assetLinkByAssetKey(kind, assetId), 0, 99);
  } else {
    ids = [...memoryAssetEvidenceLinks.values()]
      .filter(l => l.assetKind === kind && l.assetId === assetId)
      .map(l => l.linkId);
  }
  const links = redis
    ? (await Promise.all(ids.map(id => redis!.get<AssetEvidenceLink>(assetLinkKey(id)))))
        .filter((l): l is AssetEvidenceLink => l !== null)
    : ids.map(id => memoryAssetEvidenceLinks.get(id)).filter((l): l is AssetEvidenceLink => Boolean(l));
  return links
    .filter(l => l.assetKind === kind && l.assetId === assetId)
    .sort((a, b) => (b.seq ?? 0) - (a.seq ?? 0) || b.approvedAt.localeCompare(a.approvedAt));
}

export async function findRecentAssetEvidenceLinks(limit = 100): Promise<AssetEvidenceLink[]> {
  const redis = getRedis();
  let ids: string[];
  if (redis) {
    ids = await redis.lrange<string>(ASSET_LINK_RECENT, 0, Math.max(0, limit - 1));
  } else {
    ids = [...memoryAssetEvidenceLinks.values()]
      .sort((a, b) => b.approvedAt.localeCompare(a.approvedAt))
      .slice(0, limit)
      .map(l => l.linkId);
  }
  const links = redis
    ? (await Promise.all(ids.map(id => redis!.get<AssetEvidenceLink>(assetLinkKey(id)))))
        .filter((l): l is AssetEvidenceLink => l !== null)
    : ids.map(id => memoryAssetEvidenceLinks.get(id)).filter((l): l is AssetEvidenceLink => Boolean(l));
  return links.sort((a, b) => (b.seq ?? 0) - (a.seq ?? 0) || b.approvedAt.localeCompare(a.approvedAt));
}

// ---------------------------------------------------------------------------
// Port 工厂 —— 上层依赖 AssetEvidenceLinkRepositoryPort 接口，不依赖具体函数
// ---------------------------------------------------------------------------

export function createAssetEvidenceLinkStore(): AssetEvidenceLinkRepositoryPort {
  return {
    async save(link: AssetEvidenceLink): Promise<void> {
      await saveAssetEvidenceLink(link);
    },
    async findByAsset(kind: AssetKind, assetId: string): Promise<AssetEvidenceLink[]> {
      return findAssetEvidenceLinks(kind, assetId);
    },
    async findRecent(limit?: number): Promise<AssetEvidenceLink[]> {
      return findRecentAssetEvidenceLinks(limit);
    },
  };
}
