import { describe, expect, it } from 'vitest';
import {
  fitToViewport,
  graphBounds,
  GRAPH_LAYOUT_DEFAULTS,
  layoutGraph,
  resolveGraphLayoutParams,
  type GraphLayoutInput,
} from './graph-layout.js';

function chain(n: number): GraphLayoutInput {
  const nodes = Array.from({ length: n }, (_, i) => ({ id: `n${i}` }));
  const edges = Array.from({ length: n - 1 }, (_, i) => ({
    source: `n${i}`,
    target: `n${i + 1}`,
  }));
  return { nodes, edges };
}

function spread(points: Map<string, { x: number; y: number }>): number {
  const bounds = graphBounds(points.values());
  return Math.hypot(bounds.width, bounds.height);
}

describe('布局确定性', () => {
  it('同种子同输入必得同坐标（可预渲染、可测试）', () => {
    const input = chain(29);
    const a = layoutGraph(input, { seed: 7 });
    const b = layoutGraph(input, { seed: 7 });
    for (const [id, point] of a) {
      expect(b.get(id)!.x).toBeCloseTo(point.x, 10);
      expect(b.get(id)!.y).toBeCloseTo(point.y, 10);
    }
  });

  it('不同种子给出不同布局', () => {
    const input = chain(29);
    const a = layoutGraph(input, { seed: 1 });
    const b = layoutGraph(input, { seed: 2 });
    expect(a.get('n0')!.x).not.toBeCloseTo(b.get('n0')!.x, 3);
  });

  it('空图返回空坐标', () => {
    expect(layoutGraph({ nodes: [], edges: [] }).size).toBe(0);
  });

  it('单节点不产生 NaN', () => {
    const points = layoutGraph({ nodes: [{ id: 'only' }], edges: [] });
    const point = points.get('only')!;
    expect(Number.isFinite(point.x)).toBe(true);
    expect(Number.isFinite(point.y)).toBe(true);
  });
});

describe('规模无关（PRD §3.4 硬要求）', () => {
  it('节点数翻 4 倍时尺度约翻 2 倍（worldScale ∝ sqrt(n)）', () => {
    const small = spread(layoutGraph(chain(25), { seed: 3 }));
    const large = spread(layoutGraph(chain(100), { seed: 3 }));
    const ratio = large / small;
    expect(ratio).toBeGreaterThan(1.5);
    expect(ratio).toBeLessThan(2.8);
  });
});

describe('参数', () => {
  it('默认值照抄 Obsidian Forces 面板', () => {
    expect(GRAPH_LAYOUT_DEFAULTS).toEqual({
      centerForce: 0.5,
      repelForce: 10,
      linkForce: 1,
      linkDistance: 250,
    });
  });

  it('越界与非法值被夹回合法区间', () => {
    const params = resolveGraphLayoutParams({
      centerForce: 99,
      repelForce: -5,
      linkDistance: 99999,
      linkForce: Number.NaN,
    });
    expect(params.centerForce).toBe(1);
    expect(params.repelForce).toBe(0);
    expect(params.linkDistance).toBe(500);
    expect(params.linkForce).toBe(GRAPH_LAYOUT_DEFAULTS.linkForce);
  });

  it('linkDistance 越大，布局越舒展', () => {
    const input = chain(12);
    const tight = spread(layoutGraph(input, { seed: 5, params: { linkDistance: 60 } }));
    const loose = spread(layoutGraph(input, { seed: 5, params: { linkDistance: 480 } }));
    expect(loose).toBeGreaterThan(tight);
  });
});

describe('钉住与视口', () => {
  it('被钉住的节点保持在指定坐标', () => {
    const points = layoutGraph(chain(10), {
      seed: 9,
      pinned: { n0: { x: 123, y: -456 } },
    });
    expect(points.get('n0')).toEqual({ x: 123, y: -456 });
  });

  it('fitToViewport 把世界坐标等比放进画布', () => {
    const points = layoutGraph(chain(20), { seed: 11 });
    const bounds = graphBounds(points.values());
    const viewport = fitToViewport(bounds, 800, 600, 24);
    const mapped = [...points.values()].map((point) => ({
      x: point.x * viewport.scale + viewport.offsetX,
      y: point.y * viewport.scale + viewport.offsetY,
    }));
    for (const point of mapped) {
      expect(point.x).toBeGreaterThanOrEqual(23);
      expect(point.x).toBeLessThanOrEqual(777);
      expect(point.y).toBeGreaterThanOrEqual(23);
      expect(point.y).toBeLessThanOrEqual(577);
    }
  });
});
