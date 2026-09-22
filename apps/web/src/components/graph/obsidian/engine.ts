/**
 * 图谱引擎 —— 主线程侧：数据布点 → worker → 视口 → 交互 → 渲染循环。
 *
 * 行为对齐 graph-reconstructed.js：
 *   - 初始布点：Obsidian 的新节点播种算法（邻居均值 + jitter，否则按环形区域取点）
 *   - 视口：`targetScale *= 1.5^(-delta/120)`；每帧 `scale = lerp(scale, target, .15)`
 *     （仅当相对差 ≥ 1%），缩放向外时以视口中心为锚点、向内时以指针为锚点
 *   - 交互：拖背景=平移；拖节点=固定 fx/fy 并 `{alpha:.3, alphaTarget:.3}`；
 *     释放 `{alphaTarget:0, forceNode:{id,x:null,y:null}}`
 *   - 命中：`nodeSize*nodeScale + 3/scale` 内的最近圆
 *
 * 偏离：见 constants.ts 与 PRD 偏离清单（定种子、可转移 ArrayBuffer、缩放上限、
 * 初值按包围盒适配、缓动收敛后暂停重绘）。
 */
import {
  DEFAULT_RENDER_PALETTE,
  REVEAL_FADE_MS,
  REVEAL_FADE_REDUCED_MS,
  clamp,
  nodeSizeFor,
  renderGraph,
  revealStaggerFor,
  type RenderLink,
  type RenderNode,
  type RenderPalette,
  type RenderReveal,
} from './renderer';
import type {
  ForceNodeMessage,
  InboundMessage,
  OutboundMessage,
  SimForces,
  SimNodePositions,
} from './protocol';
import {
  APP_ZOOM_MAX,
  APP_ZOOM_MIN,
  COLLIDE_RADIUS,
  DEFAULT_CENTER_STRENGTH,
  DEFAULT_LINK_DISTANCE,
  DEFAULT_LINK_STRENGTH,
  DEFAULT_REPEL_STRENGTH,
  DRAG_ALPHA,
  FIT_PADDING_RATIO,
  HIT_PADDING,
  NODE_SIZE_MULTIPLIER,
  LINE_SIZE_MULTIPLIER,
  OBSIDIAN_ENGINE_SEED,
  SHOW_ARROW,
  TEXT_FADE_MULTIPLIER,
  ZOOM_BASE,
  ZOOM_LERP,
  type GraphColorKey,
} from './constants';
import { createRandom } from './forces';

/** 节点类型 → 应用的语义配色键（`MQ` / `app.css` 的映射） */
export type EngineNodeKind = 'note' | 'tag' | 'ghost' | 'attachment';

export function colorKeyForKind(kind: EngineNodeKind): GraphColorKey {
  if (kind === 'tag') return 'fillTag';
  if (kind === 'ghost') return 'fillUnresolved';
  if (kind === 'attachment') return 'fillAttachment';
  return 'fill';
}

export type EngineNodeInput = {
  id: string;
  label: string;
  kind: EngineNodeKind;
  color: string;
};

export type EngineData = {
  nodes: EngineNodeInput[];
  /** [sourceId, targetId] */
  links: Array<[string, string]>;
};

export type EngineForces = {
  centerStrength: number;
  linkStrength: number;
  linkDistance: number;
  repelStrength: number;
};

export const ENGINE_FORCE_DEFAULTS: EngineForces = {
  centerStrength: DEFAULT_CENTER_STRENGTH,
  linkStrength: DEFAULT_LINK_STRENGTH,
  linkDistance: DEFAULT_LINK_DISTANCE,
  repelStrength: DEFAULT_REPEL_STRENGTH,
};

export type EngineOptions = {
  seed?: number;
  palette?: RenderPalette;
  textFadeMultiplier?: number;
  lineSizeMultiplier?: number;
  nodeSizeMultiplier?: number;
  showArrow?: boolean;
  /** 点击（未拖动）节点时回调 */
  onActivate?: (id: string) => void;
  /** 右键节点时回调，用于外部菜单 */
  onContext?: (id: string, cssX: number, cssY: number) => void;
  /** Animate 时间轴走完时回调（宿主可据此把「停止」按钮还原成「播放」） */
  onRevealDone?: () => void;
};

type Viewport = { scale: number; targetScale: number; panX: number; panY: number };

