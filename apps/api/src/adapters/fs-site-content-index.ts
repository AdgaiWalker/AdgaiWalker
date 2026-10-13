/**
 * 问答索引只读已核验公开快照。没有基线时失败，不拿工作区最新文件冒充公开版本。
 */
import { Inject, Injectable, Optional } from '@nestjs/common';
import type {
  SiteContentSnapshot,
  SiteContentFullEntry,
  SiteContentIndexPort,
} from '../ports/site-content-index.port';
import {
  PUBLIC_SNAPSHOT_REPOSITORY,
  type PublicSnapshotRepositoryPort,
} from '../ports/public-snapshot.repository';
import { FsPublicSnapshotRepository } from './fs-public-snapshot.repository';

const MAX_ENTRIES = 40;
const MAX_SUMMARY_CHARS = 80;
/** 整库注入包的正文总字符硬上限（PRD：超 50 篇切索引式之前的保险丝） */
const MAX_FULL_PACK_CHARS = 60_000;

@Injectable()
export class FsSiteContentIndex implements SiteContentIndexPort {
  constructor(
    @Optional()
    @Inject(PUBLIC_SNAPSHOT_REPOSITORY)
    private readonly snapshotRepo?: PublicSnapshotRepositoryPort,
  ) {}

  private async readSnapshot(): Promise<SiteContentSnapshot> {
    const repo = this.snapshotRepo ?? new FsPublicSnapshotRepository();
    const snapshot = await repo.readActive();
    const denied = repo instanceof FsPublicSnapshotRepository ? repo.readDeniedSlugs() : new Set<string>();
    const items = snapshot.items.filter(
      (item) => item.readable && item.citable && (denied === 'deny-all' ? false : !denied.has(item.slug)),
    );
    const entries: SiteContentFullEntry[] = items.slice(0, MAX_ENTRIES).map((item) => ({
      slug: item.slug,
      title: item.title,
      summary: item.summary.slice(0, MAX_SUMMARY_CHARS),
      tags: item.tags.slice(0, 5),
      actionable: false,
      body: item.body,
    }));
    return { buildId: snapshot.buildId, collectionHash: snapshot.collectionHash, entries };
  }

  async loadCitable() {
    const { entries } = await this.readSnapshot();
    return entries.map(({ body: _body, ...rest }) => rest);
  }

  async loadCitableFull() {
    return (await this.loadCitableSnapshot()).entries;
  }

  async loadCitableSnapshot(): Promise<SiteContentSnapshot> {
    const snapshot = await this.readSnapshot();
    // items 按日期倒序（构建产物保证）：超预算时从最旧的一端丢弃
    const entries: SiteContentFullEntry[] = [];
    let used = 0;
    for (const item of snapshot.entries) {
      if (used + item.body.length > MAX_FULL_PACK_CHARS) break;
      entries.push(item);
      used += item.body.length;
    }
    return { ...snapshot, entries };
  }
}
