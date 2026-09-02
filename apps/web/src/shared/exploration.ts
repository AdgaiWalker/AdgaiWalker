/**
 * 探索规则（纯函数）
 * 点子 / 项目是明确的内容归属；状态只描述进度，不自动改变归属。
 */
import { WEB_ROUTES } from './routes';

export type ExplorationKind = 'idea' | 'project';
export type ExplorationView = 'all' | ExplorationKind;

export const EXPLORATION_VIEWS: readonly {
  id: ExplorationView;
  label: string;
}[] = [
  { id: 'all', label: '全部' },
  { id: 'idea', label: '点子' },
  { id: 'project', label: '项目' },
] as const;

export function parseExplorationView(raw: string | null): ExplorationView {
  return raw === 'idea' || raw === 'project' ? raw : 'all';
}

export function explorationKind(item: {
  type: string;
  status?: string;
}): ExplorationKind {
  return item.type === 'project' ? 'project' : 'idea';
}

export function matchesExplorationView(
  item: { type: string; status?: string },
  view: ExplorationView,
): boolean {
  return view === 'all' || explorationKind(item) === view;
}

export function explorationHref(view: ExplorationView = 'all'): string {
  return view === 'all'
    ? WEB_ROUTES.explore
    : `${WEB_ROUTES.explore}?view=${view}`;
}
