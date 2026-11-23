import { lazy, Suspense } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { AdminShell } from "./AdminShell";
import { ADMIN_ROUTES as R } from "../shared/routes";
import { ContentListPage } from "../pages/content/ContentListPage";
import { LoadingState } from "../components/States";

const ContentDetailPage = lazy(() =>
  import("../pages/content/ContentDetailPage").then((m) => ({ default: m.ContentDetailPage })),
);
const RunListPage = lazy(() =>
  import("../pages/records/RunListPage").then((m) => ({ default: m.RunListPage })),
);
const RunDetailPage = lazy(() =>
  import("../pages/records/RunDetailPage").then((m) => ({ default: m.RunDetailPage })),
);
const ConversationLogDetailPage = lazy(() =>
  import("../pages/records/ConversationLogDetailPage").then((m) => ({
    default: m.ConversationLogDetailPage,
  })),
);
const AgentListPage = lazy(() =>
  import("../pages/agents/AgentListPage").then((m) => ({ default: m.AgentListPage })),
);
const AgentDetailPage = lazy(() =>
  import("../pages/agents/AgentListPage").then((m) => ({ default: m.AgentDetailPage })),
);
const DeploymentsPage = lazy(() =>
  import("../pages/deployments/DeploymentsPage").then((m) => ({ default: m.DeploymentsPage })),
);
const SettingsPage = lazy(() =>
  import("../pages/settings/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);

function Lazy({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<LoadingState />}>{children}</Suspense>;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AdminShell />}>
        {/* 默认首页与旧 /overview 书签均直达文章主工作流 */}
        <Route index element={<Navigate to={R.content} replace />} />
        <Route path={R.overview} element={<Navigate to={R.content} replace />} />

        <Route path={R.content} element={<ContentListPage />} />
        <Route path={R.contentPattern} element={<Lazy><ContentDetailPage /></Lazy>} />

        <Route path={R.records} element={<Lazy><RunListPage /></Lazy>} />
        <Route path={R.runPattern} element={<Lazy><RunDetailPage /></Lazy>} />
        <Route path={R.conversationPattern} element={<Lazy><ConversationLogDetailPage /></Lazy>} />

        <Route path={R.settings} element={<Lazy><SettingsPage /></Lazy>} />
        {/* 保留 Agent 与部署深链，零破坏书签 */}
        <Route path={R.agents} element={<Lazy><AgentListPage /></Lazy>} />
        <Route path={R.deployments} element={<Lazy><DeploymentsPage /></Lazy>} />
        <Route path={R.agentPattern} element={<Lazy><AgentDetailPage /></Lazy>} />

        <Route
          path="*"
          element={
            <section className="empty-state">
              <strong>页面不存在</strong>
              <Link className="btn" to={R.content}>
                返回文章
              </Link>
            </section>
          }
        />
      </Route>
    </Routes>
  );
}
