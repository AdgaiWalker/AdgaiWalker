/**
 * 力导向模拟 —— 按 Obsidian 原始 worker 的参数与语义重写（不依赖 d3）。
 * 四叉树实现位于 `./quadtree.ts`，此处专注 PRNG、四种作用力与模拟循环。
 */

import {
  ALPHA_DECAY,
  ALPHA_MIN,
  ALPHA_START,
  ALPHA_TARGET,
  COLLIDE_ITERATIONS,
  COLLIDE_RADIUS,
  COLLIDE_STRENGTH,
  MANY_BODY_DISTANCE_MIN,
  MANY_BODY_THETA,
  VELOCITY_DECAY,
} from './constants';
import { Quadtree, isInternal, type QLeaf, type QNode } from './quadtree';

export { isInternal, type QNode };

export type SimNode = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number | null;
  fy: number | null;
  /** 四叉树遍历需要的稳定下标 */
  index: number;
};

export type SimLink<N extends SimNode> = { source: N; target: N };

export type Random = () => number;

/** 确定性 PRNG（mulberry32） */
export function createRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** d3 的 jiggle：1e-6 * (random - 0.5)，用于打破完全重合的奇点 */
function makeJiggle(random: Random): () => number {
  return () => 1e-6 * (random() - 0.5);
}

/** 对零偏移分量施加上下对称微扰；严格保持先判 x 再判 y 的 PRNG 调用顺序。 */
function jiggleZeroDistance(
  dx: number,
  dy: number,
  distSq: number,
  jiggle: () => number,
): { x: number; y: number; l: number } {
  let x = dx;
  let y = dy;
  let l = distSq;
  if (x === 0) {
    x = jiggle();
    l += x * x;
  }
  if (y === 0) {
    y = jiggle();
    l += y * y;
  }
  return { x, y, l };
}

// -------------------------------------------------------------------- 作用力

export type Force<N extends SimNode> = ((alpha: number) => void) & {
  initialize?: (nodes: N[]) => void;
};

/** forceX：向 x=0 拉，强度 centerStrength（用 getter 以便 Forces 面板运行时改） */
export function forceX<N extends SimNode>(
  targetX: number,
  getStrength: () => number,
): Force<N> {
  let nodes: N[] = [];
  const force: Force<N> = (alpha) => {
    const strength = getStrength();
    for (const node of nodes) node.vx += (targetX - node.x) * strength * alpha;
  };
  force.initialize = (next) => {
    nodes = next;
  };
  return force;
}

/** forceY：向 y=0 拉，强度 centerStrength */
export function forceY<N extends SimNode>(
  targetY: number,
  getStrength: () => number,
): Force<N> {
  let nodes: N[] = [];
  const force: Force<N> = (alpha) => {
    const strength = getStrength();
    for (const node of nodes) node.vy += (targetY - node.y) * strength * alpha;
  };
  force.initialize = (next) => {
    nodes = next;
  };
  return force;
}

/**
 * forceLink：距离 linkDistance；强度 = strengthMultiplier × d3 默认度数强度
 * `1 / min(degree[source], degree[target])`，位移按
 * `bias = degree[source] / (degree[source] + degree[target])` 分摊到两端。
 */
