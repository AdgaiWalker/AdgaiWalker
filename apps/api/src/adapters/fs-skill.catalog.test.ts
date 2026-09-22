/**
 * 技能目录读取：身份一致、坏技能不静默、不许逃出目录。
 * 技能包是可迁移资产（可能从别处拷来），所以这三条是安全与正确性的底线。
 */
import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SKILL_SCHEMA_VERSION } from '@walker/shared';
import { FsSkillCatalog } from './fs-skill.catalog';

let root = '';
const catalog = () => new FsSkillCatalog(root);

const manifestOf = (id: string, extra: Record<string, unknown> = {}) => ({
  schemaVersion: SKILL_SCHEMA_VERSION,
  id,
  name: id,
  icon: 'bot',
  version: '1.0.0',
  description: '测试技能',
  model: { requirement: { kind: 'chat' }, params: { temperature: 0.2 } },
  io: {
    input: { kind: 'text', description: '输入' },
    output: { kind: 'text', description: '输出' },
  },
  prompt: { file: 'SKILL.md' },
  cases: { file: 'cases.json' },
  bindingExample: { providerId: 'deepseek', modelId: 'deepseek-chat' },
  ...extra,
});

async function writeSkill(
  name: string,
  manifest: unknown,
  markdown = '---\nname: x\n---\n\n你是测试技能。',
  cases: unknown = { cases: [{ id: 'c1', input: '你好' }] },
): Promise<void> {
  const dir = path.join(root, name);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'skill.json'), JSON.stringify(manifest));
  await fs.writeFile(path.join(dir, 'SKILL.md'), markdown);
  if (cases !== null) await fs.writeFile(path.join(dir, 'cases.json'), JSON.stringify(cases));
}

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-catalog-'));
});

describe('list', () => {
  it('技能目录不存在时返回「零技能」而不是报错', async () => {
    const empty = new FsSkillCatalog(path.join(root, 'nope'));
    expect(await empty.list()).toEqual({ skills: [], problems: [] });
  });

  it('读出技能，并把 frontmatter 与正文分开（喂模型只用正文）', async () => {
    await writeSkill('good', manifestOf('good'));
    const page = await catalog().list();
    const skill = page.skills.find((item) => item.manifest.id === 'good');
    expect(skill?.systemPrompt).toBe('你是测试技能。');
    expect(skill?.promptMarkdown).toContain('name: x');
    expect(skill?.cases).toHaveLength(1);
    expect(skill?.dir).toBe('skills/good');
  });

  it('坏技能进 problems 且说明原因，不从列表里静默消失', async () => {
    await writeSkill('broken', { schemaVersion: SKILL_SCHEMA_VERSION, id: 'broken' });
    const page = await catalog().list();
    expect(page.skills.some((item) => item.manifest.id === 'broken')).toBe(false);
    const problem = page.problems.find((item) => item.dir === 'skills/broken');
    expect(problem?.reason).toContain('skill.json');
  });

  it('id 与目录名不一致时拒绝（防止拷错目录后张冠李戴）', async () => {
    await writeSkill('mislabeled', manifestOf('other-id'));
    const page = await catalog().list();
    expect(page.problems.find((item) => item.dir === 'skills/mislabeled')?.reason).toContain(
      '目录名',
    );
  });

  it('prompt.file 试图逃出技能目录时拒绝', async () => {
    await writeSkill('escaping', manifestOf('escaping', { prompt: { file: '../../secret.md' } }));
    const page = await catalog().list();
    expect(page.problems.find((item) => item.dir === 'skills/escaping')?.reason).toContain(
      '逃出',
    );
  });
});

describe('find', () => {
  it('命中时给出完整技能', async () => {
    const result = await catalog().find('good');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.skill.manifest.model.params.temperature).toBe(0.2);
  });

  it('不存在时给出可读原因（含技能目录位置）', async () => {
    const result = await catalog().find('nope');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('技能不存在：skills/nope');
  });

  it('目录名非法时直接拒绝（路径穿越防御）', async () => {
    const result = await catalog().find('../escape');
    expect(result.ok).toBe(false);
  });
});
