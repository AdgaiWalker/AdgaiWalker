/**
 * 站点主题管理 — auto（跟随系统）/ light / dark 三态切换并持久化到 html[data-theme]。
 * index.html 内联脚本在首帧前按同一 key 预设，避免闪屏。
 */
export type ThemePreference = 'auto' | 'light' | 'dark';

export const THEME_STORAGE_KEY = 'walker:theme-pref';

export function getThemePreference(): ThemePreference {
  if (typeof window === 'undefined') return 'auto';
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'auto') return raw;
  } catch {
    /* ignore storage restrictions */
  }
  return 'auto';
}

export function applySiteTheme(pref?: ThemePreference): ThemePreference {
  const resolved = pref ?? getThemePreference();
  if (typeof document === 'undefined') return resolved;

  if (resolved === 'light' || resolved === 'dark') {
    document.documentElement.dataset.theme = resolved;
  } else {
    delete document.documentElement.dataset.theme;
  }

  try {
    if (pref !== undefined && typeof window !== 'undefined') {
      window.localStorage.setItem(THEME_STORAGE_KEY, resolved);
    }
  } catch {
    /* ignore storage restrictions */
  }
  return resolved;
}

export function cycleThemePreference(): ThemePreference {
  const current = getThemePreference();
  const next: ThemePreference =
    current === 'auto' ? 'light' : current === 'light' ? 'dark' : 'auto';
  return applySiteTheme(next);
}
