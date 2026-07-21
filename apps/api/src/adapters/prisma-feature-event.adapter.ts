import { Inject, Injectable } from '@nestjs/common';
import { mergeFailCodeCounts, normalizeFeatureFailCode } from '@walker/shared';
import type { FeatureEventPort } from '../ports/feature-event.port';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';

/** 观测写入失败不抛 —— 不得拖垮主请求 */
@Injectable()
export class PrismaFeatureEventAdapter implements FeatureEventPort {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaPort) {}

  async record(input: {
    id: string;
    featureKey: string;
    event: 'expose' | 'attempt' | 'success' | 'fail';
    actorType: 'guest' | 'user' | 'owner';
    failCode?: string | null;
    props?: Record<string, unknown> | null;
  }): Promise<void> {
    const c = this.prisma.getClient();
    if (!c) return;
    try {
      await c.featureEvent.create({
        data: {
          id: input.id,
          featureKey: input.featureKey,
          event: input.event,
          actorType: input.actorType,
          failCode: input.failCode
            ? normalizeFeatureFailCode(input.failCode)
            : null,
          props: (input.props ?? undefined) as object | undefined,
        },
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(
        JSON.stringify({
          level: 'warn',
          msg: 'feature_event_write_failed',
          error: e instanceof Error ? e.message : String(e),
        }),
      );
    }
  }

  async listRecent(limit: number) {
    const c = this.prisma.getClient();
    if (!c) return [];
    return c.featureEvent.findMany({
      orderBy: { at: 'desc' },
      take: Math.min(limit, 100),
      select: {
        id: true,
        featureKey: true,
        event: true,
        actorType: true,
        failCode: true,
        at: true,
      },
    });
  }

  async aggregate() {
    const c = this.prisma.getClient();
    const byFeature: Record<
      string,
      { attempt: number; success: number; fail: number }
    > = {};
    const failCodes: Record<string, number> = {};
    if (!c) return { byFeature, failCodes };
    const rows = await c.featureEvent.findMany({
      where: {
        at: { gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) },
      },
      select: { featureKey: true, event: true, failCode: true },
    });
    for (const r of rows) {
      const slot = (byFeature[r.featureKey] ??= {
        attempt: 0,
        success: 0,
        fail: 0,
      });
      if (r.event === 'attempt') slot.attempt += 1;
      if (r.event === 'success') slot.success += 1;
      if (r.event === 'fail') {
        slot.fail += 1;
        if (r.failCode) {
          failCodes[r.failCode] = (failCodes[r.failCode] ?? 0) + 1;
        }
      }
    }
    return { byFeature, failCodes: mergeFailCodeCounts(failCodes) };
  }
}
