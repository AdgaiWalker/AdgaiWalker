/**
 * 引擎测试 —— 断言的是 Obsidian 源码里**可核对的确切数值**，不是「大致像」。
 * 每条的期望值都能在 sim-original.js / graph-reconstructed.js 里找到出处。
 */
import { describe, expect, it } from 'vitest';
import {
  ForceSimulation,
  createRandom,
  forceCollide,
  forceLink,
  forceManyBody,
  type SimNode,
} from './forces';
import { seedPositions } from './engine';
import { nodeSizeFor, textAlphaFor } from './renderer';
import {
  ALPHA_DECAY,
  ALPHA_MIN,
  APP_ZOOM_MAX,
  APP_ZOOM_MIN,
  DEFAULT_CENTER_STRENGTH,
  DEFAULT_LINK_DISTANCE,
  DEFAULT_LINK_STRENGTH,
  DEFAULT_REPEL_STRENGTH,
  DISPLAY_RANGES,
  FORCE_RANGES,
  LOCAL_DEPTH_RANGE,
  LINE_SIZE_MULTIPLIER,
  NODE_SIZE_MULTIPLIER,
  repelEngineToUi,
  repelUiToEngine,
  TEXT_FADE_MULTIPLIER,
  VELOCITY_DECAY,
} from './constants';

function mk(id: string, x: number, y: number): SimNode & { id: string } {
  return { id, x, y, vx: 0, vy: 0, fx: null, fy: null, index: 0 };
}

describe('常数（应用源码核对）', () => {
  it('物理常数与 worker 逐字一致', () => {
    expect(ALPHA_DECAY).toBeCloseTo(1 - Math.pow(0.001, 1 / 300), 12);
    expect(ALPHA_MIN).toBe(0.001);
    expect(VELOCITY_DECAY).toBe(0.6);
    expect(DEFAULT_CENTER_STRENGTH).toBe(0.1);
    expect(DEFAULT_REPEL_STRENGTH).toBe(1000);
    expect(DEFAULT_LINK_STRENGTH).toBe(1);
    expect(DEFAULT_LINK_DISTANCE).toBe(250);
  });

  it('Display 默认值取应用 PJ（不是首页的 -2 / 2）', () => {
    expect(TEXT_FADE_MULTIPLIER).toBe(0);
    expect(NODE_SIZE_MULTIPLIER).toBe(1);
    expect(LINE_SIZE_MULTIPLIER).toBe(1);
  });

  it('缩放上下限取应用 updateZoom 的 clamp(1/128, 8)', () => {
    expect(APP_ZOOM_MIN).toBe(1 / 128);
    expect(APP_ZOOM_MAX).toBe(8);
  });

  it('滑块区间取应用 setLimits 实参', () => {
    expect(FORCE_RANGES.centerStrength).toEqual({ min: 0, max: 1, step: 0.01 });
    expect(FORCE_RANGES.repelStrength).toEqual({ min: 0, max: 20, step: 0.1 });
    expect(FORCE_RANGES.linkStrength).toEqual({ min: 0, max: 1, step: 0.01 });
    expect(FORCE_RANGES.linkDistance).toEqual({ min: 30, max: 500, step: 1 });
    expect(DISPLAY_RANGES.textFadeMultiplier).toEqual({ min: -3, max: 3, step: 0.1 });
    expect(DISPLAY_RANGES.nodeSizeMultiplier).toEqual({ min: 0.1, max: 5, step: 0.05 });
    expect(DISPLAY_RANGES.lineSizeMultiplier).toEqual({ min: 0.1, max: 5, step: 0.05 });
    expect(LOCAL_DEPTH_RANGE).toEqual({ min: 1, max: 5, step: 1 });
  });

  it('斥力面板值是引擎值的立方根（应用 setForces({repelStrength: e*e*e})）', () => {
    expect(repelUiToEngine(10)).toBe(1000);
    expect(repelUiToEngine(0)).toBe(0);
    expect(repelUiToEngine(20)).toBe(8000);
    expect(repelEngineToUi(1000)).toBeCloseTo(10, 10);
    expect(repelEngineToUi(repelUiToEngine(7.5))).toBeCloseTo(7.5, 10);
  });
});

