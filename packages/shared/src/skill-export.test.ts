/**
 * 技能导出物（对接提示词 / 调用示例 / 接口数据）的测试。
 *
 * 这三样是「技能带走」的载体：贴到别的项目、交给任何 AI，就得能把接口接起来。
 * 所以断言的不是「字符串非空」，而是**该有的对接信息一个都不能少**：
 * 端点、请求字段、输出要求、系统提示词、自检考题、binding 指引。
 */
import { describe, expect, it } from 'vitest';
import { buildCallExamples, buildIntegrationPrompt, buildInterfaceData } from './skill-export.js';
import { SKILL_SCHEMA_VERSION, type SkillCase, type SkillManifest } from './skill.js';

const manifest: SkillManifest = {
  schemaVersion: SKILL_SCHEMA_VERSION,
  id: 'copy-polisher',
  name: '文案打磨',
  icon: 'sparkles',
  version: '1.2.0',
  description: '把粗糙草稿改写成可直接发布的文案',
  model: {
    requirement: { kind: 'chat', contextTokens: 64_000, streaming: false },
    params: { temperature: 0.6, maxTokens: 800 },
  },
  io: {
    input: { kind: 'text', description: '待打磨的草稿' },
    output: { kind: 'text', description: '改写后的文案' },
  },
  prompt: { file: 'SKILL.md' },
  cases: { file: 'cases.json' },
  bindingExample: { providerId: 'deepseek', modelId: 'deepseek-chat' },
};

const cases: SkillCase[] = [
  { id: 'concise', input: '帮我改短一点：……', expect: { minChars: 10 } },
];

const endpoint = { baseUrl: 'http://127.0.0.1:8788', path: '/skills/copy-polisher/run' };

describe('buildInterfaceData', () => {
  it('给出可编程的接口契约：端点、请求字段、响应字段、能力需求', () => {
    const data = buildInterfaceData({ manifest, promptMarkdown: '# 文案打磨\n', cases, endpoint });
    expect(data.endpoint).toEqual({
      method: 'POST',
      url: 'http://127.0.0.1:8788/skills/copy-polisher/run',
      contentType: 'application/json',
    });
    expect(data.request.fields.map((field) => field.name)).toEqual(['input', 'sessionId']);
    expect(data.request.fields.find((field) => field.name === 'input')?.required).toBe(true);
    expect(data.response.fields.map((field) => field.name)).toContain('output');
    expect(data.model.requirement.kind).toBe('chat');
    expect(data.skill.version).toBe('1.2.0');
  });

  it('请求体示例是可直接发送的真实 JSON（字段与声明一致）', () => {
    const data = buildInterfaceData({ manifest, promptMarkdown: '', cases, endpoint });
    const body = JSON.parse(data.request.example) as Record<string, unknown>;
    expect(body.input).toBeTypeOf('string');
    expect(Object.keys(body).sort()).toEqual(['input', 'sessionId'].sort());
  });
});

describe('buildCallExamples', () => {
  it('curl / fetch / SSE 三段示例都指向真实端点', () => {
    const examples = buildCallExamples({ manifest, promptMarkdown: '', cases, endpoint });
    expect(examples.curl).toContain('http://127.0.0.1:8788/skills/copy-polisher/run');
    expect(examples.curl).toContain('Authorization: Bearer');
    expect(examples.fetch).toContain('await fetch(');
    expect(examples.fetch).toContain('"input"');
    expect(examples.sse).toContain('text/event-stream');
  });
});

describe('buildIntegrationPrompt', () => {
  it('自包含：目标项目只读这一份就能完成对接', () => {
    const prompt = buildIntegrationPrompt({
      manifest,
      promptMarkdown: '你是文案打磨专家。',
      cases,
      endpoint,
    });

    // 1) 说明要对接什么
    expect(prompt).toContain('文案打磨');
    expect(prompt).toContain('copy-polisher');
    // 2) 端点的真实形态
    expect(prompt).toContain('POST http://127.0.0.1:8788/skills/copy-polisher/run');
    expect(prompt).toContain('"input"');
    expect(prompt).toContain('"output"');
    // 3) 系统提示词原文（否则对方只拿到壳）
    expect(prompt).toContain('你是文案打磨专家。');
    // 4) 能力需求与部署指引（binding 由对方填）
    expect(prompt).toContain('deepseek-chat');
    expect(prompt).toContain('temperature');
    // 5) 验收标准（自检考题）
    expect(prompt).toContain('concise');
    // 6) 明确告诉对方要交付什么，便于 AI 执行
    expect(prompt).toContain('验收');
  });

  it('提示词里不出现「占位符未替换」这类脏话术（没有 binding 时也自洽）', () => {
    const prompt = buildIntegrationPrompt({
      manifest,
      promptMarkdown: 'p',
      cases: [],
      endpoint,
    });
    expect(prompt).not.toContain('undefined');
    expect(prompt).not.toContain('TODO');
  });
});
