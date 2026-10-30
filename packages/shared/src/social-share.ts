/**
 * 社交媒体分享与跨平台同步助手（单一真相源 SSOT）
 *
 * 负责构建标准合法的 X (Twitter) Web Intent URL、精简推文内容与多平台复制格式。
 * 不依赖第三方外部 SDK，零配置、零凭据泄露风险。
 */

export interface SocialSharePayload {
  title: string;
  slug: string;
  summary?: string | null;
  tags?: string[];
  siteBaseUrl?: string;
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
 * 生成 X (Twitter) 官方标准的 Web Intent 发推链接
 * 文案与链接将直接预填进发推编辑框，无需用户手动输入
 */
export function buildXShareIntentUrl(payload: SocialSharePayload): string {
  const text = buildXShareText(payload);
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
