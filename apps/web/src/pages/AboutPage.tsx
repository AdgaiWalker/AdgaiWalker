import { Link } from 'react-router-dom';
import siteStats from '../data/site-stats.json';
import {
  Anchor,
  BookOpen,
  Compass,
  Globe,
  MessageCircleQuestion,
  PenLine,
  Ship,
  type LucideIcon,
} from 'lucide-react';
import { dualEntry } from '../shared/dual-entry';

const ICON_MAP: Record<string, LucideIcon> = {
  'lucide:anchor': Anchor,
  'lucide:book-open': BookOpen,
  'lucide:ship': Ship,
  'lucide:compass': Compass,
  'lucide:globe': Globe,
};

export function AboutPage() {
  const totalCost = siteStats.costs.reduce((s, c) => s + (c.amount || 0), 0);

  return (
    <div>
      <h1 className="page-title">关于</h1>

      <section
        className="panel-glass"
        style={{ padding: '1.35rem 1.5rem', borderRadius: 28, marginBottom: 16 }}
      >
        <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>关于我</h2>
        <p style={{ lineHeight: 1.7, color: 'var(--color-parchment-dim)' }}>
          Walker（秋知）的个人空间。沉淀思考、工具、点子与学习路径，并用「需求可见 →
          选题生产 → 结果检验」推进真实问题。
        </p>
        <p style={{ lineHeight: 1.7, color: 'var(--color-parchment-dim)' }}>
          两种用法：
          <strong>{dualEntry.ask.label}</strong>
          （{dualEntry.ask.hint}）或
          <strong>{dualEntry.browse.label}</strong>
          （{dualEntry.browse.hint}）。
        </p>
        <div className="home-dual-cta" style={{ justifyContent: 'flex-start' }}>
          <Link to={dualEntry.ask.path} className="btn-primary">
            <MessageCircleQuestion size={16} />
            {dualEntry.ask.cta}
          </Link>
          <Link to={dualEntry.browse.path} className="btn-secondary">
            <PenLine size={16} />
            {dualEntry.browse.cta}
          </Link>
        </div>
      </section>

      <section
        className="panel-glass"
        style={{ padding: '1.35rem 1.5rem', borderRadius: 28, marginBottom: 16 }}
      >
        <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>个人时间线</h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {siteStats.personalTimeline.map((item) => {
            const Ico = ICON_MAP[item.icon] ?? Globe;
            return (
              <li
                key={item.date + item.title}
                style={{
                  display: 'flex',
                  gap: 12,
                  padding: '12px 0',
                  borderBottom: '1px solid var(--color-border)',
                }}
              >
                <Ico size={18} color="var(--color-brand)" style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div className="meta">{item.date}</div>
                  <div style={{ fontWeight: 700 }}>{item.title}</div>
                  <p className="meta" style={{ marginTop: 4, lineHeight: 1.55 }}>
                    {item.desc}
                  </p>
                  {'children' in item && Array.isArray(item.children)
                    ? item.children.map((ch) => (
                        <p key={ch.label} className="meta" style={{ marginTop: 6 }}>
                          <strong>{ch.label}</strong>：{ch.text}
                          {'href' in ch && ch.href ? (
                            <>
                              {' '}
                              <a href={ch.href} target="_blank" rel="noreferrer">
                                链接
                              </a>
                            </>
                          ) : null}
                        </p>
                      ))
                    : null}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section
        className="panel-glass"
        style={{ padding: '1.35rem 1.5rem', borderRadius: 28, marginBottom: 16 }}
      >
        <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>站点时间线</h2>
        <ul className="post-list">
          {siteStats.siteTimeline.map((t) => (
            <li key={t.date + t.text}>
              <strong style={{ color: 'var(--color-parchment)' }}>{t.date}</strong>
              <div className="meta">{t.text}</div>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel-glass" style={{ padding: '1.35rem 1.5rem', borderRadius: 28 }}>
        <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>花费记录</h2>
        <p className="meta">合计约 ¥{totalCost}（来自 site-stats.json）</p>
        <ul className="post-list">
          {siteStats.costs.map((c, i) => (
            <li key={i}>
              <strong style={{ color: 'var(--color-parchment)' }}>
                {c.date} · {c.category} · ¥{c.amount}
              </strong>
              <div className="meta">{c.note}</div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
