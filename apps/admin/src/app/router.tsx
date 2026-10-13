import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, Link } from "react-router-dom";
import { AdminShell } from "./AdminShell";
import { ADMIN_ROUTES as R } from "../shared/routes";
import { OverviewPage } from "../pages/overview/OverviewPage";
import { ContentListPage } from "../pages/content/ContentListPage";
import { AgentListPage, AgentDetailPage } from "../pages/agents/AgentListPage";
import { DeploymentsPage } from "../pages/deployments/DeploymentsPage";
import { RunListPage } from "../pages/records/RunListPage";
import { RunDetailPage } from "../pages/records/RunDetailPage";
import { ConversationLogDetailPage } from "../pages/records/ConversationLogDetailPage";
import { SettingsPage } from "../pages/settings/SettingsPage";
import { LoadingState } from "../components/States";

const ContentDetailPage = lazy(() =>
  import("../pages/content/ContentDetailPage").then((module) => ({
    default: module.ContentDetailPage,
  })),
);
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AdminShell />}>
        <Route index element={<Navigate to={R.overview} replace />} />
        <Route path={R.overview} element={<OverviewPage />} />
        <Route path={R.content} element={<ContentListPage />} />
        <Route
          path={R.contentPattern}
          element={
            <Suspense fallback={<LoadingState />}>
              <ContentDetailPage />
            </Suspense>
          }
        />
        <Route path={R.agents} element={<AgentListPage />} />
        <Route path={R.deployments} element={<DeploymentsPage />} />
        <Route path={R.agentPattern} element={<AgentDetailPage />} />
        <Route path={R.records} element={<RunListPage />} />
        <Route path={R.runPattern} element={<RunDetailPage />} />
        <Route path={R.conversationPattern} element={<ConversationLogDetailPage />} />
        <Route path={R.settings} element={<SettingsPage />} />
        <Route
          path="*"
          element={
            <section className="empty-state">
              <h1>404 · 页面不存在</h1>
              <Link to={R.overview}>返回概览</Link>
            </section>
          }
        />
      </Route>
    </Routes>
  );
}
