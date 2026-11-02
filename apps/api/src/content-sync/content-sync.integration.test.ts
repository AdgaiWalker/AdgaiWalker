import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { AppModule } from '../app.module';
import { ContentSyncService } from './content-sync.service';

describe('ContentSync HTTP Endpoints', () => {
  let app: INestApplication;
  let service: ContentSyncService;
  const adminHeaders = {
    'x-admin-token': process.env.WALKER_ADMIN_TOKEN || 'local-dev-admin-token',
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    service = moduleRef.get(ContentSyncService);
    await app.listen(0);
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /admin/content/sync/status requires admin credentials', async () => {
    const server = app.getHttpServer();
    const res = await fetch(`http://127.0.0.1:${server.address().port}/admin/content/sync/status`);
    expect(res.status).toBe(401);
  });

  it('GET /admin/content/sync/status returns sync status with admin headers', async () => {
    const server = app.getHttpServer();
    vi.spyOn(service, 'getStatus').mockResolvedValueOnce({
      available: true,
      behind: 2,
      ahead: 0,
      headCommit: 'aaa',
      remoteCommit: 'bbb',
      dirtyFiles: [],
      incomingFiles: ['2026-11-02.md'],
      lastCheckedAt: '2026-11-02T16:00:00Z',
    });

    const res = await fetch(`http://127.0.0.1:${server.address().port}/admin/content/sync/status`, {
      headers: adminHeaders,
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.available).toBe(true);
    expect(data.behind).toBe(2);
    expect(data.incomingFiles).toEqual(['2026-11-02.md']);
  });

  it('POST /admin/content/sync/pull executes pull pipeline', async () => {
    const server = app.getHttpServer();
    vi.spyOn(service, 'pull').mockResolvedValueOnce({
      ok: true,
      pulledCommits: 2,
      incomingFiles: ['2026-11-02.md'],
      message: '已成功从 GitHub 同步 2 个提交',
    });

    const res = await fetch(`http://127.0.0.1:${server.address().port}/admin/content/sync/pull`, {
      method: 'POST',
      headers: {
        ...adminHeaders,
        'content-type': 'application/json',
      },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.pulledCommits).toBe(2);
  });
});
