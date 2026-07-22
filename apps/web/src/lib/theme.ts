/**
 * 站点单一主题 — 仅挂 theme-dianzi，颜色以 CSS token 为准。
 * 已移除节气/多主题切换。
 */
export function applySiteTheme(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.add('theme-dianzi');
  document.body.classList.add('theme-dianzi');
}
