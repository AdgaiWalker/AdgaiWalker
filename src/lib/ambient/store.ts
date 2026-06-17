import { getRedis } from '@/conversation/store';
import {
  FALLBACK_LOCATION,
  getSunEvents,
  seasonIndexOf,
  seasonNameOf,
  type AmbientState,
  type CurrentWeather,
} from './signals';

export const AMBIENT_KEY = 'ambient:state';

export function serializeState(s: AmbientState): string {
  return JSON.stringify(s);
}

export function deserializeState(raw: string): AmbientState {
  return JSON.parse(raw) as AmbientState;
}

export async function readAmbientState(): Promise<AmbientState | null> {
  const redis = getRedis();
  if (!redis) return null;
  const raw = await redis.get<string>(AMBIENT_KEY);
  return raw ? deserializeState(raw) : null;
}

export async function writeAmbientState(s: AmbientState): Promise<void> {
  const redis = getRedis();
  if (!redis) throw new Error('Redis 不可用，无法保存 ambient:state');
  await redis.set(AMBIENT_KEY, serializeState(s));
}

// 兜底：未设定位 / Redis 空 / 天气挂掉时，用成都坐标 + 默认晴算一份 state（PRD §11 F1/F2）
export function computeFallbackSignals(now: Date, weather?: CurrentWeather): AmbientState {
  const { lat, lng, cityLabel, tz } = FALLBACK_LOCATION;
  const sun = getSunEvents(lat, lng, now);
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86_400_000);
  return {
    lat,
    lng,
    cityLabel,
    tz,
    sunrise: sun.sunrise,
    solarNoon: sun.solarNoon,
    sunset: sun.sunset,
    nextSunRecalc: new Date(now).setHours(24, 0, 0, 0), // 次日 0 点重算
    weather: weather ?? { code: 0, condition: 'clear', temp: 20 },
    forecast24h: [],
    seasonIndex: seasonIndexOf(dayOfYear),
    seasonName: seasonNameOf(dayOfYear),
    updatedAt: now.getTime(),
  };
}
