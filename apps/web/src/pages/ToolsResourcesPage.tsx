import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  aiResources,
  aiTools,
  bloggers,
  communities,
  infra,
  skills,
} from '../data/tools-data';
import { dualEntry } from '../shared/dual-entry';

export function ToolsResourcesPage() {
  return (
    <div>
      <h1 className="page-title">资源</h1>
      <p className="page-lead">
        与旧站 tools 数据同源（tools-data）。问答请去{' '}
        <Link to={dualEntry.ask.path}>{dualEntry.ask.path}</Link>。
      </p>

      <Section title="社区">
        <div className="res-grid">
          {communities.map((c) => (
            <div key={c.name} className="res-card">
              <div className="res-badge">{c.badge}</div>
              <div className="res-name">{c.name}</div>
              <p className="meta">{c.desc}</p>
              {c.blogger ? <p className="meta">关注博主：{c.blogger}</p> : null}
              {c.qrCode ? (
                <img src={c.qrCode} alt={`${c.name} 二维码`} className="res-qr" />
              ) : null}
            </div>
          ))}
        </div>
      </Section>

      <Section title="AI 资源群">
        <div className="res-grid">
          {aiResources.map((r) => (
            <div key={r.name} className="res-card">
              <div className="res-badge">{r.badge}</div>
              <div className="res-name">{r.name}</div>
              <p className="meta">{r.desc}</p>
              {r.qrCode ? (
                <img src={r.qrCode} alt={r.name} className="res-qr" />
              ) : null}
            </div>
          ))}
        </div>
      </Section>

      <Section title="我在用的 AI 工具">
        <ul className="post-list">
          {aiTools.map((t) => (
            <li key={t.category}>
              <strong style={{ color: 'var(--color-parchment)' }}>{t.category}</strong>
              <div className="meta">{t.tools}</div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="基建">
        <ul className="post-list">
          {infra.map((i) => (
            <li key={i.name}>
              {i.url ? (
                <a href={i.url} target="_blank" rel="noreferrer">
                  {i.name} <ExternalLink size={12} style={{ display: 'inline' }} />
                </a>
              ) : (
                <strong style={{ color: 'var(--color-parchment)' }}>{i.name}</strong>
              )}
              <div className="meta">{i.desc}</div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="博主">
        <div className="res-grid">
          {bloggers.map((b) => (
            <a
              key={b.name}
              href={b.url}
              target="_blank"
              rel="noreferrer"
              className="res-card"
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                {b.avatar ? (
                  <img
                    src={b.avatar}
                    alt={b.name}
                    width={40}
                    height={40}
                    style={{ borderRadius: 999, objectFit: 'cover' }}
                  />
                ) : (
                  <span className="directory-mark">{b.initial}</span>
                )}
                <div>
                  <div className="res-name">{b.name}</div>
                  <div className="meta">{b.platform}</div>
                </div>
              </div>
              <p className="meta" style={{ marginTop: 8 }}>
                {b.desc}
              </p>
            </a>
          ))}
        </div>
      </Section>

      <Section title="Skills">
        <ul className="post-list">
          {skills.map((s) => (
            <li key={s.name}>
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.name}
              </a>
              <div className="meta">{s.desc}</div>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      className="panel-glass"
      style={{ padding: '1.1rem 1.25rem', borderRadius: 24, marginBottom: 14 }}
    >
      <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.1rem' }}>{title}</h2>
      {children}
    </section>
  );
}
