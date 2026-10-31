/**
 * 社交媒体分享与跨平台同步助手（单一真相源 SSOT）
 *
 * 负责构建标准合法的 X (Twitter) Web Intent URL、精简推文内容与多平台复制格式。
 * 不依赖第三方外部 SDK，零配置、零凭据泄露风险。
 */

export type SocialShareAngle = 'overview' | 'quote' | 'practical';

export interface SocialShareAngleOption {
  id: SocialShareAngle;
  label: string;
  desc: string;
}

export const SOCIAL_SHARE_ANGLES: SocialShareAngleOption[] = [
  { id: 'overview', label: '速览概要', desc: '提炼全文结论与精炼摘要，适合首次发布与新篇速递' },
  { id: 'quote', label: '金句引用', desc: '提取核心犀利观点与金句，适合隔周二次引用' },
  { id: 'practical', label: '技巧避坑', desc: '提炼实战技巧与要点速查，适合结合痛点重复推广' },
];

export interface SocialShareRecord {
  id: string;
  slug: string;
  channel: string;
  angle?: string | null;
  note?: string | null;
  createdAt: string;
}

export interface ContentSocialStats {
  slug: string;
  shareCount: number;
  lastSharedAt: string | null;
  records: SocialShareRecord[];
}

export type AllContentSocialStats = Record<string, { shareCount: number; lastSharedAt: string | null }>;

export interface SocialSharePayload {
  title: string;
  slug: string;
  summary?: string | null;
  tags?: string[];
  siteBaseUrl?: string;
  angle?: SocialShareAngle;
  customText?: string;
}

export const DEFAULT_SITE_BASE_URL = 'https://www.iwalk.pro';
export const DEFAULT_SHARE_TAGS = ['Walker', 'AI'];

/**
 * 规范化生成文章的公网全路径 URL
 */
export function getPublicPostUrl(slug: string, siteBaseUrl = DEFAULT_SITE_BASE_URL): string {
  const cleanBase = siteBaseUrl.trim().replace(/\/+$/, '');
  const cleanSlug = encodeURIComponent(slug.trim());
  return `${cleanBase}/posts/${cleanSlug}`;
}

/**
 * 从原始 Markdown 文本中提取摘要（优先 frontmatter 的 summary/description，次选正文首段）
 */
export function extractSummaryFromRaw(raw?: string | null): string {
  if (!raw) return '';
  const fmMatch = raw.match(/^---[\s\S]*?---/);
  if (fmMatch) {
    const fm = fmMatch[0];
    const summaryMatch = fm.match(/^(?:summary|description):\s*(?:['"]?)(.*?)(?:['"]?)\s*$/m);
    if (summaryMatch && summaryMatch[1]?.trim()) {
      return summaryMatch[1].trim();
    }
  }
  const body = raw.replace(/^---[\s\S]*?---\r?\n?/, '').trim();
  const paragraphs = body.split(/\n\s*\n/);
  for (const p of paragraphs) {
    const line = p.trim();
    if (!line || line.startsWith('#') || line.startsWith('![')) continue;
    return line.slice(0, 140);
  }
  return '';
}

/**
 * 清洗摘要文本：去除换行、多余空格和 Markdown 标记
 */
function cleanSummary(summary?: string | null, maxLen = 100): string {
  if (!summary) return '';
  const cleaned = summary
    .replace(/[#*`_~>[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length <= maxLen) return cleaned;
  return `${cleaned.slice(0, maxLen - 1)}…`;
}

/**
 * 组装适合 X (Twitter) 单条推文的最佳文案（不含 URL，URL 由 Web Intent 的 url 参数附带）
 */
export function buildXShareText(payload: SocialSharePayload): string {
  const title = payload.title.trim();
  const summary = cleanSummary(payload.summary, 90);
  const tags = (payload.tags && payload.tags.length > 0 ? payload.tags : DEFAULT_SHARE_TAGS)
    .map((tag) => `#${tag.replace(/^[#\s]+/, '')}`)
    .join(' ');

  const parts: string[] = [];
  if (summary) {
    parts.push(`【${title}】\n${summary}`);
  } else {
    parts.push(`【${title}】`);
  }

  if (tags) {
    parts.push(tags);
  }

  return parts.join('\n\n');
}

/**
 * 根据预设的不同宣发角度（新篇速递 / 金句引用 / 技巧避坑）组装适合推文的文案
 */
export function buildAngleShareText(
  payload: SocialSharePayload,
  angle: SocialShareAngle = 'overview',
): string {
  const title = payload.title.trim();
  const summary = cleanSummary(payload.summary, 90);
  const tags = (payload.tags && payload.tags.length > 0 ? payload.tags : DEFAULT_SHARE_TAGS)
    .map((tag) => `#${tag.replace(/^[#\s]+/, '')}`)
    .join(' ');

  if (angle === 'quote') {
    const cleanQuote = summary ? `“${summary}”` : `“${title}”`;
    const lines = [cleanQuote, `—— 摘自《${title}》`];
    if (tags) lines.push('', tags);
    return lines.join('\n');
  }

  if (angle === 'practical') {
    const lines = [`💡 实战技巧与要点速查：`, `【${title}】`];
    if (summary) lines.push(summary);
    if (tags) lines.push('', tags);
    return lines.join('\n');
  }

  return buildXShareText(payload);
}

/**
 * 生成 X (Twitter) 官方标准的 Web Intent 发推链接
 * 文案与链接将直接预填进发推编辑框，无需用户手动输入
 */
export function buildXShareIntentUrl(payload: SocialSharePayload): string {
  const text = payload.customText?.trim() || buildAngleShareText(payload, payload.angle || 'overview');
  const url = getPublicPostUrl(payload.slug, payload.siteBaseUrl);
  const params = new URLSearchParams({
    text,
    url,
  });
  return `https://x.com/intent/tweet?${params.toString()}`;
}

/**
 * 生成适合一键复制到剪贴板并粘贴到其他社媒（微信、即刻、小红书、Telegram）的完整排版文案
 */
export function buildSocialCopyText(payload: SocialSharePayload): string {
  const title = payload.title.trim();
  const summary = cleanSummary(payload.summary, 140);
  const url = getPublicPostUrl(payload.slug, payload.siteBaseUrl);
  const tags = (payload.tags && payload.tags.length > 0 ? payload.tags : DEFAULT_SHARE_TAGS)
    .map((tag) => `#${tag.replace(/^[#\s]+/, '')}`)
    .join(' ');

  if (payload.angle === 'quote') {
    const cleanQuote = summary ? `“${summary}”` : `“${title}”`;
    const lines = [cleanQuote, `—— 摘自《${title}》`, '', `🔗 阅读全文：${url}`];
    if (tags) lines.push(tags);
    return lines.join('\n');
  }

  if (payload.angle === 'practical') {
    const lines = [`💡 实战技巧与要点速查：`, `【${title}】`];
    if (summary) lines.push(summary);
    lines.push('', `🔗 阅读全文：${url}`);
    if (tags) lines.push(tags);
    return lines.join('\n');
  }

  const lines: string[] = [`【${title}】`];
  if (summary) {
    lines.push(summary);
  }
  lines.push('');
  lines.push(`🔗 阅读全文：${url}`);
  if (tags) {
    lines.push(tags);
  }
  return lines.join('\n');
}
