import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { getBrowseItems } from '../content';
import { ItemList } from './ItemList';

describe('ItemList editorial mode', () => {
  it('展示摘要和阅读时间，隐藏内部分类与状态', () => {
    const source = getBrowseItems()[0];
    expect(source).toBeDefined();
    const item = {
      ...source!,
      type: 'project',
      status: 'verified',
      summary: '一段用来验证编辑式内容流的摘要。',
    };

    const { container } = render(
      <MemoryRouter>
        <ItemList items={[item]} editorial />
      </MemoryRouter>,
    );

    expect(screen.getByText(item.summary)).toBeInTheDocument();
    expect(container.querySelector('.post-list-meta')).toHaveTextContent('分钟');
    expect(container.querySelector('.post-list-meta')).not.toHaveTextContent('项目');
    expect(container.querySelector('.post-list-icon')).not.toBeInTheDocument();
    expect(container.querySelector('.status-pill')).not.toBeInTheDocument();
  });
});
