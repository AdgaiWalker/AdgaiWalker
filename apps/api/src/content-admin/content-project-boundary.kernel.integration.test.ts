import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { ContentAdminService } from './content-admin.service';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';

const token = 'c22-proj-token';
let app: INestApplication;
let contentDir: string;
let moduleRef: TestingModule;
let service: ContentAdminService;
let baseUrl: string;

const VALID_PROJECT_RAW = `---
title: VibeOS 桌面项目
type: project
status: validating
url: https://github.com/AdgaiWalker/vibe0s
resources:
  - name: 源码
    url: https://github.com/AdgaiWalker/vibe0s
---
# 项目正文说明
`;

const INVALID_PROJECT_RAW = `---
title: 坏项目
type: project
status: [123]
resources: not-an-array
---
# 坏正文
`;

describe('C22 对齐项目与小店的内容边界（Kernel 集成测试）', () => {
  beforeAll(async () => {
    contentDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-c22-content-'));

    process.env.WALKER_ADMIN_TOKEN = token;
    process.env.CONTENT_LOG_DIR = contentDir;

    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');

    const address = app.getHttpServer().address();
    const port = typeof address === 'object' && address ? address.port : 8788;
    baseUrl = `http://127.0.0.1:${port}`;

    service = app.get(ContentAdminService);
  });

  afterAll(async () => {
    const db = app?.get<PrismaPort>(PRISMA).getClient();
    if (db) {
      await db.auditRecord.deleteMany({ where: { targetId: { startsWith: 'c22-' } } });
    }
    await app?.close();
    if (contentDir) await fs.rm(contentDir, { recursive: true, force: true });
    delete process.env.WALKER_ADMIN_TOKEN;
    delete process.env.CONTENT_LOG_DIR;
  });

  it('合法项目元数据经由受控保存写入工作区并受 CAS 审计保护', async () => {
    const slug = 'c22-proj-01';
    const saved = await service.save(slug, VALID_PROJECT_RAW, null);
    expect(saved.slug).toBe(slug);
    expect(saved.hash).toBeDefined();

    // 验证文件落盘与内容完整
    const onDisk = await fs.readFile(path.join(contentDir, `${slug}.md`), 'utf8');
    expect(onDisk).toContain('type: project');
    expect(onDisk).toContain('status: validating');
  });

  it('不符合项目模型的非法字段被拒绝，不写入文件', async () => {
    const slug = 'c22-proj-invalid';
    await expect(service.save(slug, INVALID_PROJECT_RAW, null)).rejects.toThrow(/项目字段校验失败/);

    // 验证未落盘
    await expect(fs.access(path.join(contentDir, `${slug}.md`))).rejects.toThrow();
  });

  it('公开/匿名请求绝对无法修改项目内容与进度（401 拦截）', async () => {
    const slug = 'c22-proj-01';
    const res = await fetch(`${baseUrl}/admin/content/${slug}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' }, // 未带 token
      body: JSON.stringify({ raw: '# 黑客修改项目进度', expectedHash: 'fake' }),
    });
    expect(res.status).toBe(401);
  });
});