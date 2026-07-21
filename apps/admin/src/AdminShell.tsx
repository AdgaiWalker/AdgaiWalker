/**
 * AdminShell — 有令牌后的布局壳
 */
import { NavLink, Outlet } from 'react-router-dom';
import {
  adminDeferredNote,
  adminPrimaryNav,
  adminSecondaryNav,
} from './shared/nav';

export function AdminShell() {
  return (
    <div className="layout">
      <nav>
        <strong>Walker Admin</strong>
        <p className="muted">推进核 · 池 / 苗 / 检 / 数</p>
        {adminPrimaryNav.map((item) => (
          <NavLink key={item.path} to={item.path}>
            {item.label}
          </NavLink>
        ))}
        <div className="nav-divider" />
        {adminSecondaryNav.map((item) => (
          <NavLink key={item.path} to={item.path}>
            {item.label}
          </NavLink>
        ))}
        <p className="muted" style={{ marginTop: 16 }}>
          {adminDeferredNote}
        </p>
      </nav>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
