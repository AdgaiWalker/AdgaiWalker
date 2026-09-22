/**
 * 技能目录端口 —— 技能的**真身在文件系统**（`skills/<id>/`），DB 只做索引与运行数据。
 *
 * 这样换项目 = 拷目录；备份 = git；review = 看 diff。
 * 端口返回「技能 + 问题清单」而不是「只返回好的」：一个坏技能不能让整页打不开，
 * 但也不能被静默忽略 —— 静默忽略会让作者以为技能生效了。
 */
import type { SkillCase, SkillManifest } from '@walker/shared';

export type SkillDescriptor = {
  manifest: SkillManifest;
  /** `SKILL.md` 原文（含 frontmatter），导出时整段给出 */
  promptMarkdown: string;
  /** 拆掉 frontmatter 的正文 —— **真正喂给模型**的部分 */
  systemPrompt: string;
  cases: SkillCase[];
  /** 技能目录（相对仓库根），便于报告与迁移 */
  dir: string;
};

export type SkillCatalogPage = {
  skills: SkillDescriptor[];
  /** 读不出来的技能目录：不静默忽略，如实列出 */
  problems: Array<{ dir: string; reason: string }>;
};

export type SkillLookup =
  | { ok: true; skill: SkillDescriptor }
  | { ok: false; reason: string };

export interface SkillCatalogPort {
  list(): Promise<SkillCatalogPage>;
  find(id: string): Promise<SkillLookup>;
}

export const SKILL_CATALOG = Symbol('SKILL_CATALOG');
