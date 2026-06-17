import { describe, it, expect } from 'vitest';
import { wmoToCondition } from './wmo';

describe('wmoToCondition', () => {
  it('0 → clear', () => {
    expect(wmoToCondition(0)).toBe('clear');
  });
  it('1,2 → partlycloudy；3 → overcast', () => {
    expect(wmoToCondition(1)).toBe('partlycloudy');
    expect(wmoToCondition(2)).toBe('partlycloudy');
    expect(wmoToCondition(3)).toBe('overcast');
  });
  it('45,48 → fog', () => {
    expect(wmoToCondition(45)).toBe('fog');
    expect(wmoToCondition(48)).toBe('fog');
  });
  it('小雨/大雨分桶', () => {
    expect(wmoToCondition(51)).toBe('lightrain');
    expect(wmoToCondition(55)).toBe('lightrain');
    expect(wmoToCondition(65)).toBe('heavyrain');
    expect(wmoToCondition(67)).toBe('heavyrain');
  });
  it('雪', () => {
    expect(wmoToCondition(71)).toBe('snow');
    expect(wmoToCondition(77)).toBe('snow');
  });
  it('阵雨 / 雷暴', () => {
    expect(wmoToCondition(80)).toBe('lightrain');
    expect(wmoToCondition(82)).toBe('heavyrain');
    expect(wmoToCondition(95)).toBe('thunder');
    expect(wmoToCondition(99)).toBe('thunder');
  });
  it('未知码降级 clear', () => {
    expect(wmoToCondition(999)).toBe('clear');
  });
});
