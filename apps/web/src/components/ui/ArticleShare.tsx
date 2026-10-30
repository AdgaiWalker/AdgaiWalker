import { useState } from 'react';
import { Check, Copy, Share2 } from 'lucide-react';
import { buildSocialCopyText, buildXShareIntentUrl } from '@walker/shared';

export interface ArticleShareProps {
  title: string;
  slug: string;
  summary?: string | null;
}

export function ArticleShare({ title, slug, summary }: ArticleShareProps) {
  const [copied, setCopied] = useState(false);

  const handleShareToX = () => {
    const url = buildXShareIntentUrl({ title, slug, summary });
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleCopy = async () => {
    const text = buildSocialCopyText({ title, slug, summary });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 容错兜底：环境不支持 clipboard 写入时静默
    }
  };

  return (
    <div className="article-share-bar" aria-label="文章分享">
      <div className="article-share-label">
        <Share2 size={15} aria-hidden />
        <span>分享与同步</span>
      </div>
      <div className="article-share-actions">
        <button
          type="button"
          className="btn-primary article-share-btn share-x"
          onClick={handleShareToX}
          title="在 X (Twitter) 上分享这篇文章"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          <span>分享到 X</span>
        </button>

        <button
          type="button"
          className="btn-primary article-share-btn"
          onClick={handleCopy}
          title="复制推文排版与全文链接"
        >
          {copied ? <Check size={13} color="#22c55e" /> : <Copy size={13} />}
          <span>{copied ? '已复制！' : '复制文案'}</span>
        </button>
      </div>
    </div>
  );
}
