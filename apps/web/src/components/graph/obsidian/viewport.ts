import {
  APP_ZOOM_MAX,
  APP_ZOOM_MIN,
  COLLIDE_RADIUS,
  FIT_PADDING_RATIO,
  HIT_PADDING,
  OBSIDIAN_ENGINE_SEED,
  ZOOM_LERP,
  type GraphColorKey,
} from './constants';
import { createRandom } from './forces';
import type { SimNodePositions } from './protocol';
import { clamp, nodeSizeFor, type RenderLink, type RenderNode, type RenderPalette } from './renderer';

export type Viewport = {
  scale: number;
  targetScale: number;
  panX: number;
  panY: number;
};

export function screenToWorldPoint(viewport: Viewport, x: number, y: number): { x: number; y: number } {
  return {
    x: (x - viewport.panX) / viewport.scale,
    y: (y - viewport.panY) / viewport.scale,
  };
}

export function hitTestNodes(
  nodes: readonly RenderNode[],
  nodeSizes: readonly number[],
  viewport: Viewport,
  cssX: number,
  cssY: number,
  dpr: number,
): number {
  const world = screenToWorldPoint(viewport, cssX * dpr, cssY * dpr);
  const nodeScale = Math.sqrt(1 / viewport.scale);
  let best = -1;
  let bestDistance = Infinity;
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i]!;
    const dx = node.x - world.x;
    const dy = node.y - world.y;
    const radius = nodeSizes[i]! * nodeScale + HIT_PADDING / viewport.scale;
    const distance = dx * dx + dy * dy;
    if (distance <= radius * radius && distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  }
  return best;
}

export function stepViewportZoom(
  viewport: Viewport,
  canvasWidth: number,
  canvasHeight: number,
  zoomAnchor: { x: number; y: number },
  usesViewportCenter: boolean,
): void {
  viewport.targetScale = clamp(viewport.targetScale, APP_ZOOM_MIN, APP_ZOOM_MAX);
  const from = viewport.scale;
  const to = viewport.targetScale;
  const ratio = from > to ? from / to : to / from;
  if (ratio - 1 >= 0.01) {
    const anchorX = usesViewportCenter ? canvasWidth / 2 : zoomAnchor.x;
    const anchorY = usesViewportCenter ? canvasHeight / 2 : zoomAnchor.y;
    const worldX = (anchorX - viewport.panX) / from;
    const worldY = (anchorY - viewport.panY) / from;
    viewport.scale = from * (1 - ZOOM_LERP) + to * ZOOM_LERP;
    viewport.panX = anchorX - worldX * viewport.scale;
    viewport.panY = anchorY - worldY * viewport.scale;
  }
}

export function computeFitViewport(
  nodes: readonly RenderNode[],
  sizes: readonly number[],
  canvasWidth: number,
  canvasHeight: number,
): { scale: number; panX: number; panY: number } | null {
  const bounds = contentBounds(nodes, sizes);
  if (!bounds) return null;
  const width = Math.max(1, canvasWidth);
  const height = Math.max(1, canvasHeight);
  const spanX = Math.max(1, bounds.maxX - bounds.minX);
  const spanY = Math.max(1, bounds.maxY - bounds.minY);
  const scale = clamp(
    Math.min(width / (spanX * FIT_PADDING_RATIO), height / (spanY * FIT_PADDING_RATIO)),
    APP_ZOOM_MIN,
    APP_ZOOM_MAX,
  );
  return {
    scale,
    panX: width / 2 - ((bounds.minX + bounds.maxX) / 2) * scale,
    panY: height / 2 - ((bounds.minY + bounds.maxY) / 2) * scale,
  };
}

