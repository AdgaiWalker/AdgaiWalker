import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ContentSyncService } from './content-sync.service';

describe('ContentSyncService', () => {
  it('getStatus returns a valid structure with available boolean', async () => {
    const service = new ContentSyncService();
    const status = await service.getStatus(false);
    expect(typeof status.available).toBe('boolean');
    expect(typeof status.behind).toBe('number');
    expect(typeof status.ahead).toBe('number');
    expect(Array.isArray(status.dirtyFiles)).toBe(true);
    expect(Array.isArray(status.incomingFiles)).toBe(true);
    expect(typeof status.lastCheckedAt).toBe('string');
  });

  it('handleWebhook ignores non-main branch pushes', async () => {
    const service = new ContentSyncService();
    const result = await service.handleWebhook({ ref: 'refs/heads/feature-x' });
    expect(result.ok).toBe(true);
    expect(result.status).toBe('ignored');
  });

  it('handleWebhook schedules sync for refs/heads/main', async () => {
    const service = new ContentSyncService();
    const pullSpy = vi.spyOn(service, 'pull').mockResolvedValue({
      ok: true,
      pulledCommits: 1,
      incomingFiles: ['2026-11-02.md'],
      message: '已成功从 GitHub 同步 1 个提交',
    });

    const result = await service.handleWebhook({ ref: 'refs/heads/main' });
    expect(result.ok).toBe(true);
    expect(result.status).toBe('scheduled');
  });
});
