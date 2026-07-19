export type BlockWidth = 'full' | 'normal' | 'narrow';

export const BLOCK_WIDTHS: BlockWidth[] = ['full', 'normal', 'narrow'];

/** 阅读布局模板：沉浸式（单栏居中）或媒体型（双栏：主内容 + 右侧推荐） */
export type ReadingLayout = 'immersive' | 'media';

/**
 * 解析阅读布局模板。优先读 frontmatter 的 layout 字段（创作者显式选择），
 * 没有则回退到 form 字段映射（video/gallery 走 media，其余 immersive）。
 */
export function resolveLayout(layout?: string, form?: string): ReadingLayout {
  if (layout === 'media' || layout === 'immersive') return layout;
  switch (form) {
    case 'video':
    case 'gallery':
    case 'project':
    case 'calligraphy':
      return 'media';
    default:
      return 'immersive';
  }
}

/**
 * 内容标签：根据 form + intent 组合返回 emoji 和中文标签，
 * 让读者 3 秒判断「这篇跟我有没有关系」。
 */
export function getContentLabel(form?: string, intent?: string): { emoji: string; label: string } {
  // form + intent combination rules
  if (form === 'idea') return { emoji: '💡', label: '半成品点子' };
  if (form === 'diary') return { emoji: '📖', label: '生活记录' };
  if (form === 'recipe') return { emoji: '🍳', label: '食谱' };
  if (form === 'calligraphy') return { emoji: '✍️', label: '书法' };
  if (form === 'video') return { emoji: '🎬', label: '视频' };
  if (form === 'gallery') return { emoji: '🖼️', label: '图集' };
  if (form === 'resource') return { emoji: '🔗', label: '资源' };
  if (form === 'project') return { emoji: '🚀', label: '项目' };
  if (form === 'lesson') return { emoji: '📚', label: '学习指南' };
  if (form === 'note') return { emoji: '🗒️', label: '随手记' };
  if (form === 'rant') return { emoji: '💭', label: '碎碎念' };
  // article with intent
  if (intent === 'teach') return { emoji: '📚', label: '教程' };
  if (intent === 'think') return { emoji: '📝', label: '个人思考' };
  if (intent === 'record') return { emoji: '📋', label: '记录' };
  if (intent === 'share') return { emoji: '📢', label: '分享' };
  if (intent === 'verify') return { emoji: '🧪', label: '验证' };
  if (intent === 'showcase') return { emoji: '✨', label: '作品展示' };
  if (intent === 'reflect') return { emoji: '🪞', label: '复盘' };
  if (intent === 'connect') return { emoji: '🤝', label: '连接' };
  if (intent === 'vent') return { emoji: '🌊', label: '宣泄' };
  return { emoji: '📄', label: '文章' };
}

/**
 * 领域标签：domain → 中文显示名。
 */
export function getDomainLabel(domain?: string): string | undefined {
  const map: Record<string, string> = {
    ai: 'AI', coding: '编程', product: '产品', philosophy: '哲学',
    life: '生活', cooking: '烹饪', calligraphy: '书法', reading: '阅读',
    travel: '旅行', emotion: '情绪', community: '社区',
  };
  return domain ? map[domain] : undefined;
}

/**
 * 状态符号：dot-universe 风格，用简洁的符号表示内容成熟度。
 */
export function getStatusSymbol(status?: string): { symbol: string; label: string } | undefined {
  switch (status) {
    case 'thinking': return { symbol: '•', label: '构思中' };
    case 'validating': return { symbol: '•  °', label: '验证中' };
    case 'building': return { symbol: '• °', label: '实现中' };
    case 'verified': return { symbol: '◉', label: '已完成' };
    case 'archived': return { symbol: '○', label: '已归档' };
    default: return undefined;
  }
}
