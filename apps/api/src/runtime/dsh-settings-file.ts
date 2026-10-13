/**
 * dsh `settings.yaml` 的安全读写（保留式）。
 *
 * 为什么要独立一份：
 * - 运行时启动（harness-launch）要把 provider 段同步进 home；
 * - 后台配置界面也要写同一个文件。
 * 两处若各写一份合并逻辑，迟早不一致（一处覆盖、一处保留）。
 *
 * **保留式**是硬要求：settings.yaml 还承载 Agent 自己的配置（如 `agent-default-model`），
 * 整文件覆盖会把它们冲掉（R26 前的实现就有这个缺陷）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { CORE_SCHEMA, dump, load } from 'js-yaml';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 读取为对象；缺失、空文件或坏形状一律按空文档处理（不猜测）。 */
export function readSettingsObject(file: string): Record<string, unknown> {
  if (!fs.existsSync(file)) return {};
  try {
    const text = fs.readFileSync(file, 'utf8');
    if (!text.trim()) return {};
    const parsed = load(text, { schema: CORE_SCHEMA });
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * 合并写入一个顶层 section：保留其它 section 与该 section 内未提及的字段。
 * 原子写（临时文件 + rename），0600。
 */
export function mergeSettingsSection(
  file: string,
  section: string,
  values: Record<string, unknown>,
): void {
  const existing = readSettingsObject(file);
  const current = isRecord(existing[section]) ? existing[section] : {};
  const next = { ...existing, [section]: { ...current, ...values } };
  writeSettingsObject(file, next);
}

/** Merge one pi-ai route without replacing its sibling providers. */
export function mergeSettingsProviderRoute(file: string, route: string, values: Record<string, unknown>): void {
  const existing = readSettingsObject(file);
  const section = isRecord(existing['llm-pi-ai']) ? existing['llm-pi-ai'] : {};
  const providers = isRecord(section.providers) ? section.providers : {};
  const current = isRecord(providers[route]) ? providers[route] : {};
  writeSettingsObject(file, {
    ...existing,
    'llm-pi-ai': { ...section, providers: { ...providers, [route]: { ...current, ...values } } },
  });
}

/**
 * 删除一个顶层 section（不存在则无操作）。
 * 用于「换提供方时清掉旧适配器段」——残留的旧段会让运行时按旧引用名取 Key。
 */
export function removeSettingsSection(file: string, section: string): void {
  const existing = readSettingsObject(file);
  if (!(section in existing)) return;
  const next = { ...existing };
  delete next[section];
  writeSettingsObject(file, next);
}

/**
 * 删除某个 section 内的一个字段（section 或字段不存在则无操作）。
 * 用于「清空自定义模型名」——写空串与「没有该字段」在合并语义上无法区分。
 */
export function removeSettingsField(file: string, section: string, field: string): void {
  const existing = readSettingsObject(file);
  const current = existing[section];
  if (!isRecord(current) || !(field in current)) return;
  const nextSection = { ...current };
  delete nextSection[field];
  writeSettingsObject(file, { ...existing, [section]: nextSection });
}

/** 整体写回（仅在本工具内部与需要删除字段时使用）。 */
export function writeSettingsObject(file: string, value: Record<string, unknown>): void {
  // 目录可能还不存在：每个 Agent 的 home 是首次保存时才建的
  // （共享层目录一直存在，所以这个坑只在 per-agent 写入时暴露）。
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, dump(value, { indent: 2, lineWidth: -1, noRefs: true }), {
    encoding: 'utf8',
    mode: 0o600,
  });
  fs.renameSync(tmp, file);
}
