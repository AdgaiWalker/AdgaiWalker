/**
 * 知识图谱组件 —— 组合画布 + 四组设置，供全局图（/graph）与局部图（文章页）复用。
 *
 * 与 Obsidian 的对应：全局图 = 全库；局部图 = 当前笔记 + Depth 层邻居，
 * 两者用**同一套** Filters / Groups / Display / Forces（PRD §3.6）。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, X } from 'lucide-react';
import {
  graphNeighbors,
  type GraphNode,
  type KnowledgeGraph as KnowledgeGraphData,
} from '@walker/shared';
import { GraphCanvas } from './GraphCanvas';
import { GraphSettingsPanel } from './GraphSettingsPanel';
import {
  animateOrder,
  applyGraphSettings,
  createDefaultGraphSettings,
  graphQueryDoc,
  type GraphSettings,
} from './graph-view-model';

type Props = {
  graph: KnowledgeGraphData;
  bodies: Record<string, string>;
  browsePath: string;
  height?: number;
  /** 局部图模式：以 centerId 为中心、depth 层邻居（Depth 滑块照抄 Obsidian） */
  local?: {
    centerId: string;
    initialDepth?: number;
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
  };
}

export function KnowledgeGraph({
  graph,
  bodies,
  browsePath,
  height = 560,
  local,
  initialSettings,
  compact = false,
}: Props) {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<GraphSettings>(() =>
    mergeSettings(initialSettings),
  );
  const [depth, setDepth] = useState(local?.initialDepth ?? 1);
  const [isolateId, setIsolateId] = useState<string | null>(null);
  const [revealProgress, setRevealProgress] = useState<number | null>(null);
  const frameRef = useRef(0);

  // 局部图 / 右键「只看它的局部图」都收敛成同一件事：换一个可见子图
  const baseGraph = useMemo(() => {
    if (local) {
      const hood = graphNeighbors(graph, local.centerId, depth);
      return { ...graph, nodes: hood.nodes, edges: hood.edges };
    }
    if (isolateId) {
      const hood = graphNeighbors(graph, isolateId, 1);
      return { ...graph, nodes: hood.nodes, edges: hood.edges };
    }
    return graph;
  }, [graph, local, depth, isolateId]);

  const view = useMemo(
    () => applyGraphSettings(baseGraph, settings, bodies),
    [baseGraph, settings, bodies],
  );

  const order = useMemo(() => animateOrder(view.nodes), [view.nodes]);

  // Animate：按 created 顺序让笔记依次出现（标签/附件始终可见，避免结尾跳变）
  useEffect(() => {
    if (revealProgress === null) return;
    const startedAt = performance.now();
    const duration = Math.max(1200, order.length * 90);
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      if (progress >= 1) {
        setRevealProgress(null);
        return;
      }
      setRevealProgress(progress);
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [revealProgress === null ? 'idle' : 'run', order.length]);

  const revealIds = useMemo(() => {
    if (revealProgress === null) return null;
    const shown = Math.max(1, Math.round(revealProgress * order.length));
    const ids = new Set(order.slice(0, shown).map((node) => node.id));
    for (const node of view.nodes) if (node.kind !== 'note') ids.add(node.id);
    return ids;
  }, [revealProgress, order, view.nodes]);

  const handleActivate = (node: GraphNode) => {
    if (node.kind === 'note' || node.kind === 'ghost') {
      navigate(`${browsePath}/${encodeURIComponent(node.slug)}`);
      return;
    }
    // 标签节点：把它写进搜索框（等价于 Obsidian 点开标签）
    if (node.kind === 'tag') {
      setSettings((current) => ({
        ...current,
        filters: { ...current.filters, search: `tag:#${node.tag}` },
      }));
      return;
    }
    setSettings((current) => ({
      ...current,
      filters: { ...current.filters, search: fileName(node.path) },
    }));
  };

  return (
    <div className={`knowledge-graph${compact ? ' is-compact' : ''}`}>
      <div className="graph-stage">
        <GraphCanvas
          nodes={view.nodes}
          edges={view.edges}
          colors={view.colors}
          display={settings.display}
          forces={settings.forces}
          seed={graph.seed}
          height={height}
          revealIds={revealIds}
          onActivate={handleActivate}
          onIsolate={(node) => {
            if (local) return;
            setIsolateId(node.id);
          }}
          onFilterFrom={(node) => {
            const doc = graphQueryDoc(node, bodies[node.kind === 'note' ? node.slug : ''] ?? '');
            const query =
              node.kind === 'tag'
                ? `tag:#${node.tag}`
                : node.kind === 'attachment'
                  ? fileName(node.path)
                  : doc.slug;
            setSettings((current) => ({
              ...current,
              filters: { ...current.filters, search: query },
            }));
          }}
        />

        <div className="graph-toolbar">
          <button
            type="button"
            className="graph-animate"
            onClick={() => setRevealProgress(0)}
          >
            <Play size={13} aria-hidden />
            时间流逝
          </button>
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
        {local ? (
          <label className="graph-depth">
            <span className="graph-slider-head">
              <span>深度</span>
              <span className="meta">{depth}</span>
            </span>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={depth}
              onChange={(event) => setDepth(Number(event.target.value))}
            />
          </label>
        ) : null}

        <GraphSettingsPanel
          settings={settings}
          onChange={setSettings}
          onRestore={() => setSettings(createDefaultGraphSettings())}
          queryError={view.queryError}
          nodeCount={view.nodes.length}
          edgeCount={view.edges.length}
        />
      </div>
    </div>
  );
}

function fileName(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] ?? path;
}
