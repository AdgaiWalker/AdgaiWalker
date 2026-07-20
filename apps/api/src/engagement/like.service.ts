import { Inject, Injectable } from '@nestjs/common';
import { newId } from '../common/ids';
import {
  storageUnavailable,
  validationError,
} from '../common/http-error';
import {
  FEATURE_EVENT,
  type FeatureEventPort,
} from '../ports/feature-event.port';
import {
  LIKE_REPOSITORY,
  type LikeRepositoryPort,
} from '../ports/like.repository';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';

@Injectable()
export class LikeService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaPort,
    @Inject(LIKE_REPOSITORY) private readonly likes: LikeRepositoryPort,
    @Inject(FEATURE_EVENT) private readonly events: FeatureEventPort,
  ) {}

  async get(path: string) {
    if (!this.prisma.isWritable()) throw storageUnavailable();
    const p = normalizePath(path);
    return { path: p, count: await this.likes.getCount(p) };
  }

  async like(path: string) {
    if (!this.prisma.isWritable()) throw storageUnavailable();
    const p = normalizePath(path);
    const count = await this.likes.increment(p);
    await this.events.record({
      id: newId(),
      featureKey: 'like.click',
      event: 'success',
      actorType: 'guest',
      props: { path: p, count },
    });
    return { path: p, count };
  }
}

function normalizePath(path: string): string {
  const p = path.trim();
  if (!p.startsWith('/') || p.length < 2 || p.length > 200) {
    throw validationError('invalid-like-path');
  }
  return p;
}
