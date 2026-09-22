/**
 * 文件系统技能包写入 —— 角色保存时落 `skills/<id>/`。
 *
 * 冲突策略见端口注释：SKILL.md 脚手架-if-absent；skill.json 只同步绑定；
 * cases.json 永不触碰。任何一条写失败都抛出（由调用方决定提示形态）——
 * 静默半写会让「文件是真身」变成谎言。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { SKILL_ID_PATTERN, SKILL_SCHEMA_VERSION } from '@walker/shared';
import type { AgentUnitRow } from '../ports/agent-unit.repository';
import type { SkillFileStorePort } from '../ports/skill-file.port';

export class FsSkillFileStore implements SkillFileStorePort {
  constructor(private readonly rootDir: string) {}

  async syncFromUnit(unit: AgentUnitRow): Promise<void> {
    if (!SKILL_ID_PATTERN.test(unit.id)) {
      throw new Error(`角色 id 不能作为技能目录名（须为 kebab-case）：${unit.id}`);
    }
    const dir = path.join(this.rootDir, unit.id);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'SKILL.md'), await this.skillMarkdown(unit), 'utf8');
    await fs.writeFile(
      path.join(dir, 'skill.json'),
      `${JSON.stringify(await this.skillJson(dir, unit), null, 2)}\n`,
      'utf8',
    );
    await fs.writeFile(
      path.join(dir, 'binding.example.json'),
      `${JSON.stringify(
        {
          providerId: unit.providerId ?? 'deepseek',
          modelId: unit.modelId,
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
  }

  /** SKILL.md：缺则脚手架（frontmatter + DB 提示词）；已有文件原样保留 */
  private async skillMarkdown(unit: AgentUnitRow): Promise<string> {
    const file = path.join(this.rootDir, unit.id, 'SKILL.md');
    try {
      return await fs.readFile(file, 'utf8');
    } catch {
      return [
        '---',
        `name: ${unit.id}`,
        `description: 角色「${unit.name}」的系统提示词`,
        'version: 1.0.0',
        '---',
        '',
        unit.prompt,
        '',
      ].join('\n');
    }
  }

  /** skill.json：始终同步身份与绑定；requirement/params 保留文件现值（缺则给保守默认） */
  private async skillJson(dir: string, unit: AgentUnitRow): Promise<unknown> {
    let current: Record<string, unknown> = {};
    try {
      current = JSON.parse(await fs.readFile(path.join(dir, 'skill.json'), 'utf8')) as Record<
        string,
        unknown
      >;
    } catch {
      current = {};
    }
    const model = (current.model ?? {}) as Record<string, unknown>;
    return {
      schemaVersion: SKILL_SCHEMA_VERSION,
      id: unit.id,
      name: unit.name,
      icon: unit.icon,
      version: typeof current.version === 'string' ? current.version : '1.0.0',
      description:
        typeof current.description === 'string'
          ? current.description
          : `角色「${unit.name}」的技能包`,
      model: {
        requirement: model.requirement ?? { kind: 'chat' },
        params: model.params ?? { temperature: 0.3 },
      },
      io:
        current.io ??
        ({
          input: { kind: 'text', description: '用户输入' },
          output: { kind: 'text', description: '回答' },
        } as unknown),
      prompt: { file: 'SKILL.md' },
      ...(current.cases ? { cases: current.cases } : {}),
      bindingExample: {
        providerId: unit.providerId ?? 'deepseek',
        modelId: unit.modelId,
      },
    };
  }
}
