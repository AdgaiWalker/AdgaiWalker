/**
 * 图谱力导向布局 —— 纯函数、确定性、规模无关。
 *
 * 四参数名称与方向照抄 Obsidian Forces 面板（PRD §3.4）：
 *   Center force 越大越紧凑越接近圆形 / Repel force 节点互斥 / Link force 边张力 / Link distance 边目标长度。
 * Obsidian 未公开力模型公式，且默认值按 400–4000 节点的库调校，故本实现：
 *   1) 以 worldScale = BASE * sqrt(n) 归一，节点数变化时不散架也不糊团；
 *   2) 固定随机种子 + 固定迭代次数，同输入必得同坐标（可预渲染、可测试）。
 */

export type GraphLayoutParams = {
  /** 0–1，默认 0.5 */
  centerForce: number;
  /** 0–20，默认 10 */
  repelForce: number;
  /** 0–1，默认 1 */
  linkForce: number;
  /** 30–500，默认 250 */
  linkDistance: number;
};

export const GRAPH_LAYOUT_DEFAULTS: GraphLayoutParams = {
  centerForce: 0.5,
  repelForce: 10,
  linkForce: 1,
  linkDistance: 250,
};

export const GRAPH_LAYOUT_RANGES: Record<
  keyof GraphLayoutParams,
  { min: number; max: number; step: number }
> = {
  centerForce: { min: 0, max: 1, step: 0.01 },
  repelForce: { min: 0, max: 20, step: 0.5 },
  linkForce: { min: 0, max: 1, step: 0.01 },
  linkDistance: { min: 30, max: 500, step: 5 },
};

/** 世界尺度基数：让 worldScale 与 sqrt(n) 同阶，使不同规模图观感一致 */
const WORLD_BASE = 40;
/** 初始布点与最大位移的温度系数 */
const TEMPERATURE_RATIO = 0.1;
const MIN_DISTANCE = 1e-3;

export type GraphLayoutInput = {
  nodes: readonly { id: string }[];
  edges: readonly { source: string; target: string }[];
};

export type GraphLayoutOptions = {
  params?: Partial<GraphLayoutParams>;
  seed?: number;
  iterations?: number;
  /** 固定不动的节点（拖拽交互中把该节点钉住） */
  pinned?: Readonly<Record<string, { x: number; y: number }>>;
  /** 增量布局的起始坐标；缺失的节点按种子在圆周上布点 */
  initial?: Readonly<Record<string, { x: number; y: number }>>;
};

export type GraphPoint = { x: number; y: number };

/** mulberry32：小而确定的 PRNG，保证同种子同序列 */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function resolveGraphLayoutParams(
  params?: Partial<GraphLayoutParams>,
): GraphLayoutParams {
  const merged = { ...GRAPH_LAYOUT_DEFAULTS, ...params };
  const clamp = (key: keyof GraphLayoutParams) => {
    const range = GRAPH_LAYOUT_RANGES[key];
    const value = Number(merged[key]);
    if (!Number.isFinite(value)) return GRAPH_LAYOUT_DEFAULTS[key];
    return Math.min(range.max, Math.max(range.min, value));
  };
  return {
    centerForce: clamp('centerForce'),
    repelForce: clamp('repelForce'),
    linkForce: clamp('linkForce'),
    linkDistance: clamp('linkDistance'),
  };
}

function defaultIterations(nodeCount: number): number {
  // 全对全斥力是 O(n²)：小图多迭代求稳，大图降迭代数守时延
  if (nodeCount > 800) return 80;
  if (nodeCount > 400) return 140;
  return 300;
}

