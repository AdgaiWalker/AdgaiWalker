import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminShell } from './AdminShell';
import { RequireAdminToken } from './auth/RequireAdminToken';
import { AiGatewayPage } from './pages/AiGatewayPage';
import { AdminContentPlaceholderPage } from './pages/AdminContentPlaceholderPage';
import { AdminTokenPage } from './pages/AdminTokenPage';
import { CluesPage } from './pages/CluesPage';
import { ExecutionsPage } from './pages/ExecutionsPage';
import { MetricsPage } from './pages/MetricsPage';
import { SeedsPage } from './pages/SeedsPage';
import { ADMIN_ROUTES } from './shared/routes';

export function App() {
  return (
    <Routes>
      <Route path={ADMIN_ROUTES.login} element={<AdminTokenPage />} />
      <Route element={<RequireAdminToken />}>
        <Route element={<AdminShell />}>
          <Route
            path="/"
            element={<Navigate to={ADMIN_ROUTES.clues} replace />}
          />
          <Route path={ADMIN_ROUTES.clues} element={<CluesPage />} />
          <Route path={ADMIN_ROUTES.seeds} element={<SeedsPage />} />
          <Route path={ADMIN_ROUTES.executions} element={<ExecutionsPage />} />
          <Route path={ADMIN_ROUTES.metrics} element={<MetricsPage />} />
          <Route
            path={ADMIN_ROUTES.content}
            element={<AdminContentPlaceholderPage />}
          />
          <Route path={ADMIN_ROUTES.aiGateway} element={<AiGatewayPage />} />
          <Route
            path="*"
            element={<Navigate to={ADMIN_ROUTES.clues} replace />}
          />
        </Route>
      </Route>
    </Routes>
  );
}
