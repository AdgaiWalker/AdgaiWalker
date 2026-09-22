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
import { Inject, Injectable } from '@nestjs/common';
import {
  deriveContentStage,
  missingPublishedPostFields,
  resolveContentGroup,
  resolveVisibility,
  type ContentLedger,
  type ContentLedgerEntry,
} from '@walker/shared';
import {
  CONTENT_LEDGER_REPOSITORY,
  type ContentLedgerRepositoryPort,
  type ContentLedgerSourceEntry,
} from '../ports/content-ledger.repository';
import { GIT_STATUS, type GitStatusPort } from '../ports/git-status.repository';

@Injectable()
export class ContentLedgerService {
  constructor(
    @Inject(CONTENT_LEDGER_REPOSITORY)
    private readonly entries: ContentLedgerRepositoryPort,
    @Inject(GIT_STATUS) private readonly git: GitStatusPort,
  ) {}

  async ledger(): Promise<ContentLedger> {
    const [entries, git] = await Promise.all([
      this.entries.list(),
      this.git.snapshot(),
    ]);
    const dirtyFiles = new Set(git.dirtyFiles);
    return {
      items: entries.map((entry) => this.toItem(entry, dirtyFiles, git.available)),
      generatedAt: new Date().toISOString(),
      gitAvailable: git.available,
    };
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
      updatedAt: entry.updatedAt,
    };
  }
}
