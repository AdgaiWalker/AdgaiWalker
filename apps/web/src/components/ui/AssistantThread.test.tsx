import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { dualEntry } from '../../shared/dual-entry';
import { AssistantThread } from './AssistantThread';

describe('AssistantThread 引用', () => {
  it('citations 链接走逛路径 SSOT', () => {
    render(
      <MemoryRouter>
        <AssistantThread
          draft=""
          draftOk={false}
          loading={false}
          error={null}
          messages={[
            {
              role: 'assistant',
              text: 'duola 是站主。',
              citations: ['cc-intro'],
              aiUsedFlag: true,
            },
          ]}
          onDraftChange={() => {}}
          onSubmit={() => {}}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: /cc-intro|《/ })).toHaveAttribute(
      'href',
      `${dualEntry.browse.path}/cc-intro`,
    );
  });

  it('正确使用 XMarkdown 渲染富文本与代码', () => {
    const { container } = render(
      <MemoryRouter>
        <AssistantThread
          draft=""
          draftOk={false}
          loading={false}
          error={null}
          messages={[
            {
              role: 'assistant',
              text: '**加粗答案**\n```js\nconsole.log(1);\n```',
              citations: [],
              aiUsedFlag: true,
            },
          ]}
          onDraftChange={() => {}}
          onSubmit={() => {}}
        />
      </MemoryRouter>,
    );
    expect(container.querySelector('strong')?.textContent).toBe('加粗答案');
    expect(container.querySelector('code')?.textContent).toContain('console.log(1)');
  });
});
