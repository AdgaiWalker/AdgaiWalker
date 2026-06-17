import { describe, it, expect } from 'vitest';
import { AMBIENT_KEY, serializeState, deserializeState, computeFallbackSignals } from './store';

describe('ambient store', () => {
  it('AMBIENT_KEY 常量', () => {
    expect(AMBIENT_KEY).toBe('ambient:state');
  });

  it('serialize/deserialize 往返无损', () => {
    const state = {
      lat: 30.67,
      lng: 104.07,
      cityLabel: '成都',
      tz: 'Asia/Shanghai',
      sunrise: 1000,
      solarNoon: 2000,
      sunset: 3000,
      nextSunRecalc: 4000,
      weather: { code: 1, condition: 'partlycloudy' as const, temp: 22 },
      forecast24h: [],
      seasonIndex: 3,
      seasonName: '夏至',
      updatedAt: 5000,
    };
    const back = deserializeState(serializeState(state));
    expect(back).toEqual(state);
  });

  it('computeFallbackSignals 用成都坐标产出合法 state', () => {
    const s = computeFallbackSignals(new Date('2026-06-21T00:00:00+08:00'));
    expect(s.cityLabel).toBe('成都');
    expect(s.sunrise).toBeLessThan(s.sunset);
    expect(s.weather.condition).toBe('clear'); // 无天气时默认晴
    expect(s.seasonName).toBe('夏至');
  });
});
