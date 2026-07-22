/**
 * 空间图标映射（展示层）
 * 职责：SpaceIconKey → Lucide 组件；配置层只存字符串键。
 */
import {
  BookOpen,
  FolderKanban,
  GraduationCap,
  LayoutGrid,
  Lightbulb,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { SpaceIconKey } from './content-spaces';

const MAP: Record<SpaceIconKey, LucideIcon> = {
  'layout-grid': LayoutGrid,
  'book-open': BookOpen,
  lightbulb: Lightbulb,
  'folder-kanban': FolderKanban,
  'graduation-cap': GraduationCap,
  wrench: Wrench,
};

export function spaceIcon(key: SpaceIconKey): LucideIcon {
  return MAP[key];
}
