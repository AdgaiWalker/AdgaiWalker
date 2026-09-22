/**
 * 关系图谱设置面板 —— 四组小节名与每一项文案**逐字取自 Obsidian 官方中文词条**
 * （`obsidian.asar` → `i18n/zh.txt`，行号见 obsidian/labels.ts）。
 *
 * 小节顺序照官方布局：筛选 → 颜色组 → 外观 → 力度（局部图模式多一组「局部关系图」）。
 * 官方「颜色组」的交互是「点击可更改颜色 · 拖动可对颜色组排序」，故这里是取色器 + 拖拽排序。
 */
import { useState } from 'react';
import { Plus, RotateCcw, X } from 'lucide-react';
import {
  DISPLAY_RANGES,
  FORCE_RANGES,
  LOCAL_DEPTH_RANGE,
  repelEngineToUi,
  repelUiToEngine,
} from './obsidian/constants';
import {
  GRAPH_ZH_ANIMATE,
  GRAPH_ZH_DISPLAY,
  GRAPH_ZH_FILTERS,
  GRAPH_ZH_FORCES,
  GRAPH_ZH_GROUPS,
  GRAPH_ZH_LOCAL,
  GRAPH_ZH_RESTORE,
  GRAPH_ZH_TITLE,
} from './obsidian/labels';
import {
  nextGroupColor,
  type GraphForceSettings,
  type GraphGroup,
  type GraphQueryHelp,
  type GraphSettings,
} from './graph-view-model';

type Props = {
  settings: GraphSettings;
  onChange: (next: GraphSettings) => void;
  onRestore: () => void;
  queryError: string | null;
  nodeCount: number;
  edgeCount: number;
  /** 本次可用检索式（各领域能用的操作符不同，只列真的能用的） */
  queryHelp: GraphQueryHelp;
  /** 局部关系图模式：多出「局部关系图」一组（深度 / 方向 / 其他节点间的链接） */
  showLocal?: boolean;
  /** 官方「播放关系图谱生长动画」 */
  onAnimate?: () => void;
  animating?: boolean;
};

