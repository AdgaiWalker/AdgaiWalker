export type WeatherCondition =
  | 'clear'
  | 'partlycloudy'
  | 'overcast'
  | 'fog'
  | 'lightrain'
  | 'heavyrain'
  | 'snow'
  | 'thunder';

// Open-Meteo / WMO 天气码 → 主题条件桶（PRD §6.3）
export function wmoToCondition(code: number): WeatherCondition {
  if (code === 0) return 'clear';
  if (code === 1 || code === 2) return 'partlycloudy';
  if (code === 3) return 'overcast';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'lightrain'; // 毛毛雨
  if (code >= 61 && code <= 67) return code <= 62 ? 'lightrain' : 'heavyrain';
  if (code >= 71 && code <= 77) return 'snow';
  if (code === 80 || code === 81) return 'lightrain'; // 阵雨
  if (code === 82) return 'heavyrain';
  if (code >= 85 && code <= 86) return 'snow'; // 阵雪
  if (code >= 95 && code <= 99) return 'thunder';
  return 'clear'; // 未知 → 晴（安全降级）
}
