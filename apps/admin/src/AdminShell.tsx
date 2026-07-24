/**
 * AdminShell — 管理端布局壳
 * 职责：侧栏材质导航 + 主区 Outlet；无令牌门。
 *
 * 依赖：shared/nav 配置
 * 触发：所有管理路由
 */
import { NavLink, Outlet } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { adminDeferredNote, adminNavGroups } from './shared/nav';

const PUBLIC_SITE =
  typeof import.meta.env.VITE_PUBLIC_SITE === 'string' &&
  import.meta.env.VITE_PUBLIC_SITE
    ? import.meta.env.VITE_PUBLIC_SITE
    : 'http://localhost:5173';

export function AdminShell() {
  return (
    <div className="layout">
      <aside className="adm-sidebar">
        <a href={PUBLIC_SITE} className="adm-brand" title="公开站">
          <span className="adm-brand-mark">W</span>
          <span>
            <span className="adm-brand-text">Walker Admin</span>
            <span className="adm-brand-sub">过程 · 一人可养</span>
          </span>
        </a>

        {adminNavGroups.map((group) => (
          <div key={group.title}>
            <div className="adm-nav-section">{group.title}</div>
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.end}
                  className={({ isActive }) =>
                    `adm-nav-link${isActive ? ' active' : ''}`
                  }
                >
                  <Icon size={17} aria-hidden />
                  {item.label}
                </NavLink>
              );
            })}
          </div>
        ))}

        <div className="adm-sidebar-foot">
          <p className="adm-sidebar-note">{adminDeferredNote}</p>
          <a
            className="adm-public-link"
            href={PUBLIC_SITE}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={14} aria-hidden />
            公开站
          </a>
        </div>
      </aside>

      <main className="adm-main">
        <Outlet />
      </main>
    </div>
  );
}
