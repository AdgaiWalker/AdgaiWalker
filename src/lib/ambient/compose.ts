import { interpSeason, lerp, lerpHue, type Oklch, type SeasonalBase } from './palette';
import type { WeatherCondition } from './wmo';

export interface SunEvents {
  sunrise: number; // epoch ms
  solarNoon: number;
  sunset: number;
}

export interface ComposeInput {
  now: number; // epoch ms
  dayOfYear: number; // 1..365
  sun: SunEvents;
  condition: WeatherCondition;
}

export interface ResolvedPalette {
  isNight: boolean;
  bg: Oklch;
  text: Oklch; // --color-parchment
  textDim: Oklch; // --color-parchment-dim
  brand: Oklch;
  secondary: Oklch;
  orb1: Oklch;
  orb2: Oklch;
  orb3: Oklch;
  orb4: Oklch;
}

// 明暗带（PRD §7.2：分类不插值，保证明度差≥0.6）
const DAY_BG_L = { low: 0.9, high: 0.97 };
const NIGHT_BG_L = { low: 0.13, high: 0.2 };
const DAY_TEXT_L = 0.22;
const NIGHT_TEXT_L = 0.93;
const DAY_TEXTDIM_L = 0.5;
const NIGHT_TEXTDIM_L = 0.7;
const HORIZON_WINDOW = 60 * 60 * 1000; // 日出/日落前后 1h 暖峰

export interface DaylightFactors {
  isNight: boolean;
  dayStrength: number; // 0 地平线 .. 1 正午（仅白天有意义）
  horizonWarmth: number; // 0 远离地平线 .. 1 正在地平线
}

export function daylightFactors(input: ComposeInput): DaylightFactors {
  const { now, sun } = input;
  const isNight = now < sun.sunrise || now > sun.sunset;

  let dayStrength = 0;
  if (!isNight) {
    const half = Math.max(sun.sunset - sun.solarNoon, sun.solarNoon - sun.sunrise, 1);
    dayStrength = 1 - Math.min(1, Math.abs(now - sun.solarNoon) / half);
  }

  const dist = Math.min(Math.abs(now - sun.sunrise), Math.abs(now - sun.sunset));
  const horizonWarmth = Math.max(0, 1 - dist / HORIZON_WINDOW);
  return { isNight, dayStrength, horizonWarmth };
}

// 季节基色 → 应用昼夜明暗带 + 地平线暖峰。明度严格在带内，保证可读性。
export function applyDaylight(input: ComposeInput): ResolvedPalette {
  const base: SeasonalBase = interpSeason(input.dayOfYear);
  const { isNight, dayStrength, horizonWarmth } = daylightFactors(input);
  const w = horizonWarmth;

  // 明度分带：白天浅底深字，夜间深底浅字。永不在中间区插值（铁律）。
  const bgL = isNight
    ? lerp(NIGHT_BG_L.low, NIGHT_BG_L.high, w) // 夜间：近地平线略亮、深夜更沉
    : lerp(DAY_BG_L.low, DAY_BG_L.high, dayStrength); // 白天：正午最亮
  const textL = isNight ? NIGHT_TEXT_L : DAY_TEXT_L;
  const textDimL = isNight ? NIGHT_TEXTDIM_L : DAY_TEXTDIM_L;

  // 背景色相：季节底色，地平线时往暖橙拉
  const bgH = lerpHue(base.bgTint.h, 45, w * 0.6);
  const bgC = base.bgTint.c + w * 0.01;

  // 品牌：地平线加彩度 + 暖色相偏移；夜间品牌略提亮（便于暗底可见）
  const brand: Oklch = {
    l: isNight ? lerp(0.7, 0.78, dayStrength) : lerp(0.55, 0.5, dayStrength),
    c: base.brand.c * (1 + w * 0.5),
    h: lerpHue(base.brand.h, 35, w * 0.5),
  };
  const secondary: Oklch = {
    l: brand.l,
    c: base.secondary.c * (1 + w * 0.3),
    h: lerpHue(base.secondary.h, 40, w * 0.4),
  };

  // 四个光晕：季节 orb 为主，地平线时掺暖
  const mkOrb = (h: number, c: number): Oklch => ({
    l: isNight ? 0.6 : 0.85,
    c: c * (1 + w * 0.3),
    h: lerpHue(h, 40, w * 0.4),
  });
  const orb1 = mkOrb(base.orb.h, base.orb.c);
  const orb2 = mkOrb(lerpHue(base.orb.h, 40, 0.5), base.orb.c * 0.9);
  const orb3 = mkOrb(base.secondary.h, base.secondary.c);
  const orb4 = mkOrb(lerpHue(base.orb.h, -30, 0.4), base.orb.c * 0.8);

  return {
    isNight,
    bg: { l: bgL, c: bgC, h: bgH },
    text: { l: textL, c: 0, h: base.bgTint.h },
    textDim: { l: textDimL, c: 0, h: base.bgTint.h },
    brand,
    secondary,
    orb1,
    orb2,
    orb3,
    orb4,
  };
}
