/**
 * 图谱物理 worker —— 行为对齐 Obsidian 原始 worker（sim-original.js）。
 *
 * 逐项对应：
 *   - 节点对象按 id 复用：缺席的删除，存活者**保留 x/y/vx/vy/fx/fy**（原始：`F` 表 + `M` 数组）
 *   - `nodes` 消息只在提供了坐标时覆盖 x/y（原始：`r && (g.x = r[0], g.y = r[1])`）
 *   - `alpha` 只抬高（原始：`if (t.alpha > Q) Q = t.alpha`）
 *   - `alphaTarget` 直接赋值；`run` 触发（重）调度
 *   - 循环 `setTimeout(16.666666666666668)`，`alpha <= 0.001` 停止
 *   - 出站 `{ id, buffer, v }`，坐标为 Float32 交错数组
 *
 * 偏离（PRD 偏离清单记账）：
 *   1. 随机源为定种子 PRNG（本站要求可复现、可测试；原始用 Math.random）。
 *   2. 不用 SharedArrayBuffer：SAB 需要 COOP/COEP 响应头，会打断本站既有的第三方嵌入
 *      （评论、统计）。原始 worker 在同一场景下也走可转移 ArrayBuffer 分支。
 */
import {
  ForceSimulation,
  createRandom,
  forceCollide,
  forceLink,
  forceManyBody,
  forceX,
  forceY,
  type SimLink,
  type SimNode,
} from './forces';
import {
  ALPHA_MIN,
  ALPHA_START,
  COLLIDE_RADIUS,
  COLLIDE_STRENGTH,
  DEFAULT_CENTER_STRENGTH,
  DEFAULT_LINK_DISTANCE,
  DEFAULT_LINK_STRENGTH,
  DEFAULT_REPEL_STRENGTH,
  MANY_BODY_DISTANCE_MIN,
  MANY_BODY_THETA,
  OBSIDIAN_ENGINE_SEED,
  TICK_INTERVAL_MS,
} from './constants';
import type { InboundMessage, OutboundMessage } from './protocol';

type WorkerNode = SimNode & { id: string };

const nodesById: Record<string, WorkerNode> = Object.create(null);
let nodes: WorkerNode[] = [];
let links: Array<SimLink<WorkerNode>> = [];

let alpha = ALPHA_START;
let alphaTarget = 0;

// 四项可运行时变更的力参数（对应 Obsidian Forces 面板）
let centerStrength = DEFAULT_CENTER_STRENGTH;
let linkStrengthMultiplier = DEFAULT_LINK_STRENGTH;
let linkDistance = DEFAULT_LINK_DISTANCE;
let repelStrength = DEFAULT_REPEL_STRENGTH;

let simulation: ForceSimulation<WorkerNode> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

const random = createRandom(OBSIDIAN_ENGINE_SEED);
const forceXInstance = forceX<WorkerNode>(0, () => centerStrength);
const forceYInstance = forceY<WorkerNode>(0, () => centerStrength);
const linkForce = forceLink<WorkerNode>(
  [],
  () => linkDistance,
  () => linkStrengthMultiplier,
  random,
);
const chargeForce = forceManyBody<WorkerNode>(
  () => repelStrength,
  random,
  MANY_BODY_DISTANCE_MIN,
  MANY_BODY_THETA,
);
const collideForce = forceCollide<WorkerNode>(random, COLLIDE_RADIUS, COLLIDE_STRENGTH);

function rebuild(): void {
  simulation = new ForceSimulation<WorkerNode>(nodes);
  simulation.alpha = alpha;
  simulation.alphaMin = ALPHA_MIN;
  simulation.alphaTarget = alphaTarget;
  simulation
    .force('x', forceXInstance)
    .force('y', forceYInstance)
    .force('link', linkForce)
    .force('charge', chargeForce)
    .force('collide', collideForce);
  // forceLink 的 links 由闭包持有，这里显式重建一次度数权重
  linkForce.initialize?.(nodes);
}

function emitPositions(): void {
  const id: string[] = new Array(nodes.length);
  const buffer = new ArrayBuffer(nodes.length * 2 * 4);
  const coords = new Float32Array(buffer);
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i]!;
    id[i] = node.id;
    coords[i * 2] = node.x;
    coords[i * 2 + 1] = node.y;
  }
  const message: OutboundMessage = { id, buffer, v: 0 };
  (self as unknown as Worker).postMessage(message, [buffer]);
}

function schedule(): void {
  if (timer === null) timer = setTimeout(tick, TICK_INTERVAL_MS);
}

function tick(): void {
  timer = null;
  if (!simulation || alpha <= ALPHA_MIN) return;
  simulation.alpha = alpha;
  simulation.alphaTarget = alphaTarget;
  simulation.tick();
  alpha = simulation.alpha;
  emitPositions();
  schedule();
}

self.onmessage = (event: MessageEvent<InboundMessage>) => {
  const message = event.data;

  if (message.nodes) {
    const incoming = message.nodes;
    for (const id of Object.keys(nodesById)) {
      if (!Object.prototype.hasOwnProperty.call(incoming, id)) delete nodesById[id];
    }
    nodes = [];
    for (const id of Object.keys(incoming)) {
      let node = nodesById[id];
      if (!node) {
        node = nodesById[id] = {
          id,
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          fx: null,
          fy: null,
          index: nodes.length,
        };
      }
      const position = incoming[id];
      if (position) {
        node.x = position[0]!;
        node.y = position[1]!;
      }
      nodes.push(node);
    }
  }

  if (message.links) {
    links = [];
    for (const [sourceId, targetId] of message.links) {
      const source = nodesById[sourceId];
      const target = nodesById[targetId];
      if (source && target) links.push({ source, target });
    }
  }

  if (message.forceNode) {
    const node = nodesById[message.forceNode.id];
    if (node) {
      node.fx = message.forceNode.x;
      node.fy = message.forceNode.y;
    }
  }

  if (message.forces) {
    if (message.forces.centerStrength !== undefined) {
      centerStrength = message.forces.centerStrength;
    }
    if (message.forces.linkStrength !== undefined) {
      linkStrengthMultiplier = message.forces.linkStrength;
    }
    if (message.forces.linkDistance !== undefined) {
      linkDistance = message.forces.linkDistance;
    }
    if (message.forces.repelStrength !== undefined) {
      repelStrength = message.forces.repelStrength;
    }
  }

  if (message.alpha !== undefined && alpha < message.alpha) alpha = message.alpha;
  if (message.alphaTarget !== undefined) alphaTarget = message.alphaTarget;

  rebuild();
  if (message.run !== undefined) schedule();
};

export {};
