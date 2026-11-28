/**
 * ThemeToggle — 配色三态：跟随系统 → 浅色 → 深色。图标即状态，标签给读屏。
 */
import { useState } from 'react';
import { Moon, Sun, SunMoon } from 'lucide-react';
import { cycleThemePreference, getThemePreference, type ThemePreference } from '../../lib/theme';

const LABELS: Record<ThemePreference, string> = {
  auto: '配色：跟随系统',
  light: '配色：浅色',
  dark: '配色：深色',
};

export function ThemeToggle() {
  const [pref, setPref] = useState<ThemePreference>(() => getThemePreference());
  const Icon = pref === 'light' ? Sun : pref === 'dark' ? Moon : SunMoon;

  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={LABELS[pref]}
      title={LABELS[pref]}
      onClick={() => setPref(cycleThemePreference())}
    >
      <Icon size={16} aria-hidden />
    </button>
  );
}
