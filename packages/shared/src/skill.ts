/**
 * 技能契约 —— `skills/<id>/` 目录的机器可读部分。
 *
 * 设计要点（决定了「技能能带走」）：
 * - **声明能力需求，不声明具体模型**：`model.requirement` 说「我要一个 chat 模型、
 *   需要 128K 上下文」，落到哪个 provider/model 由部署层的 binding 决定。
 *   换项目只改 binding，技能本体零改动。
 * - **提示词不复制进 JSON**：`prompt.file` 指向 `SKILL.md`（人读 + 任何 agent 可直接加载），
 *   单一真相源。
 * - **自带考题**：`cases.file` 指向 `cases.json`，迁移后用来自证跑通。
 */
import {
  checkSchemaVersion,
  collect,
  isNumber,
  isRecord,
  isStringArray,
} from './guards.js';
import type { ParseResult } from './parse-result.js';

/** 技能格式版本。形状再有破坏性变更时 +1，旧技能包会被解析器明确拒绝 */
export const SKILL_SCHEMA_VERSION = 1;

/** 技能 id 即目录名：必须能安全落盘（不允许路径穿越与空格） */
export const SKILL_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export type SkillModelRequirement = {
  /** 目前只支持对话型；将来的图像/嵌入按 kind 扩展 */
  kind: 'chat';
  /** 需要的上下文窗口（tokens），用于挑绑定 */
  contextTokens?: number;
  /** 是否需要结构化输出（JSON）能力 */
  structuredOutput?: boolean;
  /** 是否需要流式 */
  streaming?: boolean;
};

export type SkillManifest = {
  schemaVersion: number;
  id: string;
  name: string;
  icon: string;
  /** 技能自身版本（内容迭代用），与 schemaVersion 不同义 */
  version: string;
  description: string;
  model: {
    requirement: SkillModelRequirement;
    /** 采样参数：随技能走（属于技能行为，不属于部署） */
    params: { temperature?: number; maxTokens?: number };
  };
  io: {
    input: { kind: 'text' | 'json'; description: string };
    output: { kind: 'text' | 'json'; description: string };
  };
  /** 系统提示词所在文件（相对技能目录） */
  prompt: { file: string };
  /** 自检考题所在文件（相对技能目录）；缺席表示该技能还没考题 */
  cases?: { file: string };
  /** binding 模板：新项目照它填 provider/model */
  bindingExample: { providerId: string; modelId: string };
};

export type SkillCase = {
  id: string;
  input: string;
  expect?: {
    /** 回答里必须出现的关键词（全部命中才算过） */
    contains?: string[];
    /** 回答里不得出现的词（命中即失败，如「不知道」「规则模式」） */
    notContains?: string[];
    /** 回答长度下限（字符），防「敷衍了事」 */
    minChars?: number;
  };
};

export type SkillCases = { cases: SkillCase[] };

/**
 * 拆开 `SKILL.md` 的 YAML frontmatter 与正文。
 *
 * 为什么要拆：frontmatter 是给人和 agent 运行时看的元信息（name/description），
 * 喂给模型**必须只喂正文** —— 否则模型会开始「扮演配置注释」，污染回答。
 * 这里只做结构拆分，不解析 YAML（元信息以 skill.json 为准，单一真相源）。
 */
export function splitSkillMarkdown(markdown: string): {
  frontmatter: string;
  body: string;
} {
  const normalized = markdown.replace(/^\uFEFF/, '');
  if (!normalized.startsWith('---')) return { frontmatter: '', body: normalized.trim() };
  const end = normalized.indexOf('\n---', 3);
  if (end === -1) return { frontmatter: '', body: normalized.trim() };
  const afterDelimiter = normalized.indexOf('\n', end + 1);
  return {
    frontmatter: normalized.slice(3, end).trim(),
    body: (afterDelimiter === -1 ? '' : normalized.slice(afterDelimiter + 1)).trim(),
  };
}

/**
 * 按考题期望判分 —— 自检的**唯一**判据实现（api 自检与将来的 CI 共用）。
 *
 * 判分是「期望是否满足」，不是「回答好不好」：它只看显式声明的
 * contains / notContains / minChars，绝不引入语义判断 —— 语义判断是人的事。
 */
