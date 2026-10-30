import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ArticleShare } from './ArticleShare';

describe('ArticleShare 组件', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('点击分享到 X 调用 window.open 唤起 X Web Intent', async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(
      <ArticleShare
        title="测试文章标题"
        slug="test-slug"
        summary="这是测试文章的摘要"
      />,
    );

    const shareBtn = screen.getByRole('button', { name: /分享到 X/i });
    expect(shareBtn).toBeInTheDocument();

    await user.click(shareBtn);
    expect(openSpy).toHaveBeenCalledTimes(1);
    const targetUrl = String(openSpy.mock.calls[0]?.[0]);
    expect(targetUrl).toContain('https://x.com/intent/tweet?');
    expect(targetUrl).toContain(encodeURIComponent('https://www.iwalk.pro/posts/test-slug'));
  });

  it('点击复制文案调用 clipboard 并在按钮上呈现成功反馈', async () => {
    const user = userEvent.setup();
    const writeTextSpy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextSpy },
      configurable: true,
      writable: true,
    });

    render(
      <ArticleShare
        title="测试文章标题"
        slug="test-slug"
        summary="这是测试文章的摘要"
      />,
    );

    const copyBtn = screen.getByRole('button', { name: /复制文案/i });
    await user.click(copyBtn);

    expect(writeTextSpy).toHaveBeenCalledTimes(1);
    expect(writeTextSpy.mock.calls[0]?.[0]).toContain('【测试文章标题】');
    expect(writeTextSpy.mock.calls[0]?.[0]).toContain('https://www.iwalk.pro/posts/test-slug');

    expect(screen.getByText('已复制！')).toBeInTheDocument();
  });
});