export function forceLink<N extends SimNode>(
  links: ReadonlyArray<SimLink<N>>,
  getDistance: () => number,
  getStrengthMultiplier: () => number,
  random: Random,
): Force<N> {
  let nodes: N[] = [];
  let prepared: Array<{
    source: N;
    target: N;
    bias: number;
    weight: number;
  }> = [];

  const prepare = () => {
    const degree = new Array<number>(nodes.length).fill(0);
    for (const link of links) {
      degree[link.source.index] = (degree[link.source.index] ?? 0) + 1;
      degree[link.target.index] = (degree[link.target.index] ?? 0) + 1;
    }
    prepared = links.map((link) => {
      const sourceDegree = degree[link.source.index] ?? 0;
      const targetDegree = degree[link.target.index] ?? 0;
      const total = sourceDegree + targetDegree;
      return {
        source: link.source,
        target: link.target,
        bias: total === 0 ? 0.5 : sourceDegree / total,
        weight: 1 / Math.min(sourceDegree || 1, targetDegree || 1),
      };
    });
  };

  const force: Force<N> = (alpha) => {
    const distance = getDistance();
    const strengthMultiplier = getStrengthMultiplier();
    const jiggle = makeJiggle(random);
    for (const link of prepared) {
      const source = link.source;
      const target = link.target;
      let x = target.x + target.vx - source.x - source.vx || jiggle();
      let y = target.y + target.vy - source.y - source.vy || jiggle();
      let l = Math.sqrt(x * x + y * y);
      if (l === 0) l = 1e-6;
      l = ((l - distance) / l) * alpha * (strengthMultiplier * link.weight);
      x *= l;
      y *= l;
      const bias = link.bias;
      target.vx -= x * bias;
      target.vy -= y * bias;
      const rest = 1 - bias;
      source.vx += x * rest;
      source.vy += y * rest;
    }
  };

  force.initialize = (next) => {
    nodes = next;
    prepare();
  };
  return force;
}

/** forceManyBody：Barnes–Hut，strength = -repelStrength、theta = 0.9、distanceMin = 30 */
export function forceManyBody<N extends SimNode>(
  getRepelStrength: () => number,
  random: Random,
  distanceMin = MANY_BODY_DISTANCE_MIN,
  theta = MANY_BODY_THETA,
): Force<N> {
  let nodes: N[] = [];
  let strengths: number[] = [];
  const distanceMin2 = distanceMin * distanceMin;
  const distanceMax2 = Infinity;
  const theta2 = theta * theta;

  const force: Force<N> = (alpha) => {
    if (nodes.length === 0) return;
    const jiggle = makeJiggle(random);
    const tree = new Quadtree<N>((d) => d.x, (d) => d.y, nodes);

    tree.visitAfter((quad) => {
      let strength = 0;
      if (isInternal(quad)) {
        let weight = 0;
        let x = 0;
        let y = 0;
        for (const child of quad.children) {
          if (!child) continue;
          const magnitude = Math.abs(child.value);
          if (!magnitude) continue;
          strength += child.value;
          weight += magnitude;
          x += magnitude * child.x;
          y += magnitude * child.y;
        }
        quad.x = weight ? x / weight : 0;
        quad.y = weight ? y / weight : 0;
      } else {
        quad.x = quad.data.x;
        quad.y = quad.data.y;
        let cursor: QLeaf<N> | null = quad;
        do {
          strength += strengths[cursor.data.index] ?? 0;
          cursor = cursor.next;
        } while (cursor);
      }
      quad.value = strength;
    });

    for (const node of nodes) {
      tree.visit((quad, x0, _y0, x1) => {
        if (!quad.value) return true;
        let x = quad.x - node.x;
        let y = quad.y - node.y;
        const width = x1 - x0;
        let l = x * x + y * y;

        if ((width * width) / theta2 < l) {
          if (l < distanceMax2) {
            ({ x, y, l } = jiggleZeroDistance(x, y, l, jiggle));
            if (l < distanceMin2) l = Math.sqrt(distanceMin2 * l);
            node.vx += (x * quad.value * alpha) / l;
            node.vy += (y * quad.value * alpha) / l;
          }
          return true;
        }

        if (isInternal(quad) || l >= distanceMax2) return undefined;

        if (quad.data !== node || quad.next) {
          ({ x, y, l } = jiggleZeroDistance(x, y, l, jiggle));
          if (l < distanceMin2) l = Math.sqrt(distanceMin2 * l);
        }

        let cursor: QLeaf<N> | null = quad;
        do {
          if (cursor.data !== node) {
            const w = ((strengths[cursor.data.index] ?? 0) * alpha) / l;
            node.vx += x * w;
            node.vy += y * w;
          }
          cursor = cursor.next;
        } while (cursor);
        return undefined;
      });
    }
  };

  force.initialize = (next) => {
    nodes = next;
    strengths = nodes.map(() => -getRepelStrength());
  };
  return force;
}

