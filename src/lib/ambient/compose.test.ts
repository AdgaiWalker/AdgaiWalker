import { describe, it, expect } from 'vitest';
import {
  daylightFactors,
  applyDaylight,
  applyWeather,
  composePalette,
  toCssVars,
  type ComposeInput,
} from './compose';
import type { WeatherCondition } from './wmo';

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

describe('applyWeather（中度）', () => {
  it('晴 → 彩度提升', () => {
    const base = applyDaylight(inputAt(12, 'clear'));
    const sunny = applyWeather(base, 'clear');
    expect(sunny.brand.c).toBeGreaterThanOrEqual(base.brand.c);
  });
  it('阴/雾 → 彩度降低', () => {
    const base = applyDaylight(inputAt(12, 'clear'));
    expect(applyWeather(base, 'overcast').brand.c).toBeLessThan(base.brand.c);
    expect(applyWeather(base, 'fog').brand.c).toBeLessThan(base.brand.c);
  });
  it('雨/雷 → 偏暗', () => {
    const base = applyDaylight(inputAt(12, 'clear'));
    expect(applyWeather(base, 'heavyrain').bg.l).toBeLessThan(base.bg.l);
    expect(applyWeather(base, 'thunder').bg.l).toBeLessThan(base.bg.l);
  });
  it('雪 → 偏白提亮', () => {
    const base = applyDaylight(inputAt(12, 'clear'));
    expect(applyWeather(base, 'snow').bg.l).toBeGreaterThan(base.bg.l);
  });
  it('雾 → 对比压缩（textDim 更靠近 text）', () => {
    const base = applyDaylight(inputAt(12, 'clear'));
    const fog = applyWeather(base, 'fog');
    const baseSpread = Math.abs(base.textDim.l - base.text.l);
    const fogSpread = Math.abs(fog.textDim.l - fog.text.l);
    expect(fogSpread).toBeLessThan(baseSpread);
  });
  it('天气不破坏可读性：任意天气下明度差仍 ≥0.6', () => {
    const conds: WeatherCondition[] = [
      'clear', 'partlycloudy', 'overcast', 'fog', 'lightrain', 'heavyrain', 'snow', 'thunder',
    ];
    for (const c of conds) {
      for (let hh = 0; hh < 24; hh += 3) {
        const p = applyWeather(applyDaylight(inputAt(hh, c)), c);
        expect(Math.abs(p.text.l - p.bg.l), `${c} h${hh}`).toBeGreaterThanOrEqual(0.6);
      }
    }
  });
});

describe('composePalette 皇冠矩阵', () => {
  const conds: WeatherCondition[] = [
    'clear', 'partlycloudy', 'overcast', 'fog', 'lightrain', 'heavyrain', 'snow', 'thunder',
  ];
  const seasonDays = [35, 80, 125, 172, 218, 266, 311, 355];
  const keys = ['bg', 'text', 'textDim', 'brand', 'secondary', 'orb1', 'orb2', 'orb3', 'orb4'] as const;

  it('8 季 × 24 时刻 × 8 天气 全组合：可读性 + 合法性', () => {
    for (const d of seasonDays) {
      for (let hh = 0; hh < 24; hh++) {
        for (const c of conds) {
          const p = composePalette(inputAt(hh, c, d));
          const gap = Math.abs(p.text.l - p.bg.l);
          expect(gap, `day${d} h${hh} ${c} gap=${gap.toFixed(3)}`).toBeGreaterThanOrEqual(0.6);
          for (const k of keys) {
            expect(Number.isFinite(p[k].l), `${k}.l finite`).toBe(true);
            expect(p[k].l, `${k}.l in [0,1]`).toBeGreaterThanOrEqual(0);
            expect(p[k].l, `${k}.l in [0,1]`).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });

  it('toCssVars 产出合法 oklch() 字符串且含核心变量', () => {
    const vars = toCssVars(composePalette(inputAt(12)));
    expect(vars['--color-bg']).toMatch(/^oklch\(/);
    expect(vars['--color-parchment']).toMatch(/^oklch\(/);
    expect(vars['--color-brand']).toMatch(/^oklch\(/);
    expect(vars['--color-card']).toMatch(/oklch\(.*\/\s*[\d.]+\)/); // 带 alpha
    expect(vars['--orb-color-1']).toBeDefined();
  });
});
