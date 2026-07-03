import { describe, it, expect } from 'vitest';
import { getSolarTerm } from './solar-terms';

describe('二十四节气自适应色彩计算测试', () => {
  it('应当精确划分夏至与冬至的边界', () => {
    // 夏至通常在 6 月 21 - 22 日
    const summerSolstice = getSolarTerm(new Date(2026, 5, 22)); // Month = 5 (Jun)
    expect(summerSolstice.name).toBe('夏至');
    expect(summerSolstice.colors.brand).toBe('#0284C7'); // 默认夏日蓝色

    // 冬至通常在 12 月 21 - 22 日
    const winterSolstice = getSolarTerm(new Date(2026, 11, 22)); // Month = 11 (Dec)
    expect(winterSolstice.name).toBe('冬至');
    expect(winterSolstice.colors.brand).toBe('#6366F1');
  });

  it('应当精确判定小暑大暑', () => {
    // 小暑通常在 7 月 7 - 8 日
    const slightHeat = getSolarTerm(new Date(2026, 6, 10)); // Month = 6 (Jul)
    expect(slightHeat.name).toBe('小暑');
    expect(slightHeat.colors.brand).toBe('#0F766E');

    // 大暑通常在 7 月 22 - 23 日
    const greatHeat = getSolarTerm(new Date(2026, 6, 25)); // Month = 6 (Jul)
    expect(greatHeat.name).toBe('大暑');
    expect(greatHeat.colors.brand).toBe('#DC2626');
  });

  it('应当正确降级或向前追溯节气', () => {
    // 元旦节 1 月 1 日应判定为上一月的冬至
    const newYear = getSolarTerm(new Date(2026, 0, 1)); // Month = 0 (Jan)
    expect(newYear.name).toBe('冬至');
  });
});
