import { describe, expect, it } from 'vitest';
import {
  ASSISTANT_ANSWER_MAX_LENGTH,
  ASSISTANT_MAX_CITATIONS,
  DEGRADE_REASONS,
  diagnoseAssistantOutput,
  extractStreamedAnswer,
  isDegradeReason,
  isValidAssistantBody,
  parseAssistantOutput,
  sanitizeAnswerText,
  type AssistantRunResult,
} from './assistant.js';

const CITABLE = new Set(['used-macbook-guide', 'ai-low-cost-access', 'cc-intro']);

describe('失败原因可诊断（降级时说清为什么，而不是「没过合同」）', () => {
  it('不是 JSON → 指出「无法提取 JSON」，并给出原始片段', () => {
    const result = diagnoseAssistantOutput('今天天气不错，我们聊聊别的。', CITABLE);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('JSON');
      expect(result.preview).toContain('今天天气不错');
    }
  });

  it('缺 answer → 指出缺 answer', () => {
    const result = diagnoseAssistantOutput('{"citations":[]}', CITABLE);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('answer');
  });

  it('answer 过短 / 过长 → 指出长度越界与实测长度', () => {
    const short = diagnoseAssistantOutput('{"answer":"hi"}', CITABLE);
    if (!short.ok) expect(short.reason).toContain('过短');

    const long = diagnoseAssistantOutput(
      JSON.stringify({ answer: 'x'.repeat(ASSISTANT_ANSWER_MAX_LENGTH + 1) }),
      CITABLE,
    );
    expect(long.ok).toBe(false);
    if (!long.ok) expect(long.reason).toContain('过长');
  });

  it('合法输出 → ok，且与 parseAssistantOutput 判定一致（同一条规则）', () => {
    const raw = '```json\n{"answer":"先读入门教程。","citations":["cc-intro"]}\n```';
    const diagnosis = diagnoseAssistantOutput(raw, CITABLE);
    expect(diagnosis.ok).toBe(true);
    expect(parseAssistantOutput(raw, CITABLE)?.answer).toBe('先读入门教程。');
  });
});

describe('助手提问校验', () => {
  it('2 字中文成句即可；1 字与纯空白不行', () => {
    expect(isValidAssistantBody('你好')).toBe(true);
    expect(isValidAssistantBody('  你好  ')).toBe(true);
    expect(isValidAssistantBody('hi')).toBe(true);
    expect(isValidAssistantBody('好')).toBe(false);
    expect(isValidAssistantBody('   ')).toBe(false);
  });
});

