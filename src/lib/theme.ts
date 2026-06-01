export const THEMES = ['nature', 'aurora', 'sunset', 'mint'] as const;
export type ThemeName = typeof THEMES[number];

export function cycleTheme(): ThemeName {
  const current = (localStorage.getItem('walker-theme') || 'nature') as ThemeName;
  const next = THEMES[(THEMES.indexOf(current) + 1) % THEMES.length];
  document.body.className = document.body.className.replace(/\btheme-\S+/g, '');
  document.body.classList.add(`theme-${next}`);
  localStorage.setItem('walker-theme', next);
  document.dispatchEvent(new CustomEvent('walker-theme-change', { detail: next }));
  return next;
}
