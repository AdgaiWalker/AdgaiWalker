import { resolvePublicSiteUrl, verifyPublicSnapshot } from '@walker/shared';
import { sha256Hex } from '../common/crypto';
import type { VerifiedPublicSnapshot } from '../ports/public-snapshot.repository';

/**
 * 统一从线上公开站点拉取并校验 `public-manifest.json`：
 * 强制禁用缓存、限制超时，并通过 `verifyPublicSnapshot` 核验逐条与整包摘要。
 */
export async function fetchVerifiedPublicManifest(options?: {
  siteBase?: string;
  timeoutMs?: number;
}): Promise<VerifiedPublicSnapshot> {
  const base = resolvePublicSiteUrl(options?.siteBase || process.env.PUBLIC_SITE_URL);
  const res = await fetch(`${base}/public-manifest.json?_t=${Date.now()}`, {
    headers: {
      accept: 'application/json',
      'cache-control': 'no-cache, no-store, must-revalidate',
      pragma: 'no-cache',
    },
    signal: AbortSignal.timeout(options?.timeoutMs ?? 10_000),
  });
  if (!res.ok) {
    throw new Error(`manifest-http-${res.status}`);
  }
  const raw = (await res.json()) as unknown;
  if (!verifyPublicSnapshot(raw, sha256Hex)) {
    throw new Error('manifest-hash-invalid');
  }
  return raw as VerifiedPublicSnapshot;
}
