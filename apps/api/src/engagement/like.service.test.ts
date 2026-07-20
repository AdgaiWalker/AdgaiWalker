import { describe, expect, it } from 'vitest';
import { LikeService } from './like.service';
import type { LikeRepositoryPort } from '../ports/like.repository';
import type { FeatureEventPort } from '../ports/feature-event.port';
import type { PrismaPort } from '../ports/prisma.port';

describe('LikeService', () => {
  it('increment 走仓储并返回真实计数', async () => {
    let n = 0;
    const likes: LikeRepositoryPort = {
      getCount: async () => n,
      increment: async () => {
        n += 1;
        return n;
      },
    };
    const events: FeatureEventPort = {
      record: async () => {},
      listRecent: async () => [],
      aggregate: async () => ({ byFeature: {}, failCodes: {} }),
    };
    const prisma: PrismaPort = {
      getClient: () => null,
      isWritable: () => true,
      ping: async () => true,
    };
    const svc = new LikeService(prisma, likes, events);
    await expect(svc.like('/posts/hello')).resolves.toEqual({
      path: '/posts/hello',
      count: 1,
    });
    await expect(svc.like('/posts/hello')).resolves.toEqual({
      path: '/posts/hello',
      count: 2,
    });
  });

  it('无存储时写失败 storage-unavailable', async () => {
    const likes: LikeRepositoryPort = {
      getCount: async () => 0,
      increment: async () => 1,
    };
    const events: FeatureEventPort = {
      record: async () => {},
      listRecent: async () => [],
      aggregate: async () => ({ byFeature: {}, failCodes: {} }),
    };
    const prisma: PrismaPort = {
      getClient: () => null,
      isWritable: () => false,
      ping: async () => false,
    };
    const svc = new LikeService(prisma, likes, events);
    await expect(svc.like('/posts/x')).rejects.toSatisfy(
      (e: { getResponse?: () => { code?: string } }) =>
        e.getResponse?.()?.code === 'storage-unavailable',
    );
  });
});
