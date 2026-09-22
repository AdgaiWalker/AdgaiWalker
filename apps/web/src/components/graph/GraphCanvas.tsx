/**
 * 图谱画布 —— Obsidian 图谱引擎的 React 宿主。
 *
 * 物理与渲染全部交给 `obsidian/engine.ts`（按 Obsidian 原始 worker 与
 * graph-reconstructed.js 的规格重写）；本组件只负责：把视图模型推导出的节点/边
 * 交给引擎、把设置变化同步给引擎、把引擎回调翻译成路由动作与右键菜单。
 *
 * 权威：docs/PRD-KNOWLEDGE-GRAPH.md
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { GraphEngine, type EngineForces } from './obsidian/engine';
import {
  DEFAULT_RENDER_PALETTE,
  type RenderPalette,
} from './obsidian/renderer';
import type { GraphColorKey } from './obsidian/constants';
import type {
  GraphDisplay,
  GraphNodeView,
  GraphSettings,
  GraphViewEdge,
  GraphViewNode,
} from './graph-view-model';

type Props<Node extends GraphViewNode> = {
  nodes: readonly Node[];
  edges: readonly GraphViewEdge[];
  /** 命中颜色组的节点 → 颜色；未命中的用该节点的类型语义色 */
  colors: Map<string, string>;
  /** 节点怎么称呼、点了去哪、复制什么（领域差异，见 domains.ts） */
  nodeView: GraphNodeView<Node>;
  display: GraphDisplay;
  forces: GraphSettings['forces'];
  seed: number;
  height?: number;
  /**
   * Animate：要依次淡入的节点 id 顺序；null 表示不播放。
   * 时钟由引擎持有，这里只把顺序交出去一次，**不逐帧驱动**。
   */
  revealOrder?: readonly string[] | null;
  /** 生长动画走完时通知宿主还原按钮 */
  onRevealDone?: () => void;
  onActivate: (node: Node) => void;
  /** 右键菜单「只看它的局部图」 */
  onIsolate?: (node: Node) => void;
  /** 右键菜单「以它为起点筛选」 */
  onFilterFrom?: (node: Node) => void;
};

/** 设置面板的力参数 → 引擎参数（字段一一对应，PRD §3.4） */
function toEngineForces(forces: GraphSettings['forces']): EngineForces {
  return {
    centerStrength: forces.centerStrength,
    linkStrength: forces.linkStrength,
    linkDistance: forces.linkDistance,
    repelStrength: forces.repelStrength,
  };
}

/**
 * 配色从 CSS 变量读（单一来源在样式表，深浅主题各自覆盖）。
 * 不这么做的话，Obsidian 首页的深色配色（白节点/浅字）在浅色主题下会看不见。
 */
/** CSS 变量名 ↔ 应用语义配色键（与 app.css 的 `--graph-*` 一一对应） */
const PALETTE_VARS: Record<GraphColorKey, string> = {
  fill: '--graph-node',
  fillFocused: '--graph-node-focused',
  fillTag: '--graph-node-tag',
  fillAttachment: '--graph-node-attachment',
  fillUnresolved: '--graph-node-unresolved',
  line: '--graph-line',
  lineHighlight: '--graph-line-highlight',
  fillHighlight: '--graph-fill-highlight',
  arrow: '--graph-arrow',
  text: '--graph-text',
  circle: '--graph-circle',
};

function readPalette(element: HTMLElement): RenderPalette {
  const styles = getComputedStyle(element);
  const palette = {} as RenderPalette;
  for (const [key, cssVar] of Object.entries(PALETTE_VARS) as Array<
    [GraphColorKey, string]
  >) {
    palette[key] =
      styles.getPropertyValue(cssVar).trim() || DEFAULT_RENDER_PALETTE[key];
  }
  return palette;
}

