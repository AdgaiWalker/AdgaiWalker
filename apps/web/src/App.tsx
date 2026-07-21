import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { HomePage } from './pages/HomePage';
import { PostsPage } from './pages/PostsPage';
import { PostDetailPage } from './pages/PostDetailPage';
import { ToolsPage } from './pages/ToolsPage';
import { ToolsResourcesPage } from './pages/ToolsResourcesPage';
import { IdeasPage } from './pages/IdeasPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { LearnPage } from './pages/LearnPage';
import { ContentUniversePage } from './pages/ContentUniversePage';
import { AboutPage } from './pages/AboutPage';
import { SupportPage } from './pages/SupportPage';
import { AccountLoginShellPage } from './pages/AccountLoginShellPage';
import { WEB_ROUTES } from './shared/routes';

/** React Router 相对 path（去掉前导 /） */
function strip(path: string): string {
  return path.startsWith('/') ? path.slice(1) : path;
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path={strip(WEB_ROUTES.browse)} element={<PostsPage />} />
          <Route path={`${strip(WEB_ROUTES.browse)}/:slug`} element={<PostDetailPage />} />
          <Route path={strip(WEB_ROUTES.ideas)} element={<IdeasPage />} />
          <Route path={strip(WEB_ROUTES.projects)} element={<ProjectsPage />} />
          <Route path={strip(WEB_ROUTES.learn)} element={<LearnPage />} />
          <Route path={strip(WEB_ROUTES.content)} element={<ContentUniversePage />} />
          <Route path={strip(WEB_ROUTES.ask)} element={<ToolsPage />} />
          <Route
            path={strip(WEB_ROUTES.toolsResources)}
            element={<ToolsResourcesPage />}
          />
          <Route path={strip(WEB_ROUTES.about)} element={<AboutPage />} />
          <Route path={strip(WEB_ROUTES.support)} element={<SupportPage />} />
          <Route path={strip(WEB_ROUTES.login)} element={<AccountLoginShellPage />} />
          <Route path="*" element={<Navigate to={WEB_ROUTES.home} replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
