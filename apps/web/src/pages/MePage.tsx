/**
 * 关于我（页）— 人，不是站
 * 数据：site-stats.personalTimeline；社交 SITE_LINKS
 */
import { Link } from 'react-router-dom';
import siteStats from '../data/site-stats.json';
import {
  Anchor,
  BookOpen,
  Compass,
  Cpu,
  Globe,
  Mail,
  Ship,
  type LucideIcon,
} from 'lucide-react';
import { SITE_LINKS } from '../shared/constants';
import { WEB_ROUTES } from '../shared/routes';

const ICON_MAP: Record<string, LucideIcon> = {
  'lucide:anchor': Anchor,
  'lucide:book-open': BookOpen,
  'lucide:ship': Ship,
  'lucide:compass': Compass,
  'lucide:globe': Globe,
};

export function MePage() {
  return (
    <div className="about-page">
      <section className="about-hero about-hero-me">
        <div className="about-hero-overlay" />
        <div className="about-hero-content">
          <img
            src="/images/duola.jpg"
            alt="duola"
            className="about-hero-avatar"
            width={96}
            height={96}
          />
          <h1 className="about-hero-title">duola</h1>
          <p className="about-hero-sub">艺术生，在用 AI 解决真实问题</p>
          <p className="about-hero-era">人是主体；Walker 是站名，不是我的名字。</p>
          <div className="home-dual-cta" style={{ justifyContent: 'center' }}>
            <Link to={WEB_ROUTES.gear} className="btn-secondary">
              <Cpu size={16} />
              哆啦与硬件
            </Link>
            <Link to={WEB_ROUTES.about} className="btn-secondary">
              关于本站
            </Link>
          </div>
        </div>
      </section>

      <section className="panel-glass about-section">
        <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>关于我</h2>
        <p style={{ lineHeight: 1.7, color: 'var(--color-parchment-dim)' }}>
          我是 duola。在学、在做、在记：把真实卡点变成可检验的下一步，把走过的路收成教程、资源与札记。
        </p>
        <p style={{ lineHeight: 1.7, color: 'var(--color-parchment-dim)' }}>
          推进社会生产效率，解放人力，让生活更有趣。
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
        <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>工作经验</h2>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            paddingBottom: 4,
          }}
        >
          <div className="meta">2026 年 3 月 – 4 月</div>
          <div style={{ fontWeight: 700, color: 'var(--color-parchment)' }}>
            海拉鲁编程客 · 远程实习生
          </div>
          <p
            style={{
              margin: 0,
              lineHeight: 1.7,
              color: 'var(--color-parchment-dim)',
            }}
          >
            工作内容：自媒体文稿撰写。本意是给海哥减负，结果我成了负担，由此结束这段工作。
          </p>
          <p
            style={{
              margin: '0.65rem 0 0',
              lineHeight: 1.7,
              color: 'var(--color-parchment-dim)',
            }}
          >
            <strong style={{ color: 'var(--color-parchment)' }}>反思：</strong>
            分配工作时间；锚定工作职责；数据说话；按时反馈。
          </p>
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
                        <p
                          key={ch.label}
                          className="meta"
                          style={{ marginTop: 6 }}
                        >
                          <strong>{ch.label}</strong>：{ch.text}
                          {'href' in ch && ch.href ? (
                            <>
                              {' '}
                              <a
                                href={ch.href}
                                target="_blank"
                                rel="noreferrer"
                              >
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
    </div>
  );
}
