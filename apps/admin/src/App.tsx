import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminShell } from './AdminShell';
import { AiGatewayPage } from './pages/AiGatewayPage';
import { ContentEditPage } from './pages/ContentEditPage';
import { ContentListPage } from './pages/ContentListPage';
import { CluesPage } from './pages/CluesPage';
import { AssistantQuestionsPage } from './pages/AssistantQuestionsPage';
import { InsightsPage } from './pages/InsightsPage';
import { CredentialsPage } from './pages/CredentialsPage';
import { ExecutionsPage } from './pages/ExecutionsPage';
import { MetricsPage } from './pages/MetricsPage';
import { SeedsPage } from './pages/SeedsPage';
import { TodayPage } from './pages/TodayPage';
import { WorkstationPage } from './pages/WorkstationPage';
import { ADMIN_ROUTES } from './shared/routes';

export function App() {
  return (
    <Routes>
      <Route element={<AdminShell />}>
        <Route path={ADMIN_ROUTES.today} element={<TodayPage />} />
        <Route
          path={ADMIN_ROUTES.workstation}
          element={<WorkstationPage />}
        />
        <Route path={ADMIN_ROUTES.clues} element={<CluesPage />} />
        <Route path={ADMIN_ROUTES.seeds} element={<SeedsPage />} />
        <Route
          path={ADMIN_ROUTES.assistant}
          element={<AssistantQuestionsPage />}
        />
        <Route path={ADMIN_ROUTES.insights} element={<InsightsPage />} />
        <Route path={ADMIN_ROUTES.executions} element={<ExecutionsPage />} />
        <Route path={ADMIN_ROUTES.metrics} element={<MetricsPage />} />
        <Route path={ADMIN_ROUTES.content} element={<ContentListPage />} />
        <Route path="/content/:slug" element={<ContentEditPage />} />
        <Route
          path={ADMIN_ROUTES.credentials}
          element={<CredentialsPage />}
        />
        <Route path={ADMIN_ROUTES.aiGateway} element={<AiGatewayPage />} />
        <Route
          path="*"
          element={<Navigate to={ADMIN_ROUTES.today} replace />}
        />
      </Route>
    </Routes>
  );
}
