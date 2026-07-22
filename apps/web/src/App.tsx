/**
 * 公开站路由表
 * 职责：挂载页；路径一律来自 WEB_ROUTES / dual-entry。
 */
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { HomePage } from './pages/HomePage';
import { PostsPage } from './pages/PostsPage';
import { PostDetailPage } from './pages/PostDetailPage';
import { ToolsPage } from './pages/ToolsPage';
import { ToolsResourcesPage } from './pages/ToolsResourcesPage';
import { IdeasPage } from './pages/IdeasPage';
import { IdeasNewRedirectPage } from './pages/IdeasNewRedirectPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { FerryPage } from './pages/FerryPage';
import { LearnPage } from './pages/LearnPage';
import { LearnGuideRedirectPage } from './pages/LearnGuideRedirectPage';
import { ContentUniversePage } from './pages/ContentUniversePage';
import { AboutPage } from './pages/AboutPage';
import { SupportPage } from './pages/SupportPage';
import { AccountLoginShellPage } from './pages/AccountLoginShellPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { WEB_ROUTES } from './shared/routes';

function strip(path: string): string {
  return path.startsWith('/') ? path.slice(1) : path;
}

const ideasBase = strip(WEB_ROUTES.ideas);
const learnBase = strip(WEB_ROUTES.learn);
const browseBase = strip(WEB_ROUTES.browse);

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path={browseBase} element={<PostsPage />} />
          <Route path={`${browseBase}/:slug`} element={<PostDetailPage />} />
          <Route path={ideasBase} element={<IdeasPage />} />
          <Route path={`${ideasBase}/new`} element={<IdeasNewRedirectPage />} />
          <Route path={strip(WEB_ROUTES.projects)} element={<ProjectsPage />} />
          <Route path={strip(WEB_ROUTES.ferry)} element={<FerryPage />} />
          <Route path={learnBase} element={<LearnPage />} />
          <Route
            path={`${learnBase}/guide/:level/:tool`}
            element={<LearnGuideRedirectPage />}
          />
          <Route
            path={`${learnBase}/track/:id`}
            element={<LearnGuideRedirectPage />}
          />
          <Route path={`${learnBase}/:slug`} element={<LearnGuideRedirectPage />} />
          <Route path={strip(WEB_ROUTES.content)} element={<ContentUniversePage />} />
          <Route path={strip(WEB_ROUTES.ask)} element={<ToolsPage />} />
          <Route
            path={strip(WEB_ROUTES.toolsResources)}
            element={<ToolsResourcesPage />}
          />
          <Route path={strip(WEB_ROUTES.about)} element={<AboutPage />} />
          <Route path={strip(WEB_ROUTES.support)} element={<SupportPage />} />
          <Route
            path={strip(WEB_ROUTES.login)}
            element={<AccountLoginShellPage />}
          />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
