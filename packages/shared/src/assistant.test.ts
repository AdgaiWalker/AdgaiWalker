import { describe, expect, it } from 'vitest';
import {
  ASSISTANT_ANSWER_MAX_LENGTH,
  ASSISTANT_MAX_CITATIONS,
  extractStreamedAnswer,
  isValidAssistantBody,
  parseAssistantOutput,
  sanitizeAnswerText,
} from './assistant.js';

const CITABLE = new Set(['used-macbook-guide', 'ai-low-cost-access', 'cc-intro']);

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
