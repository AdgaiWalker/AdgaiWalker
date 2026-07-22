/**
 * 阅读进度条 — 纯展示，ratio 0..1。
 */
export type ReadingProgressProps = {
  ratio: number;
};

export function ReadingProgress({ ratio }: ReadingProgressProps) {
  const pct = Math.round(Math.min(1, Math.max(0, ratio)) * 100);
  return (
    <div
      className="reading-progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label="阅读进度"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        zIndex: 50,
        background: 'transparent',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${pct}%`,
          background: 'var(--color-accent, #2d6a4f)',
          transition: 'width 80ms linear',
        }}
      />
    </div>
  );
}
