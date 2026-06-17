import { describe, it, expect } from 'vitest';
import { lerp, lerpHue, interpSeason } from './palette';

describe('palette helpers', () => {
  it('lerp 线性插值', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
  });

  it('lerpHue 走最短弧（350→10 不绕一整圈）', () => {
    expect(lerpHue(350, 10, 0.5)).toBeCloseTo(0, 5);
    expect(lerpHue(10, 350, 0.5)).toBeCloseTo(0, 5);
    expect(lerpHue(0, 90, 0.5)).toBeCloseTo(45, 5);
  });
});

describe('interpSeason', () => {
  it('夏至当天命中夏至锚点（brand.h≈95）', () => {
    const p = interpSeason(172);
    expect(p.brand.h).toBeCloseTo(95, 0);
  });

  it('冬至当天命中冬至锚点（brand.h≈250）', () => {
    const p = interpSeason(355);
    expect(p.brand.h).toBeCloseTo(250, 0);
  });

  it('锚点之间是插值（春分到立夏的中点落在两者之间）', () => {
    const chunfen = interpSeason(80);
    const lixia = interpSeason(125);
    const mid = interpSeason(102);
    const hMid = mid.brand.h;
    expect(hMid).toBeGreaterThan(Math.min(chunfen.brand.h, lixia.brand.h) - 5);
    expect(hMid).toBeLessThan(Math.max(chunfen.brand.h, lixia.brand.h) + 5);
  });

  it('产出无 NaN', () => {
    for (let d = 1; d <= 365; d++) {
      const p = interpSeason(d);
      expect(Number.isFinite(p.brand.h)).toBe(true);
      expect(Number.isFinite(p.brand.c)).toBe(true);
    }
  });
});
