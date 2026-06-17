import SunCalc from 'suncalc';
import { SEASON_ANCHORS } from './palette';
import { wmoToCondition, type WeatherCondition } from './wmo';
import type { SunEvents } from './compose';

// 默认兜底坐标（PRD §3 / §11 F1）：成都
export const FALLBACK_LOCATION = { lat: 30.67, lng: 104.07, cityLabel: '成都', tz: 'Asia/Shanghai' };

export interface CurrentWeather {
  code: number;
  condition: WeatherCondition;
  temp: number;
}

export interface AmbientState {
  lat: number;
  lng: number;
  cityLabel: string;
  tz: string;
  sunrise: number;
  solarNoon: number;
  sunset: number;
  nextSunRecalc: number;
  weather: CurrentWeather;
  forecast24h: unknown[];
  seasonIndex: number;
  seasonName: string;
  updatedAt: number;
}

// 公开信号包（不含坐标，PRD §6.2）
export interface SignalBundle {
  sunrise: number;
  sunset: number;
  solarNoon: number;
  condition: WeatherCondition;
  temp: number;
  seasonIndex: number;
  seasonName: string;
  updatedAt: number;
}

export function getSunEvents(lat: number, lng: number, date: Date): SunEvents {
  const t = SunCalc.getTimes(date, lat, lng);
  return {
    sunrise: t.sunrise.getTime(),
    solarNoon: t.solarNoon.getTime(),
    sunset: t.sunset.getTime(),
  };
}

// dayOfYear → 所在节气段起始锚点索引（用于展示 seasonName）
export function seasonIndexOf(dayOfYear: number): number {
  const d = (((dayOfYear - 1) % 365) + 365) % 365 + 1;
  let idx = SEASON_ANCHORS.length - 1; // 默认最后一段（跨年）
  for (let k = 0; k < SEASON_ANCHORS.length; k++) {
    const cur = SEASON_ANCHORS[k].dayOfYear;
    const nxt = SEASON_ANCHORS[(k + 1) % SEASON_ANCHORS.length].dayOfYear;
    if (nxt > cur ? d >= cur && d < nxt : d >= cur || d < nxt) {
      idx = k;
      break;
    }
  }
  return idx;
}

export const SEASON_NAMES = ['立春', '春分', '立夏', '夏至', '立秋', '秋分', '立冬', '冬至'];

export function seasonNameOf(dayOfYear: number): string {
  return SEASON_NAMES[seasonIndexOf(dayOfYear)];
}

// 从完整 state 抽出不含坐标的公开信号包
export function toSignalBundle(s: AmbientState): SignalBundle {
  return {
    sunrise: s.sunrise,
    sunset: s.sunset,
    solarNoon: s.solarNoon,
    condition: s.weather.condition,
    temp: s.weather.temp,
    seasonIndex: s.seasonIndex,
    seasonName: s.seasonName,
    updatedAt: s.updatedAt,
  };
}

// Open-Meteo 拉当前天气（服务端调用，免 key）。失败抛错，由调用方降级。
export async function fetchWeather(lat: number, lng: number): Promise<CurrentWeather> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&current=weather_code,temperature_2m&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const data = (await res.json()) as { current: { weather_code: number; temperature_2m: number } };
  const code = data.current.weather_code;
  return { code, condition: wmoToCondition(code), temp: data.current.temperature_2m };
}
