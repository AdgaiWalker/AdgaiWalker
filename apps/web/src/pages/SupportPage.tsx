/**
 * 赞赏页 — 读取公开 GET /support
 */
import { useEffect, useState } from 'react';
import { Heart } from 'lucide-react';
import { publicApi, type SupportConfig } from '../api/public-api';

export function SupportPage() {
  const [cfg, setCfg] = useState<SupportConfig | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void publicApi
      .getSupport()
      .then(setCfg)
      .catch(() => {
        setError('暂时无法加载赞赏配置');
        setCfg({
          title: '支持 / 赞赏',
          body: '若内容对你有帮助，可通过赞赏支持持续创作。',
          wechatQrUrl: '',
          alipayQrUrl: '',
          externalLinks: [],
        });
      });
  }, []);

  if (!cfg) {
    return (
      <div>
        <h1 className="page-title">支持 / 赞赏</h1>
        <p className="meta">加载中…</p>
      </div>
    );
  }

  return (
    <div>
      <h1
        className="page-title"
        style={{ display: 'flex', alignItems: 'center', gap: 10 }}
      >
        <Heart size={26} aria-hidden />
        {cfg.title}
      </h1>
      {error ? <p className="meta">{error}</p> : null}
      <section
        className="panel-glass"
        style={{ padding: '1.35rem 1.5rem', borderRadius: 28 }}
      >
        <p style={{ lineHeight: 1.7 }}>{cfg.body}</p>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '1.5rem',
            marginTop: '1.25rem',
          }}
        >
          {cfg.wechatQrUrl ? (
            <figure style={{ margin: 0, textAlign: 'center' }}>
              <img
                src={cfg.wechatQrUrl}
                alt="微信赞赏码"
                style={{ maxWidth: 200, borderRadius: 12 }}
              />
              <figcaption className="meta">微信</figcaption>
            </figure>
          ) : null}
          {cfg.alipayQrUrl ? (
            <figure style={{ margin: 0, textAlign: 'center' }}>
              <img
                src={cfg.alipayQrUrl}
                alt="支付宝赞赏码"
                style={{ maxWidth: 200, borderRadius: 12 }}
              />
              <figcaption className="meta">支付宝</figcaption>
            </figure>
          ) : null}
        </div>
        {!cfg.wechatQrUrl && !cfg.alipayQrUrl ? (
          <p className="meta" style={{ marginTop: '1rem' }}>
            收款码尚未配置。站主可在 API{' '}
            <code>PUT /support</code>（Bearer）写入{' '}
            <code>content/support-config.json</code>。
          </p>
        ) : null}
        {cfg.externalLinks?.length ? (
          <ul style={{ marginTop: '1rem' }}>
            {cfg.externalLinks.map((l) => (
              <li key={l.url}>
                <a href={l.url} target="_blank" rel="noreferrer">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
