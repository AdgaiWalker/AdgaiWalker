import { Inject, Injectable } from '@nestjs/common';
import { graduationProgress, isCountableLoop, type DeliveryForm, type ReviewOutcome } from '@walker/shared';
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
import { isExternalSource } from '@walker/shared';

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
      this.executions.list(100),
      this.seeds.list(100),
      this.clues.list(100),
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
        if (clue && isExternalSource(clue.source)) externalLoopCount += 1;
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
    };
  }
}
