import { describe, expect, it } from 'vitest';

import { deriveAdminSystemHealth, getAdminSystemStatus } from './admin-shell-state';

describe('getAdminSystemStatus', () => {
  it('reports unknown when no health fact is available', () => {
    expect(getAdminSystemStatus()).toEqual({
      label: '状态未知',
      tone: 'unknown',
    });
  });

  it('reports healthy only when it is explicitly provided', () => {
    expect(getAdminSystemStatus('healthy')).toEqual({
      label: '系统可用',
      tone: 'healthy',
    });
  });

  it('keeps degraded distinct from unknown', () => {
    expect(getAdminSystemStatus('degraded')).toEqual({
      label: '系统降级',
      tone: 'degraded',
    });
  });

  it('reports unavailable when gateway is not ready', () => {
    expect(getAdminSystemStatus('unavailable')).toEqual({
      label: '系统未就绪',
      tone: 'unavailable',
    });
  });

  it('carries lastCheckedAt when provided', () => {
    const at = '2026-06-20T03:00:00.000Z';
    expect(getAdminSystemStatus('healthy', at)).toEqual({
      label: '系统可用',
      tone: 'healthy',
      lastCheckedAt: at,
    });
  });
});

describe('deriveAdminSystemHealth', () => {
  it('falls back to unknown when there is no evidence at all', () => {
    expect(deriveAdminSystemHealth({})).toBe('unknown');
  });

  it('returns unavailable when gateway is not configured', () => {
    expect(deriveAdminSystemHealth({ configured: false, stats: { totalCalls: 10, aiCalls: 10 } }))
      .toBe('unavailable');
  });

  it('returns unavailable when the last probe failed even with prior success', () => {
    expect(deriveAdminSystemHealth({
      configured: true,
      lastProbeOk: false,
      stats: { totalCalls: 10, aiCalls: 10 },
    })).toBe('unavailable');
  });

  it('returns degraded when there were fallback calls', () => {
    expect(deriveAdminSystemHealth({
      configured: true,
      stats: { totalCalls: 10, aiCalls: 8, fallbackCalls: 2 },
    })).toBe('degraded');
  });

  it('returns degraded when there were blocked calls', () => {
    expect(deriveAdminSystemHealth({
      configured: true,
      stats: { totalCalls: 10, aiCalls: 10, blockedCalls: 1 },
    })).toBe('degraded');
  });

  it('returns degraded when there is an unresolved gateway incident', () => {
    expect(deriveAdminSystemHealth({
      configured: true,
      stats: { totalCalls: 5, aiCalls: 5 },
      hasGatewayIncident: true,
    })).toBe('degraded');
  });

  it('returns healthy only with real successful calls and no degradation', () => {
    expect(deriveAdminSystemHealth({
      configured: true,
      stats: { totalCalls: 10, aiCalls: 10 },
    })).toBe('healthy');
  });

  it('does not fake healthy when totalCalls is zero', () => {
    expect(deriveAdminSystemHealth({
      configured: true,
      stats: { totalCalls: 0, aiCalls: 0 },
    })).toBe('unknown');
  });
});
