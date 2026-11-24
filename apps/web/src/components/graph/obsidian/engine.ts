/**
 * 图谱引擎 —— 主线程侧：数据装载 → worker 协调 → 视口控制 → 渲染循环。
 * 视口几何/数据整备见 `./viewport.ts`，交互状态机见 `./pointer-controller.ts`。
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
import type { ForceNodeMessage, InboundMessage, OutboundMessage, SimForces } from './protocol';
import {
  DEFAULT_CENTER_STRENGTH,
  DEFAULT_LINK_DISTANCE,
  DEFAULT_LINK_STRENGTH,
  DEFAULT_REPEL_STRENGTH,
  DRAG_ALPHA,
  NODE_SIZE_MULTIPLIER,
  LINE_SIZE_MULTIPLIER,
  OBSIDIAN_ENGINE_SEED,
  SHOW_ARROW,
  TEXT_FADE_MULTIPLIER,
  ZOOM_BASE,
  type GraphColorKey,
} from './constants';
import { attachGraphPointerController } from './pointer-controller';
import {
  buildEngineScene,
  computeFitViewport,
  hitTestNodes,
  screenToWorldPoint,
  seedPositions,
  stepViewportZoom,
  type Viewport,
} from './viewport';

export { seedPositions };

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
  onActivate?: (id: string) => void;
  onContext?: (id: string, cssX: number, cssY: number) => void;
  onRevealDone?: () => void;
};

export class GraphEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly options: Required<
    Pick<
      EngineOptions,
      'seed' | 'palette' | 'textFadeMultiplier' | 'lineSizeMultiplier' | 'nodeSizeMultiplier' | 'showArrow'
    >
  > & EngineOptions;

  private worker: Worker | null = null;
  private workerPositions: Map<string, { x: number; y: number }> | null = null;

  private ids: string[] = [];
  private indexById = new Map<string, number>();
  private weights: number[] = [];
  private nodeSizes: number[] = [];
  private renderNodes: RenderNode[] = [];
  private renderLinks: RenderLink[] = [];
  private reveal: RenderReveal | null = null;
  private positions: Array<{ x: number; y: number }> = [];
  private readonly lastPositions = new Map<string, { x: number; y: number }>();
  private relatedFlags = new Uint8Array(0);
  private adjacency: number[][] = [];

  private viewport: Viewport = { scale: 1, targetScale: 1, panX: 0, panY: 0 };
  private zoomAnchor = { x: 0, y: 0 };
  private usesViewportCenter = false;
  private selected = -1;

  private raf: number | null = null;
  private disposed = false;
  private forces: EngineForces = { ...ENGINE_FORCE_DEFAULTS };
  private resizeObserver: ResizeObserver | null = null;
  private readonly pointer: ReturnType<typeof attachGraphPointerController>;

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
    this.pointer = attachGraphPointerController(canvas, {
      hitTest: (x, y) => this.hitTest(x, y),
      screenToWorld: (x, y) => this.screenToWorld(x, y),
      nodeIdAt: (index) => this.nodeIdAt(index),
      getPan: () => ({ panX: this.viewport.panX, panY: this.viewport.panY }),
      setPan: (panX, panY) => {
        this.viewport.panX = panX;
        this.viewport.panY = panY;
      },
      moveNode: (index, x, y) => {
        const node = this.renderNodes[index];
        if (!node) return;
        node.x = x;
        node.y = y;
      },
      postDragForce: (id, x, y) => {
        const forceNode = { id, x, y } as ForceNodeMessage;
        this.post(
          x === null
            ? { alphaTarget: 0, forceNode }
            : { alpha: DRAG_ALPHA, alphaTarget: DRAG_ALPHA, run: true, forceNode },
        );
      },
      onWheelZoom: (delta, offsetCssX, offsetCssY) => {
        this.viewport.targetScale *= Math.pow(ZOOM_BASE, -delta / 120);
        const dpr = window.devicePixelRatio || 1;
        this.usesViewportCenter = this.viewport.targetScale < this.viewport.scale;
        this.zoomAnchor = this.usesViewportCenter
          ? { x: 0, y: 0 }
          : { x: offsetCssX * dpr, y: offsetCssY * dpr };
        this.requestRender();
      },
      onContext: this.options.onContext,
      onActivate: this.options.onActivate,
      onSelectionChanged: (active) => this.updateRelated(active),
      requestRender: () => this.requestRender(),
    });
    this.resize();
    this.startWorker();
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(container);
    }
  }

  setData(data: EngineData): void {
    const scene = buildEngineScene({
      nodes: data.nodes,
      links: data.links,
      colorKeyForKind,
      lastPositions: this.lastPositions,
      seed: this.options.seed,
      nodeSizeMultiplier: this.options.nodeSizeMultiplier,
      palette: this.options.palette,
      revealActive: Boolean(this.reveal),
    });
    this.ids = scene.ids;
    this.indexById = scene.indexById;
    this.adjacency = scene.adjacency;
    this.weights = scene.weights;
    this.nodeSizes = scene.nodeSizes;
    this.positions = scene.positions;
    this.renderNodes = scene.renderNodes;
    this.renderLinks = scene.renderLinks;

    this.post({
      nodes: scene.simPositions,
      links: data.links,
      forces: this.forces as SimForces,
      alpha: DRAG_ALPHA,
      run: true,
    });
    this.fitView();
    this.pointer.reset();
    this.updateRelated(this.pointer.activeIndex());
    this.requestRender();
  }

  setReveal(order: readonly string[] | null): void {
    if (!order || order.length === 0) {
      this.reveal = null;
      for (const node of this.renderNodes) node.reveal = 1;
      this.requestRender();
      return;
    }

    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
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

  setRenderOptions(options: {
    textFadeMultiplier?: number;
    nodeSizeMultiplier?: number;
    lineSizeMultiplier?: number;
    showArrow?: boolean;
  }): void {
    if (typeof options.textFadeMultiplier === 'number') this.options.textFadeMultiplier = options.textFadeMultiplier;
    if (typeof options.lineSizeMultiplier === 'number') this.options.lineSizeMultiplier = options.lineSizeMultiplier;
    if (typeof options.showArrow === 'boolean') this.options.showArrow = options.showArrow;
    if (typeof options.nodeSizeMultiplier === 'number') {
      this.options.nodeSizeMultiplier = options.nodeSizeMultiplier;
      for (let i = 0; i < this.nodeSizes.length; i += 1) {
        this.nodeSizes[i] = nodeSizeFor(this.weights[i]!, options.nodeSizeMultiplier);
      }
    }
    this.requestRender();
  }

  setPalette(palette: RenderPalette): void {
    this.options.palette = palette;
    this.requestRender();
  }

  highlight(id: string | null): void {
    const index = id === null ? -1 : (this.indexById.get(id) ?? -1);
    if (this.pointer.setHoveredIndex(index)) this.requestRender();
  }

  fitsInto(index: number): void {
    const node = this.renderNodes[index];
    if (!node) return;
    this.viewport.panX = this.canvas.width / 2 - node.x * this.viewport.scale;
    this.viewport.panY = this.canvas.height / 2 - node.y * this.viewport.scale;
    this.requestRender();
  }

  fitView(): void {
    const fitted = computeFitViewport(this.renderNodes, this.nodeSizes, this.canvas.width, this.canvas.height);
    if (!fitted) return;
    this.viewport = { scale: fitted.scale, targetScale: fitted.scale, panX: fitted.panX, panY: fitted.panY };
    this.requestRender();
  }

  hitTest(cssX: number, cssY: number): number {
    return hitTestNodes(this.renderNodes, this.nodeSizes, this.viewport, cssX, cssY, window.devicePixelRatio || 1);
  }

  nodeIdAt(index: number): string | null {
    return index >= 0 ? (this.ids[index] ?? null) : null;
  }

  screenToWorld(x: number, y: number): { x: number; y: number } {
    return screenToWorldPoint(this.viewport, x, y);
  }

  destroy(): void {
    this.disposed = true;
    this.pointer.unbind();
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.resizeObserver?.disconnect();
    this.worker?.terminate();
    this.worker = null;
  }

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

  private updateRelated(active: number): void {
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

  private requestRender(): void {
    if (this.disposed || this.raf !== null) return;
    this.raf = requestAnimationFrame(() => this.frame());
  }

  private frame(): void {
    this.raf = null;
    if (this.disposed) return;
    this.consumeWorkerPositions();
    stepViewportZoom(this.viewport, this.canvas.width, this.canvas.height, this.zoomAnchor, this.usesViewportCenter);

    const now = performance.now();
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

    const zoomSettling = Math.abs(this.viewport.targetScale / this.viewport.scale - 1) >= 0.01;
    if (result.animating || zoomSettling || this.reveal !== null) this.requestRender();
  }
}
