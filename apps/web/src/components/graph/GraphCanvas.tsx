/**
 * 图谱画布 —— Obsidian 交互的忠实实现（PRD §3.3 / §3.5）。
 *
 * 职责：把「可见节点 + 可见边 + 显示设置」画出来，并处理指针/键盘交互。
 * 不持有业务状态：可见性、配色、分组都由 graph-view-model 推导后传入。
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  fitToViewport,
  graphBounds,
  layoutGraph,
  type GraphEdge,
  type GraphLayoutParams,
  type GraphNode,
} from '@walker/shared';
import {
  edgeStroke,
  GRAPH_DEFAULT_NODE_COLOR,
  hoverHighlight,
  nodeLabel,
  nodeRadius,
  type GraphDisplay,
} from './graph-view-model';

export type GraphCanvasHandle = {
  resetView: () => void;
};

/**
 * 画布配色一律从 CSS 变量读取（单一来源在样式表里，深浅主题各自覆盖），
 * 不在 JS 里写死颜色——否则浅色主题下深色标签会直接看不见。
 */
type GraphPalette = {
  label: string;
  labelDim: string;
  edge: string;
  node: string;
  nodeRing: string;
  ghost: string;
  ghostRing: string;
};

const DEFAULT_PALETTE: GraphPalette = {
  label: '#111111',
  labelDim: '#5b6b7c',
  edge: 'rgba(40, 80, 140, 0.35)',
  node: GRAPH_DEFAULT_NODE_COLOR,
  nodeRing: 'rgba(255, 255, 255, 0.9)',
  ghost: 'rgba(91, 107, 124, 0.18)',
  ghostRing: 'rgba(91, 107, 124, 0.8)',
};

function readPalette(element: HTMLElement): GraphPalette {
  const styles = getComputedStyle(element);
  const read = (name: string, fallback: string) =>
    styles.getPropertyValue(name).trim() || fallback;
  return {
    label: read('--graph-label', DEFAULT_PALETTE.label),
    labelDim: read('--graph-label-dim', DEFAULT_PALETTE.labelDim),
    edge: read('--graph-edge', DEFAULT_PALETTE.edge),
    node: read('--graph-node', DEFAULT_PALETTE.node),
    nodeRing: read('--graph-node-ring', DEFAULT_PALETTE.nodeRing),
    ghost: read('--graph-ghost', DEFAULT_PALETTE.ghost),
    ghostRing: read('--graph-ghost-ring', DEFAULT_PALETTE.ghostRing),
  };
}

type Props = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  colors: Map<string, string>;
  display: GraphDisplay;
  forces: GraphLayoutParams;
  seed: number;
  height?: number;
  /** Animate：本帧允许显示的节点 id 集合；null / 缺省表示全部显示 */
  revealIds?: ReadonlySet<string> | null;
  onActivate: (node: GraphNode) => void;
  /** 右键菜单「只看它的局部图」——照抄 Obsidian 从节点打开局部图 */
  onIsolate?: (node: GraphNode) => void;
  /** 右键菜单「以它为起点筛选」——把该节点写进 Filters 的搜索框 */
  onFilterFrom?: (node: GraphNode) => void;
};

type Viewport = { scale: number; offsetX: number; offsetY: number };

const MIN_SCALE = 0.12;
const MAX_SCALE = 6;
const HIT_PADDING = 6;

function screenToWorld(
  sx: number,
  sy: number,
  viewport: Viewport,
): { x: number; y: number } {
  return {
    x: (sx - viewport.offsetX) / viewport.scale,
    y: (sy - viewport.offsetY) / viewport.scale,
  };
}

