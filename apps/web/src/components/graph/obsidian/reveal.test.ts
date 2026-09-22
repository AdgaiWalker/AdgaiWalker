/**
 * Animate（生长动画）时序单测。
 *
 * 这些断言曾经只能靠肉眼看画布，而画布看不出「每帧 setState 触发重启模拟」这类缺陷；
 * 时序抽成纯函数后，淡入曲线、错峰带宽与总时长上界都能被锁住。
 */
import { describe, expect, it } from 'vitest';
import {
  REVEAL_FADE_MS,
  REVEAL_STAGGER_MAX_MS,
  REVEAL_STAGGER_MIN_MS,
  REVEAL_TOTAL_BUDGET_MS,
  revealFactor,
  revealStaggerFor,
  type RenderReveal,
} from './renderer';

const START = 1000;

const timeline = (delayMs: number[], fadeMs = REVEAL_FADE_MS): RenderReveal => ({
  startAt: START,
  delayMs: Float64Array.from(delayMs),
  fadeMs,
  totalMs: Math.max(...delayMs, 0) + fadeMs,
});

describe('Animate 时间轴', () => {
  it('没有时间轴时一切按已完成处理', () => {
    expect(revealFactor(0, null, 0)).toBe(1);
  });

  it('延迟未到时不可见，延迟 + 淡入走完即完全可见', () => {
    const reveal = timeline([0, 200]);
    expect(revealFactor(START, reveal, 1)).toBe(0);
    expect(revealFactor(START + 199, reveal, 1)).toBe(0);
    expect(revealFactor(START + 200, reveal, 1)).toBe(0);
    expect(revealFactor(START + 200 + REVEAL_FADE_MS, reveal, 1)).toBe(1);
  });

  it('是强 ease-out：前 1/4 时间就走完过半进度', () => {
    const reveal = timeline([0]);
    expect(revealFactor(START + REVEAL_FADE_MS / 4, reveal, 0)).toBeGreaterThan(0.5);
  });

  it('进度单调不减，且必然收敛到 1', () => {
    const reveal = timeline([0]);
    let previous = -1;
    for (let t = 0; t <= REVEAL_FADE_MS; t += 10) {
      const value = revealFactor(START + t, reveal, 0);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
    expect(previous).toBe(1);
  });

  it('不在顺序里的节点从 0 时刻起就开始淡入（延迟按 0 处理）', () => {
    const reveal = timeline([0]);
    expect(revealFactor(START, reveal, 42)).toBe(0);
    expect(revealFactor(START + REVEAL_FADE_MS, reveal, 42)).toBe(1);
  });

  it('淡入时长为 0 时立即完成（减弱动效路径）', () => {
    const reveal = timeline([0, 0], 0);
    expect(revealFactor(START, reveal, 1)).toBe(1);
  });
});

describe('错峰间隔取值', () => {
  it('小规模时间隔落在 30–80ms 感知带内', () => {
    for (const count of [2, 10, 28, 93]) {
      const stagger = revealStaggerFor(count, false);
      expect(stagger).toBeGreaterThanOrEqual(REVEAL_STAGGER_MIN_MS);
      expect(stagger).toBeLessThanOrEqual(REVEAL_STAGGER_MAX_MS);
    }
  });

  it('任何规模下总时长都不超过预算 + 一个淡入（427 个节点曾拖到 13 秒）', () => {
    for (const count of [2, 10, 28, 93, 400, 427, 4000]) {
      const total = (count - 1) * revealStaggerFor(count, false) + REVEAL_FADE_MS;
      expect(total).toBeLessThanOrEqual(REVEAL_TOTAL_BUDGET_MS + REVEAL_FADE_MS);
    }
  });

  it('规模超出预算可容纳时压小间隔，而不是拖长总时长（总时长优先）', () => {
    const stagger = revealStaggerFor(427, false);
    expect(stagger).toBeLessThan(REVEAL_STAGGER_MIN_MS);
    expect(stagger).toBeGreaterThan(0);
    // 代码图谱 427 个节点：约 7ms 一道波，总时长与内容图谱同量级
    expect(stagger).toBeCloseTo(3000 / 426, 5);
  });

  it('减弱动效时去掉逐个出现的运动', () => {
    expect(revealStaggerFor(93, true)).toBe(0);
    expect(revealStaggerFor(1, false)).toBe(0);
  });
});
