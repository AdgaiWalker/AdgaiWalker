/**
 * 文件系统技能目录 —— 技能真身的读取实现。
 *
 * 纪律：
 * 1. **坏技能不静默**：读不出来的进 `problems`（连同原因），而不是悄悄从列表消失；
 * 2. **目录名即身份**：`skill.json` 的 id 必须与目录名一致，否则报错（防止拷错目录后张冠李戴）；
 * 3. **不允许逃出技能目录**：`prompt.file` 是相对路径，越界即拒绝（技能包是可以从别处拷来的）。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  SKILL_ID_PATTERN,
  parseSkillCases,
  parseSkillManifest,
  splitSkillMarkdown,
  type SkillCase,
} from '@walker/shared';
import type {
  SkillCatalogPage,
  SkillCatalogPort,
  SkillDescriptor,
  SkillLookup,
} from '../ports/skill.port';

export class FsSkillCatalog implements SkillCatalogPort {
  constructor(
    private readonly rootDir: string,
    /** 报告里显示的目录前缀（`skills/xiaoying`），与实际 root 解耦 */
    private readonly label = 'skills',
  ) {}

  private async readJson(file: string): Promise<unknown> {
    try {
      return JSON.parse(await fs.readFile(file, 'utf8'));
    } catch (error) {
      throw new Error(
        `${path.basename(file)} 读不出来：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** 解析出的相对路径必须在技能目录内 */
  private resolveInside(dir: string, relative: string): string {
    const resolved = path.resolve(dir, relative);
    const inside = path.relative(dir, resolved);
    if (inside.startsWith('..') || path.isAbsolute(inside)) {
      throw new Error(`引用的文件逃出了技能目录：${relative}`);
    }
    return resolved;
  }

  private async loadDir(name: string): Promise<SkillDescriptor> {
    if (!SKILL_ID_PATTERN.test(name)) {
      throw new Error(`技能目录名不合法（须为 kebab-case）：${name}`);
    }
    const dir = path.join(this.rootDir, name);

    const parsed = parseSkillManifest(await this.readJson(path.join(dir, 'skill.json')));
    if (!parsed.ok) throw new Error(parsed.reason);
    const manifest = parsed.value;
    if (manifest.id !== name) {
      throw new Error(`skill.json 的 id（${manifest.id}）必须与目录名（${name}）一致`);
    }

    const markdown = await fs.readFile(
      this.resolveInside(dir, manifest.prompt.file),
      'utf8',
    );
    const { body } = splitSkillMarkdown(markdown);

    let cases: SkillCase[] = [];
    if (manifest.cases) {
      const parsedCases = parseSkillCases(
        await this.readJson(this.resolveInside(dir, manifest.cases.file)),
      );
      if (!parsedCases.ok) throw new Error(parsedCases.reason);
      cases = parsedCases.value.cases;
    }

    return {
      manifest,
      promptMarkdown: markdown,
      systemPrompt: body,
      cases,
      dir: `${this.label}/${name}`,
    };
  }

  async list(): Promise<SkillCatalogPage> {
    const skills: SkillDescriptor[] = [];
    const problems: Array<{ dir: string; reason: string }> = [];
    let entries;
    try {
      entries = await fs.readdir(this.rootDir, { withFileTypes: true });
    } catch {
      // 还没有技能目录：不是错误，是「零技能」的诚实状态
      return { skills, problems };
    }
    for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      try {
        skills.push(await this.loadDir(entry.name));
      } catch (error) {
        problems.push({
          dir: `${this.label}/${entry.name}`,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return { skills, problems };
  }

  async find(id: string): Promise<SkillLookup> {
    try {
      return { ok: true, skill: await this.loadDir(id) };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const missing = reason.includes('ENOENT');
      return {
        ok: false,
        reason: missing ? `技能不存在：${this.label}/${id}` : reason,
      };
    }
  }
}
