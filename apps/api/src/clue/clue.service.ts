import { Inject, Injectable } from '@nestjs/common';
import {
  assertClueBody,
  isClueSource,
  type CluePoolStatus,
  type ClueSource,
} from '@walker/shared';
import { newId } from '../common/ids';
import {
  storageUnavailable,
  validationError,
} from '../common/http-error';
import {
  CLUE_REPOSITORY,
  type ClueRepositoryPort,
} from '../ports/clue.repository';
import {
  FEATURE_EVENT,
  type FeatureEventPort,
} from '../ports/feature-event.port';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';

@Injectable()
export class ClueService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaPort,
    @Inject(CLUE_REPOSITORY) private readonly clues: ClueRepositoryPort,
    @Inject(FEATURE_EVENT) private readonly events: FeatureEventPort,
  ) {}

  async list(limit = 50) {
    if (!this.prisma.isWritable()) throw storageUnavailable();
    return this.clues.list(limit);
  }

  async createManual(body: string, source: string = 'manual-self') {
    if (!this.prisma.isWritable()) throw storageUnavailable();
    try {
      assertClueBody(body);
    } catch {
      throw validationError('clue-body-too-short');
    }
    if (!isClueSource(source)) throw validationError('invalid-source');
    const clue = await this.clues.create({
      id: newId(),
      body: body.trim(),
      source: source as ClueSource,
      poolStatus: 'candidate',
      anonId: null,
    });
    await this.events.record({
      id: newId(),
      featureKey: 'clue.create_manual',
      event: 'success',
      actorType: 'owner',
      props: { clueId: clue.id },
    });
    return clue;
  }

  async setPoolStatus(id: string, poolStatus: CluePoolStatus) {
    if (!this.prisma.isWritable()) throw storageUnavailable();
    if (!['candidate', 'in-pool', 'discarded'].includes(poolStatus)) {
      throw validationError('invalid-pool-status');
    }
    return this.clues.updatePoolStatus(id, poolStatus);
  }
}
