/**
 * AssetEvidenceLink Store — 实现 AssetEvidenceLinkRepositoryPort（P2-B）
 *
 * 薄壳委托给 conversation/store.ts 的资产晋升证据链存储（Redis + 内存降级）。
 */
import type { AssetEvidenceLink, AssetEvidenceLinkRepositoryPort, AssetKind } from './ports';
import {
  findAssetEvidenceLinks,
  findRecentAssetEvidenceLinks,
  saveAssetEvidenceLink,
} from '@/conversation/store';

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
