import { HttpStatus } from '@nestjs/common';
import {
  isBrowsePostType,
  missingPublishedPostFields,
  publicItemHash,
  resolveVisibility,
  stripFrontmatterBlock,
  toPublicSnapshotSource,
  validatePublishablePost,
  type ContentVersionSnapshot,
  type ReleaseManifest,
  type ReleaseManifestItem,
  type ReleasePreflightResult,
} from '@walker/shared';
import { sha256Hex } from '../common/crypto';
import { ApiError } from '../common/http-error';
import type { ContentFileRepositoryPort } from '../ports/content-file.repository';
import type { ContentLedgerRepositoryPort } from '../ports/content-ledger.repository';
import type { ContentReleaseRepositoryPort } from '../ports/content-release.repository';
import type { GitStatusPort } from '../ports/git-status.repository';
import type { PublicSnapshotRepositoryPort } from '../ports/public-snapshot.repository';

export interface ReleasePreflightDeps {
  entries: ContentLedgerRepositoryPort;
  files?: ContentFileRepositoryPort;
  git?: GitStatusPort;
  releasesRepo?: ContentReleaseRepositoryPort;
  publicSnapshots?: PublicSnapshotRepositoryPort;
}

/** 仅对公开内容计算与 public-manifest.json 同源的条目标识哈希 */
export function computeCurrentPublicHash(
  slug: string,
  frontmatter: Record<string, unknown>,
  raw: string,
): string | null {
  if (resolveVisibility(frontmatter) !== 'public') return null;
  try {
    return publicItemHash(
      toPublicSnapshotSource({ slug, data: frontmatter, body: stripFrontmatterBlock(raw) }),
      sha256Hex,
    );
  } catch {
    return null;
  }
}

/** 上线前预检：只读门禁校验，零写动作（PRD A7）。 */
export async function runReleasePreflight(
  deps: ReleasePreflightDeps,
  slug: string,
): Promise<ReleasePreflightResult> {
  const entry = await deps.entries.get(slug);
  if (!entry) {
    throw new ApiError('content-not-found', HttpStatus.NOT_FOUND, '内容不存在');
  }
  const missing = [...missingPublishedPostFields(entry.frontmatter)];
  if (missing.length > 0) {
    return { ok: false, missing, targetSlug: slug, targetHash: null, manifest: null, scopeConflict: null };
  }

  const existingPublicSummaries = new Map<string, string>();
  const allEntries = await deps.entries.list().catch(() => []);
  for (const other of allEntries) {
    if (other.slug === slug) continue;
    if (resolveVisibility(other.frontmatter) !== 'public' || !isBrowsePostType(other.type)) continue;
    const sum = typeof other.frontmatter.summary === 'string' ? other.frontmatter.summary.trim() : '';
    if (sum && !existingPublicSummaries.has(sum)) existingPublicSummaries.set(sum, other.slug);
  }
  const validation = validatePublishablePost({
    slug,
    frontmatter: entry.frontmatter,
    existingPublicSummaries,
  });
  if (!validation.ok) {
    return {
      ok: false,
      missing: validation.missing,
      targetSlug: slug,
      targetHash: null,
      manifest: null,
      scopeConflict: {
        reason: 'publish-contract-invalid',
        message: validation.issues.join('；'),
        details: validation.issues,
      },
    };
  }

  const doc = await deps.files?.get(slug);
  if (!doc) throw new ApiError('content-not-found', HttpStatus.NOT_FOUND, '发布正本文件不存在');
  const targetHash = doc.hash;
  const publicHash = publicItemHash(
    toPublicSnapshotSource({ slug, data: entry.frontmatter, body: stripFrontmatterBlock(doc.raw) }),
    sha256Hex,
  );

  if (!deps.git?.workspaceSnapshot) {
    return {
      ok: false,
      missing: [],
      targetSlug: slug,
      targetHash,
      publicHash,
      manifest: null,
      scopeConflict: { reason: 'git-unavailable', message: 'Git 状态不可用，无法进行发布预检', details: [] },
    };
  }

  const ws = await deps.git.workspaceSnapshot();
  if (!ws.available) {
    return {
      ok: false,
      missing: [],
      targetSlug: slug,
      targetHash,
      manifest: null,
      scopeConflict: {
        reason: 'git-unavailable',
        message: 'Git 状态不可用，无法进行发布预检',
        details: [],
      },
    };
  }

  // Gate 1 无工作树单篇原子提交：只把目标文章与它的版本历史写入临时 GIT_INDEX_FILE
  const targetPath = `content/log/${slug}${doc.ext || '.md'}`;
  const items: ReleaseManifestItem[] = [
    {
      path: targetPath,
      slug,
      hash: targetHash,
      kind: 'content',
      status: 'modified',
    },
  ];
  const manifestPayload = JSON.stringify({
    targetSlug: slug,
    targetHash,
    headCommit: ws.headCommit,
    items,
  });
  const manifestHash = sha256Hex(manifestPayload);
  const manifest: ReleaseManifest = {
    targetSlug: slug,
    targetHash,
    headCommit: ws.headCommit,
    manifestHash,
    items,
    createdAt: new Date().toISOString(),
  };

  return {
    ok: true,
    missing: [],
    targetSlug: slug,
    targetHash,
    publicHash,
    manifest,
    scopeConflict: null,
  };
}

/**
 * 内容版本快照（TECH-DESIGN §5.2）：
 * 分别从文件正本、已发布发布记录、已激活问答快照三个独立真相源推导，不相互覆盖。
 */
export async function readContentVersionSnapshot(
  deps: Pick<ReleasePreflightDeps, 'files' | 'entries' | 'releasesRepo' | 'publicSnapshots'>,
  slug: string,
): Promise<ContentVersionSnapshot> {
  const doc = deps.files ? await deps.files.get(slug) : null;
  const workingHash = doc?.hash ?? null;

  let currentPublicHash: string | null = null;
  if (doc && deps.entries) {
    try {
      const entry = await deps.entries.get(slug);
      if (entry) {
        currentPublicHash = computeCurrentPublicHash(slug, entry.frontmatter, doc.raw);
      }
    } catch {
      currentPublicHash = null;
    }
  }

  let publishedHash: string | null = null;
  if (deps.releasesRepo) {
    const latest = await deps.releasesRepo.findLatestPublishedForTarget(slug);
    if (latest && latest.stage === 'PUBLISHED') {
      publishedHash = latest.verifiedHash;
    }
  }

  let indexedHash: string | null = null;
  if (deps.publicSnapshots) {
    try {
      const active = await deps.publicSnapshots.readActive();
      const entry = active.items?.find((item) => item.slug === slug);
      if (entry) {
        indexedHash = entry.hash;
      }
    } catch {
      indexedHash = null;
    }
  }

  return {
    workingHash,
    currentPublicHash,
    publishedHash,
    indexedHash,
  };
}
