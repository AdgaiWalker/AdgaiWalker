import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { afterEach, expect, it, vi } from 'vitest';
import type { ContentFileRepositoryPort } from '../ports/content-file.repository';
import { CONTENT_FILE_REPOSITORY } from '../ports/content-file.repository';
import { CONTENT_MUTATION_SERVICE } from '../ports/content-mutation.port';
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
