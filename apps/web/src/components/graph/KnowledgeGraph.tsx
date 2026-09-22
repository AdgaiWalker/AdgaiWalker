/**
 * 图谱组件 —— 组合画布 + 四组设置。**领域无关**：只认 `GraphDomain`。
 *
 * 同一个组件驱动两处（v1.5 起）：
 * - 内容图谱：`/graph` 全库图 + 文章页局部图（领域见 domains.createContentGraphDomain）
 * - 代码结构图谱：`/architecture`（领域见 domains.createCodeGraphDomain）
 *
 * 与 Obsidian 的对应：全局图 = 全库；局部图 = 当前节点 + Depth 层邻居，
 * 两者用**同一套** Filters / Groups / Display / Forces（PRD §3.6）。
 */
import { useCallback, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { GraphCanvas } from './GraphCanvas';
import { GraphSettingsPanel } from './GraphSettingsPanel';
import {
  createDefaultGraphSettings,
  localNeighborhood,
  applyGraphSettings,
  type GraphDomain,
  type GraphSettings,
  type GraphViewData,
  type GraphViewNode,
} from './graph-view-model';

type Props<Node extends GraphViewNode> = {
  graph: GraphViewData<Node>;
  domain: GraphDomain<Node>;
  height?: number;
  /** 局部图模式：以 centerId 为中心展开（深度与方向开关在设置面板里，照抄应用） */
  local?: {
    centerId: string;
  };
  /** 初始设置覆盖（如局部图默认关掉标签以免邻域被淹没） */
  initialSettings?: Partial<GraphSettings>;
  /** 关闭「设置」按钮等紧凑模式 */
  compact?: boolean;
};

function mergeSettings(initial?: Partial<GraphSettings>): GraphSettings {
  const base = createDefaultGraphSettings();
  if (!initial) return base;
  return {
    filters: { ...base.filters, ...initial.filters },
    groups: initial.groups ?? base.groups,
    display: { ...base.display, ...initial.display },
    forces: { ...base.forces, ...initial.forces },
    local: { ...base.local, ...initial.local },
  };
}

export function KnowledgeGraph<Node extends GraphViewNode>({
  graph,
  domain,
  height = 560,
  local,
  initialSettings,
  compact = false,
}: Props<Node>) {
  const [settings, setSettings] = useState<GraphSettings>(() =>
    mergeSettings(initialSettings),
  );
  const [isolateId, setIsolateId] = useState<string | null>(null);
  /** Animate：要依次淡入的节点顺序；null = 未播放。时钟在引擎里，这里只记「是否在播」 */
  const [revealOrder, setRevealOrder] = useState<string[] | null>(null);

  const setSearch = useCallback((search: string) => {
    setSettings((current) => ({
      ...current,
      filters: { ...current.filters, search },
    }));
  }, []);
  const activateOps = useMemo(() => ({ setSearch }), [setSearch]);

  // 局部图 / 右键「只看它的局部图」都收敛成同一件事：换一个可见子图
  const baseGraph = useMemo<GraphViewData<Node>>(() => {
    if (local) {
      const hood = localNeighborhood(graph, local.centerId, settings.local);
      return { ...graph, nodes: hood.nodes, edges: hood.edges };
    }
    if (isolateId) {
      const hood = localNeighborhood(graph, isolateId, { ...settings.local, depth: 1 });
      return { ...graph, nodes: hood.nodes, edges: hood.edges };
    }
    return graph;
  }, [graph, local, isolateId, settings.local]);

  const view = useMemo(
    () => applyGraphSettings(baseGraph, settings, domain),
    [baseGraph, settings, domain],
  );

  /**
   * Animate 的出场顺序（内容图谱按 `created`，代码图谱按 git 首次提交时间，同理）。
   * 时间轴交给引擎：这里只产出**一次**顺序，不逐帧 setState ——
   * 否则每帧 setState 会让 setData 每秒重跑 60 次并重启模拟。
   */
  const order = useMemo(() => domain.order(view.nodes), [domain, view.nodes]);

  return (
    <div className={`knowledge-graph${compact ? ' is-compact' : ''}`}>
      <div className="graph-stage">
        <GraphCanvas
          nodes={view.nodes}
          edges={view.edges}
          colors={view.colors}
          nodeView={domain}
          display={settings.display}
          forces={settings.forces}
          seed={graph.seed}
          height={height}
          revealOrder={revealOrder}
          onRevealDone={() => setRevealOrder(null)}
          onActivate={(node) => domain.activate(node, activateOps)}
          onIsolate={(node) => {
            if (local) return;
            setIsolateId(node.id);
          }}
          onFilterFrom={(node) => domain.filterFrom(node, activateOps)}
        />

        <div className="graph-toolbar">
          {isolateId ? (
            <button
              type="button"
              className="graph-exit-isolate"
              onClick={() => setIsolateId(null)}
            >
              <X size={13} aria-hidden />
              退出局部视图
            </button>
          ) : null}
        </div>
      </div>

      <div className="graph-side">
        <GraphSettingsPanel
          settings={settings}
          onChange={setSettings}
          onRestore={() => setSettings(createDefaultGraphSettings())}
          queryError={view.queryError}
          nodeCount={view.nodes.length}
          edgeCount={view.edges.length}
          queryHelp={domain.queryHelp}
          showLocal={Boolean(local)}
          onAnimate={() =>
            setRevealOrder((current) =>
              current ? null : order.map((node) => node.id),
            )
          }
          animating={revealOrder !== null}
        />
      </div>
    </div>
  );
}
