/**
 * 主线程 ↔ worker 的消息协议 —— 逐字段对齐 Obsidian 原始 worker 的 onmessage 结构。
 *
 * 来源：sim-original.js 的 `self.onmessage`：
 *   `var t = A.data, n = t.nodes; ... var I = t.links; ... var f = t.forceNode; ...
 *    var C = t.forces; ... t.alpha / t.alphaTarget / t.run`
 * 出站：`postMessage({ id: t, buffer: T, v: i })`（SharedArrayBuffer 路径带版本号）。
 */

export type SimNodePositions = Record<string, [number, number]>;

export type SimForces = {
  centerStrength?: number;
  linkStrength?: number;
  linkDistance?: number;
  repelStrength?: number;
};

export type ForceNodeMessage = {
  id: string;
  x: number | null;
  y: number | null;
};

export type InboundMessage = {
  nodes?: SimNodePositions;
  /** [sourceId, targetId]，与原始 worker 的 `[[a, b], …]` 一致 */
  links?: Array<[string, string]>;
  forceNode?: ForceNodeMessage;
  forces?: SimForces;
  /** 只会抬高，不会降低（原始 worker：`if (t.alpha > Q) Q = t.alpha`） */
  alpha?: number;
  alphaTarget?: number;
  run?: boolean;
};

export type OutboundMessage = {
  /** 下标与 buffer 中坐标一一对应 */
  id: string[];
  buffer: ArrayBuffer;
  /** 版本号；使用可转移 ArrayBuffer 时恒为 0 */
  v: number;
};
