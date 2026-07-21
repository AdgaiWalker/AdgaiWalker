import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { CluesPage } from './pages/CluesPage';
import { SeedsPage } from './pages/SeedsPage';
import { ExecutionsPage } from './pages/ExecutionsPage';
import { MetricsPage } from './pages/MetricsPage';
import { ContentPage } from './pages/ContentPage';
import { AiGatewayPage } from './pages/AiGatewayPage';
import { LoginPage } from './pages/LoginPage';
import {
  adminDeferredNote,
  adminPrimaryNav,
  adminSecondaryNav,
} from './shared/nav';

export function App() {
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
        <Routes>
          <Route path="/" element={<Navigate to="/clues" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/clues" element={<CluesPage />} />
          <Route path="/seeds" element={<SeedsPage />} />
          <Route path="/executions" element={<ExecutionsPage />} />
          <Route path="/metrics" element={<MetricsPage />} />
          <Route path="/content" element={<ContentPage />} />
          <Route path="/ai-gateway" element={<AiGatewayPage />} />
        </Routes>
      </main>
    </div>
  );
}
