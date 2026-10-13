/**
 * 内容台账读模型（PRD A1/A2、TECH-DESIGN §6.1）
 *
 * 阶段与分组**只**来自 packages/shared 的唯一实现：
 *   resolveVisibility（可见性）· missingPublishedPostFields（门禁缺口）·
 *   deriveContentStage（四阶段）· resolveContentGroup（展示分组）
 * 本层不做任何判据推导，只做「文件事实 + git 事实」的合流。
 *
 * git 不可用时如实置 gitAvailable=false（阶段相关的脏/干净事实缺失），
 * 由前端显示「未知」，不得据此编造「已上线」（PRD §3.8）。
 */
import { Inject, Injectable, Optional } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  deriveContentStage,
  missingPublishedPostFields,
  publicItemHash,
  resolveContentGroup,
  resolveVisibility,
  toPublicSnapshotSource,
  type ContentLedger,
  type ContentLedgerEntry,
} from '@walker/shared';
import {
  CONTENT_LEDGER_REPOSITORY,
  type ContentLedgerRepositoryPort,
  type ContentLedgerSourceEntry,
} from '../ports/content-ledger.repository';
import { GIT_STATUS, type GitStatusPort } from '../ports/git-status.repository';
import { CONTENT_RELEASE_REPOSITORY, type ContentReleaseRepositoryPort } from '../ports/content-release.repository';
import { PUBLIC_SNAPSHOT_REPOSITORY, type PublicSnapshotRepositoryPort } from '../ports/public-snapshot.repository';

@Injectable()
export class ContentLedgerService {
  constructor(
    @Inject(CONTENT_LEDGER_REPOSITORY)
    private readonly entries: ContentLedgerRepositoryPort,
    @Inject(GIT_STATUS) private readonly git: GitStatusPort,
    @Optional() @Inject(CONTENT_RELEASE_REPOSITORY)
    private readonly releases?: ContentReleaseRepositoryPort,
    @Optional() @Inject(PUBLIC_SNAPSHOT_REPOSITORY)
    private readonly snapshots?: PublicSnapshotRepositoryPort,
  ) {}

  async ledger(): Promise<ContentLedger> {
    const [entries, git] = await Promise.all([
      this.entries.list(),
      this.git.snapshot(),
    ]);
    const releasesResult = this.releases
      ? await Promise.allSettled([
          this.releases.listLatestPerTarget(),
          this.releases.listLatestPublishedPerTarget(),
        ])
      : null;
    const publicationAvailable = Boolean(releasesResult?.every((result) => result.status === 'fulfilled'));
    const latestAttempts = releasesResult?.[0]?.status === 'fulfilled' ? releasesResult[0].value : [];
    const latestPublished = releasesResult?.[1]?.status === 'fulfilled' ? releasesResult[1].value : [];
    const attemptsBySlug = new Map(latestAttempts.map((release) => [release.target.slug, release]));
    const publishedBySlug = new Map(latestPublished.map((release) => [release.target.slug, release]));
    let indexedBySlug = new Map<string, string>();
    if (this.snapshots) {
      try {
        indexedBySlug = new Map((await this.snapshots.readActive()).items.map((item) => [item.slug, item.hash]));
      } catch {
        // 快照不可读时索引版本未知，不把缺失伪装成已同步。
      }
    }
    const dirtyFiles = new Set(git.dirtyFiles);
    return {
      items: entries.map((entry) => {
        const item = this.toItem(entry, dirtyFiles, git.available);
        const published = publishedBySlug.get(entry.slug);
        item.publication = {
          currentPublicHash: this.currentPublicHash(entry),
          publishedHash: published?.verifiedHash ?? null,
          verifiedAt: published?.verifiedAt ?? null,
          indexedHash: indexedBySlug.get(entry.slug) ?? null,
          latestAttemptStage: attemptsBySlug.get(entry.slug)?.stage ?? null,
        };
        return item;
      }),
      generatedAt: new Date().toISOString(),
      gitAvailable: git.available,
      publicationAvailable,
    };
  }

  private currentPublicHash(entry: ContentLedgerSourceEntry): string | null {
    if (entry.body === undefined || resolveVisibility(entry.frontmatter) !== 'public') return null;
    try {
      return publicItemHash(
        toPublicSnapshotSource({ slug: entry.slug, data: entry.frontmatter, body: entry.body }),
        (text) => createHash('sha256').update(text).digest('hex'),
      );
    } catch {
      return null;
    }
  }

  /** 单条：文件事实 + git 事实 → shared 判据 */
  private toItem(
    entry: ContentLedgerSourceEntry,
    dirtyFiles: ReadonlySet<string>,
    gitAvailable: boolean,
  ): ContentLedgerEntry {
    const visibility = resolveVisibility(entry.frontmatter);
    const missing = missingPublishedPostFields(entry.frontmatter);
    const dirty =
      gitAvailable &&
      (dirtyFiles.has(`${entry.slug}.md`) || dirtyFiles.has(`${entry.slug}.mdx`));
    return {
      slug: entry.slug,
      title: entry.title,
      type: entry.type,
      group: resolveContentGroup(entry.type),
      stage: deriveContentStage({ visibility, missingFields: missing, dirty }),
      visibility,
      missing: visibility === 'public' ? missing : [],
      dirty,
      publication: {
        currentPublicHash: null,
        publishedHash: null,
        verifiedAt: null,
        indexedHash: null,
        latestAttemptStage: null,
      },
      updatedAt: entry.updatedAt,
    };
  }
}
