import { describe, expect, it } from 'vitest';
import { getPetActivity, isPetWorking } from './activity';
import type { AssistantMessage } from '../../hooks/useAssistant';

const assistant = (
  text: string,
  extra: Partial<Extract<AssistantMessage, { role: 'assistant' }>> = {},
): AssistantMessage => ({
  role: 'assistant',
  text,
  citations: [],
  aiUsedFlag: true,
  ...extra,
});

describe('getPetActivity', () => {
  it('空闲时是陪伴，输入中是倾听，检索中是工作', () => {
    expect(getPetActivity(false, null, [])).toBe('idle');
    expect(getPetActivity(false, null, [], true)).toBe('listening');
    expect(getPetActivity(false, null, [], false, true)).toBe('searching');
    expect(isPetWorking('idle')).toBe(false);
    expect(isPetWorking('searching')).toBe(true);
    expect(isPetWorking('thinking')).toBe(true);
  });

  it('检索优先于倾听；加载时走思考或回应', () => {
    expect(getPetActivity(false, null, [], true, true)).toBe('searching');
    expect(getPetActivity(true, null, [])).toBe('thinking');
    expect(getPetActivity(true, null, [assistant('半句')])).toBe('speaking');
  });

  it('错误与完成来自真实请求结果', () => {
    expect(getPetActivity(false, '超时', [])).toBe('error');
    expect(getPetActivity(false, null, [assistant('好了')])).toBe('complete');
    expect(getPetActivity(false, null, [assistant('固定', { aiUsedFlag: false })])).toBe('fallback');
    expect(getPetActivity(false, null, [assistant('停', { stopped: true })])).toBe('stopped');
  });
});
