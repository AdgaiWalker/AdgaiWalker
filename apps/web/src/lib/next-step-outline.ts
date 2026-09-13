/**
 * nextStep 排版纯函数。
 *
 * 职责：把服务端返回的文本切成可读的步骤行，只做「切分 + 去列表标记」，
 * 不改写、不补词、不添加原文没有的强调——展示与证据必须一致。
 */

const NUMBER_PREFIX = /^[\s\u3000]*(\d+)[.、)）]\s*/;
const BULLET_PREFIX = /^[\s\u3000]*[-•*]\s+/;

/** 切成步骤：优先按分号/换行，其次整体作为一步（不擅自拆句） */
export function outlineNextStep(raw: string): string[] {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text) return [];
  const parts = raw
    .split(/[；;]\s*|\n+/)
    .map((part) =>
      part
        .replace(/\s+/g, ' ')
        .replace(NUMBER_PREFIX, '')
        .replace(BULLET_PREFIX, '')
        .trim(),
    )
    .filter(Boolean);
  return parts.length > 0 ? parts : [text];
}

export type InlinePiece = { kind: 'text' | 'code' | 'strong'; text: string };

const INLINE_SOURCE = '`([^`]+)`|\\*\\*([^*]+)\\*\\*';

/**
 * 把行内代码与 `**强调**` 切出来单独渲染；只做排版，文字内容一字不改。
 * 服务端返回的 nextStep 是纯文本，这里不引入 Markdown 解析器。
 */
export function splitInlineMarkup(text: string): InlinePiece[] {
  const pieces: InlinePiece[] = [];
  const pattern = new RegExp(INLINE_SOURCE, 'g');
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      pieces.push({ kind: 'text', text: text.slice(cursor, match.index) });
    }
    if (match[1] !== undefined) {
      pieces.push({ kind: 'code', text: match[1] });
    } else if (match[2] !== undefined) {
      pieces.push({ kind: 'strong', text: match[2] });
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) {
    pieces.push({ kind: 'text', text: text.slice(cursor) });
  }
  return pieces.length > 0 ? pieces : [{ kind: 'text', text }];
}
