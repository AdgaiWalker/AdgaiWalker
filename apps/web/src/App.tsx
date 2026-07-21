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

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="posts" element={<PostsPage />} />
          <Route path="posts/:slug" element={<PostDetailPage />} />
          <Route path="ideas" element={<IdeasPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="learn" element={<LearnPage />} />
          <Route path="content" element={<ContentUniversePage />} />
          <Route path="tools" element={<ToolsPage />} />
          <Route path="tools/resources" element={<ToolsResourcesPage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="support" element={<SupportPage />} />
          <Route path="login" element={<AccountLoginShellPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
