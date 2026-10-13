import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PublicDeploymentReadiness } from '@walker/shared';
import { PublicReadinessPanel, readinessAllowsEnable } from './PublicReadinessPanel';

const readiness: PublicDeploymentReadiness = {
  deploymentId: 'deployment-a', placementKey: 'post-detail', scopeSlug: 'post-a', enabled: false,
  checkedAt: '2026-09-25T00:00:00.000Z', canEnable: false,
  gates: [
    { key: 'verifiedSnapshot', state: 'ready', reason: '当前公开快照可用', details: [] },
    { key: 'runtimeIsolation', state: 'blocked', reason: '缺少运行隔离探针报告', details: [] },
  ],
};

describe('PublicReadinessPanel', () => {
  it('shows failed readiness reasons and lets the owner refresh the checks', () => {
    const retry = vi.fn();
    render(<PublicReadinessPanel report={readiness} isPending={false} isError={false} onRetry={retry} />);

    expect(screen.getByText('1/2 项通过')).toBeTruthy();
    expect(screen.getByText('缺少运行隔离探针报告')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '重新检查' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the check is missing, loading, or unavailable', () => {
    expect(readinessAllowsEnable(undefined, true, false)).toBe(false);
    expect(readinessAllowsEnable(undefined, false, true)).toBe(false);
    expect(readinessAllowsEnable(readiness, false, false)).toBe(false);
    expect(readinessAllowsEnable({ ...readiness, canEnable: true }, false, false)).toBe(true);
  });
});