describe('文字透明度（AQ.setScale）', () => {
  it('textAlpha = clamp(log2(scale) + 1 - fTextShowMult, 0, 1)', () => {
    expect(textAlphaFor(1, 0)).toBe(1);
    // 缩放 1/2 → log2 = -1 → -1+1-0 = 0
    expect(textAlphaFor(0.5, 0)).toBe(0);
    // 缩放 1/4 → -2+1-0 = -1 → 夹到 0
    expect(textAlphaFor(0.25, 0)).toBe(0);
    // 阈值为 -2（首页取值）时，缩放 1/4 → -2+1+2 = 1
    expect(textAlphaFor(0.25, -2)).toBe(1);
    expect(textAlphaFor(8, 0)).toBe(1);
  });
});

describe('节点半径（graph-reconstructed.nodeSize）', () => {
  it('clamp(sqrt(weight+1)*3, 8, 30) × 乘子', () => {
    expect(nodeSizeFor(0, 1)).toBe(8); // sqrt(1)*3 = 3 → 夹到 8
    expect(nodeSizeFor(8, 1)).toBeCloseTo(9, 10); // sqrt(9)*3
    expect(nodeSizeFor(49, 1)).toBeCloseTo(Math.sqrt(50) * 3, 10);
    expect(nodeSizeFor(100, 1)).toBe(30); // sqrt(101)*3 ≈ 30.1 → 夹到 30
    expect(nodeSizeFor(8, 2)).toBeCloseTo(18, 10);
  });
});

describe('forceLink（d3 度数默认强度与 bias）', () => {
  it('两端度数相等时各承担一半位移，方向互相靠近', () => {
    const a = mk('a', 0, 0);
    const b = mk('b', 500, 0);
    const nodes = [a, b];
    nodes.forEach((node, index) => {
      node.index = index;
    });
    const force = forceLink([{ source: a, target: b }], () => 250, () => 1, createRandom(1));
    force.initialize?.(nodes);
    force(1);
    // (500-250)/500 * alpha(1) * strength(1/min(1,1)=1) = 0.5 → x *= 0.5 → 250；bias = 1/2
    expect(b.vx).toBeCloseTo(-125, 6);
    expect(a.vx).toBeCloseTo(125, 6);
  });

  it('强度按 1/min(两端度数) 缩放、位移按 bias 分摊，且逐边就地更新', () => {
    const center = mk('center', 0, 0);
    const leafA = mk('leafA', 500, 0);
    const leafB = mk('leafB', -500, 0);
    const nodes = [center, leafA, leafB];
    nodes.forEach((node, index) => {
      node.index = index;
    });
    const force = forceLink(
      [
        { source: center, target: leafA },
        { source: center, target: leafB },
      ],
      () => 250,
      () => 1,
      createRandom(1),
    );
    force.initialize?.(nodes);
    force(1);

    // 度数按 link 计数：center=2、leafA=leafB=1
    //   strength = 1/min(2,1) = 1；bias = count[source]/(count[source]+count[target]) = 2/3
    // 同一趟内**逐边就地更新**，第二条边会看到第一条边写入的速度（d3 的原始语义）：
    //   link1: x = 500 → l = (500-250)/500 = .5 → 250
    //          leafA.vx = -250·2/3 = -166.667；center.vx = +250·1/3 = +83.333
    //   link2: 此时 center.vx = 83.333 → x = -500-83.333 = -583.333
    //          l = (583.333-250)/583.333 = .5714 → x' = -333.333
    //          leafB.vx = +333.333·2/3 = +222.222；center.vx += -333.333·1/3 = -111.111
    expect(leafA.vx).toBeCloseTo(-166.667, 3);
    expect(leafB.vx).toBeCloseTo(222.222, 3);
    expect(center.vx).toBeCloseTo(-27.778, 3);
  });
});

