import { Navigate, Route, Routes } from 'react-router';
import { BacklogItemPage } from './pages/BacklogItemPage.tsx';
import { BacklogPage } from './pages/BacklogPage.tsx';
import { NewProjectPage } from './pages/NewProjectPage.tsx';
import { ProjectPage } from './pages/ProjectPage.tsx';
import { ProjectsPage } from './pages/ProjectsPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { SignInPage } from './pages/SignInPage.tsx';
import { useSession } from './session.tsx';

export function App() {
  const { session } = useSession();
  if (session.state === 'loading') return <main className="page">Loading…</main>;
  if (session.state === 'anonymous') return <SignInPage />;
  return (
    <Routes>
      <Route path="/" element={<ProjectsPage />} />
      <Route path="/projects/new" element={<NewProjectPage />} />
      <Route path="/projects/:projectId" element={<ProjectPage />}>
        <Route index element={<Navigate to="backlog" replace />} />
        <Route path="backlog" element={<BacklogPage />} />
        <Route path="backlog/:itemId" element={<BacklogItemPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
