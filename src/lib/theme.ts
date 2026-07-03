export const THEMES = ['solar-term'] as const;
export type ThemeName = typeof THEMES[number];

/** 从 localStorage 读取已保存的主题名 */
export function getSavedTheme(): ThemeName {
  return 'solar-term';
}

/** 将指定主题应用到 body（清除旧主题类，添加新类） */
export function applyTheme(name?: ThemeName): ThemeName {
  const pageTheme = document.body.getAttribute('data-page-theme') as ThemeName | null;
  const theme = pageTheme ?? name ?? getSavedTheme();
  document.body.className = document.body.className.replace(/\btheme-\S+/g, '');
  document.body.classList.add(`theme-${theme}`);
  return theme;
}

/** 切换到下一个主题，应用并持久化 */
export function cycleTheme(): ThemeName {
  const current = getSavedTheme();
  const next = THEMES[(THEMES.indexOf(current) + 1) % THEMES.length];
  applyTheme(next);
  localStorage.setItem('walker-theme', next);
  document.dispatchEvent(new CustomEvent('walker-theme-change', { detail: next }));
  return next;
}
