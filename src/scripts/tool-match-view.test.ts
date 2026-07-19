// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';

import {
  escapeAttr,
  escapeHtml,
  renderComplianceResponse,
  renderDiagnosisResponse,
  renderPlainResponse,
  renderPromptBox,
  renderResultCard,
  type MatchResponse,
} from './tool-match-view';

describe('escapeHtml / escapeAttr', () => {
  it('转义 < > & 字符', () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      '&lt;script&gt;alert("x")&lt;/script&gt;',
    );
  });

  it('escapeAttr 额外转义引号', () => {
    expect(escapeAttr('a"b\'c')).toBe('a&quot;b&#39;c');
  });
});

describe('renderPlainResponse', () => {
  it('使用 bridge 文本', () => {
    const html = renderPlainResponse({ bridge: '你好' } as MatchResponse);
    expect(html).toBe('<p>你好</p>');
  });

  it('bridge 缺省时用兜底文案', () => {
    const html = renderPlainResponse({} as MatchResponse);
    expect(html).toContain('你可以直接说想用 AI 做什么');
  });

  it('转义 bridge 中的 HTML', () => {
    const html = renderPlainResponse({ bridge: '<b>x</b>' } as MatchResponse);
    expect(html).toContain('&lt;b&gt;');
    expect(html).not.toContain('<b>');
  });
});

describe('renderPromptBox', () => {
  it('无 actionPlan 或无 prompt 返回空串', () => {
    expect(renderPromptBox(undefined)).toBe('');
    expect(renderPromptBox({ prompt: '', nextStep: '' })).toBe('');
  });

  it('有 prompt 时渲染带 data-copy-prompt 的复制按钮', () => {
    const html = renderPromptBox({ prompt: '帮我写代码', nextStep: '' });
    expect(html).toContain('data-copy-prompt=');
    expect(html).toContain('帮我写代码');
    expect(html).toContain('copy-prompt');
  });
});

describe('renderDiagnosisResponse', () => {
  it('渲染 bridge + promptBox + 选项按钮', () => {
    const html = renderDiagnosisResponse({
      bridge: '收窄方向',
      actionPlan: { prompt: 'p1', nextStep: '' },
      diagnosisOptions: [
        { label: '选项A', text: 'text-a' },
        { label: '选项B', text: 'text-b' },
      ],
    } as MatchResponse);
    expect(html).toContain('收窄方向');
    expect(html).toContain('data-diagnosis-text="text-a"');
    expect(html).toContain('选项B');
  });
});

describe('renderComplianceResponse', () => {
  it('渲染合规转向卡片', () => {
    const html = renderComplianceResponse({ bridge: '不能协助' } as MatchResponse);
    expect(html).toContain('合规转向');
    expect(html).toContain('chat-result-card');
    expect(html).toContain('不能协助');
  });
});

describe('renderResultCard', () => {
  const baseResponse: MatchResponse = {
    sessionId: 's1',
    bridge: '先做这一步',
    actionPlan: {
      primaryTool: { id: 't1', name: 'Cursor', tagline: '编辑器', useFor: '写代码', nextStep: '下一步', fit: 'best' },
      backupTools: [{ id: 't2', name: 'Codex', tagline: '代理', useFor: '执行', nextStep: '', fit: 'also-good' }],
      prompt: '复制我',
      nextStep: '继续',
    },
    resources: [
      { id: 'r1', title: '资源A', href: '/a', kind: 'doc', useFor: '参考', summary: '' },
    ],
    needCaseId: 'nc1',
  };

  it('渲染 verdict / bridge / 主工具 / 备选 / prompt / 资源 / 反馈按钮', () => {
    const html = renderResultCard(baseResponse);
    expect(html).toContain('先做这一步');
    expect(html).toContain('Cursor');
    expect(html).toContain('备选：Codex');
    expect(html).toContain('复制我');
    expect(html).toContain('资源A');
    expect(html).toContain('data-feedback="first-draft"');
    expect(html).toContain('data-need-case-id="nc1"');
  });

  it('无 primaryTool 时回退到 toolDirection', () => {
    const html = renderResultCard({
      bridge: 'b',
      toolDirection: '用命令行',
    } as MatchResponse);
    expect(html).toContain('result-direction');
    expect(html).toContain('用命令行');
    expect(html).not.toContain('action-tool-name');
  });

  it('主工具缺 useFor 时回退到 tagline', () => {
    const html = renderResultCard({
      actionPlan: { primaryTool: { id: 't', name: 'N', tagline: '副标题', useFor: '', nextStep: '', fit: 'best' }, prompt: '', nextStep: '' },
    } as MatchResponse);
    expect(html).toContain('副标题');
  });
});
