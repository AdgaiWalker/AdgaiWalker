// OKLCH：l 明度 0..1，c 彩度，h 色相 0..360
export interface Oklch {
  l: number;
  c: number;
  h: number;
}

// 季节基色：只承载色相 + 彩度身份；明度由 applyDaylight 的昼夜带决定
export interface SeasonalBase {
  brand: Oklch; // 品牌强调色
  secondary: Oklch; // 次强调色
  orb: Oklch; // 光晕主色
  bgTint: Oklch; // 背景色相倾向（明度另给）
}

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

// 色相最短弧插值
export function lerpHue(a: number, b: number, t: number): number {
  const diff = ((((b - a) % 360) + 540) % 360) - 180; // [-180,180) 最短有符号差
  return ((((a + diff * t) % 360) + 360) % 360);
}

function lerpOklch(a: Oklch, b: Oklch, t: number): Oklch {
  return {
    l: lerp(a.l, b.l, t),
    c: lerp(a.c, b.c, t),
    h: lerpHue(a.h, b.h, t),
  };
}

// 8 节气锚点：四立 + 二分二至。dayOfYear 近似值（北半球）。
// 色相方向见 PRD §6.4；具体数值为 Phase A 起始值，后续按预览精调。
interface Anchor {
  dayOfYear: number;
  base: SeasonalBase;
}

export const SEASON_ANCHORS: Anchor[] = [
  { dayOfYear: 35, base: { brand: { l: 0, c: 0.1, h: 140 }, secondary: { l: 0, c: 0.08, h: 160 }, orb: { l: 0, c: 0.12, h: 130 }, bgTint: { l: 0, c: 0.02, h: 120 } } }, // 立春
  { dayOfYear: 80, base: { brand: { l: 0, c: 0.11, h: 130 }, secondary: { l: 0, c: 0.06, h: 320 }, orb: { l: 0, c: 0.1, h: 140 }, bgTint: { l: 0, c: 0.02, h: 110 } } }, // 春分
  { dayOfYear: 125, base: { brand: { l: 0, c: 0.13, h: 135 }, secondary: { l: 0, c: 0.1, h: 90 }, orb: { l: 0, c: 0.12, h: 120 }, bgTint: { l: 0, c: 0.02, h: 115 } } }, // 立夏
  { dayOfYear: 172, base: { brand: { l: 0, c: 0.13, h: 95 }, secondary: { l: 0, c: 0.12, h: 70 }, orb: { l: 0, c: 0.11, h: 80 }, bgTint: { l: 0, c: 0.02, h: 90 } } }, // 夏至
  { dayOfYear: 218, base: { brand: { l: 0, c: 0.11, h: 75 }, secondary: { l: 0, c: 0.1, h: 45 }, orb: { l: 0, c: 0.1, h: 60 }, bgTint: { l: 0, c: 0.02, h: 70 } } }, // 立秋
  { dayOfYear: 266, base: { brand: { l: 0, c: 0.12, h: 45 }, secondary: { l: 0, c: 0.1, h: 30 }, orb: { l: 0, c: 0.09, h: 50 }, bgTint: { l: 0, c: 0.02, h: 40 } } }, // 秋分
  { dayOfYear: 311, base: { brand: { l: 0, c: 0.06, h: 50 }, secondary: { l: 0, c: 0.05, h: 40 }, orb: { l: 0, c: 0.05, h: 45 }, bgTint: { l: 0, c: 0.015, h: 50 } } }, // 立冬
  { dayOfYear: 355, base: { brand: { l: 0, c: 0.08, h: 250 }, secondary: { l: 0, c: 0.07, h: 220 }, orb: { l: 0, c: 0.06, h: 240 }, bgTint: { l: 0, c: 0.015, h: 250 } } }, // 冬至
];

// 按实际天数在相邻锚点间插值（跨年环绕）。返回的 l 全 0（明度由 daylight 决定）。
export function interpSeason(dayOfYear: number): SeasonalBase {
  const d = (((dayOfYear - 1) % 365) + 365) % 365 + 1; // 归一到 1..365
  // 找到 d 落在哪两个锚点之间
  let i = 0;
  for (let k = 0; k < SEASON_ANCHORS.length; k++) {
    const cur = SEASON_ANCHORS[k].dayOfYear;
    const nxt = SEASON_ANCHORS[(k + 1) % SEASON_ANCHORS.length].dayOfYear;
    const inSeg = nxt > cur ? d >= cur && d < nxt : d >= cur || d < nxt;
    if (inSeg) {
      i = k;
      break;
    }
  }
  const a = SEASON_ANCHORS[i];
  const b = SEASON_ANCHORS[(i + 1) % SEASON_ANCHORS.length];
  let span = b.dayOfYear - a.dayOfYear;
  if (span <= 0) span += 365; // 跨年段
  let off = d - a.dayOfYear;
  if (off < 0) off += 365;
  const t = off / span;
  return {
    brand: lerpOklch(a.base.brand, b.base.brand, t),
    secondary: lerpOklch(a.base.secondary, b.base.secondary, t),
    orb: lerpOklch(a.base.orb, b.base.orb, t),
    bgTint: lerpOklch(a.base.bgTint, b.base.bgTint, t),
  };
}