describe('forceManyBody（Barnes–Hut + distanceMin 30）', () => {
  it('distanceMin 之下按 sqrt(distanceMin²·l) 夹住，斥力方向朝外', () => {
    const a = mk('a', 0, 0);
    const b = mk('b', 10, 0);
    const nodes = [a, b];
    nodes.forEach((node, index) => {
      node.index = index;
    });
    const force = forceManyBody(() => 1000, createRandom(1));
    force.initialize?.(nodes);
    force(1);
    // l 被抬到 sqrt(900*100) = 300 → a.vx += 10*(-1000)*1/300
    expect(a.vx).toBeCloseTo(-10 * 1000 / 300, 4);
    expect(a.vx).toBeLessThan(0);
    expect(b.vx).toBeGreaterThan(0);
  });
});

describe('forceCollide（半径 60、强度 0.5）', () => {
  it('把重叠的两点推开', () => {
    const a = mk('a', 0, 0);
    const b = mk('b', 1, 0);
    const nodes = [a, b];
    nodes.forEach((node, index) => {
      node.index = index;
    });
    const force = forceCollide(createRandom(1));
    force.initialize?.(nodes);
    force(1);
    expect(a.vx).toBeLessThan(0);
    expect(b.vx).toBeGreaterThan(0);
  });
});

describe('模拟循环（d3 tick 语义）', () => {
  it('alpha 按 alpha += (target - alpha) * alphaDecay 推进', () => {
    const node = mk('a', 0, 0);
    const sim = new ForceSimulation([node]);
    sim.tick();
    expect(sim.alpha).toBeCloseTo(1 - ALPHA_DECAY, 12);
  });

  it('速度每 tick 乘 0.6 并叠加到位置', () => {
    const node = mk('a', 0, 0);
    node.vx = 10;
    const sim = new ForceSimulation([node]);
    sim.alphaDecay = 0; // 排除 alpha 影响
    sim.tick();
    expect(node.vx).toBeCloseTo(6, 12);
    expect(node.x).toBeCloseTo(6, 12);
  });

  it('fx/fy 非空时位置被钉住且速度清零', () => {
    const node = mk('a', 0, 0);
    node.vx = 100;
    node.fx = 42;
    node.fy = -7;
    const sim = new ForceSimulation([node]);
    sim.tick();
    expect(node.x).toBe(42);
    expect(node.vx).toBe(0);
    expect(node.y).toBe(-7);
    expect(node.vy).toBe(0);
  });
});

describe('初始布点（graph-reconstructed.setData）', () => {
  it('同种子同输入产出同坐标（本站定种子偏离）', () => {
    const adjacency = [[1], [0], []];
    const first = seedPositions(['a', 'b', 'c'], adjacency, 7);
    const second = seedPositions(['a', 'b', 'c'], adjacency, 7);
    expect(first).toEqual(second);
  });

  it('有已知邻居时取邻居均值 + jitter 抖动', () => {
    const adjacency = [[], [0]];
    const known = [{ x: 1000, y: -500 }, undefined];
    const positions = seedPositions(['a', 'b'], adjacency, 3, known);
    // 已知节点保持原位
    expect(positions[0]).toEqual({ x: 1000, y: -500 });
    // 新节点 = 邻居均值(1000,-500) + (rand-.5)*jitter；jitter = sqrt(count*60²) = 120
    expect(Math.abs(positions[1]!.x - 1000)).toBeLessThanOrEqual(60);
    expect(Math.abs(positions[1]!.y + 500)).toBeLessThanOrEqual(60);
  });

  it('无邻居的节点落在环形区域内（半径 ≤ annulusWidth）', () => {
    const positions = seedPositions(['only'], [[]], 5);
    const area = 1 * 60 * 60;
    const annulusWidth = Math.sqrt(area / Math.PI);
    const radius = Math.hypot(positions[0]!.x, positions[0]!.y);
    expect(radius).toBeLessThanOrEqual(annulusWidth + 1e-9);
  });
});
