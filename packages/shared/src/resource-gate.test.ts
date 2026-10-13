import { describe, expect, it } from 'vitest';
import { memoryHeadroomOk, resolveMinFreeMemoryMb, DEFAULT_MIN_FREE_MEMORY_MB } from './resource-gate.js';

describe('G03 资源门禁（内存余量判定）', () => {
  it('余量达到 512MB 阈值即放行', () => {
    expect(memoryHeadroomOk(512 * 1024 * 1024).ok).toBe(true);
    expect(memoryHeadroomOk(1024 * 1024 * 1024).ok).toBe(true);
  });

  it('余量低于阈值时阻断并给出如实说明', () => {
    const result = memoryHeadroomOk(100 * 1024 * 1024);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('100MB');
      expect(result.reason).toContain('512MB');
      expect(result.reason).toContain('阻止');
    }
  });

  it('默认阈值为 512MB（不偷偷放宽）', () => {
    expect(DEFAULT_MIN_FREE_MEMORY_MB).toBe(512);
    expect(resolveMinFreeMemoryMb({})).toBe(512);
  });

  it('运维可显式覆盖阈值（显式 0 解除门；非法值回落默认）', () => {
    expect(resolveMinFreeMemoryMb({ WALKER_MEMORY_HEADROOM_MB: '0' })).toBe(0);
    expect(resolveMinFreeMemoryMb({ WALKER_MEMORY_HEADROOM_MB: '1024' })).toBe(1024);
    expect(resolveMinFreeMemoryMb({ WALKER_MEMORY_HEADROOM_MB: 'abc' })).toBe(512);
    expect(resolveMinFreeMemoryMb({ WALKER_MEMORY_HEADROOM_MB: '-5' })).toBe(512);
  });
});