/** 整备引擎视图数据、初始坐标、邻接表与发送给力导向 worker 的位置映射。 */
export function buildEngineScene<Kind extends string>(options: {
  nodes: ReadonlyArray<{ id: string; label: string; kind: Kind; color: string }>;
  links: ReadonlyArray<[string, string]>;
  colorKeyForKind: (kind: Kind) => GraphColorKey;
  lastPositions: Map<string, { x: number; y: number }>;
  seed: number;
  nodeSizeMultiplier: number;
  palette: RenderPalette;
  revealActive: boolean;
}): {
  ids: string[];
  indexById: Map<string, number>;
  adjacency: number[][];
  weights: number[];
  nodeSizes: number[];
  positions: Array<{ x: number; y: number }>;
  renderNodes: RenderNode[];
  renderLinks: RenderLink[];
  simPositions: SimNodePositions;
} {
  const ids: string[] = [];
  const indexById = new Map<string, number>();
  const adjacency: number[][] = [];

  for (const node of options.nodes) {
    indexById.set(node.id, ids.length);
    ids.push(node.id);
    adjacency.push([]);
  }

  const reverse = new Set<string>();
  for (const [sourceId, targetId] of options.links) {
    const s = indexById.get(sourceId);
    const t = indexById.get(targetId);
    if (s === undefined || t === undefined) continue;
    reverse.add(`${t}\u0000${s}`);
    adjacency[s]!.push(t);
    adjacency[t]!.push(s);
  }

  const weights: number[] = [];
  const nodeSizes: number[] = [];
  for (let i = 0; i < ids.length; i += 1) {
    const weight = new Set(adjacency[i]).size;
    weights.push(weight);
    nodeSizes.push(nodeSizeFor(weight, options.nodeSizeMultiplier));
  }

  const known = ids.map((id) => options.lastPositions.get(id));
  const positions = seedPositions(ids, adjacency, options.seed, known);
  options.lastPositions.clear();
  for (let i = 0; i < ids.length; i += 1) {
    options.lastPositions.set(ids[i]!, positions[i]!);
  }

  const renderNodes: RenderNode[] = options.nodes.map((node, index) => ({
    x: positions[index]!.x,
    y: positions[index]!.y,
    weight: weights[index]!,
    color: node.color || options.palette[options.colorKeyForKind(node.kind)],
    label: node.label,
    fadeAlpha: 1,
    reveal: options.revealActive ? 0 : 1,
    moveText: 0,
  }));

  const renderLinks: RenderLink[] = [];
  for (const [sourceId, targetId] of options.links) {
    const s = indexById.get(sourceId);
    const t = indexById.get(targetId);
    if (s === undefined || t === undefined || s === t) continue;
    const suppressed = reverse.has(`${s}\u0000${t}`) && ids[s]! < ids[t]!;
    renderLinks.push({ source: s, target: t, suppressed, alpha: 1, arrowAlpha: 1 });
  }

  const simPositions: SimNodePositions = {};
  for (let i = 0; i < ids.length; i += 1) {
    simPositions[ids[i]!] = [positions[i]!.x, positions[i]!.y];
  }

  return {
    ids,
    indexById,
    adjacency,
    weights,
    nodeSizes,
    positions,
    renderNodes,
    renderLinks,
    simPositions,
  };
}

/**
 * Obsidian 的新节点播种（graph-reconstructed.js 的 setData）：
 *   有已知邻居 → 取邻居坐标均值 + (rand-.5)*jitter
 *   否则       → 在环形区域内随机取点（半径 maxRadius + sqrt(rand)*annulusWidth）
 */
export function seedPositions(
  ids: readonly string[],
  adjacency: readonly number[][],
  seed = OBSIDIAN_ENGINE_SEED,
  known?: ReadonlyArray<{ x: number; y: number } | undefined>,
): Array<{ x: number; y: number }> {
  const random = createRandom(seed);
  const count = ids.length;
  const area = count * COLLIDE_RADIUS * COLLIDE_RADIUS;
  const maxRadius = 0;
  const annulusWidth = Math.sqrt(area / Math.PI + maxRadius * maxRadius) - maxRadius;
  const jitter = Math.sqrt(area);

  const positions: Array<{ x: number; y: number }> = new Array(count);
  for (let i = 0; i < count; i += 1) {
    const existing = known?.[i];
    if (existing) {
      positions[i] = { x: existing.x, y: existing.y };
      continue;
    }
    const neighbours = adjacency[i] ?? [];
    let sumX = 0;
    let sumY = 0;
    let found = 0;
    for (const neighbour of neighbours) {
      const other = positions[neighbour];
      if (other) {
        sumX += other.x;
        sumY += other.y;
        found += 1;
      }
    }
    if (found > 0) {
      positions[i] = {
        x: sumX / found + (random() - 0.5) * jitter,
        y: sumY / found + (random() - 0.5) * jitter,
      };
    } else {
      const angle = random() * Math.PI * 2;
      const radius = maxRadius + Math.sqrt(random()) * annulusWidth;
      positions[i] = { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
    }
  }
  return positions;
}

function contentBounds(
  nodes: readonly RenderNode[],
  sizes: readonly number[],
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (nodes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i]!;
    const radius = sizes[i] ?? 0;
    if (node.x - radius < minX) minX = node.x - radius;
    if (node.y - radius < minY) minY = node.y - radius;
    if (node.x + radius > maxX) maxX = node.x + radius;
    if (node.y + radius > maxY) maxY = node.y + radius;
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}
