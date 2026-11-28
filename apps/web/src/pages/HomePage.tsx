/**
 * 首页 — 参考 Felix Rieseberg 纸页版：
 * 自述 + 更多关于我 →（可选横幅图）→ #work 作品（经历 + 项目 + 视频）→ #posts 文章（按年 + 展开其余）→ #online 在线。
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getBrowseItems, type ContentItem } from '../content';
import { displayHandle, PROFILE, type WorkEntry } from '../data/profile';
import { postHref, shortDate } from '../components/paper/EntryList';
import { OnlineSection } from '../components/paper/OnlineSection';
import { parseIsoDate } from '../shared/format';
import { groupPostsByYear } from '../shared/posts-timeline';
import { WEB_ROUTES } from '../shared/routes';

const INITIAL_POSTS = 8;

function byDateDesc(a: ContentItem, b: ContentItem): number {
  return parseIsoDate(b.date).getTime() - parseIsoDate(a.date).getTime();
}

function WorkRows({ entries }: { entries: readonly WorkEntry[] }) {
  return (
    <ul className="work-list">
      {entries.map((entry) => (
        <li key={entry.name} className="work-item">
          <div className="work-head">
            {entry.slug ? (
              <Link to={postHref(entry.slug)} className="work-title">
                {entry.name}
              </Link>
            ) : entry.link ? (
              <a
                href={entry.link}
                className="work-title"
                target="_blank"
                rel="noopener noreferrer"
              >
                {entry.name}
              </a>
            ) : (
              <span className="work-title">{entry.name}</span>
            )}
            {entry.years ? <span className="entry-meta">{entry.years}</span> : null}
          </div>
          <p className="work-desc">{entry.story}</p>
          {entry.link ? (
            <a
              className="work-ext"
              href={entry.link}
              target="_blank"
              rel="noopener noreferrer"
            >
              {displayHandle(entry.link)}
            </a>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function HomePage() {
  const [showOlder, setShowOlder] = useState(false);

  const essays = useMemo(() => {
    return [...getBrowseItems()]
      .sort(byDateDesc)
      .filter((item) => item.type !== 'project' && item.type !== 'idea');
  }, []);

  const visibleEssays = useMemo(
    () => (showOlder ? essays : essays.slice(0, INITIAL_POSTS)),
    [essays, showOlder],
  );
  const byYear = useMemo(() => groupPostsByYear(visibleEssays), [visibleEssays]);
  const hiddenCount = Math.max(0, essays.length - INITIAL_POSTS);

  return (
    <div className="measure home">
      <section className="hero">
        <h1 className="hero-title">{PROFILE.greeting}</h1>
        {PROFILE.intro.map((line) => (
          <p key={line} className="hero-dek">
            {line}
          </p>
        ))}
        <Link to={WEB_ROUTES.me} className="hero-more">
          更多关于我
        </Link>
      </section>

      {PROFILE.hero ? (
        <figure className="home-figure">
          <img
            src={PROFILE.hero.src}
            alt={PROFILE.hero.alt}
            width={PROFILE.hero.width}
            height={PROFILE.hero.height}
            decoding="async"
          />
        </figure>
      ) : null}

      <section id="work" className="home-section" aria-labelledby="sec-work">
        <h2 id="sec-work" className="section-title">
          作品
        </h2>
        <WorkRows entries={PROFILE.work} />
        {PROFILE.projects.length > 0 ? (
          <>
            <h3 className="subsection-title">工具</h3>
            <WorkRows entries={PROFILE.projects} />
          </>
        ) : null}
        {PROFILE.talks.length > 0 ? (
          <>
            <h3 className="subsection-title">视频</h3>
            <ul className="work-list">
              {PROFILE.talks.map((talk) => (
                <li key={talk.href} className="work-item">
                  <div className="work-head">
                    <a
                      className="work-title"
                      href={talk.href}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {talk.title}
                    </a>
                    <span className="entry-meta">{talk.date}</span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      <section id="posts" className="home-section" aria-labelledby="sec-posts">
        <div className="section-head">
          <h2 id="sec-posts" className="section-title">
            文章
          </h2>
          <Link to={WEB_ROUTES.browse} className="section-aux">
            全部
          </Link>
        </div>

        {byYear.map(({ year, items }) => (
          <div key={year || 'unknown'} className="pb-year">
            <span className="pb-year-label">{year > 0 ? year : '—'}</span>
            <ul className="pb-post-list">
              {items.map((item) => (
                <li key={item.slug}>
                  <Link to={postHref(item.slug)} className="pb-post-row">
                    <span className="pb-post-title">{item.title}</span>
                    <span className="entry-meta">{shortDate(item.date)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}

        {!showOlder && hiddenCount > 0 ? (
          <button type="button" className="older-posts-btn" onClick={() => setShowOlder(true)}>
            展开其余 {hiddenCount} 篇
          </button>
        ) : null}
      </section>

      <OnlineSection />
    </div>
  );
}
