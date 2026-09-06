import { describe, expect, it, vi } from 'vitest';
import type { PrismaPort } from '../ports/prisma.port';
import type { SiteContentIndexPort } from '../ports/site-content-index.port';
import { InsightsService } from './insights.service';

function harness(existing: { id: string; title: string } | null = null) {
  const created: Array<Record<string, unknown>> = [];
  const client = {
    seed: {
      findFirst: vi.fn(async () => existing),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return data;
      }),
    },
  };
  const prisma: PrismaPort = {
    getClient: () => client as never,
    isWritable: () => true,
    async ping() {
      return true;
    },
  };
  const index: SiteContentIndexPort = {
    async loadCitable() {
      return [];
    },
    async loadCitableFull() {
      return [];
    },
  };
  return { service: new InsightsService(prisma, index), created, client: client as never };
}

describe('InsightsService.createSeedFromSuggestion（M4-3）', () => {
  it('仅 write 类建议可转；空文本拒绝', async () => {
    const h = harness();
    await expect(
      h.service.createSeedFromSuggestion({ kind: 'build', text: '做个小工具' }),
    ).rejects.toSatisfy((e: { getResponse?: () => { message?: string } }) =>
      e.getResponse?.()?.message === 'only-write-suggestions',
    );
    await expect(
      h.service.createSeedFromSuggestion({ kind: 'write', text: '   ' }),
    ).rejects.toSatisfy((e: { getResponse?: () => { message?: string } }) =>
      e.getResponse?.()?.message === 'suggestion-text-required',
    );
    expect(h.created).toHaveLength(0);
  });

  it('建 INBOX 题苗，evidence 落 whyNow，标题截断 60 字', async () => {
    const h = harness();
    const r = await h.service.createSeedFromSuggestion({
      kind: 'write',
      text: '写一篇超长标题'.padEnd(80, '长'),
      evidence: '依据：近 7 天 3 次搜索没找到',
    });
    expect(r.reused).toBe(false);
    expect(h.created[0]).toMatchObject({
      workflowStatus: 'INBOX',
      whyNow: '依据：近 7 天 3 次搜索没找到',
    });
    expect((h.created[0]!.title as string).length).toBe(60);
  });

  it('7 天内同题幂等复用既有题苗', async () => {
    const h = harness({ id: 'seed-old', title: '写周报自动化' });
    const r = await h.service.createSeedFromSuggestion({
      kind: 'write',
      text: '写周报自动化',
      evidence: '重复建议',
    });
    expect(r).toMatchObject({ id: 'seed-old', reused: true });
    expect(h.created).toHaveLength(0);
  });
});
