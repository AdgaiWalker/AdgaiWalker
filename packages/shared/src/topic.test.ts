import { describe, expect, it } from 'vitest';
import { assertTopicTransition, normalizeContentBrief } from './topic.js';

describe('topic contracts', () => {
  it('only permits the four MVP topic states', () => {
    expect(() => assertTopicTransition('INBOX', 'CANDIDATE')).not.toThrow();
    expect(() => assertTopicTransition('CANDIDATE', 'SELECTED')).not.toThrow();
    expect(() => assertTopicTransition('SELECTED', 'INBOX')).toThrow(
      'invalid-topic-transition',
    );
  });

  it('normalizes a complete content brief', () => {
    expect(
      normalizeContentBrief({
        audience: ' 刚开始使用 AI 的普通人 ',
        scenario: '想把一个想法做成第一篇教程',
        problem: '会聊天但不会形成作品',
        keyQuestion: '怎样从初稿走到可发布成品',
        intendedAction: '上传自己的第一版初稿',
      }),
    ).toEqual({
      audience: '刚开始使用 AI 的普通人',
      scenario: '想把一个想法做成第一篇教程',
      problem: '会聊天但不会形成作品',
      keyQuestion: '怎样从初稿走到可发布成品',
      intendedAction: '上传自己的第一版初稿',
    });
  });
});
