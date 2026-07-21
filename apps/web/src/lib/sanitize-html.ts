import DOMPurify from 'dompurify';

/**
 * 将不可信 HTML（如 Markdown 渲染结果）消毒后再写入 DOM。
 * 仅保留常见排版标签，去掉 script/事件处理器等。
 */
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    USE_PROFILES: { html: true },
  });
}
