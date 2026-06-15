import { describe, expect, it } from 'vitest';

import { createPerceptionService } from '@/services/perception.service';

describe('PerceptionService', () => {
  const perception = createPerceptionService();

  it('keeps only the most recent messages up to the limit', () => {
    const messages = Array.from({ length: 20 }, (_, i) => ({
      role: 'user' as const,
      content: `msg-${i}`,
    }));
    const result = perception.perceive({ messages });
    expect(result.messages).toHaveLength(16);
    expect(result.messages[0].content).toBe('msg-4');
    expect(result.messages[15].content).toBe('msg-19');
  });

  it('redacts PII and compacts whitespace in each kept message', () => {
    const result = perception.perceive({
      messages: [
        { role: 'user', content: '联系我  13800138000   还有  a@b.com' },
        { role: 'assistant', content: '好的' },
      ],
    });
    expect(result.messages[0].content).toBe('联系我 [手机号已隐藏] 还有 [邮箱已隐藏]');
  });

  it('extracts and redacts the latest user need, flagging PII', () => {
    const result = perception.perceive({
      messages: [
        { role: 'user', content: '第一句' },
        { role: 'assistant', content: '回复' },
        { role: 'user', content: '我的邮箱是 leak@test.com 怎么办' },
      ],
    });
    expect(result.latestNeedRedacted.text).not.toContain('leak@test.com');
    expect(result.latestNeedRedacted.piiDetected).toBe(true);
  });

  it('reports no PII and empty text when there is no user message', () => {
    const result = perception.perceive({
      messages: [{ role: 'assistant', content: '你好' }],
    });
    expect(result.latestNeedRedacted.text).toBe('');
    expect(result.latestNeedRedacted.piiDetected).toBe(false);
  });

  it('flags minor context only for audience "minor"', () => {
    expect(perception.perceive({ messages: [], audienceGroup: 'minor' }).isMinorContext).toBe(true);
    expect(perception.perceive({ messages: [], audienceGroup: 'other' }).isMinorContext).toBe(false);
    expect(perception.perceive({ messages: [] }).isMinorContext).toBe(false);
  });

  it('returns an empty message list for empty input', () => {
    const result = perception.perceive({ messages: [] });
    expect(result.messages).toEqual([]);
  });
});
