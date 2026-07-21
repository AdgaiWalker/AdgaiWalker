import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { IntakePanel } from './IntakePanel';

const base = {
  title: '你卡在哪？',
  lead: '描述场景',
  ruleHints: ['至少 4 字'] as const,
  examples: ['想学 AI，从哪开始？'] as const,
  body: '',
  bodyOk: false,
  remaining: 4,
  minLength: 4,
  loading: false,
  error: null as string | null,
  result: null,
  browsePath: '/posts',
  browseLabel: '逛',
  onBodyChange: vi.fn(),
  onPickExample: vi.fn(),
  onSubmit: vi.fn(),
};

describe('IntakePanel（展示块 UX）', () => {
  it('body 不足时提交按钮禁用', () => {
    render(
      <MemoryRouter>
        <IntakePanel {...base} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: '获取下一步' })).toBeDisabled();
  });

  it('bodyOk 时可点提交并抛 onSubmit', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <IntakePanel {...base} body="足够长的正文了" bodyOk remaining={0} onSubmit={onSubmit} />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: '获取下一步' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('有 result 时展示 nextStep', () => {
    render(
      <MemoryRouter>
        <IntakePanel
          {...base}
          bodyOk
          remaining={0}
          result={{ nextStep: '先写五条大纲', bucketId: 'learn-ai', aiUsedFlag: false }}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('先写五条大纲')).toBeInTheDocument();
    expect(screen.getByText(/桶 learn-ai/)).toBeInTheDocument();
  });
});