export function checkSkillCase(
  answer: string,
  expect?: SkillCase['expect'],
): { ok: boolean; failures: string[] } {
  const failures: string[] = [];
  if (!expect) return { ok: true, failures };

  for (const needle of expect.contains ?? []) {
    if (!answer.includes(needle)) failures.push(`缺少关键词「${needle}」`);
  }
  for (const needle of expect.notContains ?? []) {
    if (answer.includes(needle)) failures.push(`出现了不该出现的内容「${needle}」`);
  }
  if (expect.minChars !== undefined && answer.length < expect.minChars) {
    failures.push(`回答过短（${answer.length} < ${expect.minChars} 字）`);
  }
  return { ok: failures.length === 0, failures };
}

// ---------------------------------------------------------------- 解析器

/** 旧技能包的出路：按最新格式重写（技能是资产，格式不兼容时宁可明确失败） */
const checkVersion = (raw: Record<string, unknown>): string | null =>
  checkSchemaVersion(raw, SKILL_SCHEMA_VERSION, '请按最新格式重写该技能包');

export function parseSkillManifest(raw: unknown): ParseResult<SkillManifest> {
  if (!isRecord(raw)) return { ok: false, reason: 'skill.json 不是 JSON 对象' };
  const version = checkVersion(raw);
  if (version) return { ok: false, reason: version };

  const model = raw.model;
  const requirement = isRecord(model) ? model.requirement : undefined;
  const io = raw.io;
  const prompt = raw.prompt;
  const binding = raw.bindingExample;

  const problems = collect(
    [typeof raw.id !== 'string' || !SKILL_ID_PATTERN.test(raw.id), 'id 必须是 kebab-case（目录名即技能身份）'],
    [typeof raw.name !== 'string' || raw.name.trim() === '', 'name 不能为空'],
    [typeof raw.version !== 'string' || raw.version.trim() === '', 'version 不能为空'],
    [typeof raw.icon !== 'string', 'icon 必须是字符串'],
    [typeof raw.description !== 'string', 'description 必须是字符串'],
    [!isRecord(model), 'model 必须是对象'],
    [
      !isRecord(model) || !isRecord(requirement) || requirement.kind !== 'chat',
      'model.requirement.kind 必须是 chat（能力需求，不是具体模型名）',
    ],
    [!isRecord(model) || !isRecord(model.params), 'model.params 必须是对象'],
    [
      !isRecord(io) ||
        !isRecord(io.input) ||
        !isRecord(io.output) ||
        (io.input.kind !== 'text' && io.input.kind !== 'json') ||
        (io.output.kind !== 'text' && io.output.kind !== 'json'),
      'io.input/output 需为 { kind: text|json, description }',
    ],
    [
      !isRecord(prompt) || typeof prompt.file !== 'string' || prompt.file.trim() === '',
      'prompt.file 必须指向系统提示词文件（技能的灵魂）',
    ],
    [
      !isRecord(binding) ||
        typeof binding.providerId !== 'string' ||
        typeof binding.modelId !== 'string',
      'bindingExample 需给出 providerId 与 modelId 作为部署模板',
    ],
    [
      raw.cases !== undefined && (!isRecord(raw.cases) || typeof raw.cases.file !== 'string'),
      'cases.file 若存在必须是字符串',
    ],
  );
  if (problems.length > 0) {
    return { ok: false, reason: `skill.json 形状不对：${problems.join('；')}` };
  }
  return { ok: true, value: raw as unknown as SkillManifest };
}

export function parseSkillCases(raw: unknown): ParseResult<SkillCases> {
  if (!isRecord(raw)) return { ok: false, reason: 'cases.json 不是 JSON 对象' };
  if (!Array.isArray(raw.cases)) {
    return { ok: false, reason: 'cases.json 形状不对：cases 必须是数组' };
  }
  const problems = collect(
    [
      raw.cases.some(
        (item) =>
          !isRecord(item) ||
          typeof item.id !== 'string' ||
          item.id.trim() === '' ||
          typeof item.input !== 'string' ||
          item.input.trim() === '',
      ),
      'cases 条目需含非空 id 与 input',
    ],
    [
      raw.cases.some((item) => {
        if (!isRecord(item) || item.expect === undefined) return false;
        const expect = item.expect;
        if (!isRecord(expect)) return true;
        return (
          (expect.contains !== undefined && !isStringArray(expect.contains)) ||
          (expect.notContains !== undefined && !isStringArray(expect.notContains)) ||
          (expect.minChars !== undefined && !isNumber(expect.minChars))
        );
      }),
      'cases.expect 的 contains / notContains 必须是字符串数组，minChars 必须是数字',
    ],
  );
  if (problems.length > 0) {
    return { ok: false, reason: `cases.json 形状不对：${problems.join('；')}` };
  }
  return { ok: true, value: raw as unknown as SkillCases };
}
