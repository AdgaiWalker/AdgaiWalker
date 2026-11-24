/**
 * SafeMarkdown — 轻量流式安全 Markdown 渲染器（marked + DOMPurify），替代 @ant-design/x-markdown。
 */
import { useMemo } from 'react';
import { marked } from 'marked';
import { sanitizeHtml } from '../../lib/sanitize-html';

export type SafeMarkdownProps = {
  content: string;
  streaming?: boolean;
};

function addSafeExternalTargets(html: string): string {
  return html.replace(
    /<a\s+href="(https?:\/\/[^"]+)"/gi,
    '<a href="$1" target="_blank" rel="noopener noreferrer"',
  );
}

export function SafeMarkdown({ content, streaming = false }: SafeMarkdownProps) {
  const html = useMemo(() => {
    if (!content) return '';
    const parsed = marked.parse(content, { async: false, breaks: true }) as string;
    return addSafeExternalTargets(sanitizeHtml(parsed));
  }, [content]);

  return (
    <div
      className="prose-md assistant-markdown"
      data-streaming={streaming ? 'true' : undefined}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