export function GraphCanvas<Node extends GraphViewNode>({
  nodes,
  edges,
  colors,
  nodeView,
  display,
  forces,
  seed,
  height = 560,
  revealOrder = null,
  onRevealDone,
  onActivate,
  onIsolate,
  onFilterFrom,
}: Props<Node>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GraphEngine | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; node: Node } | null>(null);
  const latestNodes = useRef(nodes);
  latestNodes.current = nodes;
  const latestRevealDone = useRef(onRevealDone);
  latestRevealDone.current = onRevealDone;
  const latestNodeView = useRef(nodeView);
  latestNodeView.current = nodeView;

  // 引擎生命周期（容器/画布就绪后创建一次）
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const engine = new GraphEngine(container, canvas, {
      seed,
      // 配色在这里就给到引擎：本 effect 是被动副作用，而下面读配色的 effect 是布局副作用，
      // 布局副作用**先于**被动副作用执行——若把首次配色放在那里，engineRef 还是 null，
      // setPalette 会空转，画布只能退回引擎默认的深色板（浅色主题下标签等于隐形）。
      palette: readPalette(container),
      onActivate: (id) => {
        const node = latestNodes.current.find((entry) => entry.id === id);
        if (node) onActivate(node);
      },
      onContext: (id, cssX, cssY) => {
        const node = latestNodes.current.find((entry) => entry.id === id);
        if (node) setMenu({ x: cssX, y: cssY, node });
      },
      onRevealDone: () => latestRevealDone.current?.(),
    });
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
    // onActivate 通过 ref 取最新值，不参与依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  useEffect(() => {
    engineRef.current?.setData({
      nodes: nodes.map((node) => ({
        id: node.id,
        label: latestNodeView.current.label(node),
        kind: node.kind,
        // 空字符串表示「用该类型的语义色」（引擎按 kind 取 fill/fillTag/…）；
        // 颜色组命中时才给组色（应用优先级：分组色 > 类型色）
        color: colors.get(node.id) ?? '',
      })),
      links: edges.map((edge) => [edge.source, edge.target] as [string, string]),
    });
    // nodeView 按 ref 取最新值（它每次渲染都是新对象，入依赖会每帧重建数据）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, colors]);

  // Animate：只把顺序交出一次，时间轴留在引擎里 —— 不逐帧 setState
  useEffect(() => {
    engineRef.current?.setReveal(revealOrder);
  }, [revealOrder]);

  useEffect(() => {
    engineRef.current?.setForces(toEngineForces(forces));
  }, [forces]);

  // 主题切换时重新读配色（首次配色由上面的构造参数负责，这里只管变化）
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    engineRef.current?.setPalette(readPalette(container));
    if (typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(() =>
      engineRef.current?.setPalette(readPalette(container)),
    );
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class'],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    engineRef.current?.setRenderOptions({
      textFadeMultiplier: display.textFadeMultiplier,
      nodeSizeMultiplier: display.nodeSizeMultiplier,
      lineSizeMultiplier: display.lineSizeMultiplier,
      showArrow: display.showArrow,
    });
  }, [
    display.textFadeMultiplier,
    display.nodeSizeMultiplier,
    display.lineSizeMultiplier,
    display.showArrow,
  ]);

  const menuHref = menu ? nodeView.href(menu.node) : null;
  /** 复制链接：优先领域给的文本（代码图谱复制仓库路径），否则按地址，再否则按标签 */
  const copyText = menu
    ? (nodeView.copyText?.(menu.node) ?? nodeView.href(menu.node) ?? nodeView.label(menu.node))
    : '';

  return (
    <div className="graph-canvas-wrap surface-l2">
      <div ref={containerRef} className="graph-canvas" style={{ height }}>
        <canvas ref={canvasRef} aria-hidden />
      </div>

      {menu ? (
        <div className="graph-menu" style={{ left: menu.x, top: menu.y }} role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenu(null);
              onActivate(menu.node);
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
              // 站内页面复制绝对地址（方便分享）；没有站内页面的则复制领域给的文本
              const target = menuHref ? `${window.location.origin}${menuHref}` : copyText;
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
              onIsolate?.(menu.node);
            }}
          >
            只看它的局部图
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenu(null);
              onFilterFrom?.(menu.node);
            }}
          >
            以它为起点筛选
          </button>
          <button type="button" role="menuitem" onClick={() => setMenu(null)}>
            关闭
          </button>
        </div>
      ) : null}
    </div>
  );
}
