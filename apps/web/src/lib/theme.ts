import { getSolarTerm } from './solar-terms';

/** 应用节气驱动的品牌色 + 默认 dianzi 壳 */
export function applySiteTheme(date = new Date()): void {
  const term = getSolarTerm(date);
  const root = document.documentElement;
  const body = document.body;

  root.classList.add('theme-dianzi');
  body.classList.add('theme-dianzi');

  const c = term.colors;
  const set = (k: string, v: string) => {
    root.style.setProperty(k, v);
    body.style.setProperty(k, v);
  };
  set('--color-brand', c.brand);
  set('--color-brand-secondary', c.brandSecondary);
  set('--color-brand-glow', `${c.brand}20`);
  set('--color-bg', c.bg);
  set('--color-card', c.card);
  set('--color-border', c.border);
  set('--color-parchment', c.parchment);
  set('--color-parchment-dim', c.parchmentDim);
  set('--orb-color-1', c.orb1);
  set('--orb-color-2', c.orb2);
  set('--orb-color-3', c.orb3);
  set('--orb-color-4', c.orb4);
  set('--color-nav-bg', c.mistBg);
}

export function cycleThemeVisual(): void {
  // 节气主题为主；点击时轻微切换 brand 饱和感作为反馈
  applySiteTheme(new Date(Date.now() + Math.random() * 90 * 86400000));
}
