import { Inject, Injectable } from '@nestjs/common';
import {
  graduationProgress,
  isClueSource,
  isCountableLoop,
  isExternalSource,
  sourceBucket,
  type ClueSource,
  type DeliveryForm,
  type ReviewOutcome,
  type SourceBucket,
} from '@walker/shared';
import { storageUnavailable } from '../common/http-error';
import {
  EXECUTION_REPOSITORY,
  type ExecutionRepositoryPort,
} from '../ports/execution.repository';
import {
  FEATURE_EVENT,
  type FeatureEventPort,
} from '../ports/feature-event.port';
import {
  SEED_REPOSITORY,
  type SeedRepositoryPort,
} from '../ports/seed.repository';
import {
  CLUE_REPOSITORY,
  type ClueRepositoryPort,
} from '../ports/clue.repository';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';

const MS_DAY = 24 * 60 * 60 * 1000;
const BOX_DAYS = 14;

@Injectable()
export class MetricsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaPort,
    @Inject(EXECUTION_REPOSITORY)
    private readonly executions: ExecutionRepositoryPort,
    @Inject(SEED_REPOSITORY) private readonly seeds: SeedRepositoryPort,
    @Inject(CLUE_REPOSITORY) private readonly clues: ClueRepositoryPort,
    @Inject(FEATURE_EVENT) private readonly events: FeatureEventPort,
  ) {}

  async summary() {
    if (!this.prisma.isWritable()) throw storageUnavailable();
    const [execs, seeds, clueList, featureAgg] = await Promise.all([
      this.executions.list(200),
      this.seeds.list(200),
      this.clues.list(200),
      this.events.aggregate(),
    ]);

    let countableLoops = 0;
    let yesCount = 0;
    let externalLoopCount = 0;

    for (const ex of execs) {
      if (ex.outcome !== 'yes' && ex.outcome !== 'no') continue;
      const seed = seeds.find((s) => s.id === ex.seedId);
      if (!seed) continue;
      const ok = isCountableLoop({
        links: seed.links,
        delivery: {
          url: ex.deliveryUrl,
          form: ex.deliveryForm as DeliveryForm | null,
          note: ex.deliveryNote,
        },
        review: {
          outcome: ex.outcome as ReviewOutcome,
          evidence: ex.evidence,
        },
      });
      if (!ok) continue;
      countableLoops += 1;
      if (ex.outcome === 'yes') yesCount += 1;
      const primary = seed.links.find((l) => l.role === 'primary');
      if (primary) {
        const clue = clueList.find((c) => c.id === primary.clueId);
        if (clue && isClueSource(clue.source) && isExternalSource(clue.source)) {
          externalLoopCount += 1;
        }
      }
    }

    const bySource: Record<string, number> = {};
    const byBucket: Record<SourceBucket, number> = {
      visitor: 0,
      self: 0,
      external: 0,
    };
    const since = Date.now() - BOX_DAYS * MS_DAY;
    const byBucket14d: Record<SourceBucket, number> = {
      visitor: 0,
      self: 0,
      external: 0,
    };

    for (const c of clueList) {
      const src = isClueSource(c.source) ? c.source : ('other-external' as ClueSource);
      bySource[src] = (bySource[src] ?? 0) + 1;
      const bucket = sourceBucket(src);
      byBucket[bucket] += 1;
      const created = new Date(c.createdAt).getTime();
      if (!Number.isNaN(created) && created >= since) {
        byBucket14d[bucket] += 1;
      }
    }

    return {
      clues: clueList.length,
      seeds: seeds.length,
      executions: execs.length,
      countableLoops,
      yesCount,
      externalLoopCount,
      graduation: graduationProgress({
        countableLoops,
        yesCount,
        externalLoopCount,
      }),
      features: featureAgg,
      clueSources: {
        bySource,
        byBucket,
        byBucket14d,
        windowDays: BOX_DAYS,
      },
    };
  }
}
