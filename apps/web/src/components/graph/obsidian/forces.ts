/**
 * 力导向模拟 —— 按 Obsidian 原始 worker 的参数与语义重写（不依赖 d3）。
 *
 * 对应关系（来源见 constants.ts）：
 *   sim-original.js 的 WASM 入口
 *     `simulate(ptr, n, m, alpha, centerStrength, linkStrength, linkDistance,
 *               repelStrength, theta=.9, collideStrength=.5)` + `complete(ptr, n, .6)`
 *   与其 d3-force 回退分支完全同构：
 *     forceX(0, centerStrength) / forceY(0, centerStrength)
 *     forceLink(distance = linkDistance, strength = linkStrength × d3 度数默认强度)
 *     forceManyBody(strength = -repelStrength, distanceMin = 30, theta = 0.9)
 *     forceCollide(radius = 60, strength = 0.5, iterations = 1)
 *   每 tick：`alpha += (alphaTarget - alpha) * alphaDecay` → 依次施加力 →
 *   `fx==null ? x += vx *= .6 : (x = fx, vx = 0)`。
 *
 * 四叉树按 d3-quadtree 的 `cover` / `add` / `visit` / `visitAfter` 结构逐行等价重写，
 * 因为 Barnes–Hut 的近似结果依赖象限划分与遍历顺序。
 *
 * 唯一偏离：随机源由 `Math.random` 改为可注入的定种子 PRNG（本站要求布局可复现、可测试）。
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

// --------------------------------------------------------------------- 四叉树

type QInternal<T> = {
  children: Array<QNode<T> | undefined>;
  x: number;
  y: number;
  value: number;
  r: number;
};

type QLeaf<T> = {
  data: T;
  next: QLeaf<T> | null;
  x: number;
  y: number;
  value: number;
  r: number;
};

export type QNode<T> = QInternal<T> | QLeaf<T>;

export function isInternal<T>(node: QNode<T>): node is QInternal<T> {
  return 'children' in node;
}

class Quadtree<T> {
  private readonly getX: (d: T) => number;
  private readonly getY: (d: T) => number;
  private x0 = Number.NaN;
  private y0 = Number.NaN;
  private x1 = Number.NaN;
  private y1 = Number.NaN;
  private root: QNode<T> | undefined;

  constructor(getX: (d: T) => number, getY: (d: T) => number, data?: readonly T[]) {
    this.getX = getX;
    this.getY = getY;
    if (data) this.addAll(data);
  }

  addAll(data: readonly T[]): this {
    const size = data.length;
    const xs: number[] = new Array(size);
    const ys: number[] = new Array(size);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (let i = 0; i < size; i += 1) {
      const x = +this.getX(data[i]!);
      const y = +this.getY(data[i]!);
      if (Number.isNaN(x) || Number.isNaN(y)) continue;
      xs[i] = x;
      ys[i] = y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    if (minX > maxX || minY > maxY) return this;

    this.cover(minX, minY).cover(maxX, maxY);

    for (let i = 0; i < size; i += 1) {
      const x = xs[i];
      const y = ys[i];
      if (x === undefined || y === undefined) continue;
      this.insert(x, y, data[i]!);
    }
    return this;
  }

  /** d3 的 cover：把范围扩成正方形（边长取 2 的幂），保证象限划分不退化 */
  cover(inputX: number, inputY: number): this {
    const x = +inputX;
    const y = +inputY;
    if (Number.isNaN(x) || Number.isNaN(y)) return this;

    let x0 = this.x0;
    let y0 = this.y0;
    let x1 = this.x1;
    let y1 = this.y1;

    if (Number.isNaN(x0)) {
      x0 = Math.floor(x);
      x1 = x0 + 1;
      y0 = Math.floor(y);
      y1 = y0 + 1;
    } else {
      let z = x1 - x0 || 1;
      let node: QNode<T> | undefined = this.root;
      let parent: QInternal<T> | undefined;
      let bit = 0;
      while (x < x0 || x >= x1 || y < y0 || y >= y1) {
        bit = ((y < y0 ? 1 : 0) << 1) | (x < x0 ? 1 : 0);
        parent = { children: [undefined, undefined, undefined, undefined], x: 0, y: 0, value: 0, r: 0 };
        parent.children[bit] = node;
        node = parent;
        z *= 2;
        if (bit === 0) {
          x1 = x0 + z;
          y1 = y0 + z;
        } else if (bit === 1) {
          x0 = x1 - z;
          y1 = y0 + z;
        } else if (bit === 2) {
          x1 = x0 + z;
          y0 = y1 - z;
        } else {
          x0 = x1 - z;
          y0 = y1 - z;
        }
      }
      // 只有内部节点根需要被新包装的象限替换；叶子根与边界无关
      if (this.root && isInternal(this.root)) this.root = node;
    }

    this.x0 = x0;
    this.y0 = y0;
    this.x1 = x1;
    this.y1 = y1;
    return this;
  }

  private insert(x: number, y: number, data: T): void {
    if (Number.isNaN(x) || Number.isNaN(y)) return;

    const leaf: QLeaf<T> = { data, next: null, x: 0, y: 0, value: 0, r: 0 };
    let node: QNode<T> | undefined = this.root;
    if (!node) {
      this.root = leaf;
      return;
    }

    let x0 = this.x0;
    let y0 = this.y0;
    let x1 = this.x1;
    let y1 = this.y1;
    let parent: QInternal<T> | undefined;
    let bit = 0;
    let midX = 0;
    let midY = 0;

    // 下沉到目标象限；命中的第一个空位就是落点
    while (isInternal(node)) {
      midX = (x0 + x1) / 2;
      midY = (y0 + y1) / 2;
      const right = x >= midX;
      const bottom = y >= midY;
      if (right) x0 = midX;
      else x1 = midX;
      if (bottom) y0 = midY;
      else y1 = midY;
      bit = ((bottom ? 1 : 0) << 1) | (right ? 1 : 0);
      parent = node;
      const next: QNode<T> | undefined = node.children[bit];
      if (!next) {
        node.children[bit] = leaf;
        return;
      }
      node = next;
    }

    const existingX = +this.getX(node.data);
    const existingY = +this.getY(node.data);

    // 完全重合：串成链表
    if (x === existingX && y === existingY) {
      leaf.next = node;
      if (parent) parent.children[bit] = leaf;
      else this.root = leaf;
      return;
    }

    // 分裂叶子，直到两点进入不同象限
    do {
      const bucket: QInternal<T> = {
        children: [undefined, undefined, undefined, undefined],
        x: 0,
        y: 0,
        value: 0,
        r: 0,
      };
      if (parent) parent.children[bit] = bucket;
      else this.root = bucket;
      parent = bucket;

      midX = (x0 + x1) / 2;
      midY = (y0 + y1) / 2;
      const right = x >= midX;
      const bottom = y >= midY;
      if (right) x0 = midX;
      else x1 = midX;
      if (bottom) y0 = midY;
      else y1 = midY;
      bit = ((bottom ? 1 : 0) << 1) | (right ? 1 : 0);

      const existingBit = ((existingY >= midY ? 1 : 0) << 1) | (existingX >= midX ? 1 : 0);
      if (bit !== existingBit) {
        parent.children[existingBit] = node;
        parent.children[bit] = leaf;
        return;
      }
    } while (true);
  }

  visit(
    visitor: (
      node: QNode<T>,
      x0: number,
      y0: number,
      x1: number,
      y1: number,
    ) => boolean | void,
  ): this {
    type Entry = { node: QNode<T>; x0: number; y0: number; x1: number; y1: number };
    const stack: Entry[] = [];
    if (this.root) {
      stack.push({ node: this.root, x0: this.x0, y0: this.y0, x1: this.x1, y1: this.y1 });
    }
    let entry: Entry | undefined;
    while ((entry = stack.pop())) {
      const node = entry.node;
      if (!visitor(node, entry.x0, entry.y0, entry.x1, entry.y1) && isInternal(node)) {
        const midX = (entry.x0 + entry.x1) / 2;
        const midY = (entry.y0 + entry.y1) / 2;
        const children = node.children;
        const child3 = children[3];
        if (child3) stack.push({ node: child3, x0: midX, y0: midY, x1: entry.x1, y1: entry.y1 });
        const child2 = children[2];
        if (child2) stack.push({ node: child2, x0: entry.x0, y0: midY, x1: midX, y1: entry.y1 });
        const child1 = children[1];
        if (child1) stack.push({ node: child1, x0: midX, y0: entry.y0, x1: entry.x1, y1: midY });
        const child0 = children[0];
        if (child0) stack.push({ node: child0, x0: entry.x0, y0: entry.y0, x1: midX, y1: midY });
      }
    }
    return this;
  }

  visitAfter(
    visitor: (node: QNode<T>, x0: number, y0: number, x1: number, y1: number) => void,
  ): this {
    type Entry = { node: QNode<T>; x0: number; y0: number; x1: number; y1: number };
    const pending: Entry[] = [];
    const ordered: Entry[] = [];
    if (this.root) {
      pending.push({ node: this.root, x0: this.x0, y0: this.y0, x1: this.x1, y1: this.y1 });
    }
    let entry: Entry | undefined;
    while ((entry = pending.pop())) {
      if (isInternal(entry.node)) {
        const midX = (entry.x0 + entry.x1) / 2;
        const midY = (entry.y0 + entry.y1) / 2;
        const children = entry.node.children;
        const child0 = children[0];
        if (child0) pending.push({ node: child0, x0: entry.x0, y0: entry.y0, x1: midX, y1: midY });
        const child1 = children[1];
        if (child1) pending.push({ node: child1, x0: midX, y0: entry.y0, x1: entry.x1, y1: midY });
        const child2 = children[2];
        if (child2) pending.push({ node: child2, x0: entry.x0, y0: midY, x1: midX, y1: entry.y1 });
        const child3 = children[3];
        if (child3) pending.push({ node: child3, x0: midX, y0: midY, x1: entry.x1, y1: entry.y1 });
      }
      ordered.push(entry);
    }
    for (let i = ordered.length - 1; i >= 0; i -= 1) {
      const item = ordered[i]!;
      visitor(item.node, item.x0, item.y0, item.x1, item.y1);
    }
    return this;
  }
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
    /** 仅度数权重部分；距离与强度乘子每 tick 从 getter 读取 */
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
    const tree = new Quadtree<N>(
      (d) => d.x,
      (d) => d.y,
      nodes,
    );

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
            if (x === 0) {
              x = jiggle();
              l += x * x;
            }
            if (y === 0) {
              y = jiggle();
              l += y * y;
            }
            if (l < distanceMin2) l = Math.sqrt(distanceMin2 * l);
            node.vx += (x * quad.value * alpha) / l;
            node.vy += (y * quad.value * alpha) / l;
          }
          return true;
        }

        if (isInternal(quad) || l >= distanceMax2) return undefined;

        if (quad.data !== node || quad.next) {
          if (x === 0) {
            x = jiggle();
            l += x * x;
          }
          if (y === 0) {
            y = jiggle();
            l += y * y;
          }
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
      const tree = new Quadtree<N>(
        (d) => d.x,
        (d) => d.y,
        nodes,
      );
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
                if (x === 0) {
                  x = jiggle();
                  l += x * x;
                }
                if (y === 0) {
                  y = jiggle();
                  l += y * y;
                }
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
