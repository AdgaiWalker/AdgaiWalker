/**
 * OnlineSection — 在线（首页 #online 与 /me 共用），数据源为 profile.ts。
 * 支持普通链接行（href）与点击复制行（copyValue，如微信号）。
 */
import { useState } from 'react';
import { PROFILE } from '../../data/profile';

export function OnlineSection({ id = 'online', headingId = 'sec-online' }: { id?: string; headingId?: string }) {
  const [copiedPlatform, setCopiedPlatform] = useState<string | null>(null);

  return (
    <section id={id} className="home-section" aria-labelledby={headingId}>
      <h2 id={headingId} className="section-title">
        在线
      </h2>
      <ul className="online-list">
        {PROFILE.online.map((row) => (
          <li key={row.platform}>
            {row.copyValue ? (
              <button
                type="button"
                className="online-row online-copy-btn"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(row.copyValue!);
                    setCopiedPlatform(row.platform);
                    window.setTimeout(() => setCopiedPlatform(null), 1800);
                  } catch {
                    /* 剪贴板受限时文本本身已在右侧可见，可直接选中复制 */
                  }
                }}
              >
                <span className="online-name">{row.platform}</span>
                <span className="entry-meta">
                  {copiedPlatform === row.platform ? `已复制 ${row.handle}` : row.handle}
                </span>
              </button>
            ) : (
              <a
                className="online-row"
                href={row.href}
                {...(row.href?.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              >
                <span className="online-name">{row.platform}</span>
                <span className="entry-meta">{row.handle}</span>
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
