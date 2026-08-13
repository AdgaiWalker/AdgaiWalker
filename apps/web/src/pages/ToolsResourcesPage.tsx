/**
 * 资源页（页）
 * 扁平陈列：不做赛道/分类筛选；分区仅作阅读锚点。
 */
import { ExternalLink, Wrench } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  aiResources,
  aiTools,
  bloggers,
  communities,
  infra,
  skills,
} from '../data/tools-data';
import { ResourceCard } from '../components/ResourceCard';
import { dualEntry } from '../shared/dual-entry';
import { WEB_ROUTES } from '../shared/routes';
import { TOOLS_SECTIONS, type ToolsSectionId } from '../shared/tools-sections';
import { toolsSectionIcon } from '../shared/tools-section-icons';

export function ToolsResourcesPage() {
  return (
    <div className="resource-page">
      <header className="resource-head">
        <h1 className="page-title">
          <Wrench size={24} aria-hidden className="page-title-icon" />
          资源
        </h1>
        <p className="page-lead">
          实际在用的群、工具与引路人。
          <strong>以下群/服务/产品与本人无任何利益关系</strong>
          ，只是用户分享。卡住请先去{' '}
          <Link to={WEB_ROUTES.ask}>{dualEntry.ask.cta}</Link>。
        </p>
      </header>

      <nav className="section-nav" aria-label="本页锚点">
        {TOOLS_SECTIONS.map((sec) => {
          const Icon = toolsSectionIcon(sec.icon);
          return (
            <a key={sec.id} href={`#${sec.id}`} className="section-nav-tab">
              <Icon size={14} aria-hidden />
              {sec.label}
            </a>
          );
        })}
      </nav>

      <section id="info-source" className="resource-section panel-glass">
        <SectionTitle id="info-source" />
        <h3 className="sub-title">氛围群</h3>
        <p className="section-hint">
          有二维码的直接扫。博主维护的群，关注他们加入。
        </p>
        <div className="res-grid">
          {communities.map((c) => (
            <ResourceCard
              key={c.name}
              name={c.name}
              badge={c.badge}
              desc={c.desc}
              qrCode={c.qrCode}
              featured={c.featured}
              footer={
                c.blogger ? (
                  <a href="#bloggers" className="meta res-blogger-link">
                    关注 {c.blogger} 加入
                  </a>
                ) : null
              }
            />
          ))}
        </div>
        <h3 className="sub-title">省钱用 AI</h3>
        <p className="section-hint">获取低价 AI 额度的渠道。有码可扫。</p>
        <div className="res-grid">
          {aiResources.map((r) => (
            <ResourceCard
              key={r.name}
              name={r.name}
              badge={r.badge}
              desc={r.desc}
              qrCode={r.qrCode}
            />
          ))}
        </div>
      </section>

      <section id="ai-tools" className="resource-section panel-glass">
        <SectionTitle id="ai-tools" />
        <div className="tool-grid">
          {aiTools.map((t) => (
            <div key={t.category} className="tool-card">
              <span className="tool-category">{t.category}</span>
              <span className="tool-value">{t.tools}</span>
            </div>
          ))}
        </div>
      </section>

      <section id="skill" className="resource-section panel-glass">
        <SectionTitle id="skill" />
        <ul className="post-list">
          {skills.map((s) => (
            <li key={s.name}>
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.name} <ExternalLink size={12} className="inline-icon" />
              </a>
              <div className="meta">{s.desc}</div>
            </li>
          ))}
        </ul>
      </section>

      <section id="infra" className="resource-section panel-glass">
        <SectionTitle id="infra" />
        <ul className="post-list">
          {infra.map((i) => (
            <li key={i.name}>
              {i.url ? (
                <a href={i.url} target="_blank" rel="noreferrer">
                  {i.name} <ExternalLink size={12} className="inline-icon" />
                </a>
              ) : (
                <strong className="res-strong">{i.name}</strong>
              )}
              <div className="meta">{i.desc}</div>
            </li>
          ))}
        </ul>
      </section>

      <section id="bloggers" className="resource-section panel-glass">
        <SectionTitle id="bloggers" />
        <div className="res-grid">
          {bloggers.map((b) => (
            <a
              key={b.name}
              href={b.url}
              target="_blank"
              rel="noreferrer"
              className="res-card res-card-link"
            >
              <div className="blogger-row">
                {b.avatar ? (
                  <img
                    src={b.avatar}
                    alt=""
                    width={40}
                    height={40}
                    className="blogger-avatar"
                  />
                ) : (
                  <span className="directory-mark" aria-hidden>
                    {b.initial}
                  </span>
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
      </section>
    </div>
  );
}

function SectionTitle({ id }: { id: ToolsSectionId }) {
  const sec = TOOLS_SECTIONS.find((s) => s.id === id)!;
  const Icon = toolsSectionIcon(sec.icon);
  return (
    <>
      <h2 className="section-title">
        <Icon size={20} aria-hidden className="section-icon" />
        {sec.label}
      </h2>
      {sec.hint ? <p className="section-hint">{sec.hint}</p> : null}
    </>
  );
}
