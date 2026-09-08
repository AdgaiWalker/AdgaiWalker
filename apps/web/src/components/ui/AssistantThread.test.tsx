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
});
