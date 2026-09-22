import DOMPurify from "dompurify";
import { marked } from "marked";
import { useMemo } from "react";
/** 原始 HTML、事件属性、脚本协议与主动嵌入均不得进入预览。 */
export function previewHtml(raw: string): string {
  const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "");
  return DOMPurify.sanitize(marked.parse(body, { async: false }), {
    USE_PROFILES: { html: true },
    FORBID_TAGS: [
      "img",
      "iframe",
      "form",
      "input",
      "button",
      "video",
      "audio",
      "style",
    ],
    FORBID_ATTR: ["style", "target"],
  });
}
export function MarkdownPreview({ raw }: { raw: string }) {
  const html = useMemo(() => previewHtml(raw), [raw]);
  return (
    <article className="markdown" dangerouslySetInnerHTML={{ __html: html }} />
  );
}
