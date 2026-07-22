/**
 * 资源分区图标（展示层）
 */
import {
  Bot,
  Heart,
  Server,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { ToolsSectionIconKey } from './tools-sections';

const MAP: Record<ToolsSectionIconKey, LucideIcon> = {
  users: Users,
  bot: Bot,
  zap: Zap,
  server: Server,
  heart: Heart,
};

export function toolsSectionIcon(key: ToolsSectionIconKey): LucideIcon {
  return MAP[key];
}
