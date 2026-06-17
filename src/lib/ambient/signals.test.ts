import { describe, it, expect } from 'vitest';
import { getSunEvents, seasonIndexOf, toSignalBundle } from './signals';

describe('getSunEvents（suncalc）', () => {
  it('成都夏至日出早于冬至日出', () => {
    const chengdu = { lat: 30.67, lng: 104.07 };
    const summer = getSunEvents(chengdu.lat, chengdu.lng, new Date('2026-06-21T00:00:00+08:00'));
    const winter = getSunEvents(chengdu.lat, chengdu.lng, new Date('2026-12-21T00:00:00+08:00'));
    expect(summer.sunrise).toBeLessThan(summer.sunset);
    expect(summer.sunrise < winter.sunrise).toBe(true); // 夏至日出更早
  });
  it('正午落在日出与日落之间', () => {
    const s = getSunEvents(30.67, 104.07, new Date('2026-06-21T00:00:00+08:00'));
    expect(s.solarNoon).toBeGreaterThan(s.sunrise);
    expect(s.solarNoon).toBeLessThan(s.sunset);
  });
});

describe('seasonIndexOf', () => {
  it('夏至当天返回夏至锚点索引', () => {
    expect(seasonIndexOf(172)).toBe(3); // SEASON_ANCHORS[3] = 夏至
  });
  it('冬至当天返回冬至锚点索引', () => {
    expect(seasonIndexOf(355)).toBe(7);
  });
});

describe('toSignalBundle', () => {
  it('返回不含坐标的公开信号包', () => {
    const bundle = toSignalBundle({
      lat: 30.67,
      lng: 104.07,
      cityLabel: '成都',
      tz: 'Asia/Shanghai',
      sunrise: 1,
      solarNoon: 2,
      sunset: 3,
      nextSunRecalc: 4,
      weather: { code: 0, condition: 'clear', temp: 25 },
      forecast24h: [],
      dayOfYear: 172,
      seasonIndex: 3,
      seasonName: '夏至',
      updatedAt: 5,
    });
    expect(JSON.stringify(bundle)).not.toContain('lat');
    expect(JSON.stringify(bundle)).not.toContain('104.07');
    expect(bundle).toHaveProperty('sunrise');
    expect(bundle).toHaveProperty('condition', 'clear');
    expect(bundle).toHaveProperty('seasonName', '夏至');
    expect(bundle).toHaveProperty('dayOfYear', 172);
  });
});
