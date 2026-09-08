import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GiscusComments } from './GiscusComments';

describe('GiscusComments', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_GISCUS_REPO', 'org/repo');
    vi.stubEnv('VITE_GISCUS_REPO_ID', 'repo-id');
    vi.stubEnv('VITE_GISCUS_CATEGORY', 'Comments');
    vi.stubEnv('VITE_GISCUS_CATEGORY_ID', 'cat-id');
  });

  it('同一 term 重渲染不卸载重挂 giscus 脚本', () => {
    const { container, rerender } = render(<GiscusComments term="cc-intro" />);
    const first = container.querySelector('script[src="https://giscus.app/client.js"]');
    expect(first).not.toBeNull();
    rerender(<GiscusComments term="cc-intro" />);
    const second = container.querySelector('script[src="https://giscus.app/client.js"]');
    expect(second).toBe(first);
  });

  it('未配置仓库时不渲染', () => {
    vi.stubEnv('VITE_GISCUS_REPO', '');
    const { container } = render(<GiscusComments term="cc-intro" />);
    expect(container.querySelector('script')).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });
});
