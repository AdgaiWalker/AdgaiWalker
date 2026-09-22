/**
 * 图谱渲染器 —— 逐条对齐**应用本体**（`app.js` 的 `AQ` 渲染器 / `xQ` 节点 / `TQ` 连线）。
 *
 * 关键公式（全部来自应用源码，非推测）：
 *   节点半径  `getSize() = fNodeSizeMult * clamp(3*sqrt(weight+1), 8, 30)`
 *   世界缩放  `setScale(e): nodeScale = sqrt(1/e)`
 *   文字透明  `textAlpha = clamp(log2(scale) + 1 - fTextShowMult, 0, 1)`
 *   标签字号  `14 + size/4`（世界坐标）；标签纵向 `(size+5)*nodeScale + moveText/scale`
 *   标签位移  `moveText` 缓动到 15（高亮）或 0
 *   标签缩放  常规 `nodeScale`；**高亮且 scale<1 时用 `1/scale`**
 *   边线宽    `fLineSizeMult / scale`
 *   边透明度  目标 `1` 或 `fQ(.2)`（高亮时非关联边），由 `lerp(keep .9)` 缓动
 *   箭头透明  目标 `c * clamp(2*(scale - 0.3), 0, 1)`
 *   反向重复边  若 `target.reverse[source]` 存在且 `source.id < target.id` 则不画
 *   命中/剔除  半径 `size*nodeScale (+1)`；标签剔除盒 600×200
 *
 * 配色是**按节点类型语义化**的（fill / fillFocused / fillTag / fillAttachment /
 * fillUnresolved / line / lineHighlight / fillHighlight / arrow / text / circle），
 * 由 CSS 变量注入（见 styles/walker.css）。
 */

import {
  DIM_ALPHA,
  EDGE_ZOOM_FADE_RATE,
  EDGE_ZOOM_FADE_SCALE,
  FALLBACK_PALETTE,
  LABEL_ALPHA_LOG_OFFSET,
  LABEL_FONT_BASE,
  LABEL_FONT_SIZE_DIVISOR,
  LABEL_OFFSET_PADDING,
  LABEL_SELECTED_OFFSET,
  NODE_SIZE_FACTOR,
  NODE_SIZE_MAX,
  NODE_SIZE_MIN,
  type GraphColorKey,
} from './constants';

