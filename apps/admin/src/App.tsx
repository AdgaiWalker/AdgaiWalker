import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminShell } from './AdminShell';
import { RequireAdminToken } from './auth/RequireAdminToken';
import { AiGatewayPage } from './pages/AiGatewayPage';
import { CluesPage } from './pages/CluesPage';
import { ContentPage } from './pages/ContentPage';
import { ExecutionsPage } from './pages/ExecutionsPage';
import { LoginPage } from './pages/LoginPage';
import { MetricsPage } from './pages/MetricsPage';
import { SeedsPage } from './pages/SeedsPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAdminToken />}>
        <Route element={<AdminShell />}>
          <Route path="/" element={<Navigate to="/clues" replace />} />
          <Route path="/clues" element={<CluesPage />} />
          <Route path="/seeds" element={<SeedsPage />} />
          <Route path="/executions" element={<ExecutionsPage />} />
          <Route path="/metrics" element={<MetricsPage />} />
          <Route path="/content" element={<ContentPage />} />
          <Route path="/ai-gateway" element={<AiGatewayPage />} />
          <Route path="*" element={<Navigate to="/clues" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
