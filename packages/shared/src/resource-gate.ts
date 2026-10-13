/** G03 资源门禁：内存余量阈值与判定规则只有这一份。 */

/** 目标机器（2C2G Windows）要求的最低可用内存余量（MB）。不满足时降级而不是偷偷扩容。 */
export const DEFAULT_MIN_FREE_MEMORY_MB = 512;

/**
 * 解析生效阈值。
 *
 * - 生产默认 512MB；
 * - 允许运维经 `WALKER_MEMORY_HEADROOM_MB` 显式覆盖（例如低配开发机设 0 解除该门，
 *   或高配机器上调）。这是**运维配置**而非兼容代码：目标机器按验收条款保持默认。
 */
export function resolveMinFreeMemoryMb(env?: Record<string, string | undefined>): number {
  const source = env ?? (typeof process !== 'undefined' && process.env ? process.env : {});
  const raw = source.WALKER_MEMORY_HEADROOM_MB;
  if (raw === undefined || raw === '') return DEFAULT_MIN_FREE_MEMORY_MB;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : DEFAULT_MIN_FREE_MEMORY_MB;
}

/**
 * 判定内存余量是否满足目标机器要求。
 *
 * - 满足 → ok；
 * - 不满足 → blocked，附带如实说明（不假装可用），调用方据此降级/阻止，绝不扩容。
 */
export function memoryHeadroomOk(
  freeBytes: number,
  minBytes: number = DEFAULT_MIN_FREE_MEMORY_MB * 1024 * 1024,
): { ok: true; freeBytes: number; minBytes: number } | { ok: false; freeBytes: number; minBytes: number; reason: string } {
  if (freeBytes >= minBytes) return { ok: true, freeBytes, minBytes };
  const freeMb = Math.floor(freeBytes / (1024 * 1024));
  const minMb = Math.floor(minBytes / (1024 * 1024));
  return {
    ok: false,
    freeBytes,
    minBytes,
    reason: `可用内存余量 ${freeMb}MB 低于要求 ${minMb}MB，已阻止该能力上线`,
  };
}
