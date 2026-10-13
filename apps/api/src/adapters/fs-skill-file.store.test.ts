import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FsSkillFileStore } from './fs-skill-file.store';
import type { AgentUnitRow } from '../ports/agent-unit.repository';

describe('FsSkillFileStore', () => {
  let tempDir: string;
  let store: FsSkillFileStore;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-store-test-'));
    store = new FsSkillFileStore(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const baseUnit: AgentUnitRow = {
    id: 'test-agent',
    name: '测试助手',
    icon: 'bot',
    isSystem: false,
    providerId: 'deepseek-official',
    modelId: 'deepseek-chat',
    prompt: '你是一个测试助手。',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('全新目录时创建 SKILL.md、skill.json 和 binding.example.json', async () => {
    await store.syncFromUnit(baseUnit);

    const skillDir = path.join(tempDir, 'test-agent');
    const skillMd = await fs.readFile(path.join(skillDir, 'SKILL.md'), 'utf8');
    expect(skillMd).toContain('name: test-agent');
    expect(skillMd).toContain('你是一个测试助手。');

    const skillJson = JSON.parse(await fs.readFile(path.join(skillDir, 'skill.json'), 'utf8'));
    expect(skillJson.id).toBe('test-agent');
    expect(skillJson.name).toBe('测试助手');
    expect(skillJson.prompt).toEqual({ file: 'SKILL.md' });
    expect(skillJson.model.params.temperature).toBe(0.3);

    const bindingJson = JSON.parse(await fs.readFile(path.join(skillDir, 'binding.example.json'), 'utf8'));
    expect(bindingJson).toEqual({
      providerId: 'deepseek-official',
      modelId: 'deepseek-chat',
    });
  });

  it('已有 SKILL.md 时原样保留正文，保留 skill.json 中的自定义字段与用例', async () => {
    const skillDir = path.join(tempDir, 'test-agent');
    await fs.mkdir(skillDir, { recursive: true });

    const originalMd = '# 手动定制的 SKILL.md\n保留此正文，不被覆盖。';
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), originalMd, 'utf8');

    const existingSkillJson = {
      version: '2.5.0',
      description: '自定义描述',
      model: {
        requirement: { kind: 'reasoning' },
        params: { temperature: 0.7 },
      },
      cases: [{ input: '你好', expected: '你好！' }],
    };
    await fs.writeFile(path.join(skillDir, 'skill.json'), JSON.stringify(existingSkillJson), 'utf8');

    await store.syncFromUnit({
      ...baseUnit,
      name: '新名称',
      prompt: '新提示词（应不覆盖已有 SKILL.md）',
    });

    const updatedMd = await fs.readFile(path.join(skillDir, 'SKILL.md'), 'utf8');
    expect(updatedMd).toBe(originalMd);

    const updatedSkillJson = JSON.parse(await fs.readFile(path.join(skillDir, 'skill.json'), 'utf8'));
    expect(updatedSkillJson.name).toBe('新名称');
    expect(updatedSkillJson.version).toBe('2.5.0');
    expect(updatedSkillJson.description).toBe('自定义描述');
    expect(updatedSkillJson.model.requirement).toEqual({ kind: 'reasoning' });
    expect(updatedSkillJson.model.params.temperature).toBe(0.7);
    expect(updatedSkillJson.cases).toEqual([{ input: '你好', expected: '你好！' }]);
  });

  it('非法 id 抛出异常，不写入文件', async () => {
    await expect(
      store.syncFromUnit({
        ...baseUnit,
        id: 'Invalid_Id_With_CamelCase',
      }),
    ).rejects.toThrow('角色 id 不能作为技能目录名（须为 kebab-case）');
  });
});
