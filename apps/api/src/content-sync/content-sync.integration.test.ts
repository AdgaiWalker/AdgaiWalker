import { createHmac } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { AppModule } from '../app.module';
import { ContentSyncService } from './content-sync.service';

describe('ContentSync HTTP Endpoints', () => {
  let app: INestApplication;
  let service: ContentSyncService;
  const testAdminToken = 'content-sync-test-admin-token';
  const adminHeaders = {
    'x-admin-token': testAdminToken,
  };

  beforeEach(async () => {
    vi.stubEnv('WALKER_ADMIN_TOKEN', testAdminToken);
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication({ rawBody: true });
    service = moduleRef.get(ContentSyncService);
    await app.listen(0);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
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

  it('POST /admin/content/sync/backup-drafts backs up drafts under admin auth', async () => {
    const server = app.getHttpServer();
    vi.spyOn(service, 'backupDrafts').mockResolvedValueOnce({
      ok: true,
      branch: 'drafts',
      commit: '1234567890abcdef1234567890abcdef12345678',
      backedUpFiles: ['content/log/draft-a.md'],
      message: '已将 1 篇草稿备份到 GitHub drafts 分支',
    });

    const unauth = await fetch(`http://127.0.0.1:${server.address().port}/admin/content/sync/backup-drafts`, {
      method: 'POST',
    });
    expect(unauth.status).toBe(401);

    const res = await fetch(`http://127.0.0.1:${server.address().port}/admin/content/sync/backup-drafts`, {
      method: 'POST',
      headers: { ...adminHeaders, 'content-type': 'application/json' },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.branch).toBe('drafts');
  });

  it('POST /webhooks/github fails closed when secret is missing or signature is forged, and accepts valid HMAC-SHA256', async () => {
    const server = app.getHttpServer();
    const url = `http://127.0.0.1:${server.address().port}/webhooks/github`;
    const body = JSON.stringify({ ref: 'refs/heads/main' });

    // 1) 未配置密钥 → fail-closed 拒绝（403）
    vi.stubEnv('WALKER_GITHUB_WEBHOOK_SECRET', '');
    const noSecret = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-github-event': 'push' },
      body,
    });
    expect(noSecret.status).toBe(403);

    // 2) 配置密钥后，无签名或伪造签名 → 401 拒绝
    const secret = 'test-webhook-secret-key';
    vi.stubEnv('WALKER_GITHUB_WEBHOOK_SECRET', secret);
    const missingSig = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-github-event': 'push' },
      body,
    });
    expect(missingSig.status).toBe(401);

    const badSig = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-github-event': 'push',
        'x-hub-signature-256': 'sha256=' + '0'.repeat(64),
      },
      body,
    });
    expect(badSig.status).toBe(401);

    // 3) 合法 HMAC-SHA256 签名 → 200 放行
    vi.spyOn(service, 'handleWebhook').mockResolvedValueOnce({
      ok: true,
      status: 'scheduled',
      message: '已安排后台同步 GitHub 最新内容',
    });
    const validSig = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
    const okRes = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-github-event': 'push',
        'x-hub-signature-256': validSig,
      },
      body,
    });
    expect(okRes.status).toBe(200);
    const data = await okRes.json();
    expect(data.status).toBe('scheduled');
  });
});