export function GraphCanvas({
  nodes,
  edges,
  colors,
  display,
  forces,
  seed,
  height = 560,
  revealIds,
  onActivate,
  onIsolate,
  onFilterFrom,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 800, height });
  const [viewport, setViewport] = useState<Viewport>({
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; node: GraphNode } | null>(
    null,
  );
  const [palette, setPalette] = useState<GraphPalette>(DEFAULT_PALETTE);

  const dragRef = useRef<
    | { mode: 'pan'; lastX: number; lastY: number }
    | { mode: 'node'; nodeId: string }
    | null
  >(null);
  const [dragged, setDragged] = useState<{
    nodeId: string;
    position: { x: number; y: number };
  } | null>(null);

  const visibleNodes = useMemo(
    () => (revealIds ? nodes.filter((node) => revealIds.has(node.id)) : nodes),
    [nodes, revealIds],
  );

  const visibleIds = useMemo(
    () => new Set(visibleNodes.map((node) => node.id)),
    [visibleNodes],
  );
  const visibleEdges = useMemo(
    () => edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target)),
    [edges, visibleIds],
  );

  const positions = useMemo(() => {
    const initial: Record<string, { x: number; y: number }> = {};
    if (dragged) initial[dragged.nodeId] = dragged.position;
    return layoutGraph(
      {
        nodes: visibleNodes.map((node) => ({ id: node.id })),
        edges: visibleEdges.map((edge) => ({ source: edge.source, target: edge.target })),
      },
      {
        params: forces,
        seed,
        initial: dragged ? initial : undefined,
        pinned: dragged ? initial : undefined,
      },
    );
  }, [visibleNodes, visibleEdges, forces, seed, dragged]);

  const nodeById = useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes],
  );

  const highlight = useMemo(() => {
    const active = hoveredId ?? selectedId;
    if (!active) return null;
    const base = hoverHighlight(visibleEdges, active);
    return base;
  }, [hoveredId, selectedId, visibleEdges]);

  // 尺寸自适应
  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const update = () => {
      const rect = element.getBoundingClientRect();
      setSize({ width: Math.max(320, rect.width), height });
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [height]);

  // 主题配色（含深色模式切换）
  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    setPalette(readPalette(element));
    if (typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(() => setPalette(readPalette(element)));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class'],
    });
    return () => observer.disconnect();
  }, []);

  // 图变化时重新适配视口
  const fitKey = `${visibleNodes.length}:${visibleEdges.length}:${size.width}:${size.height}`;
  const lastFitKey = useRef('');
  useEffect(() => {
    if (lastFitKey.current === fitKey) return;
    lastFitKey.current = fitKey;
    const bounds = graphBounds(positions.values());
    setViewport(fitToViewport(bounds, size.width, size.height, 40));
  }, [fitKey, positions, size.width, size.height]);

  const screenOf = useCallback(
    (id: string) => {
      const point = positions.get(id);
      if (!point) return null;
      return {
        x: point.x * viewport.scale + viewport.offsetX,
        y: point.y * viewport.scale + viewport.offsetY,
      };
    },
    [positions, viewport],
  );

  const pickNode = useCallback(
    (sx: number, sy: number): GraphNode | null => {
      let best: GraphNode | null = null;
      let bestDistance = Infinity;
      for (const node of visibleNodes) {
        const screen = screenOf(node.id);
        if (!screen) continue;
        const radius = Math.max(
          nodeRadius(node, display) * viewport.scale,
          HIT_PADDING,
        );
        const distance = Math.hypot(screen.x - sx, screen.y - sy);
        if (distance <= radius + HIT_PADDING && distance < bestDistance) {
          bestDistance = distance;
          best = node;
        }
      }
      return best;
    },
    [visibleNodes, screenOf, display, viewport.scale],
  );

  const normalizeZoom = useMemo(() => {
    const bounds = graphBounds(positions.values());
    const fitted = fitToViewport(bounds, size.width, size.height, 40);
    return fitted.scale > 0 ? viewport.scale / fitted.scale : 1;
  }, [positions, size.width, size.height, viewport.scale]);

  // ------------------------------------------------------------- 绘制
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
    canvas.width = Math.floor(size.width * dpr);
    canvas.height = Math.floor(size.height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);

    const dim = (id: string) => (highlight ? !highlight.neighbors.has(id) : false);

    // 边
    visibleEdges.forEach((edge, index) => {
      const from = screenOf(edge.source);
      const to = screenOf(edge.target);
      if (!from || !to) return;
      const stroke = edgeStroke(edge.kind);
      const isHighlighted = highlight?.edges.has(index) ?? false;
      const faded = highlight && !isHighlighted;
      ctx.save();
      ctx.globalAlpha = faded ? 0.12 : isHighlighted ? 1 : stroke.alpha;
      ctx.strokeStyle = isHighlighted
        ? colors.get(edge.source) ?? palette.label
        : palette.edge;
      ctx.lineWidth = Math.max(0.5, display.linkThickness * stroke.widthRatio);
      ctx.setLineDash(stroke.dash.map((value) => value * display.linkThickness));
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.setLineDash([]);

      if (display.arrows) {
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        const tip = 9 + display.linkThickness * 2;
        const targetRadius = 4;
        const ax = to.x - Math.cos(angle) * (targetRadius + tip);
        const ay = to.y - Math.sin(angle) * (targetRadius + tip);
        ctx.beginPath();
        ctx.moveTo(ax + Math.cos(angle) * tip, ay + Math.sin(angle) * tip);
        ctx.lineTo(
          ax + Math.cos(angle + 2.5) * tip * 0.7,
          ay + Math.sin(angle + 2.5) * tip * 0.7,
        );
        ctx.lineTo(
          ax + Math.cos(angle - 2.5) * tip * 0.7,
          ay + Math.sin(angle - 2.5) * tip * 0.7,
        );
        ctx.closePath();
        ctx.fillStyle = ctx.strokeStyle as string;
        ctx.fill();
      }
      ctx.restore();
    });

    // 节点
    const fade = Math.min(1, Math.max(0, display.textFadeThreshold));
    const labelAlpha =
      fade >= 1 ? 0 : Math.min(1, Math.max(0, (normalizeZoom - fade) / Math.max(0.05, 1 - fade)));

    for (const node of visibleNodes) {
      const screen = screenOf(node.id);
      if (!screen) continue;
      const radius = Math.max(2.5, nodeRadius(node, display) * viewport.scale);
      const isHovered = hoveredId === node.id || selectedId === node.id;
      ctx.save();
      ctx.globalAlpha = dim(node.id) ? 0.15 : 1;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
      ctx.fillStyle =
        node.kind === 'ghost' ? palette.ghost : colors.get(node.id) ?? palette.node;
      ctx.fill();
      ctx.lineWidth = node.kind === 'ghost' ? 1.5 : 1;
      ctx.strokeStyle =
        node.kind === 'ghost'
          ? palette.ghostRing
          : isHovered
            ? palette.label
            : palette.nodeRing;
      if (node.kind === 'ghost') ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      if (labelAlpha > 0.02 || isHovered) {
        ctx.globalAlpha = Math.max(dim(node.id) ? 0.1 : 0, isHovered ? 1 : labelAlpha);
        ctx.fillStyle = isHovered ? palette.label : palette.labelDim;
        ctx.font = `${Math.max(10, 11 * Math.min(1.4, viewport.scale))}px system-ui, -apple-system, sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(nodeLabel(node), screen.x + radius + 4, screen.y);
      }
      ctx.restore();
    }
  }, [
    visibleNodes,
    visibleEdges,
    positions,
    viewport,
    size,
    display,
    colors,
    highlight,
    hoveredId,
    selectedId,
    normalizeZoom,
    screenOf,
    palette,
  ]);

  // ------------------------------------------------------------- 交互
  const zoomAt = useCallback((factor: number, cx: number, cy: number) => {
    setViewport((current) => {
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, current.scale * factor));
      const ratio = scale / current.scale;
      return {
        scale,
        offsetX: cx - (cx - current.offsetX) * ratio,
        offsetY: cy - (cy - current.offsetY) * ratio,
      };
    });
  }, []);

  const localPoint = (event: React.PointerEvent | React.MouseEvent | React.WheelEvent) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    setMenu(null);
    const point = localPoint(event);
    const node = pickNode(point.x, point.y);
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    if (node) {
      dragRef.current = { mode: 'node', nodeId: node.id };
      setDragged({ nodeId: node.id, position: positions.get(node.id) ?? { x: 0, y: 0 } });
      setSelectedId(node.id);
    } else {
      dragRef.current = { mode: 'pan', lastX: event.clientX, lastY: event.clientY };
      setSelectedId(null);
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const point = localPoint(event);
    const drag = dragRef.current;
    if (drag?.mode === 'pan') {
      const dx = event.clientX - drag.lastX;
      const dy = event.clientY - drag.lastY;
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      setViewport((current) => ({
        ...current,
        offsetX: current.offsetX + dx,
        offsetY: current.offsetY + dy,
      }));
      return;
    }
    if (drag?.mode === 'node') {
      const world = screenToWorld(point.x, point.y, viewport);
      setDragged({ nodeId: drag.nodeId, position: world });
      return;
    }
    const node = pickNode(point.x, point.y);
    setHoveredId(node?.id ?? null);
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
    if (drag?.mode === 'node') {
      // 松开后按当前 Forces 重新收敛（把被拖节点钉在新位置）
      setDragged((current) => current);
      return;
    }
  };

  const onClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (dragRef.current) return;
    const point = localPoint(event);
    const node = pickNode(point.x, point.y);
    if (!node) return;
    onActivate(node);
  };

  const onContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    const point = localPoint(event);
    const node = pickNode(point.x, point.y);
    if (!node) return;
    event.preventDefault();
    setMenu({ x: point.x, y: point.y, node });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 90 : 28;
    const pan = (dx: number, dy: number) => {
      event.preventDefault();
      setViewport((current) => ({
        ...current,
        offsetX: current.offsetX + dx,
        offsetY: current.offsetY + dy,
      }));
    };
    switch (event.key) {
      case 'ArrowLeft':
        return pan(step, 0);
      case 'ArrowRight':
        return pan(-step, 0);
      case 'ArrowUp':
        return pan(0, step);
      case 'ArrowDown':
        return pan(0, -step);
      case '+':
      case '=':
        event.preventDefault();
        return zoomAt(1.2, size.width / 2, size.height / 2);
      case '-':
        event.preventDefault();
        return zoomAt(1 / 1.2, size.width / 2, size.height / 2);
      case 'Escape':
        return setMenu(null);
      default:
        return;
    }
  };

  const menuNode = menu?.node;
  const menuHref =
    menuNode && (menuNode.kind === 'note' || menuNode.kind === 'ghost')
      ? `${'/posts'}/${encodeURIComponent(menuNode.slug)}`
      : null;

  return (
    <div className="graph-canvas-wrap surface-l2">
      <div
        ref={containerRef}
        className="graph-canvas"
        style={{ height }}
        role="application"
        aria-label="知识图谱画布：可缩放、平移、拖拽节点"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setHoveredId(null)}
        onClick={onClick}
        onContextMenu={onContextMenu}
        onKeyDown={onKeyDown}
        onWheel={(event) => {
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          zoomAt(
            event.deltaY > 0 ? 1 / 1.12 : 1.12,
            event.clientX - rect.left,
            event.clientY - rect.top,
          );
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ width: size.width, height: size.height }}
          aria-hidden
        />
      </div>

      {menu && menuNode ? (
        <div
          className="graph-menu"
          style={{ left: menu.x, top: menu.y }}
          role="menu"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenu(null);
              onActivate(menuNode);
            }}
          >
            打开
          </button>
          {menuHref ? (
            <a role="menuitem" href={menuHref} target="_blank" rel="noreferrer">
              在新标签打开
            </a>
          ) : null}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenu(null);
              const target = menuHref
                ? `${window.location.origin}${menuHref}`
                : nodeLabel(menuNode);
              void navigator.clipboard?.writeText(target);
            }}
          >
            复制链接
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenu(null);
              setSelectedId(menuNode.id);
              onIsolate?.(menuNode);
            }}
          >
            只看它的局部图
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenu(null);
              onFilterFrom?.(menuNode);
            }}
          >
            以它为起点筛选
          </button>
        </div>
      ) : null}
    </div>
  );
}
