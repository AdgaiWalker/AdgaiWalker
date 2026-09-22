/**
 * 契约层的通用运行时守卫 —— 所有「读外部数据」的解析器共用一份。
 *
 * 各写一遍的后果不是重复几行，而是**漂移**：某个解析器收紧了 `isRecord`，
 * 另一个还收着 `typeof === 'object'`（连数组都放行）。收在一处，语义只有一份。
 */

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

export const isStringMatrix = (value: unknown): value is string[][] =>
  Array.isArray(value) && value.every(isStringArray);

export const isNumber = (value: unknown): value is number => typeof value === 'number';

/** 把一组「[不对劲, 说明]」收成问题清单；全对则返回空 */
export function collect(...pairs: Array<[boolean, string]>): string[] {
  return pairs.filter(([bad]) => bad).map(([, message]) => message);
}

/**
 * 版本位校验。旧数据最常见，原因里直接给出出路（`remediation` 按契约类型不同）。
 * 返回 null 表示通过。
 */
export function checkSchemaVersion(
  raw: Record<string, unknown>,
  expected: number,
  remediation: string,
): string | null {
  const version = raw.schemaVersion;
  if (typeof version !== 'number') {
    return `缺 schemaVersion（旧格式没有版本位），${remediation}`;
  }
  if (version !== expected) {
    return `schemaVersion ${version} 与当前 ${expected} 不匹配，${remediation}`;
  }
  return null;
}
