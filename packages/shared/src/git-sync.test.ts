import { describe, expect, it } from 'vitest';
import { formatSyncStatusSummary, type ContentSyncStatus } from './git-sync';

describe('formatSyncStatusSummary', () => {
  it('returns unknown when status is null or not available', () => {
    expect(formatSyncStatusSummary(null)).toEqual({
      state: 'unknown',
      label: '同步状态未知',
      description: '无法获取 Git 远端状态',
    });

    expect(formatSyncStatusSummary({ available: false } as ContentSyncStatus)).toEqual({
      state: 'unknown',
      label: '同步状态未知',
      description: '无法获取 Git 远端状态',
    });
  });

  it('detects behind state with incoming commits', () => {
    const summary = formatSyncStatusSummary({
      available: true,
      behind: 2,
      ahead: 0,
      headCommit: 'a1b2c3d',
      remoteCommit: 'e4f5a6b',
      dirtyFiles: [],
      incomingFiles: ['content/log/2026-11-02.md'],
      lastCheckedAt: '2026-11-02T16:00:00Z',
    });

    expect(summary.state).toBe('behind');
    expect(summary.label).toBe('待从 GitHub 同步 (2)');
    expect(summary.description).toContain('GitHub 有 2 个新提交');
  });

  it('detects diverged state when both ahead and behind', () => {
    const summary = formatSyncStatusSummary({
      available: true,
      behind: 1,
      ahead: 1,
      headCommit: 'a1b2c3d',
      remoteCommit: 'e4f5a6b',
      dirtyFiles: [],
      incomingFiles: [],
      lastCheckedAt: '2026-11-02T16:00:00Z',
    });

    expect(summary.state).toBe('diverged');
  });

  it('detects ahead state', () => {
    const summary = formatSyncStatusSummary({
      available: true,
      behind: 0,
      ahead: 3,
      headCommit: 'a1b2c3d',
      remoteCommit: 'e4f5a6b',
      dirtyFiles: [],
      incomingFiles: [],
      lastCheckedAt: '2026-11-02T16:00:00Z',
    });

    expect(summary.state).toBe('ahead');
  });

  it('detects synced state when 0 ahead and 0 behind', () => {
    const summary = formatSyncStatusSummary({
      available: true,
      behind: 0,
      ahead: 0,
      headCommit: 'a1b2c3d',
      remoteCommit: 'a1b2c3d',
      dirtyFiles: [],
      incomingFiles: [],
      lastCheckedAt: '2026-11-02T16:00:00Z',
    });

    expect(summary.state).toBe('synced');
    expect(summary.label).toBe('与 GitHub 一致');
  });

  it('surfaces error state honestly when fetchError is present instead of reporting synced', () => {
    const summary = formatSyncStatusSummary({
      available: true,
      behind: 0,
      ahead: 0,
      headCommit: 'a1b2c3d',
      remoteCommit: 'a1b2c3d',
      dirtyFiles: [],
      incomingFiles: [],
      lastCheckedAt: '2026-11-23T00:00:00Z',
      fetchError: 'ssh timeout',
    });

    expect(summary.state).toBe('error');
    expect(summary.description).toContain('ssh timeout');
  });

  it('surfaces conflict state when same-article conflicts exist', () => {
    const summary = formatSyncStatusSummary({
      available: true,
      behind: 0,
      ahead: 0,
      headCommit: 'a1b2c3d',
      remoteCommit: 'a1b2c3d',
      dirtyFiles: ['2026-11-19.md'],
      incomingFiles: [],
      conflicts: ['2026-11-19.md'],
      lastCheckedAt: '2026-11-23T00:00:00Z',
    });

    expect(summary.state).toBe('conflict');
    expect(summary.label).toContain('冲突');
  });
});
