/**
 * 公开站路由表
 * 职责：HomePage 同步挂载以便 /#work /#posts /#online 锚点直达；其余路由 React.lazy 按需拆包；
 * 路径一律来自 WEB_ROUTES / dual-entry；旧路径按 LEGACY_REDIRECTS 原地替换跳转。
 */
import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { RouteMetadata } from './components/RouteMetadata';
import { HomePage } from './pages/HomePage';
import { LEGACY_REDIRECTS, WEB_ROUTES } from './shared/routes';

const PostsPage = lazy(() => import('./pages/PostsPage').then((m) => ({ default: m.PostsPage })));
const PostDetailPage = lazy(() => import('./pages/PostDetailPage').then((m) => ({ default: m.PostDetailPage })));
const PostVersionPage = lazy(() => import('./pages/PostVersionPage').then((m) => ({ default: m.PostVersionPage })));
const PostHistoryPage = lazy(() => import('./pages/PostHistoryPage').then((m) => ({ default: m.PostHistoryPage })));
const GraphPage = lazy(() => import('./pages/GraphPage').then((m) => ({ default: m.GraphPage })));
const ToolsPage = lazy(() => import('./pages/ToolsPage').then((m) => ({ default: m.ToolsPage })));
const ToolsResultPage = lazy(() => import('./pages/ToolsResultPage').then((m) => ({ default: m.ToolsResultPage })));
const MePage = lazy(() => import('./pages/MePage').then((m) => ({ default: m.MePage })));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })));

function strip(path: string): string {
  return path.startsWith('/') ? path.slice(1) : path;
}

const browseBase = strip(WEB_ROUTES.browse);

function LazyRoute({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="page-loading" aria-busy="true" />}>
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
          <Route index element={<HomePage />} />
          <Route path={browseBase} element={<LazyRoute><PostsPage /></LazyRoute>} />
          <Route path={`${browseBase}/:slug`} element={<LazyRoute><PostDetailPage /></LazyRoute>} />
          <Route path={`${browseBase}/:slug/history`} element={<LazyRoute><PostHistoryPage /></LazyRoute>} />
          <Route path={`${browseBase}/:slug/v/:version`} element={<LazyRoute><PostVersionPage /></LazyRoute>} />
          <Route path={strip(WEB_ROUTES.graph)} element={<LazyRoute><GraphPage /></LazyRoute>} />
          <Route path={strip(WEB_ROUTES.ask)} element={<LazyRoute><ToolsPage /></LazyRoute>} />
          <Route path={strip(WEB_ROUTES.toolsResult)} element={<LazyRoute><ToolsResultPage /></LazyRoute>} />
          <Route path={strip(WEB_ROUTES.me)} element={<LazyRoute><MePage /></LazyRoute>} />
          {LEGACY_REDIRECTS.map(({ source, destination }) => (
            <Route key={source} path={strip(source)} element={<Navigate to={destination} replace />} />
          ))}
          <Route path="learn/*" element={<Navigate to="/posts?c=use" replace />} />
          <Route path="*" element={<LazyRoute><NotFoundPage /></LazyRoute>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
