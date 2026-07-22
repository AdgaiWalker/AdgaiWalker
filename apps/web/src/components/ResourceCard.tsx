/**
 * 资源卡（块）
 * 职责：展示名称/徽章/描述/二维码；可选链接包装。
 */
import type { ReactNode } from 'react';

export function ResourceCard({
  name,
  badge,
  desc,
  qrCode,
  featured,
  footer,
  href,
}: {
  name: string;
  badge?: string;
  desc?: string;
  qrCode?: string;
  featured?: boolean;
  footer?: ReactNode;
  href?: string;
}) {
  const body = (
    <>
      {badge ? <div className="res-badge">{badge}</div> : null}
      <div className="res-name">{name}</div>
      {desc ? <p className="meta">{desc}</p> : null}
      {footer}
      {qrCode ? (
        <img src={qrCode} alt={`${name} 二维码`} className="res-qr" />
      ) : null}
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={`res-card res-card-link${featured ? ' is-featured' : ''}`}
      >
        {body}
      </a>
    );
  }

  return (
    <div className={`res-card${featured ? ' is-featured' : ''}`}>{body}</div>
  );
}