export class GraphEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly options: Required<
    Pick<
      EngineOptions,
      | 'seed'
      | 'palette'
      | 'textFadeMultiplier'
      | 'lineSizeMultiplier'
      | 'nodeSizeMultiplier'
      | 'showArrow'
    >
  > &
    EngineOptions;

  private worker: Worker | null = null;
  private workerPositions: Map<string, { x: number; y: number }> | null = null;

  private readonly ids: string[] = [];
  private readonly indexById = new Map<string, number>();
  private readonly weights: number[] = [];
  private readonly nodeSizes: number[] = [];
  private renderNodes: RenderNode[] = [];
  private renderLinks: RenderLink[] = [];
  /** Animate 时间轴；null = 无动画。时钟在此持有，不进 React */
  private reveal: RenderReveal | null = null;
  private positions: Array<{ x: number; y: number }> = [];
  /** 上次数据集的坐标：重设可见集合时复用，避免已有节点跳位 */
  private readonly lastPositions = new Map<string, { x: number; y: number }>();
  /** 节点类型 → 语义配色键 */
  private readonly colorKeys = new Map<string, GraphColorKey>();
  private relatedFlags = new Uint8Array(0);
  private readonly adjacency: number[][] = [];

  private viewport: Viewport = { scale: 1, targetScale: 1, panX: 0, panY: 0 };
  private zoomAnchor = { x: 0, y: 0 };
  private usesViewportCenter = false;

  private selected = -1;
  private hovered = -1;
  private dragging = -1;
  private panning = false;
  private panStart: { x: number; y: number; panX: number; panY: number } | null = null;
  private movedSinceDown = false;

  private raf: number | null = null;
  private disposed = false;
  private forces: EngineForces = { ...ENGINE_FORCE_DEFAULTS };
  private resizeObserver: ResizeObserver | null = null;

  constructor(
    private readonly container: HTMLElement,
    canvas: HTMLCanvasElement,
    options: EngineOptions = {},
  ) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('graph: 2d context unavailable');
    this.ctx = ctx;
    this.options = {
      seed: OBSIDIAN_ENGINE_SEED,
      palette: DEFAULT_RENDER_PALETTE,
      textFadeMultiplier: TEXT_FADE_MULTIPLIER,
      lineSizeMultiplier: LINE_SIZE_MULTIPLIER,
      nodeSizeMultiplier: NODE_SIZE_MULTIPLIER,
      showArrow: SHOW_ARROW,
      ...options,
    };
    this.bindEvents();
    this.resize();
    this.startWorker();
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(container);
    }
  }

  // ----------------------------------------------------------------- data

  setData(data: EngineData): void {
    this.ids.length = 0;
    this.indexById.clear();
    this.colorKeys.clear();
    this.adjacency.length = 0;
    for (const node of data.nodes) {
      this.indexById.set(node.id, this.ids.length);
      this.ids.push(node.id);
      this.adjacency.push([]);
      this.colorKeys.set(node.id, colorKeyForKind(node.kind));
    }

    const forward = new Set<string>();
    const reverse = new Set<string>();
    for (const [sourceId, targetId] of data.links) {
      const s = this.indexById.get(sourceId);
      const t = this.indexById.get(targetId);
      if (s === undefined || t === undefined) continue;
      forward.add(`${s}\u0000${t}`);
      reverse.add(`${t}\u0000${s}`);
      this.adjacency[s]!.push(t);
      this.adjacency[t]!.push(s);
    }

    // weight = |forward ∪ reverse|（无向邻居数），即 Obsidian 的节点大小依据
    this.weights.length = 0;
    for (let i = 0; i < this.ids.length; i += 1) {
      this.weights.push(new Set(this.adjacency[i]).size);
    }
    this.nodeSizes.length = 0;
    for (let i = 0; i < this.ids.length; i += 1) {
      this.nodeSizes.push(nodeSizeFor(this.weights[i]!, this.options.nodeSizeMultiplier));
    }

    // 存活节点沿用上次坐标（Obsidian worker 按 id 保留节点对象），只给新节点播种
    const known: Array<{ x: number; y: number } | undefined> = new Array(this.ids.length);
    for (let i = 0; i < this.ids.length; i += 1) {
      known[i] = this.lastPositions.get(this.ids[i]!);
    }
    this.positions = seedPositions(this.ids, this.adjacency, this.options.seed, known);
    this.lastPositions.clear();
    for (let i = 0; i < this.ids.length; i += 1) {
      this.lastPositions.set(this.ids[i]!, this.positions[i]!);
    }

    this.renderNodes = data.nodes.map((node, index) => ({
      x: this.positions[index]!.x,
      y: this.positions[index]!.y,
      weight: this.weights[index]!,
      // 空颜色 = 该节点类型的语义色（应用：fill / fillTag / fillAttachment / fillUnresolved）
      color: node.color || this.options.palette[this.colorKeyFor(node.id)],
      label: node.label,
      fadeAlpha: 1,
      // Animate 进行中重设数据时，新节点从 0 开始，避免中途闪一下
      reveal: this.reveal ? 0 : 1,
      moveText: 0,
    }));

    this.renderLinks = [];
    for (const [sourceId, targetId] of data.links) {
      const s = this.indexById.get(sourceId);
      const t = this.indexById.get(targetId);
      if (s === undefined || t === undefined || s === t) continue;
      // 反向重复边：物理层保留两条，视觉上只画一条（Obsidian 同款抑制）
      const suppressed = reverse.has(`${s}\u0000${t}`) && this.ids[s]! < this.ids[t]!;
      this.renderLinks.push({ source: s, target: t, suppressed, alpha: 1, arrowAlpha: 1 });
    }

    const positions: SimNodePositions = {};
    for (let i = 0; i < this.ids.length; i += 1) {
      positions[this.ids[i]!] = [this.positions[i]!.x, this.positions[i]!.y];
    }
    this.post({
      nodes: positions,
      links: data.links,
      forces: this.forces as SimForces,
      alpha: DRAG_ALPHA,
      run: true,
    });
    this.fitView();
    this.updateRelated();
    this.requestRender();
  }

  /**
   * Animate（「播放关系图谱生长动画」）：按给定顺序让节点依次淡入。
   *
   * 时钟由引擎持有，**不进 React**——若在组件里逐帧 setState，
   * `setData` 会跟着每秒重跑 60 次，连带重启物理模拟并重设视口。
   * 时间轴无状态（每帧纯由 now 求值），故重放与中断都立即生效：
   * 传新的 order 即从头重放，传 null 即立刻全部显示。
   *
   * 减弱动效时保留淡入、去掉逐个出现的运动（规范：更少更轻，而不是没有）。
   */
  setReveal(order: readonly string[] | null): void {
    if (!order || order.length === 0) {
      this.reveal = null;
      for (const node of this.renderNodes) node.reveal = 1;
      this.requestRender();
      return;
    }

    const reduce =
      typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;
    const staggerMs = revealStaggerFor(order.length, reduce);
    const fadeMs = reduce ? REVEAL_FADE_REDUCED_MS : REVEAL_FADE_MS;

    const delayMs = new Float64Array(this.ids.length);
    order.forEach((id, position) => {
      const nodeIndex = this.indexById.get(id);
      if (nodeIndex !== undefined) delayMs[nodeIndex] = position * staggerMs;
    });

    this.reveal = {
      startAt: performance.now(),
      delayMs,
      fadeMs,
      totalMs: Math.max(0, (order.length - 1) * staggerMs) + fadeMs,
    };
    for (const node of this.renderNodes) node.reveal = 0;
    this.requestRender();
  }

  setForces(forces: Partial<EngineForces>): void {
    this.forces = { ...this.forces, ...forces };
    this.post({ forces: this.forces as SimForces, alpha: DRAG_ALPHA, run: true });
    this.requestRender();
  }

  /** 对应应用的 `setRenderOptions`：四项一起收，节点大小变化时重算尺寸 */
  setRenderOptions(options: {
    textFadeMultiplier?: number;
    nodeSizeMultiplier?: number;
    lineSizeMultiplier?: number;
    showArrow?: boolean;
  }): void {
    if (typeof options.textFadeMultiplier === 'number') {
      this.options.textFadeMultiplier = options.textFadeMultiplier;
    }
    if (typeof options.lineSizeMultiplier === 'number') {
      this.options.lineSizeMultiplier = options.lineSizeMultiplier;
    }
    if (typeof options.showArrow === 'boolean') {
      this.options.showArrow = options.showArrow;
    }
    if (typeof options.nodeSizeMultiplier === 'number') {
      this.options.nodeSizeMultiplier = options.nodeSizeMultiplier;
      for (let i = 0; i < this.nodeSizes.length; i += 1) {
        this.nodeSizes[i] = nodeSizeFor(
          this.weights[i]!,
          options.nodeSizeMultiplier,
        );
      }
    }
    this.requestRender();
  }

  private colorKeyFor(id: string): GraphColorKey {
    return this.colorKeys.get(id) ?? 'fill';
  }

  setPalette(palette: RenderPalette): void {
    this.options.palette = palette;
    this.requestRender();
  }

  highlight(id: string | null): void {
    const index = id === null ? -1 : (this.indexById.get(id) ?? -1);
    if (index === this.hovered) return;
    this.hovered = index;
    this.updateRelated();
    this.requestRender();
  }

  fitsInto(index: number): void {
    const node = this.renderNodes[index];
    if (!node) return;
    this.viewport.panX = this.canvas.width / 2 - node.x * this.viewport.scale;
    this.viewport.panY = this.canvas.height / 2 - node.y * this.viewport.scale;
    this.requestRender();
  }

  fitView(): void {
    const bounds = contentBounds(this.renderNodes, this.nodeSizes);
    if (!bounds) return;
    const width = Math.max(1, this.canvas.width);
    const height = Math.max(1, this.canvas.height);
    const spanX = Math.max(1, bounds.maxX - bounds.minX);
    const spanY = Math.max(1, bounds.maxY - bounds.minY);
    const scale = clamp(
      Math.min(width / (spanX * FIT_PADDING_RATIO), height / (spanY * FIT_PADDING_RATIO)),
      APP_ZOOM_MIN,
      APP_ZOOM_MAX,
    );
    this.viewport.scale = scale;
    this.viewport.targetScale = scale;
    this.viewport.panX = width / 2 - ((bounds.minX + bounds.maxX) / 2) * scale;
    this.viewport.panY = height / 2 - ((bounds.minY + bounds.maxY) / 2) * scale;
    this.requestRender();
  }

  hitTest(cssX: number, cssY: number): number {
    const dpr = window.devicePixelRatio || 1;
    const world = this.screenToWorld(cssX * dpr, cssY * dpr);
    const nodeScale = Math.sqrt(1 / this.viewport.scale);
    let best = -1;
    let bestDistance = Infinity;
    for (let i = 0; i < this.renderNodes.length; i += 1) {
      const node = this.renderNodes[i]!;
      const dx = node.x - world.x;
      const dy = node.y - world.y;
      const radius = this.nodeSizes[i]! * nodeScale + HIT_PADDING / this.viewport.scale;
      const distance = dx * dx + dy * dy;
      if (distance <= radius * radius && distance < bestDistance) {
        best = i;
        bestDistance = distance;
      }
    }
    return best;
  }

  /** 拖拽中的节点保持固定（引擎内部记录 fx/fy 由 worker 保存） */
  nodeIdAt(index: number): string | null {
    return index >= 0 ? (this.ids[index] ?? null) : null;
  }

  screenToWorld(x: number, y: number): { x: number; y: number } {
    return {
      x: (x - this.viewport.panX) / this.viewport.scale,
      y: (y - this.viewport.panY) / this.viewport.scale,
    };
  }

  destroy(): void {
    this.disposed = true;
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.resizeObserver?.disconnect();
    this.worker?.terminate();
    this.worker = null;
  }

  // -------------------------------------------------------------- internals

  private post(message: InboundMessage): void {
    this.worker?.postMessage(message);
  }

  private startWorker(): void {
    if (typeof Worker === 'undefined') return;
    this.worker = new Worker(new URL('./graph.worker.ts', import.meta.url), {
      type: 'module',
      name: 'Graph Worker',
    });
    this.worker.onmessage = (event: MessageEvent<OutboundMessage>) => {
      const { id, buffer } = event.data;
      const coords = new Float32Array(buffer, 0, id.length * 2);
      const map = new Map<string, { x: number; y: number }>();
      for (let i = 0; i < id.length; i += 1) {
        map.set(id[i]!, { x: coords[i * 2]!, y: coords[i * 2 + 1]! });
      }
      this.workerPositions = map;
      this.requestRender();
    };
  }

  private consumeWorkerPositions(): void {
    const map = this.workerPositions;
    if (!map) return;
    this.workerPositions = null;
    for (let i = 0; i < this.ids.length; i += 1) {
      const next = map.get(this.ids[i]!);
      if (!next) continue;
      this.renderNodes[i]!.x = next.x;
      this.renderNodes[i]!.y = next.y;
      this.positions[i] = next;
    }
  }

  private updateRelated(): void {
    const active = this.dragging >= 0 ? this.dragging : this.hovered;
    this.selected = active;
    this.relatedFlags = new Uint8Array(this.ids.length);
    if (active < 0) {
      this.relatedFlags.fill(1);
      return;
    }
    this.relatedFlags[active] = 1;
    for (const neighbour of this.adjacency[active] ?? []) this.relatedFlags[neighbour] = 1;
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.container.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    const previousWidth = this.canvas.width || width;
    const previousHeight = this.canvas.height || height;
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;

    if (!this.viewport.panX && !this.viewport.panY) {
      this.viewport.panX = width / 2;
      this.viewport.panY = height / 2;
      this.viewport.scale = clamp(0.25 * dpr, 0.25, 1);
      this.viewport.targetScale = this.viewport.scale;
    } else {
      this.viewport.panX += (width - previousWidth) / 2;
      this.viewport.panY += (height - previousHeight) / 2;
    }
    this.requestRender();
  }

  private updateZoom(): void {
    const viewport = this.viewport;
    viewport.targetScale = clamp(viewport.targetScale, APP_ZOOM_MIN, APP_ZOOM_MAX);
    const from = viewport.scale;
    const to = viewport.targetScale;
    const ratio = from > to ? from / to : to / from;
    if (ratio - 1 >= 0.01) {
      const anchorX = this.usesViewportCenter ? this.canvas.width / 2 : this.zoomAnchor.x;
      const anchorY = this.usesViewportCenter ? this.canvas.height / 2 : this.zoomAnchor.y;
      const worldX = (anchorX - viewport.panX) / from;
      const worldY = (anchorY - viewport.panY) / from;
      viewport.scale = from * (1 - ZOOM_LERP) + to * ZOOM_LERP;
      viewport.panX = anchorX - worldX * viewport.scale;
      viewport.panY = anchorY - worldY * viewport.scale;
    }
  }

  private requestRender(): void {
    if (this.disposed || this.raf !== null) return;
    this.raf = requestAnimationFrame(() => this.frame());
  }

  private frame(): void {
    this.raf = null;
    if (this.disposed) return;
    this.consumeWorkerPositions();
    this.updateZoom();

    const now = performance.now();
    // Animate 收尾：时间轴走完即停，并通知宿主还原按钮状态
    if (this.reveal && now - this.reveal.startAt >= this.reveal.totalMs) {
      this.reveal = null;
      for (const node of this.renderNodes) node.reveal = 1;
      this.options.onRevealDone?.();
    }

    const result = renderGraph(this.ctx, this.canvas.width, this.canvas.height, {
      nodes: this.renderNodes,
      links: this.renderLinks,
      selected: this.selected,
      related: this.relatedFlags,
      scale: this.viewport.scale,
      panX: this.viewport.panX,
      panY: this.viewport.panY,
      palette: this.options.palette,
      textFadeMultiplier: this.options.textFadeMultiplier,
      lineSizeMultiplier: this.options.lineSizeMultiplier,
      showArrow: this.options.showArrow,
      nodeSizes: this.nodeSizes,
      width: this.canvas.width,
      height: this.canvas.height,
      now,
      reveal: this.reveal,
    });

    // 仍在缩放缓动 / Animate 未走完 → 继续；否则等下一次数据/交互唤醒
    const zoomSettling =
      Math.abs(this.viewport.targetScale / this.viewport.scale - 1) >= 0.01;
    if (result.animating || zoomSettling || this.reveal !== null) this.requestRender();
  }

  private bindEvents(): void {
    const canvas = this.canvas;
    canvas.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      const index = this.hitTest(event.offsetX, event.offsetY);
      if (index >= 0 && this.options.onContext) {
        this.options.onContext(this.ids[index]!, event.offsetX, event.offsetY);
      }
    });

    canvas.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        let delta = event.deltaY;
        if (event.deltaMode === 1) delta *= 40;
        if (event.deltaMode === 2) delta *= 800;
        this.viewport.targetScale *= Math.pow(ZOOM_BASE, -delta / 120);
        const dpr = window.devicePixelRatio || 1;
        if (this.viewport.targetScale < this.viewport.scale) {
          this.usesViewportCenter = true;
          this.zoomAnchor = { x: 0, y: 0 };
        } else {
          this.usesViewportCenter = false;
          this.zoomAnchor = { x: event.offsetX * dpr, y: event.offsetY * dpr };
        }
        this.requestRender();
      },
      { passive: false },
    );

    canvas.addEventListener('pointerdown', (event) => {
      canvas.setPointerCapture(event.pointerId);
      this.movedSinceDown = false;
      const index = this.hitTest(event.offsetX, event.offsetY);
      const dpr = window.devicePixelRatio || 1;
      if (index >= 0) {
        this.dragging = index;
        const world = this.screenToWorld(event.offsetX * dpr, event.offsetY * dpr);
        this.renderNodes[index]!.x = world.x;
        this.renderNodes[index]!.y = world.y;
        this.post({
          alpha: DRAG_ALPHA,
          alphaTarget: DRAG_ALPHA,
          run: true,
          forceNode: { id: this.ids[index]!, x: world.x, y: world.y } as ForceNodeMessage,
        });
        this.updateRelated();
      } else {
        this.panning = true;
        canvas.classList.add('is-grabbing');
        this.panStart = {
          x: event.clientX * dpr,
          y: event.clientY * dpr,
          panX: this.viewport.panX,
          panY: this.viewport.panY,
        };
      }
      this.requestRender();
    });

    canvas.addEventListener('pointermove', (event) => {
      const dpr = window.devicePixelRatio || 1;
      if (this.dragging >= 0) {
        this.movedSinceDown = true;
        const world = this.screenToWorld(event.offsetX * dpr, event.offsetY * dpr);
        const index = this.dragging;
        this.renderNodes[index]!.x = world.x;
        this.renderNodes[index]!.y = world.y;
        this.post({
          alpha: DRAG_ALPHA,
          alphaTarget: DRAG_ALPHA,
          run: true,
          forceNode: { id: this.ids[index]!, x: world.x, y: world.y } as ForceNodeMessage,
        });
      } else if (this.panning && this.panStart) {
        this.viewport.panX = this.panStart.panX + event.clientX * dpr - this.panStart.x;
        this.viewport.panY = this.panStart.panY + event.clientY * dpr - this.panStart.y;
      } else if (event.pointerType === 'mouse') {
        // hover 高亮只在鼠标上生效：触摸没有 pointerleave，
        // 会让高亮和 cursor 一直卡在最后碰到的节点上。
        const index = this.hitTest(event.offsetX, event.offsetY);
        const next = index >= 0 ? index : -1;
        if (next !== this.hovered) {
          this.hovered = next;
          this.updateRelated();
        }
        canvas.style.cursor = next >= 0 ? 'pointer' : 'grab';
      }
      this.requestRender();
    });

    const release = (event: PointerEvent) => {
      canvas.releasePointerCapture?.(event.pointerId);
      if (this.dragging >= 0) {
        const index = this.dragging;
        const id = this.ids[index]!;
        this.post({ alphaTarget: 0, forceNode: { id, x: null, y: null } as ForceNodeMessage });
        if (!this.movedSinceDown && this.options.onActivate) this.options.onActivate(id);
        this.dragging = -1;
      }
      this.panning = false;
      this.panStart = null;
      canvas.classList.remove('is-grabbing');
      this.updateRelated();
      this.requestRender();
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('pointerleave', () => {
      if (this.dragging < 0 && !this.panning && this.hovered >= 0) {
        this.hovered = -1;
        this.updateRelated();
        this.requestRender();
      }
    });
  }
}

/**
 * Obsidian 的新节点播种（graph-reconstructed.js 的 setData）：
 *   有已知邻居 → 取邻居坐标均值 + (rand-.5)*jitter
 *   否则       → 在环形区域内随机取点（半径 maxRadius + sqrt(rand)*annulusWidth）
 *   area = count * 60²（60 = 碰撞半径），jitter = sqrt(area)
 * 原实现的 `maxRadius` 在循环中恒为 0，这里保持一致。
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
