/**
 * 图谱设置面板 —— 四组照抄 Obsidian（Filters / Groups / Display / Forces + Restore default settings）。
 * 面板本身不含图数据逻辑：设置进、设置出（PRD §3.1–§3.4）。
 */
import { RotateCcw, Plus, X } from 'lucide-react';
import {
  GRAPH_LAYOUT_RANGES,
  type GraphLayoutParams,
} from '@walker/shared';
import {
  GRAPH_QUERY_HELP,
  nextGroupColor,
  type GraphGroup,
  type GraphSettings,
} from './graph-view-model';

type Props = {
  settings: GraphSettings;
  onChange: (next: GraphSettings) => void;
  onRestore: () => void;
  queryError: string | null;
  nodeCount: number;
  edgeCount: number;
};

function Toggle({
  label,
  checked,
  hint,
  onChange,
}: {
  label: string;
  checked: boolean;
  hint?: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="graph-toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
      {hint ? <em className="meta">{hint}</em> : null}
    </label>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  hint?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="graph-slider">
      <span className="graph-slider-head">
        <span>{label}</span>
        <span className="meta">{Number(value.toFixed(2))}</span>
      </span>
      {hint ? <em className="meta">{hint}</em> : null}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export function GraphSettingsPanel({
  settings,
  onChange,
  onRestore,
  queryError,
  nodeCount,
  edgeCount,
}: Props) {
  const { filters, groups, display, forces } = settings;

  const patch = (partial: Partial<GraphSettings>) =>
    onChange({ ...settings, ...partial });

  const patchForces = (partial: Partial<GraphLayoutParams>) =>
    onChange({ ...settings, forces: { ...forces, ...partial } });

  const updateGroup = (id: string, partial: Partial<GraphGroup>) =>
    onChange({
      ...settings,
      groups: groups.map((group) =>
        group.id === id ? { ...group, ...partial } : group,
      ),
    });

  const addGroup = () =>
    onChange({
      ...settings,
      groups: [
        ...groups,
        {
          id: `g${Date.now().toString(36)}${groups.length}`,
          query: '',
          color: nextGroupColor(groups),
        },
      ],
    });

  return (
    <aside className="graph-settings" aria-label="图谱设置">
      <header className="graph-settings-head">
        <h2>设置</h2>
        <button type="button" className="graph-restore" onClick={onRestore}>
          <RotateCcw size={13} aria-hidden />
          恢复默认设置
        </button>
      </header>
      <p className="meta">
        当前显示 {nodeCount} 个节点 · {edgeCount} 条边
      </p>

      <section className="graph-settings-group">
        <h3>过滤器</h3>
        <label className="graph-search">
          <span className="meta">搜索</span>
          <input
            type="search"
            value={filters.search}
            placeholder="tag:#AI · hall:showcase · series:Ferry"
            onChange={(event) => patch({ filters: { ...filters, search: event.target.value } })}
          />
        </label>
        {queryError ? (
          <p className="graph-query-error" role="status">
            查询语法错误：{queryError}（已按不过滤显示）
          </p>
        ) : null}
        <Toggle
          label="标签"
          checked={filters.tags}
          hint="标签作为节点"
          onChange={(value) => patch({ filters: { ...filters, tags: value } })}
        />
        <Toggle
          label="附件"
          checked={filters.attachments}
          hint="图片等非文章文件"
          onChange={(value) => patch({ filters: { ...filters, attachments: value } })}
        />
        <Toggle
          label="只显示已存在的文件"
          checked={filters.existingFilesOnly}
          hint="隐藏被引用但尚不存在的笔记"
          onChange={(value) =>
            patch({ filters: { ...filters, existingFilesOnly: value } })
          }
        />
        <Toggle
          label="孤立笔记"
          checked={filters.orphans}
          hint="没有任何连接的笔记"
          onChange={(value) => patch({ filters: { ...filters, orphans: value } })}
        />
        <details className="graph-query-help">
          <summary className="meta">支持的查询语法</summary>
          <ul>
            {GRAPH_QUERY_HELP.map((entry) => (
              <li key={entry.syntax}>
                <code>{entry.syntax}</code>
                <span className="meta">{entry.description}</span>
              </li>
            ))}
          </ul>
        </details>
      </section>

      <section className="graph-settings-group">
        <h3>分组</h3>
        {groups.length === 0 ? (
          <p className="meta">还没有分组。分组用颜色区分节点，列表越靠上优先级越高。</p>
        ) : null}
        <ul className="graph-groups">
          {groups.map((group) => (
            <li key={group.id}>
              <input
                type="color"
                value={group.color}
                aria-label="分组颜色"
                onChange={(event) => updateGroup(group.id, { color: event.target.value })}
              />
              <input
                type="text"
                value={group.query}
                placeholder="tag:#AI"
                aria-label="分组查询"
                onChange={(event) => updateGroup(group.id, { query: event.target.value })}
              />
              <button
                type="button"
                aria-label="删除分组"
                onClick={() =>
                  onChange({
                    ...settings,
                    groups: groups.filter((entry) => entry.id !== group.id),
                  })
                }
              >
                <X size={13} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="graph-add-group" onClick={addGroup}>
          <Plus size={13} aria-hidden />
          新建分组
        </button>
      </section>

      <section className="graph-settings-group">
        <h3>显示</h3>
        <Toggle
          label="箭头"
          checked={display.arrows}
          hint="显示链接方向"
          onChange={(value) => patch({ display: { ...display, arrows: value } })}
        />
        <Slider
          label="文字淡出阈值"
          value={display.textFadeThreshold}
          min={0}
          max={1}
          step={0.05}
          hint="越高，越需要放大才显示笔记名"
          onChange={(value) =>
            patch({ display: { ...display, textFadeThreshold: value } })
          }
        />
        <Slider
          label="节点大小"
          value={display.nodeSize}
          min={0.1}
          max={2}
          step={0.05}
          hint="圆圈尺寸的整体倍数（被引用越多仍越大）"
          onChange={(value) => patch({ display: { ...display, nodeSize: value } })}
        />
        <Slider
          label="连线粗细"
          value={display.linkThickness}
          min={0.1}
          max={1}
          step={0.05}
          onChange={(value) =>
            patch({ display: { ...display, linkThickness: value } })
          }
        />
      </section>

      <section className="graph-settings-group">
        <h3>力</h3>
        <Slider
          label="中心力"
          value={forces.centerForce}
          {...GRAPH_LAYOUT_RANGES.centerForce}
          hint="越高越紧凑、越接近圆形"
          onChange={(value) => patchForces({ centerForce: value })}
        />
        <Slider
          label="斥力"
          value={forces.repelForce}
          {...GRAPH_LAYOUT_RANGES.repelForce}
          hint="节点互相推开的强度"
          onChange={(value) => patchForces({ repelForce: value })}
        />
        <Slider
          label="链接力"
          value={forces.linkForce}
          {...GRAPH_LAYOUT_RANGES.linkForce}
          hint="连线的张力，像橡皮筋的松紧"
          onChange={(value) => patchForces({ linkForce: value })}
        />
        <Slider
          label="链接距离"
          value={forces.linkDistance}
          {...GRAPH_LAYOUT_RANGES.linkDistance}
          hint="连线之间的目标长度"
          onChange={(value) => patchForces({ linkDistance: value })}
        />
      </section>
    </aside>
  );
}
