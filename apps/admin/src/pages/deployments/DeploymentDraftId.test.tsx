import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { DeploymentsPage } from './DeploymentsPage';

const mock = vi.hoisted(() => ({
  useQuery: vi.fn(), useAgents: vi.fn(), useAgentDetail: vi.fn(),
  usePublicDeploymentReadiness: vi.fn(), requestJson: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({ useQuery: mock.useQuery }));
vi.mock('../../api/queries', () => ({
  useAgents: mock.useAgents,
  useAgentDetail: mock.useAgentDetail,
  usePublicDeploymentReadiness: mock.usePublicDeploymentReadiness,
}));
vi.mock('../../api/http', () => ({ requestJson: mock.requestJson }));

describe('位置绑定草稿的幂等键', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.useQuery.mockReturnValue({ data: [], isPending: false, isError: false, refetch: vi.fn() });
    mock.useAgents.mockReturnValue({ data: { data: [{ id: 'agent-a', name: '小影' }] } });
    mock.useAgentDetail.mockReturnValue({ data: { data: { revisions: [{ id: 'rev-a', version: 1, modelId: 'model-a' }] } }, isPending: false });
    mock.requestJson.mockRejectedValue(new Error('本地请求失败'));
  });

  it('失败重试沿用原键，修改草稿后才换新键', async () => {
    render(<MemoryRouter><DeploymentsPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: '新建绑定' }));
    fireEvent.change(screen.getByRole('textbox', { name: '对象（文章 slug）' }), { target: { value: 'post-a' } });
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[1]!, { target: { value: 'agent-a' } });
    fireEvent.change(selects[2]!, { target: { value: 'rev-a' } });

    fireEvent.click(screen.getByRole('button', { name: '保存绑定' }));
    await waitFor(() => expect(mock.requestJson).toHaveBeenCalledTimes(1));
    await screen.findByRole('alert');
    const firstId = mock.requestJson.mock.calls[0]?.[1]?.body?.deploymentId;

    fireEvent.click(screen.getByRole('button', { name: '保存绑定' }));
    await waitFor(() => expect(mock.requestJson).toHaveBeenCalledTimes(2));
    await screen.findByRole('alert');
    expect(mock.requestJson.mock.calls[1]?.[1]?.body?.deploymentId).toBe(firstId);

    fireEvent.change(screen.getByRole('textbox', { name: '对象（文章 slug）' }), { target: { value: 'post-b' } });
    fireEvent.click(screen.getByRole('button', { name: '保存绑定' }));
    await waitFor(() => expect(mock.requestJson).toHaveBeenCalledTimes(3));
    expect(mock.requestJson.mock.calls[2]?.[1]?.body?.deploymentId).not.toBe(firstId);
  });
});
