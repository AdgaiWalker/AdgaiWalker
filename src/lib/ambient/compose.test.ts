import { describe, it, expect } from 'vitest';
import { daylightFactors, applyDaylight, type ComposeInput } from './compose';

// 构造一天：sunrise 06:00, solarNoon 12:00, sunset 18:00（某天 UTC）
const DAY = Date.UTC(2026, 5, 21); // 2026-06-21 00:00 UTC
const H = 3600_000;
const sun = { sunrise: DAY + 6 * H, solarNoon: DAY + 12 * H, sunset: DAY + 18 * H };

function inputAt(hour: number, condition: ComposeInput['condition'] = 'clear', dayOfYear = 172): ComposeInput {
  return { now: DAY + hour * H, dayOfYear, sun, condition };
}

describe('daylightFactors', () => {
  it('正午是白天、dayStrength≈1', () => {
    const f = daylightFactors(inputAt(12));
    expect(f.isNight).toBe(false);
    expect(f.dayStrength).toBeGreaterThan(0.95);
  });
  it('子夜是夜间', () => {
    expect(daylightFactors(inputAt(0)).isNight).toBe(true);
    expect(daylightFactors(inputAt(23)).isNight).toBe(true);
  });
  it('日出/日落时刻 horizonWarmth≈1', () => {
    expect(daylightFactors(inputAt(6)).horizonWarmth).toBeGreaterThan(0.95);
    expect(daylightFactors(inputAt(18)).horizonWarmth).toBeGreaterThan(0.95);
  });
  it('正午 horizonWarmth≈0', () => {
    expect(daylightFactors(inputAt(12)).horizonWarmth).toBeLessThan(0.05);
  });
});

describe('applyDaylight 可读性铁律', () => {
  it('白天：深字浅底（text.l < bg.l），明度差 ≥0.6', () => {
    const p = applyDaylight(inputAt(12));
    expect(p.isNight).toBe(false);
    expect(p.text.l).toBeLessThan(p.bg.l);
    expect(p.bg.l - p.text.l).toBeGreaterThanOrEqual(0.6);
  });
  it('夜间：浅字深底（text.l > bg.l），明度差 ≥0.6', () => {
    const p = applyDaylight(inputAt(0));
    expect(p.isNight).toBe(true);
    expect(p.text.l).toBeGreaterThan(p.bg.l);
    expect(p.text.l - p.bg.l).toBeGreaterThanOrEqual(0.6);
  });
  it('整天 24 小时明度差恒 ≥0.6（明暗是分类不插值）', () => {
    for (let hh = 0; hh < 24; hh++) {
      const p = applyDaylight(inputAt(hh));
      const gap = Math.abs(p.text.l - p.bg.l);
      expect(gap, `hour ${hh} gap ${gap}`).toBeGreaterThanOrEqual(0.6);
    }
  });
  it('日出/日落有暖峰：brand 彩度被抬高', () => {
    const noon = applyDaylight(inputAt(12));
    const dusk = applyDaylight(inputAt(18));
    expect(dusk.brand.c).toBeGreaterThan(noon.brand.c);
  });
});
