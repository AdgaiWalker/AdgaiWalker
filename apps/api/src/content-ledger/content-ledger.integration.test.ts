import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigModule } from '../config/config.module';
import { KernelModule } from '../kernel.module';
import { ContentLedgerController } from './content-ledger.controller';
import { ContentAdminController } from '../content-admin/content-admin.controller';
import { ContentLedgerService } from './content-ledger.service';
import type {
  ContentLedgerRepositoryPort,
  ContentLedgerSourceEntry,
} from '../ports/content-ledger.repository';
import type { GitStatusPort } from '../ports/git-status.repository';
import { resolveContentLogDir } from '../adapters/content-log-dir';

/** 7 项必需字段齐全的公开 frontmatter */
const FULL_PUBLIC: Record<string, unknown> = {
  title: '完整公开文',
  type: 'knowledge',
  visibility: 'public',
  form: 'article',
  domain: 'product',
  intent: 'share',
  valueMode: 'utility',
  aiUsePolicy: { level: 'AI-2', readable: true, citable: true },
  updated: '2026-09-15',
  summary: '摘要',
};

function entry(slug: string, frontmatter: Record<string, unknown>, type = 'knowledge'): ContentLedgerSourceEntry {
  return { slug, title: slug, type, frontmatter, updatedAt: '2026-09-15T00:00:00.000Z' };
}

function serviceWith(
  entries: ContentLedgerSourceEntry[],
  git: { available: boolean; dirtyFiles: string[] },
): ContentLedgerService {
  const repo: ContentLedgerRepositoryPort = {
    list: async () => entries,
    get: async (slug) => entries.find((item) => item.slug === slug) ?? null,
  };
  const gitPort: GitStatusPort = {
    snapshot: async () => ({ ...git, headCommit: git.available ? 'deadbeef' : null }),
  };
  return new ContentLedgerService(repo, gitPort);
}

describe('内容台账读模型（阶段口径 = shared 唯一实现）', () => {
  it('四阶段边界：draft / review / ready / live', async () => {
    const service = serviceWith(
      [
        entry('draft-one', { ...FULL_PUBLIC, visibility: 'draft' }),
        entry('review-one', { ...FULL_PUBLIC, summary: '' }),
        entry('ready-one', FULL_PUBLIC),
        entry('live-one', FULL_PUBLIC),
      ],
      { available: true, dirtyFiles: ['ready-one.md'] },
    );
    const { items, gitAvailable } = await service.ledger();
    expect(gitAvailable).toBe(true);
    const stageBySlug = Object.fromEntries(items.map((item) => [item.slug, item.stage]));
    expect(stageBySlug).toEqual({
      'draft-one': 'draft',
      'review-one': 'review',
      'ready-one': 'ready',
      'live-one': 'live',
    });
  });

  it('private 归入 draft，并把门禁缺口收敛为空（草稿不显示缺口）', async () => {
    const service = serviceWith(
      [entry('secret-one', { ...FULL_PUBLIC, visibility: 'private', summary: '' })],
      { available: true, dirtyFiles: [] },
    );
    const { items } = await service.ledger();
    expect(items[0]!.stage).toBe('draft');
    expect(items[0]!.visibility).toBe('private');
    expect(items[0]!.missing).toEqual([]);
  });

  it('review 条目恰好列出缺失字段（口径与构建门禁同一份清单）', async () => {
    const service = serviceWith(
      [
        entry('missing-three', {
          title: '缺三项',
          type: 'knowledge',
          visibility: 'public',
          form: 'article',
          domain: 'product',
          intent: 'share',
          valueMode: 'utility',
        }),
      ],
      { available: true, dirtyFiles: [] },
    );
    const { items } = await service.ledger();
    expect(items[0]!.stage).toBe('review');
    expect(items[0]!.missing).toEqual(['aiUsePolicy', 'updated', 'summary']);
  });

  it('分组来自 frontmatter.type 的展示层映射', async () => {
    const service = serviceWith(
      [
        entry('p1', FULL_PUBLIC, 'project'),
        entry('t1', FULL_PUBLIC, 'tool'),
        entry('l1', FULL_PUBLIC, 'learn'),
        entry('i1', FULL_PUBLIC, 'idea'),
      ],
      { available: true, dirtyFiles: [] },
    );
    const { items } = await service.ledger();
    expect(items.map((item) => item.group)).toEqual(['product', 'product', 'article', 'idea']);
  });

  it('git 不可用：如实上报 gitAvailable=false，且不据此断言已上线', async () => {
    const service = serviceWith([entry('live-one', FULL_PUBLIC)], {
      available: false,
      dirtyFiles: [],
    });
    const { items, gitAvailable } = await service.ledger();
    expect(gitAvailable).toBe(false);
    // 事实缺失：dirty 只能算 false，前端凭 gitAvailable=false 显示「未知」（PRD §3.8）
    expect(items[0]!.dirty).toBe(false);
  });
});

describe('内容台账（真实 kernel 接线）', () => {
  let moduleRef: TestingModule;
  let service: ContentLedgerService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, KernelModule],
    }).compile();
    await moduleRef.init();
    service = moduleRef.get(ContentLedgerService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('返回条数 = content/log 目录条目数（PRD A1）', async () => {
    const dir = await resolveContentLogDir();
    const expected = fs
      .readdirSync(dir)
      .filter((name) => /\.(md|mdx)$/i.test(name) && fs.statSync(path.join(dir, name)).isFile());
    const { items, generatedAt } = await service.ledger();
    expect(items).toHaveLength(expected.length);
    expect(Number.isNaN(Date.parse(generatedAt))).toBe(false);
    // 每条的阶段都必须是 shared 四阶段之一（不出现编造值）
    for (const item of items) {
      expect(['draft', 'review', 'ready', 'live']).toContain(item.stage);
    }
  });

  it('路由注册顺序：ContentLedgerController 必须排在 ContentAdminController 之前', () => {
    // @Get(':slug') 已在册（content-admin.controller.ts:27-30）：
    // 若 ledger controller 注册在后，'/admin/content/ledger' 会被通配吃掉（TECH-DESIGN §6.2）
    const controllers: unknown[] =
      Reflect.getMetadata('controllers', KernelModule) ?? [];
    const ledgerIndex = controllers.indexOf(ContentLedgerController);
    const adminIndex = controllers.indexOf(ContentAdminController);
    expect(ledgerIndex).toBeGreaterThanOrEqual(0);
    expect(adminIndex).toBeGreaterThanOrEqual(0);
    expect(ledgerIndex).toBeLessThan(adminIndex);
  });
});