describe('助手 Run 合同', () => {
  it('合法输出通过；字符串包裹 JSON 也能解析', () => {
    const ok = parseAssistantOutput(
      {
        answer: 'duola 是一位艺术生，用 AI 解决真实问题。',
        citations: ['used-macbook-guide', { slug: 'cc-intro' }],
      },
      CITABLE,
    );
    expect(ok?.answer).toBe('duola 是一位艺术生，用 AI 解决真实问题。');
    expect(ok?.citations).toEqual([
      { slug: 'used-macbook-guide' },
      { slug: 'cc-intro' },
    ]);

    const wrapped = parseAssistantOutput(
      JSON.stringify({ answer: '先读入门教程再动手。', citations: [] }),
      CITABLE,
    );
    expect(wrapped?.answer).toBe('先读入门教程再动手。');
    expect(wrapped?.citations).toEqual([]);
  });

  it('citations 缺省视为空；非 citable 与重复项丢弃，不拒收整体', () => {
    const noCite = parseAssistantOutput({ answer: '这是一段不需要引用的回答。' }, CITABLE);
    expect(noCite?.citations).toEqual([]);

    const out = parseAssistantOutput(
      {
        answer: '推荐从这篇开始读起。',
        citations: ['draft-post', 'cc-intro', 'cc-intro', 42, { slug: 'ai-low-cost-access' }],
      },
      CITABLE,
    );
    expect(out?.citations).toEqual([{ slug: 'cc-intro' }, { slug: 'ai-low-cost-access' }]);
  });

  it('citations 超过上限截断', () => {
    const out = parseAssistantOutput(
      {
        answer: '多引用场景下只保留前几条。',
        citations: ['used-macbook-guide', 'cc-intro', 'ai-low-cost-access', 'used-macbook-guide'],
      },
      CITABLE,
    );
    expect(out?.citations).toHaveLength(ASSISTANT_MAX_CITATIONS);
  });

  it('answer 用 markdown 围栏包住 JSON 时仍能解析（模型最常见的输出形态）', () => {
    const fenced = parseAssistantOutput(
      '```json\n{"answer":"推荐先读入门教程。","citations":["cc-intro"]}\n```',
      CITABLE,
    );
    expect(fenced?.answer).toBe('推荐先读入门教程。');
    expect(fenced?.citations).toEqual([{ slug: 'cc-intro' }]);
  });

  it('JSON 前后夹带解释文字时仍能解析（只取其中的对象）', () => {
    const chatty = parseAssistantOutput(
      '好的，我来回答：\n{"answer":"先读入门教程，再动手实践。","citations":[]}\n希望有帮助。',
      CITABLE,
    );
    expect(chatty?.answer).toBe('先读入门教程，再动手实践。');
  });

  it('无 JSON 可提取时拒收（不把散文当合同）', () => {
    expect(parseAssistantOutput('这是一段没有 JSON 的散文回答。', CITABLE)).toBeNull();
  });

  it('answer 缺失 / 过短 / 过长 / 非对象 → 整体拒收', () => {
    expect(parseAssistantOutput({ citations: [] }, CITABLE)).toBeNull();
    expect(parseAssistantOutput({ answer: '短' }, CITABLE)).toBeNull();
    expect(
      parseAssistantOutput({ answer: '长'.repeat(ASSISTANT_ANSWER_MAX_LENGTH + 1) }, CITABLE),
    ).toBeNull();
    expect(parseAssistantOutput('不是 JSON', CITABLE)).toBeNull();
    expect(parseAssistantOutput(null, CITABLE)).toBeNull();
  });

  it('sanitize：折叠链接、去尖括号、压空行', () => {
    expect(sanitizeAnswerText('看[这篇](/posts/x)再动手')).toBe('看这篇再动手');
    expect(sanitizeAnswerText('<b>hi</b>')).toBe('bhi/b');
    expect(sanitizeAnswerText('段一\n\n\n\n段二  \n尾')).toBe('段一\n\n段二\n尾');
  });
});

describe('观测 P1 合同（token / 延迟 / 降级原因）', () => {
  it('DEGRADE_REASONS 词表完整且可判定', () => {
    expect(DEGRADE_REASONS).toEqual([
      'ai-disabled',
      'budget-exceeded',
      'timeout',
      'client-abort',
      'queue-full',
      'queue-deadline',
      'bad-output',
      'runtime-error',
    ]);
    expect(isDegradeReason('timeout')).toBe(true);
    expect(isDegradeReason('whatever')).toBe(false);
    expect(isDegradeReason(null)).toBe(false);
    expect(isDegradeReason(1)).toBe(false);
  });

  it('新字段全部可选：老调用方不填合法，AI 路径可填全', () => {
    const legacy: AssistantRunResult = {
      answer: '规则版的回答仍然非空。',
      citations: [],
      sessionId: 's1',
      aiUsedFlag: false,
      elapsedMs: 12,
    };
    expect(legacy.usage).toBeUndefined();
    expect(legacy.degradeReason).toBeUndefined();

    const ai: AssistantRunResult = {
      answer: 'AI 回答。',
      citations: [{ slug: 'cc-intro' }],
      sessionId: 's1',
      aiUsedFlag: true,
      elapsedMs: 3200,
      usage: { inputTokens: 1850, outputTokens: 340, cacheReadTokens: 1620 },
      firstChunkMs: 820,
      queueWaitMs: 40,
      degradeReason: null,
    };
    expect(ai.usage?.inputTokens).toBe(1850);
    expect(ai.usage?.cacheReadTokens).toBe(1620);
    expect(ai.firstChunkMs).toBe(820);
    expect(ai.degradeReason).toBeNull();
  });
});

describe('extractStreamedAnswer（流式展示合同）', () => {
  it('只提取 answer 已闭合文本；citations 尾巴与 JSON 噪声不外发', () => {
    expect(extractStreamedAnswer('{"answer":"你好')).toBe('你好');
    expect(extractStreamedAnswer('{"answer":"答案","citations":["used-macbook-guide"]}')).toBe('答案');
    expect(extractStreamedAnswer('{"ans')).toBe('');
  });

  it('容忍 "answer" 与冒号后的空白变体；转义字符还原', () => {
    expect(extractStreamedAnswer('{ "answer" : "变体" }')).toBe('变体');
    expect(extractStreamedAnswer('{"answer":"换行\\n引号\\"反斜杠\\\\","citations":[]}')).toBe('换行\n引号"反斜杠\\');
  });
});
