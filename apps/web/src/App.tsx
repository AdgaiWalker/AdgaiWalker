/**
 * 公开站路由表
 * 职责：全路由 React.lazy 按需拆包挂载；路径一律来自 WEB_ROUTES / dual-entry。
 */
import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { RouteMetadata } from './components/RouteMetadata';
import { dualEntry } from './shared/dual-entry';
import { WEB_ROUTES } from './shared/routes';

const HomePage = lazy(() => import('./pages/HomePage').then((m) => ({ default: m.HomePage })));
const PostsPage = lazy(() => import('./pages/PostsPage').then((m) => ({ default: m.PostsPage })));
const PostDetailPage = lazy(() => import('./pages/PostDetailPage').then((m) => ({ default: m.PostDetailPage })));
const PostVersionPage = lazy(() => import('./pages/PostVersionPage').then((m) => ({ default: m.PostVersionPage })));
const PostHistoryPage = lazy(() => import('./pages/PostHistoryPage').then((m) => ({ default: m.PostHistoryPage })));
const GraphPage = lazy(() => import('./pages/GraphPage').then((m) => ({ default: m.GraphPage })));
const ToolsPage = lazy(() => import('./pages/ToolsPage').then((m) => ({ default: m.ToolsPage })));
const ToolsResultPage = lazy(() => import('./pages/ToolsResultPage').then((m) => ({ default: m.ToolsResultPage })));
const ToolsResourcesPage = lazy(() => import('./pages/ToolsResourcesPage').then((m) => ({ default: m.ToolsResourcesPage })));
const AskPage = lazy(() => import('./pages/AskPage').then((m) => ({ default: m.AskPage })));
const IdeasNewRedirectPage = lazy(() => import('./pages/IdeasNewRedirectPage').then((m) => ({ default: m.IdeasNewRedirectPage })));
const ExplorePage = lazy(() => import('./pages/ExplorePage').then((m) => ({ default: m.ExplorePage })));
const ExploreLegacyRedirectPage = lazy(() => import('./pages/ExploreLegacyRedirectPage').then((m) => ({ default: m.ExploreLegacyRedirectPage })));
const FerryPage = lazy(() => import('./pages/FerryPage').then((m) => ({ default: m.FerryPage })));
const AdvanceTrilogyPage = lazy(() => import('./pages/AdvanceTrilogyPage').then((m) => ({ default: m.AdvanceTrilogyPage })));
const LabPage = lazy(() => import('./pages/LabPage').then((m) => ({ default: m.LabPage })));
const ShowcasePage = lazy(() => import('./pages/ShowcasePage').then((m) => ({ default: m.ShowcasePage })));
const ConditionPage = lazy(() => import('./pages/ConditionPage').then((m) => ({ default: m.ConditionPage })));
const KitPage = lazy(() => import('./pages/KitPage').then((m) => ({ default: m.KitPage })));
const ExchangePage = lazy(() => import('./pages/ExchangePage').then((m) => ({ default: m.ExchangePage })));
const TutorialsPage = lazy(() => import('./pages/TutorialsPage').then((m) => ({ default: m.TutorialsPage })));
const LearnPage = lazy(() => import('./pages/LearnPage').then((m) => ({ default: m.LearnPage })));
const LearnGuideRedirectPage = lazy(() => import('./pages/LearnGuideRedirectPage').then((m) => ({ default: m.LearnGuideRedirectPage })));
const AboutPage = lazy(() => import('./pages/AboutPage').then((m) => ({ default: m.AboutPage })));
const MePage = lazy(() => import('./pages/MePage').then((m) => ({ default: m.MePage })));
const SupportPage = lazy(() => import('./pages/SupportPage').then((m) => ({ default: m.SupportPage })));
const GearPage = lazy(() => import('./pages/GearPage').then((m) => ({ default: m.GearPage })));
const AccountLoginShellPage = lazy(() => import('./pages/AccountLoginShellPage').then((m) => ({ default: m.AccountLoginShellPage })));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })));

function strip(path: string): string {
  return path.startsWith('/') ? path.slice(1) : path;
}

const ideasBase = strip(WEB_ROUTES.ideas);
const learnBase = strip(WEB_ROUTES.learn);
const browseBase = strip(WEB_ROUTES.browse);