export function layoutGraph(
  input: GraphLayoutInput,
  options: GraphLayoutOptions = {},
): Map<string, GraphPoint> {
  const params = resolveGraphLayoutParams(options.params);
  const ids = input.nodes.map((node) => node.id);
  const n = ids.length;
  const result = new Map<string, GraphPoint>();
  if (n === 0) return result;

  const worldScale = WORLD_BASE * Math.sqrt(n);
  const desired = (params.linkDistance / GRAPH_LAYOUT_DEFAULTS.linkDistance) * worldScale;

  // 初始布点：圆周 + 种子抖动（确定性）
  const random = createRandom(options.seed ?? 1);
  const index = new Map<string, number>();
  const pos: GraphPoint[] = [];
  const acc: GraphPoint[] = [];
  for (let i = 0; i < n; i += 1) {
    const id = ids[i]!;
    index.set(id, i);
    const fixed = options.initial?.[id];
    if (fixed) {
      pos.push({ x: fixed.x, y: fixed.y });
    } else {
      const angle = (i / n) * Math.PI * 2 + random() * 0.6;
      const radius = worldScale * (0.6 + random() * 0.4);
      pos.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
    }
    acc.push({ x: 0, y: 0 });
  }

  const pinnedIndex = new Map<number, GraphPoint>();
  for (const [id, point] of Object.entries(options.pinned ?? {})) {
    const at = index.get(id);
    if (at !== undefined) {
      pinnedIndex.set(at, { x: point.x, y: point.y });
      pos[at] = { x: point.x, y: point.y };
    }
  }

  // 只保留两端都存在的边
  const links: Array<[number, number]> = [];
  for (const edge of input.edges) {
    const s = index.get(edge.source);
    const t = index.get(edge.target);
    if (s === undefined || t === undefined || s === t) continue;
    links.push([s, t]);
  }

  const iterations = Math.max(1, options.iterations ?? defaultIterations(n));
  const linkWeight = params.linkForce * 0.5;
  const centerWeight = params.centerForce * 0.1;
  const repelWeight = params.repelForce * desired * desired;

  for (let step = 0; step < iterations; step += 1) {
    for (let i = 0; i < n; i += 1) {
      acc[i]!.x = 0;
      acc[i]!.y = 0;
    }

    // 斥力：全对全
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        let dx = pos[j]!.x - pos[i]!.x;
        let dy = pos[j]!.y - pos[i]!.y;
        let dist = Math.hypot(dx, dy);
        if (dist < MIN_DISTANCE) {
          // 完全重合时用确定性微扰分开，避免除零
          const angle = ((i * 31 + j * 17) % 360) * (Math.PI / 180);
          dx = Math.cos(angle) * MIN_DISTANCE;
          dy = Math.sin(angle) * MIN_DISTANCE;
          dist = MIN_DISTANCE;
        }
        const ux = dx / dist;
        const uy = dy / dist;
        const magnitude = repelWeight / dist;
        acc[i]!.x -= ux * magnitude;
        acc[i]!.y -= uy * magnitude;
        acc[j]!.x += ux * magnitude;
        acc[j]!.y += uy * magnitude;
      }
    }

    // 边张力（像橡皮筋，越偏离目标长度拉力越大）
    for (const [s, t] of links) {
      let dx = pos[t]!.x - pos[s]!.x;
      let dy = pos[t]!.y - pos[s]!.y;
      let dist = Math.hypot(dx, dy);
      if (dist < MIN_DISTANCE) {
        dx = MIN_DISTANCE;
        dy = 0;
        dist = MIN_DISTANCE;
      }
      const ux = dx / dist;
      const uy = dy / dist;
      const magnitude = (dist - desired) * linkWeight;
      acc[s]!.x += ux * magnitude;
      acc[s]!.y += uy * magnitude;
      acc[t]!.x -= ux * magnitude;
      acc[t]!.y -= uy * magnitude;
    }

    // 中心力：把节点往原点拉，力值越大越圆越紧凑
    for (let i = 0; i < n; i += 1) {
      const dist = Math.hypot(pos[i]!.x, pos[i]!.y);
      if (dist < MIN_DISTANCE) continue;
      const ux = pos[i]!.x / dist;
      const uy = pos[i]!.y / dist;
      const magnitude = centerWeight * dist;
      acc[i]!.x -= ux * magnitude;
      acc[i]!.y -= uy * magnitude;
    }

    // 位移：按温度封顶，线性冷却
    const temperature =
      worldScale * TEMPERATURE_RATIO * (1 - step / iterations) +
      worldScale * 0.005;

    for (let i = 0; i < n; i += 1) {
      const pin = pinnedIndex.get(i);
      if (pin) {
        pos[i] = { x: pin.x, y: pin.y };
        continue;
      }
      const force = acc[i]!;
      const magnitude = Math.hypot(force.x, force.y);
      if (magnitude <= MIN_DISTANCE) continue;
      const move = Math.min(magnitude, temperature);
      pos[i]!.x += (force.x / magnitude) * move;
      pos[i]!.y += (force.y / magnitude) * move;
    }
  }

  for (let i = 0; i < n; i += 1) {
    result.set(ids[i]!, { x: pos[i]!.x, y: pos[i]!.y });
  }
  return result;
}

export type GraphBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
};

export function graphBounds(points: Iterable<GraphPoint>): GraphBounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let seen = false;
  for (const point of points) {
    seen = true;
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }
  if (!seen) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export type GraphViewport = {
  scale: number;
  offsetX: number;
  offsetY: number;
};

/** 把世界坐标等比适配进给定画布尺寸（渲染与预渲染共用同一套换算） */
export function fitToViewport(
  bounds: GraphBounds,
  width: number,
  height: number,
  padding = 24,
): GraphViewport {
  const usableWidth = Math.max(1, width - padding * 2);
  const usableHeight = Math.max(1, height - padding * 2);
  const scale =
    bounds.width <= 0 || bounds.height <= 0
      ? 1
      : Math.min(usableWidth / bounds.width, usableHeight / bounds.height);
  const offsetX =
    padding + usableWidth / 2 - ((bounds.minX + bounds.maxX) / 2) * scale;
  const offsetY =
    padding + usableHeight / 2 - ((bounds.minY + bounds.maxY) / 2) * scale;
  return { scale, offsetX, offsetY };
}
