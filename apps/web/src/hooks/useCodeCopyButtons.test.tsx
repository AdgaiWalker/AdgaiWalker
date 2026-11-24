import { StrictMode, useRef } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCodeCopyButtons } from './useCodeCopyButtons';

function CodeHost({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useCodeCopyButtons(ref, html);
  return <div ref={ref} dangerouslySetInnerHTML={{ __html: html }} />;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useCodeCopyButtons', () => {
  it('在 React.StrictMode 双重挂载下仍可点击复制，卸载时彻底移除按钮 DOM', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    const { container, unmount } = render(
      <StrictMode>
        <CodeHost html="<pre><code>const x = 1;</code></pre>" />
      </StrictMode>,
    );

    const buttons = screen.getAllByRole('button', { name: '复制代码' });
    expect(buttons).toHaveLength(1);

    fireEvent.click(buttons[0]!);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('const x = 1;'));
    expect(buttons[0]!.textContent).toBe('已复制 √');

    unmount();
    expect(container.querySelector('.code-copy-btn')).toBeNull();
  });
});
