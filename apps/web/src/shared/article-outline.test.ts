import { describe, expect, it } from 'vitest';
import {
  buildArticleOutline,
  computeReadingProgress,
  resolveActiveTocId,
} from './article-outline';

describe('buildArticleOutline', () => {
  it('为 h2/h3 注入 id 并生成 toc', () => {
    const src = '<p>x</p><h2>你好世界</h2><h3>细节</h3><h2>第二节</h2>';
    const { html, toc } = buildArticleOutline(src);
    expect(toc).toHaveLength(3);
    expect(toc[0]?.level).toBe(2);
    expect(toc[0]?.text).toBe('你好世界');
    expect(html).toContain(`id="${toc[0]!.id}"`);
    expect(html).toContain(`id="${toc[1]!.id}"`);
    expect(toc.every((t) => t.id.length > 0)).toBe(true);
  });

  it('保留已有 id', () => {
    const { html, toc } = buildArticleOutline(
      '<h2 id="keep-me">固定</h2>',
    );
    expect(toc[0]?.id).toBe('keep-me');
    expect(html).toContain('id="keep-me"');
  });
});

describe('computeReadingProgress', () => {
  it('在 0 与 1 之间夹取', () => {
    expect(computeReadingProgress(0, 100, 500)).toBe(0);
    expect(computeReadingProgress(400, 100, 500)).toBe(1);
    expect(computeReadingProgress(200, 100, 500)).toBe(0.5);
  });
});

describe('resolveActiveTocId', () => {
  it('按滚动位置选择当前标题', () => {
    const ids = ['a', 'b', 'c'];
    const tops = [0, 200, 400];
    expect(resolveActiveTocId(0, tops, ids, 0)).toBe('a');
    expect(resolveActiveTocId(250, tops, ids, 0)).toBe('b');
    expect(resolveActiveTocId(500, tops, ids, 0)).toBe('c');
  });
});