function LazyRoute({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="page-loading" aria-busy="true">正在打开…</div>}>
      {children}
    </Suspense>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <RouteMetadata />
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<LazyRoute><HomePage /></LazyRoute>} />
          <Route path={browseBase} element={<LazyRoute><PostsPage /></LazyRoute>} />
          <Route path={`${browseBase}/:slug`} element={<LazyRoute><PostDetailPage /></LazyRoute>} />
          <Route path={`${browseBase}/:slug/history`} element={<LazyRoute><PostHistoryPage /></LazyRoute>} />
          <Route path={`${browseBase}/:slug/v/:version`} element={<LazyRoute><PostVersionPage /></LazyRoute>} />
          <Route path={strip(WEB_ROUTES.graph)} element={<LazyRoute><GraphPage /></LazyRoute>} />
          <Route path={strip(WEB_ROUTES.architecture)} element={<Navigate to={WEB_ROUTES.graph} replace />} />
          <Route path={strip(WEB_ROUTES.explore)} element={<LazyRoute><ExplorePage /></LazyRoute>} />
          <Route path={ideasBase} element={<LazyRoute><ExploreLegacyRedirectPage view="idea" /></LazyRoute>} />
          <Route path={`${ideasBase}/new`} element={<LazyRoute><IdeasNewRedirectPage /></LazyRoute>} />
          <Route path={strip(WEB_ROUTES.projects)} element={<LazyRoute><ExploreLegacyRedirectPage view="project" /></LazyRoute>} />
          <Route path={strip(WEB_ROUTES.tutorials)} element={<LazyRoute><TutorialsPage /></LazyRoute>} />
          <Route path={strip(WEB_ROUTES.condition)} element={<LazyRoute><ConditionPage /></LazyRoute>} />
          <Route path={strip(WEB_ROUTES.kit)} element={<LazyRoute><KitPage /></LazyRoute>} />
          <Route path={strip(WEB_ROUTES.lab)} element={<LazyRoute><LabPage /></LazyRoute>} />
          <Route path={strip(WEB_ROUTES.showcase)} element={<LazyRoute><ShowcasePage /></LazyRoute>} />
          <Route path={strip(WEB_ROUTES.exchange)} element={<LazyRoute><ExchangePage /></LazyRoute>} />
          <Route path={strip(WEB_ROUTES.ferry)} element={<LazyRoute><FerryPage /></LazyRoute>} />
          <Route path={strip(WEB_ROUTES.advanceTrilogy)} element={<LazyRoute><AdvanceTrilogyPage /></LazyRoute>} />
          <Route path={learnBase} element={<LazyRoute><LearnPage /></LazyRoute>} />
          <Route path={`${learnBase}/guide/:level/:tool`} element={<LazyRoute><LearnGuideRedirectPage /></LazyRoute>} />
          <Route path={`${learnBase}/track/:id`} element={<LazyRoute><LearnGuideRedirectPage /></LazyRoute>} />
          <Route path={`${learnBase}/:slug`} element={<LazyRoute><LearnGuideRedirectPage /></LazyRoute>} />
          <Route path={strip(WEB_ROUTES.content)} element={<Navigate to={dualEntry.browse.path} replace />} />
          <Route path={strip(WEB_ROUTES.ask)} element={<LazyRoute><ToolsPage /></LazyRoute>} />
          <Route path={strip(WEB_ROUTES.toolsResult)} element={<LazyRoute><ToolsResultPage /></LazyRoute>} />
          <Route path={strip(WEB_ROUTES.assistant)} element={<LazyRoute><AskPage /></LazyRoute>} />
          <Route path={strip(WEB_ROUTES.toolsResources)} element={<LazyRoute><ToolsResourcesPage /></LazyRoute>} />
          <Route path={strip(WEB_ROUTES.about)} element={<LazyRoute><AboutPage /></LazyRoute>} />
          <Route path={strip(WEB_ROUTES.me)} element={<LazyRoute><MePage /></LazyRoute>} />
          <Route path={strip(WEB_ROUTES.gear)} element={<LazyRoute><GearPage /></LazyRoute>} />
          <Route path={strip(WEB_ROUTES.support)} element={<LazyRoute><SupportPage /></LazyRoute>} />
          <Route path={strip(WEB_ROUTES.login)} element={<LazyRoute><AccountLoginShellPage /></LazyRoute>} />
          <Route path="*" element={<LazyRoute><NotFoundPage /></LazyRoute>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
