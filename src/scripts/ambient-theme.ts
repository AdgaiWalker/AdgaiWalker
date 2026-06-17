import { composePalette, toCssVars, type ComposeInput } from '@/lib/ambient/compose';
import type { SignalBundle } from '@/lib/ambient/signals';

// 活体环境主题客户端：拉 /api/ambient 信号 → 合成 → 写 documentElement。
// 明暗/色相/天气全部由引擎算出的 CSS 变量驱动；每分钟重算让背景"呼吸"。
const VARS_KEY = 'walker-ambient-vars';
const NIGHT_KEY = 'walker-ambient-night';
const RECOMPUTE_MS = 60_000;

let bundle: SignalBundle | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

function applyFromBundle(b: SignalBundle): void {
  const input: ComposeInput = {
    now: Date.now(),
    dayOfYear: b.dayOfYear,
    sun: { sunrise: b.sunrise, solarNoon: b.solarNoon, sunset: b.sunset },
    condition: b.condition,
  };
  const palette = composePalette(input);
  const vars = toCssVars(palette);
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.setAttribute('data-ambient', palette.isNight ? 'night' : 'day');
  try {
    localStorage.setItem(VARS_KEY, JSON.stringify(vars));
    localStorage.setItem(NIGHT_KEY, palette.isNight ? '1' : '0');
  } catch {
    /* localStorage 不可用时静默 */
  }
  document.dispatchEvent(
    new CustomEvent('walker-ambient-update', { detail: { isNight: palette.isNight } }),
  );
}

function recompute(): void {
  if (bundle) applyFromBundle(bundle);
}

async function fetchAndApply(): Promise<void> {
  try {
    const res = await fetch('/api/ambient', { cache: 'no-store' });
    if (!res.ok) return;
    bundle = (await res.json()) as SignalBundle;
    applyFromBundle(bundle);
  } catch {
    /* 网络失败：沿用防闪屏脚本已套上的 localStorage 缓存 */
  }
}

/** 活体环境主题：拉信号 → 合成 → 写 documentElement，每分钟重算让背景慢慢流动 */
export function initAmbientTheme(): void {
  fetchAndApply();
  recompute();
  if (timer === null) {
    timer = setInterval(recompute, RECOMPUTE_MS);
  }
}
