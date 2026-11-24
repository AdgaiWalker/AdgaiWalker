/**
 * 阅读进度条 — 现代浏览器走纯 CSS scroll() 合成层动画；降级走 transform: scaleX(ratio)。
 */
import { supportsCssScrollTimeline } from '../../hooks/useReadingProgress';

export type ReadingProgressProps = {
  ratio: number;
};

export function ReadingProgress({ ratio }: ReadingProgressProps) {
  const clamped = Math.min(1, Math.max(0, ratio));
  const pct = Math.round(clamped * 100);
  const nativeCss = supportsCssScrollTimeline();

  return (
    <div
      className="reading-progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label="阅读进度"
    >
      <div
        className={`reading-progress-bar${nativeCss ? ' is-css-driven' : ''}`}
        style={nativeCss ? undefined : { transform: `scaleX(${clamped})` }}
      />
    </div>
  );
}
