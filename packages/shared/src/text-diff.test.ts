import { describe, expect, it } from 'vitest';
import { computeTextDiff } from './text-diff.js';

describe('computeTextDiff', () => {
  it('当两份文本相同时，返回全部未变且 hasChanges 为 false', () => {
    const text = '第一行\n第二行\n第三行';
    const result = computeTextDiff(text, text);
    expect(result.hasChanges).toBe(false);
    expect(result.addedCount).toBe(0);
    expect(result.removedCount).toBe(0);
    expect(result.unchangedCount).toBe(3);
    expect(result.lines).toEqual([
      { type: 'unchanged', text: '第一行', oldLineNumber: 1, newLineNumber: 1 },
      { type: 'unchanged', text: '第二行', oldLineNumber: 2, newLineNumber: 2 },
      { type: 'unchanged', text: '第三行', oldLineNumber: 3, newLineNumber: 3 },
    ]);
  });

  it('能正确识别新增行与删除行', () => {
    const oldText = '标题\n旧段落\n结语';
    const newText = '标题\n新段落1\n新段落2\n结语';
    const result = computeTextDiff(oldText, newText);
    expect(result.hasChanges).toBe(true);
    expect(result.removedCount).toBe(1);
    expect(result.addedCount).toBe(2);
    expect(result.lines).toEqual([
      { type: 'unchanged', text: '标题', oldLineNumber: 1, newLineNumber: 1 },
      { type: 'removed', text: '旧段落', oldLineNumber: 2 },
      { type: 'added', text: '新段落1', newLineNumber: 2 },
      { type: 'added', text: '新段落2', newLineNumber: 3 },
      { type: 'unchanged', text: '结语', oldLineNumber: 3, newLineNumber: 4 },
    ]);
  });

  it('当从空文本创建时，所有行均为 added', () => {
    const result = computeTextDiff('', '第一行\n第二行');
    expect(result.hasChanges).toBe(true);
    expect(result.addedCount).toBe(2);
    expect(result.removedCount).toBe(0);
    expect(result.lines).toEqual([
      { type: 'added', text: '第一行', newLineNumber: 1 },
      { type: 'added', text: '第二行', newLineNumber: 2 },
    ]);
  });

  it('当清空文本时，所有行均为 removed', () => {
    const result = computeTextDiff('删除内容', '');
    expect(result.hasChanges).toBe(true);
    expect(result.addedCount).toBe(0);
    expect(result.removedCount).toBe(1);
    expect(result.lines).toEqual([
      { type: 'removed', text: '删除内容', oldLineNumber: 1 },
    ]);
  });
});