function Toggle({
  label,
  tooltip,
  checked,
  onChange,
}: {
  label: string;
  tooltip?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="graph-toggle" title={tooltip}>
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

function Slider({
  label,
  tooltip,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  tooltip?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="graph-slider" title={tooltip}>
      <span className="graph-slider-head">
        <span>{label}</span>
        <span className="meta">{display ?? Number(value.toFixed(2))}</span>
      </span>
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

function Section({
  title,
  children,
  open = true,
}: {
  title: string;
  children: React.ReactNode;
  open?: boolean;
}) {
  return (
    <details className="graph-settings-group" open={open}>
      <summary>{title}</summary>
      <div className="graph-settings-body">{children}</div>
    </details>
  );
}

export function GraphSettingsPanel({
  settings,
  onChange,
  onRestore,
  queryError,
  nodeCount,
  edgeCount,
  queryHelp,
  showLocal = false,
  onAnimate,
  animating = false,
}: Props) {
  const { filters, groups, display, forces, local } = settings;
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const patch = (partial: Partial<GraphSettings>) => onChange({ ...settings, ...partial });
  const patchForces = (partial: Partial<GraphForceSettings>) =>
    onChange({ ...settings, forces: { ...forces, ...partial } });
  const patchLocal = (partial: Partial<GraphSettings['local']>) =>
    onChange({ ...settings, local: { ...local, ...partial } });

  const updateGroup = (id: string, partial: Partial<GraphGroup>) =>
    onChange({
      ...settings,
      groups: groups.map((group) => (group.id === id ? { ...group, ...partial } : group)),
    });

  const moveGroup = (from: number, to: number) => {
    if (to < 0 || to >= groups.length || from === to) return;
    const next = groups.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    onChange({ ...settings, groups: next });
  };

  const repelUi = repelEngineToUi(forces.repelStrength);

  return (
    <aside className="graph-settings" aria-label={GRAPH_ZH_TITLE}>
      <header className="graph-settings-head">
        <h2>{GRAPH_ZH_TITLE}</h2>
        <button
          type="button"
          className="graph-restore"
          onClick={onRestore}
          title={GRAPH_ZH_RESTORE}
        >
          <RotateCcw size={13} aria-hidden />
          {GRAPH_ZH_RESTORE}
        </button>
      </header>
      <p className="meta">
        {nodeCount} 个节点 · {edgeCount} 条边
      </p>

      {showLocal ? (
        <Section title="局部关系图">
          <Slider
            label={GRAPH_ZH_LOCAL.depth}
            tooltip={GRAPH_ZH_LOCAL.depthTooltip}
            value={local.depth}
            {...LOCAL_DEPTH_RANGE}
            onChange={(value) => patchLocal({ depth: value })}
          />
          <Toggle
            label={GRAPH_ZH_LOCAL.interlinks}
            tooltip={GRAPH_ZH_LOCAL.interlinksTooltip}
            checked={local.interlinks}
            onChange={(value) => patchLocal({ interlinks: value })}
          />
          <Toggle
            label={GRAPH_ZH_LOCAL.forelinks}
            tooltip={GRAPH_ZH_LOCAL.forelinksTooltip}
            checked={local.forelinks}
            onChange={(value) => patchLocal({ forelinks: value })}
          />
          <Toggle
            label={GRAPH_ZH_LOCAL.backlinks}
            tooltip={GRAPH_ZH_LOCAL.backlinksTooltip}
            checked={local.backlinks}
            onChange={(value) => patchLocal({ backlinks: value })}
          />
        </Section>
      ) : null}

      <Section title={GRAPH_ZH_FILTERS.section}>
        <label className="graph-search">
          <input
            type="search"
            value={filters.search}
            placeholder={GRAPH_ZH_FILTERS.search}
            aria-label={GRAPH_ZH_FILTERS.search}
            onChange={(event) =>
              patch({ filters: { ...filters, search: event.target.value } })
            }
          />
        </label>
        {queryError ? (
          <p className="graph-query-error" role="status">
            查询语法错误：{queryError}（已按不过滤显示）
          </p>
        ) : null}
        <Toggle
          label={GRAPH_ZH_FILTERS.tags}
          tooltip={GRAPH_ZH_FILTERS.tagsTooltip}
          checked={filters.tags}
          onChange={(value) => patch({ filters: { ...filters, tags: value } })}
        />
        <Toggle
          label={GRAPH_ZH_FILTERS.attachments}
          tooltip={GRAPH_ZH_FILTERS.attachmentsTooltip}
          checked={filters.attachments}
          onChange={(value) => patch({ filters: { ...filters, attachments: value } })}
        />
        <Toggle
          label={GRAPH_ZH_FILTERS.existingFilesOnly}
          tooltip={GRAPH_ZH_FILTERS.existingFilesOnlyTooltip}
          checked={filters.existingFilesOnly}
          onChange={(value) =>
            patch({ filters: { ...filters, existingFilesOnly: value } })
          }
        />
        <Toggle
          label={GRAPH_ZH_FILTERS.orphans}
          tooltip={GRAPH_ZH_FILTERS.orphansTooltip}
          checked={filters.orphans}
          onChange={(value) => patch({ filters: { ...filters, orphans: value } })}
        />
        <details className="graph-query-help">
          <summary className="meta">支持的检索式</summary>
          <ul>
            {queryHelp.map((entry) => (
              <li key={entry.syntax}>
                <code>{entry.syntax}</code>
                <span className="meta">{entry.description}</span>
              </li>
            ))}
          </ul>
        </details>
      </Section>

      <Section title={GRAPH_ZH_GROUPS.section}>
        <p className="meta">{GRAPH_ZH_GROUPS.hint.replace('\n', ' · ')}</p>
        {groups.length === 0 ? <p className="meta">还没有颜色组。</p> : null}
        <ul className="graph-groups">
          {groups.map((group, index) => (
            <li
              key={group.id}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (dragIndex !== null) moveGroup(dragIndex, index);
                setDragIndex(null);
              }}
            >
              <input
                type="color"
                value={group.color}
                aria-label={GRAPH_ZH_GROUPS.hint.split('\n')[0]}
                title={GRAPH_ZH_GROUPS.hint.replace('\n', '；')}
                onChange={(event) => updateGroup(group.id, { color: event.target.value })}
              />
              <input
                type="text"
                value={group.query}
                placeholder={GRAPH_ZH_GROUPS.searchPlaceholder}
                aria-label={GRAPH_ZH_GROUPS.searchPlaceholder}
                onChange={(event) => updateGroup(group.id, { query: event.target.value })}
              />
              <button
                type="button"
                title={GRAPH_ZH_GROUPS.delete}
                aria-label={GRAPH_ZH_GROUPS.delete}
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
        <button
          type="button"
          className="graph-add-group"
          onClick={() =>
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
            })
          }
        >
          <Plus size={13} aria-hidden />
          {GRAPH_ZH_GROUPS.create}
        </button>
      </Section>

      <Section title={GRAPH_ZH_DISPLAY.section}>
        <Toggle
          label={GRAPH_ZH_DISPLAY.arrows}
          tooltip={GRAPH_ZH_DISPLAY.arrowsTooltip}
          checked={display.showArrow}
          onChange={(value) => patch({ display: { ...display, showArrow: value } })}
        />
        <Slider
          label={GRAPH_ZH_DISPLAY.textFade}
          value={display.textFadeMultiplier}
          {...DISPLAY_RANGES.textFadeMultiplier}
          onChange={(value) =>
            patch({ display: { ...display, textFadeMultiplier: value } })
          }
        />
        <Slider
          label={GRAPH_ZH_DISPLAY.nodeSize}
          value={display.nodeSizeMultiplier}
          {...DISPLAY_RANGES.nodeSizeMultiplier}
          onChange={(value) =>
            patch({ display: { ...display, nodeSizeMultiplier: value } })
          }
        />
        <Slider
          label={GRAPH_ZH_DISPLAY.linkThickness}
          value={display.lineSizeMultiplier}
          {...DISPLAY_RANGES.lineSizeMultiplier}
          onChange={(value) =>
            patch({ display: { ...display, lineSizeMultiplier: value } })
          }
        />
        {onAnimate ? (
          <button
            type="button"
            className="graph-animate"
            onClick={onAnimate}
            aria-pressed={animating}
            title={GRAPH_ZH_ANIMATE.play}
          >
            {animating ? '停止动画' : GRAPH_ZH_ANIMATE.button}
          </button>
        ) : null}
      </Section>

      <Section title={GRAPH_ZH_FORCES.section}>
        <Slider
          label={GRAPH_ZH_FORCES.centerForce}
          value={forces.centerStrength}
          {...FORCE_RANGES.centerStrength}
          onChange={(value) => patchForces({ centerStrength: value })}
        />
        <Slider
          label={GRAPH_ZH_FORCES.repelForce}
          value={repelUi}
          {...FORCE_RANGES.repelStrength}
          display={repelUi.toFixed(2)}
          onChange={(value) => patchForces({ repelStrength: repelUiToEngine(value) })}
        />
        <Slider
          label={GRAPH_ZH_FORCES.linkForce}
          value={forces.linkStrength}
          {...FORCE_RANGES.linkStrength}
          onChange={(value) => patchForces({ linkStrength: value })}
        />
        <Slider
          label={GRAPH_ZH_FORCES.linkDistance}
          value={forces.linkDistance}
          {...FORCE_RANGES.linkDistance}
          onChange={(value) => patchForces({ linkDistance: value })}
        />
      </Section>
    </aside>
  );
}
