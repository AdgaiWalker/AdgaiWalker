import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CONTENT_FILE_REPOSITORY,
  type ContentFileRepositoryPort,
} from '../ports/content-file.repository';
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
  get: async () => null,
  save: async () => {
    throw new Error('not-used');
  },
};

@Module({
  controllers: [ContentAdminController],
  providers: [
    ContentAdminService,
    { provide: CONTENT_FILE_REPOSITORY, useValue: files },
  ],
})
class ContentAdminTestModule {}

describe('ContentAdminController dependency injection', () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await close?.();
    close = undefined;
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
});
