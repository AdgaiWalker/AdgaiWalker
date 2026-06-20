import yaml from 'js-yaml';

export interface ParsedDoc {
  frontmatter: Record<string, unknown>;
  body: string;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** 解析 markdown 源为 frontmatter 对象 + body。frontmatter 损坏时降级为空对象。 */
export function parseDoc(raw: string): ParsedDoc {
  const m = raw.match(FRONTMATTER_RE);
  if (!m) return { frontmatter: {}, body: raw };
  let frontmatter: Record<string, unknown> = {};
  try {
    const parsed = yaml.load(m[1]);
    if (parsed && typeof parsed === 'object') {
      frontmatter = parsed as Record<string, unknown>;
    }
  } catch {
    frontmatter = {};
  }
  return { frontmatter, body: raw.slice(m[0].length) };
}

/** 序列化 frontmatter + body 为合法 markdown 源。 */
export function serializeDoc(doc: ParsedDoc): string {
  const fmText = Object.keys(doc.frontmatter).length > 0
    ? yaml.dump(doc.frontmatter, { quotingType: '"', lineWidth: 0 }).trimEnd()
    : '';
  const body = doc.body.replace(/^\n+/, '');
  if (!fmText) return body;
  return `---\n${fmText}\n---\n\n${body}`;
}

/** MetadataForm select 选项，与 content.config.ts 枚举一致。 */
export const FORM_ENUMS = {
  type: ['knowledge', 'tool', 'idea', 'project', 'community', 'learn'],
  form: ['article', 'note', 'diary', 'rant', 'gallery', 'video', 'recipe', 'calligraphy', 'resource', 'project', 'idea', 'lesson'],
  domain: ['ai', 'coding', 'product', 'philosophy', 'life', 'cooking', 'calligraphy', 'reading', 'travel', 'emotion', 'community'],
  intent: ['think', 'record', 'teach', 'share', 'verify', 'showcase', 'reflect', 'connect', 'vent'],
  valueMode: ['utility', 'existence', 'both'],
  visibility: ['public', 'draft', 'private'],
  status: ['thinking', 'validating', 'building', 'verified', 'archived'],
  aiLevel: ['AI-0', 'AI-1', 'AI-2', 'AI-3', 'AI-4'],
} as const;

/** 表单管理的字段 key（其余留在 raw YAML 兜底框）。 */
export const FORM_MANAGED_KEYS = [
  'title', 'summary', 'date', 'tags', 'visibility',
  'type', 'form', 'domain', 'intent', 'valueMode', 'status',
] as const;
