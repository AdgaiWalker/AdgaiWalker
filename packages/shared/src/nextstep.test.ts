import { describe, expect, it } from 'vitest';
import {
  AI_NEXT_STEP_MAX_LENGTH,
  isNextStepBucketId,
  parseAiNextStepOutput,
  sanitizeNextStepText,
} from './nextstep.js';

const CITABLE = new Set(['ai-low-cost-access', 'vibe0s']);

describe('nextStep AI 输出契约', () => {
  it('合法输出通过；字符串包裹的 JSON 也能解析', () => {
    const ok = parseAiNextStepOutput(
      { bucketId: 'learn-ai', nextStep: '先挑一个最小场景，连做三次。', suggestedSlug: 'ai-low-cost-access' },
      CITABLE,
    );
    expect(ok).toEqual({
      bucketId: 'learn-ai',
      nextStep: '先挑一个最小场景，连做三次。',
      suggestedSlug: 'ai-low-cost-access',
    });

    const wrapped = parseAiNextStepOutput(
      JSON.stringify({ bucketId: 'writing', nextStep: '先写五条大纲再扩写。', suggestedSlug: null }),
      CITABLE,
    );
    expect(wrapped?.bucketId).toBe('writing');
    expect(wrapped?.suggestedSlug).toBeNull();
  });

  it('非 citable 的 suggestedSlug 强制降为 null，不拒收整体', () => {
    const out = parseAiNextStepOutput(
      { bucketId: 'coding', nextStep: '复现问题并写清期望与实际。', suggestedSlug: 'draft-post' },
      CITABLE,
    );
    expect(out).not.toBeNull();
    expect(out!.suggestedSlug).toBeNull();
  });

  it('桶不在白名单 / nextStep 缺失或过长 → 拒收', () => {
    expect(parseAiNextStepOutput({ bucketId: 'random', nextStep: '做点什么。' }, CITABLE)).toBeNull();
    expect(parseAiNextStepOutput({ bucketId: 'coding' }, CITABLE)).toBeNull();
    expect(
      parseAiNextStepOutput({ bucketId: 'coding', nextStep: '长'.repeat(AI_NEXT_STEP_MAX_LENGTH + 1) }, CITABLE),
    ).toBeNull();
    expect(parseAiNextStepOutput('不是 JSON', CITABLE)).toBeNull();
    expect(parseAiNextStepOutput(null, CITABLE)).toBeNull();
  });

  it('sanitize：折叠 markdown 链接、去尖括号、压空白', () => {
    expect(sanitizeNextStepText('看[这篇](/posts/x)再动手  <b>hi</b>')).toBe(
      '看这篇再动手 bhi/b',
    );
    expect(sanitizeNextStepText('  多  个   空格\n换行  ')).toBe('多 个 空格 换行');
  });

  it('isNextStepBucketId 只放行六桶', () => {
    expect(isNextStepBucketId('learn-ai')).toBe(true);
    expect(isNextStepBucketId('default')).toBe(true);
    expect(isNextStepBucketId('Learn-AI')).toBe(false);
    expect(isNextStepBucketId(1)).toBe(false);
  });
});
