/**
 * 公开站路由表
 * 职责：挂载页；路径一律来自 WEB_ROUTES / dual-entry。
 */
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { RouteMetadata } from './components/RouteMetadata';
import { HomePage } from './pages/HomePage';
import { PostsPage } from './pages/PostsPage';
import { PostDetailPage } from './pages/PostDetailPage';
import { ToolsPage } from './pages/ToolsPage';
import { ToolsResourcesPage } from './pages/ToolsResourcesPage';
import { AskPage } from './pages/AskPage';
import { IdeasNewRedirectPage } from './pages/IdeasNewRedirectPage';
import { ExplorePage } from './pages/ExplorePage';
import { ExploreLegacyRedirectPage } from './pages/ExploreLegacyRedirectPage';
import { FerryPage } from './pages/FerryPage';
import { AdvanceTrilogyPage } from './pages/AdvanceTrilogyPage';
import { LabPage } from './pages/LabPage';
import { ShowcasePage } from './pages/ShowcasePage';
import { ConditionPage } from './pages/ConditionPage';
import { KitPage } from './pages/KitPage';
import { ExchangePage } from './pages/ExchangePage';
import { TutorialsPage } from './pages/TutorialsPage';
import { LearnPage } from './pages/LearnPage';
import { LearnGuideRedirectPage } from './pages/LearnGuideRedirectPage';
import { AboutPage } from './pages/AboutPage';
import { MePage } from './pages/MePage';
import { SupportPage } from './pages/SupportPage';
import { GearPage } from './pages/GearPage';
import { AccountLoginShellPage } from './pages/AccountLoginShellPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { dualEntry } from './shared/dual-entry';
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
      <RouteMetadata />
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path={browseBase} element={<PostsPage />} />
          <Route path={`${browseBase}/:slug`} element={<PostDetailPage />} />
          <Route path={strip(WEB_ROUTES.explore)} element={<ExplorePage />} />
          <Route
            path={ideasBase}
            element={<ExploreLegacyRedirectPage view="idea" />}
          />
          <Route path={`${ideasBase}/new`} element={<IdeasNewRedirectPage />} />
          <Route
            path={strip(WEB_ROUTES.projects)}
            element={<ExploreLegacyRedirectPage view="project" />}
          />
          <Route path={strip(WEB_ROUTES.tutorials)} element={<TutorialsPage />} />
          <Route path={strip(WEB_ROUTES.condition)} element={<ConditionPage />} />
          <Route path={strip(WEB_ROUTES.kit)} element={<KitPage />} />
          <Route path={strip(WEB_ROUTES.lab)} element={<LabPage />} />
          <Route path={strip(WEB_ROUTES.showcase)} element={<ShowcasePage />} />
          <Route path={strip(WEB_ROUTES.exchange)} element={<ExchangePage />} />
          <Route path={strip(WEB_ROUTES.ferry)} element={<FerryPage />} />
          <Route
            path={strip(WEB_ROUTES.advanceTrilogy)}
            element={<AdvanceTrilogyPage />}
          />
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
          {/* 旧「内容宇宙」→ 逛；总览只保留 dualEntry.browse */}
          <Route
            path={strip(WEB_ROUTES.content)}
            element={<Navigate to={dualEntry.browse.path} replace />}
          />
          <Route path={strip(WEB_ROUTES.ask)} element={<ToolsPage />} />
          <Route path={strip(WEB_ROUTES.assistant)} element={<AskPage />} />
          <Route
            path={strip(WEB_ROUTES.toolsResources)}
            element={<ToolsResourcesPage />}
          />
          <Route path={strip(WEB_ROUTES.about)} element={<AboutPage />} />
          <Route path={strip(WEB_ROUTES.me)} element={<MePage />} />
          <Route path={strip(WEB_ROUTES.gear)} element={<GearPage />} />
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
