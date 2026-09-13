import { describe, expect, it } from 'vitest';
import { outlineNextStep, splitInlineMarkup } from './next-step-outline';

describe('outlineNextStep', () => {
  it('按分号切分为多步并去掉编号', () => {
    expect(outlineNextStep('1. 先写五条大纲；2. 再扩一段正文。')).toEqual([
      '先写五条大纲',
      '再扩一段正文。',
    ]);
  });

  it('按换行与项目符号切分', () => {
    expect(outlineNextStep('- 记下耗时\n- 找出触发条件')).toEqual([
      '记下耗时',
      '找出触发条件',
    ]);
  });

  it('单句不擅自拆，整体作为一步', () => {
    expect(outlineNextStep('先选一个最小场景连做三次。')).toEqual([
      '先选一个最小场景连做三次。',
    ]);
  });

  it('压空白、空文本返回空数组', () => {
    expect(outlineNextStep('  多   个  空格  ')).toEqual(['多 个 空格']);
    expect(outlineNextStep('   ')).toEqual([]);
  });
});

describe('splitInlineMarkup', () => {
  it('把反引号内容切出来单独渲染，文字不改写', () => {
    expect(splitInlineMarkup('先跑 `pnpm typecheck` 再提交')).toEqual([
      { kind: 'text', text: '先跑 ' },
      { kind: 'code', text: 'pnpm typecheck' },
      { kind: 'text', text: ' 再提交' },
    ]);
  });

  it('把 **强调** 切出来单独渲染', () => {
    expect(splitInlineMarkup('先写 **5 条大纲** 再扩写')).toEqual([
      { kind: 'text', text: '先写 ' },
      { kind: 'strong', text: '5 条大纲' },
      { kind: 'text', text: ' 再扩写' },
    ]);
  });

  it('代码与强调混排按出现顺序解析', () => {
    expect(splitInlineMarkup('跑 `npm test` 并确认 **全绿**')).toEqual([
      { kind: 'text', text: '跑 ' },
      { kind: 'code', text: 'npm test' },
      { kind: 'text', text: ' 并确认 ' },
      { kind: 'strong', text: '全绿' },
    ]);
  });

  it('没有行内标记时返回单段纯文本', () => {
    expect(splitInlineMarkup('普通文本')).toEqual([
      { kind: 'text', text: '普通文本' },
    ]);
  });
});
