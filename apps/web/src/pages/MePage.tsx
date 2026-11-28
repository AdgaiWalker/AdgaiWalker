/**
 * 关于我（/me）— 参考 felixrieseberg.com/about-me/?reading=1：
 * 标题下细横线 → 纯衬线短段自述 → 我在做的事 → 我做过的事（无头像、无底部重复表格）。
 */
import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { postHref } from '../components/paper/EntryList';
import { PROFILE } from '../data/profile';
import { SITE_LINKS } from '../shared/constants';

export function MePage() {
  const activeWork = PROFILE.work.filter((item) => item.years?.endsWith('–'));

  return (
    <div className="measure me-page">
      <header className="page-head">
        <h1 className="page-title">关于我</h1>
      </header>

      <div className="prose">
        {PROFILE.aboutLead.map((line) => (
          <p key={line}>{line}</p>
        ))}
        <p>
          我是个 AI 实践主义者，拿 AI 解决真实问题。日常在用的硬件和渠道记在
          <Link to={postHref('dora-gear')}>生产力装备</Link>与
          <Link to={postHref('idea-cocreate')}>点子共促</Link>里。
        </p>

        <h2>我做的事</h2>
        <p>
          我致力于探索如何把人的注意力从重复步骤里解放出来：人只定方向、做整体结果的验证，其余交给一台不关机的
          <Link to={postHref(PROFILE.aboutLink.slug)}>物理 Bot</Link>
          。目前在主理
          {activeWork.map((item, index) => (
            <Fragment key={item.name}>
              {index > 0 ? (index === activeWork.length - 1 ? '和' : '、') : null}
              {item.link ? (
                <a href={item.link} target="_blank" rel="noopener noreferrer">
                  {item.name}
                </a>
              ) : (
                item.name
              )}
            </Fragment>
          ))}
          。
        </p>
        <p>
          我也维护着一串顺手造的开源小工具——
          {PROFILE.projects.map((project, index) => (
            <Fragment key={project.name}>
              {index > 0 ? '、' : null}
              {project.slug ? (
                <Link to={postHref(project.slug)}>{project.name}</Link>
              ) : project.link ? (
                <a href={project.link} target="_blank" rel="noopener noreferrer">
                  {project.name}
                </a>
              ) : (
                project.name
              )}
            </Fragment>
          ))}
          ，完整列表在{' '}
          <a href={SITE_LINKS.github} target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
          {' '}上。
        </p>

        <h2>我做过的事</h2>
        {PROFILE.did.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        {PROFILE.thanks ? <p>{PROFILE.thanks}</p> : null}
      </div>
    </div>
  );
}