/** forceCollide：半径 COLLIDE_RADIUS、强度 COLLIDE_STRENGTH、单次迭代 */
export function forceCollide<N extends SimNode>(
  random: Random,
  radius = COLLIDE_RADIUS,
  strength = COLLIDE_STRENGTH,
  iterations = COLLIDE_ITERATIONS,
): Force<N> {
  let nodes: N[] = [];
  let radii: number[] = [];

  const force: Force<N> = () => {
    const jiggle = makeJiggle(random);
    for (let k = 0; k < iterations; k += 1) {
      const tree = new Quadtree<N>((d) => d.x, (d) => d.y, nodes);
      tree.visitAfter((quad) => {
        if (isInternal(quad)) {
          let maxRadius = 0;
          for (const child of quad.children) {
            if (child && child.r > maxRadius) maxRadius = child.r;
          }
          quad.r = maxRadius;
        } else {
          quad.r = radii[quad.data.index] ?? 0;
        }
      });

      for (const node of nodes) {
        const ri = radii[node.index] ?? 0;
        const xi = node.x + node.vx;
        const yi = node.y + node.vy;
        tree.visit((quad, x0, y0, x1, y1) => {
          if (!isInternal(quad)) {
            const data = quad.data;
            const rj = quad.r || radii[data.index] || 0;
            const r = ri + rj;
            if (data.index > node.index) {
              let x = xi - data.x - data.vx;
              let y = yi - data.y - data.vy;
              let l = x * x + y * y;
              if (l < r * r) {
                ({ x, y, l } = jiggleZeroDistance(x, y, l, jiggle));
                l = ((r - (l = Math.sqrt(l))) / l) * strength;
                x *= l;
                y *= l;
                const share = (rj * rj) / ((ri * ri) + (rj * rj) || 1);
                node.vx += x * share;
                node.vy += y * share;
                const rest = 1 - share;
                data.vx -= x * rest;
                data.vy -= y * rest;
              }
            }
            return undefined;
          }
          return x0 > xi + ri || x1 < xi - ri || y0 > yi + ri || y1 < yi - ri;
        });
      }
    }
  };

  force.initialize = (next) => {
    nodes = next;
    radii = nodes.map(() => radius);
  };
  return force;
}

// ------------------------------------------------------------------ 模拟循环

export class ForceSimulation<N extends SimNode> {
  nodes: N[];
  alpha = ALPHA_START;
  alphaMin = ALPHA_MIN;
  alphaDecay = ALPHA_DECAY;
  alphaTarget = ALPHA_TARGET;
  velocityDecay = VELOCITY_DECAY;
  private readonly forces = new Map<string, Force<N>>();

  constructor(nodes: N[]) {
    this.nodes = nodes;
    this.reindex();
  }

  private reindex(): void {
    for (let i = 0; i < this.nodes.length; i += 1) this.nodes[i]!.index = i;
  }

  setNodes(nodes: N[]): void {
    this.nodes = nodes;
    this.reindex();
    this.initializeForces();
  }

  initializeForces(): void {
    for (const force of this.forces.values()) force.initialize?.(this.nodes);
  }

  force(name: string, force?: Force<N>): this {
    if (force === undefined) {
      this.forces.delete(name);
      return this;
    }
    this.forces.set(name, force);
    force.initialize?.(this.nodes);
    return this;
  }

  /** d3 的 tick：推进 alpha → 依次施加力 → 积分位置 */
  tick(): void {
    this.alpha += (this.alphaTarget - this.alpha) * this.alphaDecay;
    for (const force of this.forces.values()) force(this.alpha);
    for (const node of this.nodes) {
      if (node.fx === null) {
        node.x += (node.vx *= this.velocityDecay);
      } else {
        node.x = node.fx;
        node.vx = 0;
      }
      if (node.fy === null) {
        node.y += (node.vy *= this.velocityDecay);
      } else {
        node.y = node.fy;
        node.vy = 0;
      }
    }
  }
}
