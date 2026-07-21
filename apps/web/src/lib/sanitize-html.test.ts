import { describe, expect, it } from 'vitest';
import { sanitizeHtml } from './sanitize-html';

describe('sanitizeHtml', () => {
  it('剥离 script 标签', () => {
    const out = sanitizeHtml('<p>你好</p><script>alert(1)</script>');
    expect(out).toContain('你好');
    expect(out.toLowerCase()).not.toContain('script');
  });

  it('剥离 onerror 事件', () => {
    const out = sanitizeHtml('<img src=x onerror="alert(1)">');
    expect(out.toLowerCase()).not.toContain('onerror');
  });
});
