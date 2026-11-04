import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CONTENT_FILE_REPOSITORY,
  type ContentFileRepositoryPort,
} from '../ports/content-file.repository';
import { CONTENT_MUTATION_SERVICE } from '../ports/content-mutation.port';
import { ContentAdminController } from './content-admin.controller';
import { ContentAdminService } from './content-admin.service';

const files: ContentFileRepositoryPort = {
  list: async () => [
    {
      slug: 'hello-world',
      title: '你好',
      type: 'knowledge',
      updatedAt: '2026-08-12T00:00:00.000Z',
    },
  ],
  get: async (slug) => slug === 'hello-world' ? { slug, title: slug, type: 'knowledge', updatedAt: '2026-09-25T00:00:00.000Z', raw: 'text', hash: 'a'.repeat(64), ext: '.md' } : null,
  save: async (slug, raw, expectedHash) => {
    savedExpectedHash = expectedHash;
    return { slug, title: slug, type: 'knowledge', updatedAt: '2026-09-25T00:00:00.000Z', raw, hash: expectedHash ?? 'b'.repeat(64), ext: '.md' };
  },
  delete: async (slug) => slug === 'hello-world',
};
let savedExpectedHash: string | null | undefined;
const mutation = {
  async saveManual(input: { slug: string; raw: string; expectedHash: string | null }) {
    savedExpectedHash = input.expectedHash;
    return { slug: input.slug, title: input.slug, type: 'knowledge', updatedAt: '2026-09-25T00:00:00.000Z', raw: input.raw, hash: input.expectedHash ?? 'b'.repeat(64), ext: '.md' as const };
  },
};

@Module({
  controllers: [ContentAdminController],
  providers: [
    ContentAdminService,
    { provide: CONTENT_FILE_REPOSITORY, useValue: files },
    { provide: CONTENT_MUTATION_SERVICE, useValue: mutation },
  ],
})
class ContentAdminTestModule {}

describe('ContentAdminController dependency injection', () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await close?.();
    close = undefined;
    vi.unstubAllEnvs();
  });

  it('通过 Nest 容器注入服务并返回内容列表', async () => {
    const app = await NestFactory.createApplicationContext(
      ContentAdminTestModule,
      { logger: false },
    );
    close = () => app.close();

    const controller = app.get(ContentAdminController);
    await expect(controller.list()).resolves.toEqual([
      expect.objectContaining({ slug: 'hello-world', title: '你好' }),
    ]);
  });

  it('保存请求必须显式带 expectedHash 并把它传给受控变更服务', async () => {
    const app = await NestFactory.createApplicationContext(ContentAdminTestModule, { logger: false });
    close = () => app.close();
    const controller = app.get(ContentAdminController);
    const raw = '---\ntitle: 更新\ntype: knowledge\n---\n正文';

    expect(() => controller.save('hello-world', { raw })).toThrow(/expectedHash/);
    await expect(controller.save('hello-world', { raw, expectedHash: 'a'.repeat(64) }))
      .resolves.toMatchObject({ hash: 'a'.repeat(64), raw });
    expect(savedExpectedHash).toBe('a'.repeat(64));
  });

  it('支持调用 DELETE :slug 删除内容', async () => {
    const app = await NestFactory.createApplicationContext(ContentAdminTestModule, { logger: false });
    close = () => app.close();
    const controller = app.get(ContentAdminController);

    await expect(controller.delete('hello-world')).resolves.toEqual({
      ok: true,
      slug: 'hello-world',
    });
  });
});
