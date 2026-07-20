import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { CluesPage } from './pages/CluesPage';
import { SeedsPage } from './pages/SeedsPage';
import { ExecutionsPage } from './pages/ExecutionsPage';
import { MetricsPage } from './pages/MetricsPage';
import { ContentPage } from './pages/ContentPage';
import { AiGatewayPage } from './pages/AiGatewayPage';
import { LoginPage } from './pages/LoginPage';

export function App() {
  return (
    <div className="layout">
      <nav>
        <strong>Walker Admin</strong>
        <p className="muted">推进核</p>
        <NavLink to="/login">登录</NavLink>
        <NavLink to="/clues">线索</NavLink>
        <NavLink to="/seeds">题苗</NavLink>
        <NavLink to="/executions">执行</NavLink>
        <NavLink to="/metrics">指标</NavLink>
        <NavLink to="/content">内容</NavLink>
        <NavLink to="/ai-gateway">AI Gateway</NavLink>
        <p className="muted" style={{ marginTop: 16 }}>
          未迁：WorkItem / Skill / NorthStar / Grants
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
