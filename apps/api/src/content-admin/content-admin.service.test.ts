import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ContentFileRepositoryPort } from '../ports/content-file.repository';
import { CONTENT_FILE_REPOSITORY } from '../ports/content-file.repository';
import { CONTENT_MUTATION_SERVICE } from '../ports/content-mutation.port';
import { PRISMA } from '../ports/prisma.port';
import { ContentAdminService } from './content-admin.service';

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: spawnMock }));

const raw = '---\ntitle: 人工保存\ntype: knowledge\n---\n正文';
const hash = 'a'.repeat(64);
const detail = { slug: 'manual-save', title: '人工保存', type: 'knowledge', updatedAt: '2026-09-25T00:00:00.000Z', raw, hash, ext: '.md' as const };

afterEach(() => {
  vi.unstubAllEnvs();
  spawnMock.mockReset();
});

it('人工保存委托受控变更服务，不再启动 content:gen 刷新公共索引', async () => {
  vi.stubEnv('CONTENT_GEN_ON_SAVE', 'true');
  const files: ContentFileRepositoryPort = {
    async list() { return []; },
    async get() { return detail; },
    async save() { return detail; },
  };
  const mutation = { saveManual: vi.fn(async () => detail) };
  const child = { unref: vi.fn(), on: vi.fn().mockReturnThis() };
  spawnMock.mockReturnValue(child);
  const module = await Test.createTestingModule({
    providers: [
      ContentAdminService,
      { provide: CONTENT_FILE_REPOSITORY, useValue: files },
      { provide: CONTENT_MUTATION_SERVICE, useValue: mutation },
    ],
  }).compile();
  try {
    await module.get(ContentAdminService).save('manual-save', raw, hash);
    expect(mutation.saveManual).toHaveBeenCalledWith(expect.objectContaining({
      slug: 'manual-save', raw, expectedHash: hash, actor: 'owner',
    }));
    expect(spawnMock).not.toHaveBeenCalled();
  } finally {
    await module.close();
  }
});

it('记录社媒宣发流水，并统计总分享次数与最近分享时间', async () => {
  const auditRecords: any[] = [];
  const mockPrisma = {
    getClient: vi.fn(() => ({
      auditRecord: {
        create: vi.fn(async ({ data }: any) => {
          auditRecords.push(data);
          return data;
        }),
        findMany: vi.fn(async ({ where }: any) => {
          if (where.targetId) {
            return auditRecords.filter(
              (r) => r.targetType === where.targetType && r.targetId === where.targetId && r.action === where.action,
            );
          }
          return auditRecords.filter((r) => r.targetType === where.targetType && r.action === where.action);
        }),
      },
    })),
  };

  const files: ContentFileRepositoryPort = {
    async list() { return []; },
    async get(slug: string) { return slug === 'test-article' ? detail : null; },
    async save() { return detail; },
  };
  const mutation = { saveManual: vi.fn(async () => detail) };

  const module = await Test.createTestingModule({
    providers: [
      ContentAdminService,
      { provide: CONTENT_FILE_REPOSITORY, useValue: files },
      { provide: CONTENT_MUTATION_SERVICE, useValue: mutation },
      { provide: PRISMA, useValue: mockPrisma },
    ],
  }).compile();

  try {
    const service = module.get(ContentAdminService);

    // 初始状态：未分享
    const initStats = await service.getSocialStats('test-article');
    expect(initStats.shareCount).toBe(0);
    expect(initStats.lastSharedAt).toBeNull();

    // 第一次分享：overview 角度
    const res1 = await service.recordSocialShare('test-article', { channel: 'x', angle: 'overview' });
    expect(res1.ok).toBe(true);
    expect(res1.record.channel).toBe('x');
    expect(res1.record.angle).toBe('overview');
    expect(res1.stats.shareCount).toBe(1);

    // 第二次重复引用分享：quote 角度
    const res2 = await service.recordSocialShare('test-article', { channel: 'x', angle: 'quote', note: '二次金句引用' });
    expect(res2.stats.shareCount).toBe(2);
    expect(res2.record.note).toBe('二次金句引用');

    // 批量汇总
    const summary = await service.getAllSocialStatsSummary();
    expect(summary['test-article']?.shareCount).toBe(2);
    expect(summary['test-article']?.lastSharedAt).toBeDefined();
  } finally {
    await module.close();
  }
});
