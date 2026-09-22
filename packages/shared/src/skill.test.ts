/**
 * 技能契约（`skills/<id>/skill.json`）的测试。
 *
 * 技能是**可迁移资产**：拷到别的项目要能立刻被识别。因此格式一旦读错，
 * 迁移就悄悄失败（缺字段的技能被当默认值吞掉）。这里把「形状不对 → 拒绝并说明」
 * 钉死，和产物契约层同一纪律。
 */
import { describe, expect, it } from 'vitest';
import {
  SKILL_SCHEMA_VERSION,
  checkSkillCase,
  parseSkillCases,
  parseSkillManifest,
  splitSkillMarkdown,
  type SkillManifest,
} from './skill.js';

const valid: SkillManifest = {
  schemaVersion: SKILL_SCHEMA_VERSION,
  id: 'xiaoying',
  name: '小影',
  icon: 'bot',
  version: '1.0.0',
  description: '站内助手：依据站内文章回答访客问题',
  model: {
    requirement: { kind: 'chat', contextTokens: 128_000, streaming: true },
    params: { temperature: 0.3, maxTokens: 1024 },
  },
  io: {
    input: { kind: 'text', description: '访客问题' },
    output: { kind: 'text', description: '回答（纯文本）' },
  },
  prompt: { file: 'SKILL.md' },
  cases: { file: 'cases.json' },
  bindingExample: { providerId: 'deepseek', modelId: 'deepseek-chat' },
};

describe('parseSkillManifest', () => {
  it('接受合法技能清单', () => {
    const result = parseSkillManifest(valid);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.id).toBe('xiaoying');
  });

  it('拒绝缺 schemaVersion 的清单（旧格式必须重写，不能靠猜）', () => {
    const { schemaVersion: _dropped, ...legacy } = valid;
    const result = parseSkillManifest(legacy);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('schemaVersion');
  });

  it('拒绝 id 不合法的清单（目录名即技能身份，必须能安全落盘）', () => {
    expect(parseSkillManifest({ ...valid, id: '../escape' }).ok).toBe(false);
    expect(parseSkillManifest({ ...valid, id: 'Has Space' }).ok).toBe(false);
  });

  it('拒绝缺系统提示词指向的清单（技能的灵魂是提示词）', () => {
    const { prompt: _dropped, ...noPrompt } = valid;
    const result = parseSkillManifest(noPrompt);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('prompt');
  });

  it('拒绝缺模型能力需求的清单（可迁移的前提是声明「要什么」，而不是「用谁」）', () => {
    const { model: _dropped, ...noModel } = valid;
    const result = parseSkillManifest(noModel);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('model');
  });

  it('拒绝描述能力不足的清单（name / model.requirement.kind）', () => {
    expect(parseSkillManifest({ ...valid, name: '' }).ok).toBe(false);
    expect(
      parseSkillManifest({
        ...valid,
        model: { ...valid.model, requirement: { kind: '图像' } },
      }).ok,
    ).toBe(false);
  });
});

describe('splitSkillMarkdown', () => {
  it('拆出 frontmatter 与正文（喂模型只能用正文）', () => {
    const { frontmatter, body } = splitSkillMarkdown(
      ['---', 'name: xiaoying', 'version: 1.0.0', '---', '', '# 小影', '', '你是站内助手。'].join(
        '\n',
      ),
    );
    expect(frontmatter).toBe('name: xiaoying\nversion: 1.0.0');
    expect(body).toBe('# 小影\n\n你是站内助手。');
    expect(body).not.toContain('name:');
  });

  it('没有 frontmatter 时原样作为正文返回', () => {
    expect(splitSkillMarkdown('就是一段提示词。').body).toBe('就是一段提示词。');
    expect(splitSkillMarkdown('就是一段提示词。').frontmatter).toBe('');
  });

  it('frontmatter 未闭合时不当配置解析（宁可全给模型，也不吃掉正文）', () => {
    const markdown = '---\nname: broken\n\n正文还在。';
    expect(splitSkillMarkdown(markdown).body).toBe(markdown.trim());
  });
});

describe('checkSkillCase（自检判据）', () => {
  it('contains / notContains / minChars 三条判据各司其职', () => {
    expect(checkSkillCase('我是小影，站内助手。', { contains: ['小影'], minChars: 5 }).ok).toBe(true);
    const failures = checkSkillCase('（规则模式）固定回答。', {
      contains: ['小影'],
      notContains: ['规则模式'],
      minChars: 50,
    });
    expect(failures.ok).toBe(false);
    expect(failures.failures).toEqual([
      '缺少关键词「小影」',
      '出现了不该出现的内容「规则模式」',
      '回答过短（11 < 50 字）',
    ]);
  });

  it('没有期望的考题默认通过（存在即跑通，别让自检变成半成品）', () => {
    expect(checkSkillCase('任意回答', undefined).ok).toBe(true);
    expect(checkSkillCase('任意回答', {}).ok).toBe(true);
  });
});

describe('parseSkillCases', () => {
  it('接受合法考题', () => {
    const result = parseSkillCases({
      cases: [{ id: 'core', input: '站点是做什么的', expect: { contains: ['知识库'] } }],
    });
    expect(result.ok).toBe(true);
  });

  it('拒绝没有 cases 数组的考题文件', () => {
    expect(parseSkillCases({}).ok).toBe(false);
    expect(parseSkillCases({ cases: [{ input: '缺 id' }] }).ok).toBe(false);
  });
});
