import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/http';
import { ConversationActionPanel } from './ConversationActionPanel';

const mock = vi.hoisted(() => ({ preview: vi.fn(), convert: vi.fn() }));
vi.mock('../../api/queries', () => ({
  useConversationActionPreview: mock.preview,
  useConvertConversationToAction: mock.convert,
}));

describe('访客会话转更新事项', () => {
  const mutateAsync = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    mutateAsync.mockReset();
    mock.preview.mockReturnValue({
      isPending: false, isError: false,
      data: { title: '回应访客：原问题', summary: '原问题', messageIds: ['visitor-1'], turnCount: 1 },
    });
    mock.convert.mockReturnValue({ mutateAsync, isPending: false });
  });

  it('结果不明时冻结提交内容，同键原样重试后显示既有事项', async () => {
    mutateAsync.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({
      action: { id: 'action-1' }, replayed: true,
    });
    render(<ConversationActionPanel conversationId="conversation-1" />);
    fireEvent.change(screen.getByRole('textbox', { name: '事项标题' }), { target: { value: '站主确认的标题' } });
    fireEvent.click(screen.getByRole('button', { name: '创建事项' }));
    expect((await screen.findByRole('alert')).textContent).toContain('结果未确认');
    expect((screen.getByRole('textbox', { name: '事项标题' }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('提醒日期') as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '原样重试' }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2));
    expect(mutateAsync.mock.calls[1]?.[0]).toEqual(mutateAsync.mock.calls[0]?.[0]);
    expect(await screen.findByText(/此前已生效/)).toBeTruthy();
  });

  it('明确放弃时先提示重复风险，确认后编辑使用新键', async () => {
    mutateAsync.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({
      action: { id: 'action-2' }, replayed: false,
    });
    render(<ConversationActionPanel conversationId="conversation-1" />);
    fireEvent.click(screen.getByRole('button', { name: '创建事项' }));
    expect((await screen.findByRole('alert')).textContent).toContain('结果未确认');
    const firstKey = mutateAsync.mock.calls[0]?.[0]?.requestKey;
    fireEvent.click(screen.getByRole('button', { name: '放弃本次并重新编辑' }));
    expect(screen.getByText(/可能重复创建/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '确认放弃并编辑' }));
    const title = screen.getByRole('textbox', { name: '事项标题' });
    expect((title as HTMLInputElement).disabled).toBe(false);
    fireEvent.change(title, { target: { value: '新的标题' } });
    fireEvent.click(screen.getByRole('button', { name: '创建事项' }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2));
    expect(mutateAsync.mock.calls[1]?.[0]).toMatchObject({ title: '新的标题' });
    expect(mutateAsync.mock.calls[1]?.[0]?.requestKey).not.toBe(firstKey);
  });

  it('明确的校验拒绝后保留可编辑表单', async () => {
    mutateAsync.mockRejectedValueOnce(new ApiError('invalid-planned-date', '日期无效', 422));
    render(<ConversationActionPanel conversationId="conversation-1" />);
    fireEvent.click(screen.getByRole('button', { name: '创建事项' }));
    await screen.findByText('日期无效');
    expect((screen.getByRole('textbox', { name: '事项标题' }) as HTMLInputElement).disabled).toBe(false);
  });

  it('结果不明的原样重试若明确被拒绝，解除表单冻结', async () => {
    mutateAsync.mockRejectedValueOnce(new Error('network'))
      .mockRejectedValueOnce(new ApiError('invalid-planned-date', '日期无效', 422));
    render(<ConversationActionPanel conversationId="conversation-1" />);
    fireEvent.click(screen.getByRole('button', { name: '创建事项' }));
    await screen.findByRole('button', { name: '原样重试' });
    fireEvent.click(screen.getByRole('button', { name: '原样重试' }));
    await screen.findByText('日期无效');
    expect((screen.getByRole('textbox', { name: '事项标题' }) as HTMLInputElement).disabled).toBe(false);
  });
});
