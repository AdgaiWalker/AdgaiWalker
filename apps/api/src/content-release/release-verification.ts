import { HttpStatus, type Logger } from '@nestjs/common';
import {
  requireVersionNote,
  resolvePublicSiteUrl,
  type ContentRelease,
  type ReleaseVerificationResult,
} from '@walker/shared';
import { fetchVerifiedPublicManifest } from '../adapters/live-public-manifest';
import { ApiError, validationError } from '../common/http-error';
import type { ArticleVersionStorePort } from '../ports/article-version-store.port';
import type { ContentChangeRepositoryPort } from '../ports/content-change.repository';
import type { ContentFileRepositoryPort } from '../ports/content-file.repository';
import type { ContentReleaseRepositoryPort } from '../ports/content-release.repository';
import type { PublicSnapshotRepositoryPort } from '../ports/public-snapshot.repository';
import type { WebsiteDeploymentVerifierPort } from '../ports/website-deployment-verifier.port';

export interface ReleaseVerificationDeps {
  releasesRepo?: ContentReleaseRepositoryPort;
  websiteVerifier?: WebsiteDeploymentVerifierPort;
  articleVersions?: ArticleVersionStorePort;
  files?: ContentFileRepositoryPort;
  changesRepo?: ContentChangeRepositoryPort;
  publicSnapshots?: PublicSnapshotRepositoryPort;
  log: Logger;
}

/**
 * 固化不可变公开版本（fail-open：网页上线优先）。
 * 对账红线：若批准后文件又被改写（appliedHash !== 当前文件 hash），拒绝写入防把未上线草稿记为已发布。
 */
async function archivePublishedVersion(
  deps: ReleaseVerificationDeps,
  release: ContentRelease,
  verifiedAt: string,
): Promise<void> {
  if (!deps.articleVersions) return;
  try {
    const doc = await deps.files?.get(release.target.slug);
    const note = requireVersionNote(release.versionNote?.trim() || '发布新版本');
    const change = deps.changesRepo ? await deps.changesRepo.findById(release.changeId) : null;
    const appliedHash = change?.appliedHash ?? null;
    if (!doc) throw new Error('version-source-file-missing');
    if (appliedHash !== null && appliedHash !== doc.hash) {
      throw new Error(
        `version-source-drift: 线上内容是 appliedHash=${appliedHash.slice(0, 12)} 的版本，` +
          `当前文件已是 ${doc.hash.slice(0, 12)}（未上线的新草稿），拒绝把草稿记成已发布版本`,
      );
    }
    await deps.articleVersions.appendVersion({
      slug: release.target.slug,
      rawBody: doc.raw,
      note,
      publishedAt: verifiedAt,
      releaseId: release.id,
    });
  } catch (err: unknown) {
    deps.log.error(
      `版本历史写入失败 releaseId=${release.id}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** 问答快照切换（C17）：独立记录 SYNCING → SYNCED/FAILED，失败不回滚网页 PUBLISHED 事实。 */
async function syncAssistantSnapshot(
  deps: ReleaseVerificationDeps,
  release: ContentRelease,
  siteBase: string,
): Promise<ContentRelease> {
  if (!deps.publicSnapshots || !deps.releasesRepo) return release;
  try {
    await deps.releasesRepo.updateIndexState({ id: release.id, assistantIndexState: 'SYNCING' });
    const manifest = await fetchVerifiedPublicManifest({ siteBase });
    const targetEntry = manifest.items?.find((item) => item.slug === release.target.slug);
    if (!targetEntry || targetEntry.hash !== release.sourceHash) {
      throw new Error('manifest-missing-target-version');
    }
    await deps.publicSnapshots.publish(manifest);
    return await deps.releasesRepo.updateIndexState({
      id: release.id,
      assistantIndexState: 'SYNCED',
      publishedSnapshotId: manifest.collectionHash,
    });
  } catch (err: unknown) {
    deps.log.error(
      `问答快照同步失败 releaseId=${release.id}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return deps.releasesRepo.updateIndexState({ id: release.id, assistantIndexState: 'FAILED' });
  }
}

/** 线上版本核验（PRD A10 / C16）：必须确证目标 hash 才推进 VERIFYING → PUBLISHED。 */
export async function verifyContentRelease(
  deps: ReleaseVerificationDeps,
  releaseId: string,
): Promise<ReleaseVerificationResult> {
  if (!deps.releasesRepo) throw validationError('content-release-repository-unavailable');
  if (!deps.websiteVerifier) throw validationError('website-verifier-unavailable');

  const release = await deps.releasesRepo.findById(releaseId);
  if (!release) throw new ApiError('content-release-not-found', HttpStatus.NOT_FOUND, '找不到发布记录');

  if (release.stage === 'PUBLISHED') {
    return {
      releaseId: release.id,
      stage: release.stage,
      assistantIndexState: release.assistantIndexState,
      publishedSnapshotId: release.publishedSnapshotId,
      verified: true,
      verifiedHash: release.verifiedHash,
      reason: release.assistantIndexState === 'FAILED' ? 'assistant-index-sync-failed' : null,
    };
  }

  if (release.stage !== 'VERIFYING') {
    throw new ApiError(
      'content-release-not-verifying',
      HttpStatus.CONFLICT,
      `只有待核验的发布才能核验，当前状态：${release.stage}`,
    );
  }

  const base = resolvePublicSiteUrl(process.env.PUBLIC_SITE_URL);
  const url = `${base}/posts/${encodeURIComponent(release.target.slug)}`;
  const verification = await deps.websiteVerifier.verify(url, {
    slug: release.target.slug,
    expectedHash: release.sourceHash,
  });

  if (verification.ok !== true || verification.verifiedHash !== release.sourceHash) {
    return {
      releaseId: release.id,
      stage: release.stage,
      assistantIndexState: release.assistantIndexState,
      publishedSnapshotId: release.publishedSnapshotId,
      verified: false,
      verifiedHash: verification.verifiedHash ?? null,
      reason: verification.reason ?? 'online-hash-not-confirmed',
    };
  }

  const verifiedAt = new Date().toISOString();
  const updated = await deps.releasesRepo.updateStage({
    id: release.id,
    stage: 'PUBLISHED',
    verifiedHash: release.sourceHash,
    verifiedAt,
  });

  await archivePublishedVersion(deps, release, verifiedAt);
  const finalRelease = await syncAssistantSnapshot(deps, updated, base);

  return {
    releaseId: finalRelease.id,
    stage: finalRelease.stage,
    assistantIndexState: finalRelease.assistantIndexState,
    publishedSnapshotId: finalRelease.publishedSnapshotId,
    verified: true,
    verifiedHash: finalRelease.verifiedHash,
    reason: finalRelease.assistantIndexState === 'FAILED' ? 'assistant-index-sync-failed' : null,
  };
}
