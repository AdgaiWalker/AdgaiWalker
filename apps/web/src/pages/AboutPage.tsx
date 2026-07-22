/**
 * 关于 — 旧站 about 英雄区/社交/时间线，React 重写（数据仍来 site-stats）。
 */
import { Link } from 'react-router-dom';
import siteStats from '../data/site-stats.json';
import {
  Anchor,
  BookOpen,
  Compass,
  Globe,
  Mail,
  MessageCircleQuestion,
  PenLine,
  Ship,
  type LucideIcon,
} from 'lucide-react';
import { dualEntry } from '../shared/dual-entry';
import { SITE_LINKS } from '../shared/constants';

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
    <div className="about-page">
      <section className="about-hero">
        <video
          className="about-hero-video"
          autoPlay
          muted
          loop
          playsInline
          poster="/images/hero-bg.png"
          aria-hidden
        >
          <source src="/video/A-storyboard-2.mp4" type="video/mp4" />
        </video>
        <div className="about-hero-overlay" />
        <div className="about-hero-content">
          <img
            src="/images/duola.jpg"
            alt="duola"
            className="about-hero-avatar"
            width={96}
            height={96}
          />
          <h1 className="about-hero-title">Walker</h1>
          <p className="about-hero-sub">
            赋能，不依赖 — 让每个人都能用 AI 解决真实问题
          </p>
          <p className="about-hero-era">
            一个人 + AI，从零搭了这整个站。你也可以。
          </p>
          <div className="home-dual-cta" style={{ justifyContent: 'center' }}>
            <Link to={dualEntry.ask.path} className="btn-primary">
              <MessageCircleQuestion size={16} />
              {dualEntry.ask.cta}
            </Link>
            <Link to={dualEntry.browse.path} className="btn-secondary">
              <PenLine size={16} />
              {dualEntry.browse.cta}
            </Link>
          </div>
        </div>
      </section>

      <section className="panel-glass about-section">
        <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>关于我</h2>
        <p style={{ lineHeight: 1.7, color: 'var(--color-parchment-dim)' }}>
          Walker（duola）的个人空间。沉淀思考、工具、点子与学习路径，并用「需求可见 →
          选题生产 → 结果检验」推进真实问题。
        </p>
        <p style={{ lineHeight: 1.7, color: 'var(--color-parchment-dim)' }}>
          两种用法：
          <strong>{dualEntry.ask.label}</strong>
          （{dualEntry.ask.hint}）或
          <strong>{dualEntry.browse.label}</strong>
          （{dualEntry.browse.hint}）。
        </p>
        <blockquote className="about-quote">
          <p>哲学家们只是用不同的方式解释世界，问题在于改变世界。</p>
          <footer className="meta">—— 马克思</footer>
        </blockquote>
        <div className="about-social">
          <a
            href={SITE_LINKS.github}
            target="_blank"
            rel="noopener noreferrer"
            className="social-pill"
          >
            GitHub
          </a>
          <a
            href={SITE_LINKS.bilibili}
            target="_blank"
            rel="noopener noreferrer"
            className="social-pill"
          >
            Bilibili
          </a>
          <a
            href={SITE_LINKS.xiaohongshu}
            target="_blank"
            rel="noopener noreferrer"
            className="social-pill"
          >
            小红书
          </a>
          <a href={SITE_LINKS.mailto} className="social-pill">
            <Mail size={14} /> 邮件
          </a>
        </div>
      </section>

      <section className="panel-glass about-section">
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
                <Ico
                  size={18}
                  color="var(--color-brand)"
                  style={{ flexShrink: 0, marginTop: 2 }}
                />
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

      <section className="panel-glass about-section">
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

      <section className="panel-glass about-section">
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