/** 与原实现的 lerp 同义：keep 默认 0.9 → 每帧移动 10% */
function lerp(from: number, to: number, keep = 0.9): number {
  return from * keep + to * (1 - keep);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export type RenderPalette = Record<GraphColorKey, string>;

export const DEFAULT_RENDER_PALETTE: RenderPalette = { ...FALLBACK_PALETTE };

export type RenderNode = {
  x: number;
  y: number;
  /** `getRelated().length`：无向邻居数，节点大小的唯一依据 */
  weight: number;
  /** 已解析好的填充色（分组自定义色 > 类型语义色） */
  color: string;
  label: string;
  /** 逐帧缓动的淡出值（高亮 / 变暗） */
  fadeAlpha: number;
  /**
   * Animate 的淡入进度 0→1。
   * 与 `fadeAlpha` **分开**：后者是高亮语义（learp 向 1 或 DIM_ALPHA），
   * 两者相乘才既保留高亮过渡又保留入场动画，不会互相覆盖。
   */
  reveal: number;
  /** 对应应用的 `moveText` */
  moveText: number;
};

export type RenderLink = {
  source: number;
  target: number;
  /** 反向重复边抑制：true 表示本方向不画 */
  suppressed: boolean;
  /** 逐帧缓动的透明度 */
  alpha: number;
  /** 逐帧缓动的箭头透明度 */
  arrowAlpha: number;
};

/**
 * Animate（生长动画）的时间轴。
 * 引擎持有 `startAt`，渲染器只做无状态求值——**时钟不进 React**，
 * 否则每帧 setState 会让 `setData` 每秒重跑 60 次并重启模拟。
 */
export type RenderReveal = {
  /** performance.now() 起点 */
  startAt: number;
  /** 每个节点下标的延迟（毫秒）；未参与的为 0（立即出现） */
  delayMs: Float64Array;
  /** 单节点淡入时长 */
  fadeMs: number;
  /** 全部完成所需时间（毫秒，相对 startAt） */
  totalMs: number;
};

export type RenderState = {
  nodes: RenderNode[];
  links: RenderLink[];
  /** 高亮节点下标；-1 表示无高亮 */
  selected: number;
  /** 1 = 与高亮节点直接相关（自身或相邻） */
  related: Uint8Array;
  scale: number;
  panX: number;
  panY: number;
  palette: RenderPalette;
  textFadeMultiplier: number;
  lineSizeMultiplier: number;
  showArrow: boolean;
  /** 每个节点的显示尺寸（世界单位），由引擎按 getSize 预计算 */
  nodeSizes: number[];
  /** 画布尺寸（设备像素），用于视口剔除 */
  width: number;
  height: number;
  /** 当前时刻（`performance.now()`），供 Animate 求值 */
  now: number;
  /** Animate 时间轴；null 表示无动画（所有节点按已完成处理） */
  reveal: RenderReveal | null;
};

export type RenderResult = {
  /** 是否仍有元素在缓动（用于决定下一帧是否必须重绘） */
  animating: boolean;
};

export function nodeSizeFor(
  weight: number,
  nodeSizeMultiplier: number,
  minimum = NODE_SIZE_MIN,
  maximum = NODE_SIZE_MAX,
): number {
  return (
    nodeSizeMultiplier *
    Math.max(minimum, Math.min(Math.sqrt(weight + 1) * NODE_SIZE_FACTOR, maximum))
  );
}

/** `setScale`：nodeScale 与 textAlpha 出自同一处，必须一起更新 */
export function textAlphaFor(scale: number, textFadeMultiplier: number): number {
  return clamp(
    Math.log(scale) / Math.log(2) + LABEL_ALPHA_LOG_OFFSET - textFadeMultiplier,
    0,
    1,
  );
}

/**
 * Animate 的时序（**非应用派生值**）：应用只暴露「播放生长动画」一个布尔，
 * 时序未公开，故这里按动效规范取值——
 * - 单节点淡入 280ms：UI 动画的 200–300ms 区间
 * - 逐个出现的间隔 30–80ms（规范给的 stagger 带）**在小规模内**成立
 * - 总时长 3s 是**硬预算**：规模大到保住 30ms 下限会拖出十几秒时，间隔继续压小
 * - 减弱动效：保留淡入（帮助理解），去掉逐个出现的运动
 */
export const REVEAL_FADE_MS = 280;
export const REVEAL_FADE_REDUCED_MS = 200;
export const REVEAL_STAGGER_MIN_MS = 30;
export const REVEAL_STAGGER_MAX_MS = 80;
export const REVEAL_TOTAL_BUDGET_MS = 3000;
/** 淡入起点尺寸比例。**不从 0 开始**——物体不会从虚无中出现 */
export const REVEAL_MIN_SCALE = 0.94;

/**
 * 按节点数反推错峰间隔：**总时长优先**。
 *
 * 先用总预算除，再夹到 30–80ms 的感知带内（小规模时它是主角）；
 * 一旦「保住 30ms 下限」会让总时长超出预算，就**不再守住下限** ——
 * 427 个节点按 7ms 是一道 3.3 秒长起来的波，按 30ms 则是 13 秒的等待，
 * 后者已经不是「演示结构怎么长起来的」，而是让人等。
 * 于是「总时长 ≤ 预算 + 一个淡入」对任何规模都成立。
 */
export function revealStaggerFor(count: number, reduce: boolean): number {
  if (reduce || count <= 1) return 0;
  const byBudget = REVEAL_TOTAL_BUDGET_MS / (count - 1);
  if (byBudget <= REVEAL_STAGGER_MIN_MS) return byBudget;
  return Math.min(byBudget, REVEAL_STAGGER_MAX_MS);
}

/**
 * 某个节点的淡入进度（0→1），强 ease-out（三次方，≈ `cubic-bezier(0.23, 1, 0.32, 1)`）。
 * 抽成纯函数以便单测锁住时序，而不是靠肉眼看画布。
 */
export function revealFactor(
  now: number,
  reveal: RenderReveal | null,
  index: number,
): number {
  if (!reveal) return 1;
  const elapsed = now - reveal.startAt - (reveal.delayMs[index] ?? 0);
  // 还没轮到自己 → 完全不可见；恰好到点 → 进度 0（淡入刚开始）
  if (elapsed < 0) return 0;
  // 无淡入时长（或已走完）→ 立即完全可见
  if (reveal.fadeMs <= 0 || elapsed >= reveal.fadeMs) return 1;
  const t = elapsed / reveal.fadeMs;
  return 1 - (1 - t) ** 3;
}

function inViewport(
  state: RenderState,
  worldX: number,
  worldY: number,
  radius: number,
): boolean {
  const { scale, panX, panY, width, height } = state;
  const screenX = worldX * scale + panX;
  const screenY = worldY * scale + panY;
  const screenRadius = radius * scale;
  return (
    screenX + screenRadius >= 0 &&
    screenX - screenRadius <= width &&
    screenY + screenRadius >= 0 &&
    screenY - screenRadius <= height
  );
}

export function renderGraph(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: RenderState,
): RenderResult {
  const {
    nodes,
    links,
    selected,
    related,
    scale,
    panX,
    panY,
    palette,
    textFadeMultiplier,
    lineSizeMultiplier,
    showArrow,
    nodeSizes,
  } = state;

  const nodeScale = Math.sqrt(1 / scale);
  const textAlpha = textAlphaFor(scale, textFadeMultiplier);
  const arrowFade = clamp((scale - EDGE_ZOOM_FADE_SCALE) * EDGE_ZOOM_FADE_RATE, 0, 1);
  const hasHighlight = selected >= 0;
  let animating = false;

  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.translate(panX, panY);
  ctx.scale(scale, scale);

  // ---- 连线（先画，压在节点下）----
  for (const link of links) {
    const a = nodes[link.source]!;
    const b = nodes[link.target]!;
    const incident = hasHighlight && (link.source === selected || link.target === selected);
    // 应用口径：目标 alpha 就是 1 或 fQ(.2)，没有额外的样式乘子
    const targetAlpha = !hasHighlight || incident ? 1 : DIM_ALPHA;
    const targetArrow = targetAlpha * arrowFade;

    const nextAlpha = lerp(link.alpha, targetAlpha);
    const nextArrow = lerp(link.arrowAlpha, targetArrow);
    if (Math.abs(nextAlpha - link.alpha) > 0.001) animating = true;
    if (Math.abs(nextArrow - link.arrowAlpha) > 0.001) animating = true;
    link.alpha = nextAlpha;
    link.arrowAlpha = nextArrow;

    if (link.suppressed) continue;

    // Animate：两端都出现后连线才可见，否则会看到连向空处的线
    const linkReveal = Math.min(a.reveal, b.reveal);
    if (linkReveal <= 0.001) continue;

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy) || 1;
    const ar = nodeSizes[link.source]! * nodeScale;
    const br = nodeSizes[link.target]! * nodeScale;
    const x1 = a.x + (dx * ar) / length;
    const y1 = a.y + (dy * ar) / length;
    const x2 = b.x - (dx * br) / length;
    const y2 = b.y - (dy * br) / length;

    const lineWidth = lineSizeMultiplier / scale;
    if (!inViewport(state, (a.x + b.x) / 2, (a.y + b.y) / 2, Math.max(ar, br) + 1)) {
      continue;
    }
    ctx.globalAlpha = link.alpha * linkReveal;
    ctx.strokeStyle = incident ? palette.lineHighlight : palette.line;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    if (showArrow && link.arrowAlpha > 0.001) {
      const angle = Math.atan2(dy, dx);
      const head = Math.max(6, lineWidth * 4);
      ctx.globalAlpha = link.arrowAlpha * linkReveal;
      ctx.fillStyle = palette.arrow;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(
        x2 - Math.cos(angle - 0.4) * head,
        y2 - Math.sin(angle - 0.4) * head,
      );
      ctx.lineTo(
        x2 - Math.cos(angle + 0.4) * head,
        y2 - Math.sin(angle + 0.4) * head,
      );
      ctx.closePath();
      ctx.fill();
    }
  }

  // ---- 节点 ----
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i]!;
    const isSelected = i === selected;
    const isRelated = !hasHighlight || related[i] === 1;
    const nextFade = lerp(node.fadeAlpha, isRelated ? 1 : DIM_ALPHA);
    if (Math.abs(nextFade - node.fadeAlpha) > 0.001) animating = true;
    node.fadeAlpha = nextFade;

    // Animate：直接由 now 求值（无状态），故可随时重放或中断
    node.reveal = revealFactor(state.now, state.reveal, i);
    if (node.reveal <= 0.001) continue;
    if (node.reveal < 1) animating = true;

    const size =
      nodeSizes[i]! *
      nodeScale *
      (REVEAL_MIN_SCALE + (1 - REVEAL_MIN_SCALE) * node.reveal);
    if (!isSelected && !inViewport(state, node.x, node.y, size + 1)) continue;

    ctx.globalAlpha = node.fadeAlpha * node.reveal;
    // 应用：高亮节点用 fillHighlight，其余用自身语义色（分组色 > 类型色）
    ctx.fillStyle = isSelected ? palette.fillHighlight : node.color;
    ctx.beginPath();
    ctx.arc(node.x, node.y, size, 0, Math.PI * 2);
    ctx.fill();

    if (isSelected) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = palette.circle;
      ctx.lineWidth = Math.max(1, 1 / scale);
      ctx.beginPath();
      ctx.arc(node.x, node.y, size + 2 / scale, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // ---- 标签 ----
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i]!;
    if (!node.label) continue;
    const isSelected = i === selected;
    const isRelated = !hasHighlight || related[i] === 1;

    const nextMove = lerp(node.moveText, isSelected ? LABEL_SELECTED_OFFSET : 0);
    if (Math.abs(nextMove - node.moveText) > 0.001) animating = true;
    node.moveText = nextMove;

    // 应用：高亮节点 alpha 强制 1，其余 textAlpha × fadeAlpha × Animate 淡入
    const alpha = isSelected ? 1 : textAlpha * node.fadeAlpha * node.reveal;
    if (alpha <= 0.001) continue;

    const worldSize = nodeSizes[i]!;
    if (
      !isSelected &&
      !inViewport(state, node.x, node.y, worldSize + 2)
    ) {
      continue;
    }

    // 应用特例：高亮且 scale<1 时标签不随缩放变小（PIXI 里是 text.scale = 1/scale）
    const fontScale = isSelected && scale < 1 ? 1 : nodeScale;
    const fontPx = (LABEL_FONT_BASE + worldSize / LABEL_FONT_SIZE_DIVISOR) * fontScale;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = palette.text;
    ctx.font = `${fontPx}px ui-sans-serif, -apple-system, BlinkMacSystemFont, system-ui, "Segoe UI", Roboto, "Microsoft YaHei Light", sans-serif`;
    ctx.fillText(
      node.label,
      node.x,
      node.y + (worldSize + LABEL_OFFSET_PADDING) * nodeScale + nextMove / scale,
    );
    void isRelated;
  }

  ctx.restore();
  ctx.globalAlpha = 1;
  return { animating };
}
