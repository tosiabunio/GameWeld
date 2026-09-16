import { Navigate, Route, Routes, useParams } from 'react-router';
import { BacklogPage } from './pages/BacklogPage.tsx';
import { BreakdownPage } from './pages/BreakdownPage.tsx';
import { NewProjectPage } from './pages/NewProjectPage.tsx';
import { ProjectPage } from './pages/ProjectPage.tsx';
import { ProjectsPage } from './pages/ProjectsPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { SignInPage } from './pages/SignInPage.tsx';
import { TaskPage } from './pages/TaskPage.tsx';
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
        <Route path="backlog/:itemId" element={<RedirectToBreakdown />} />
        <Route path="breakdown" element={<BreakdownPage />} />
        <Route path="breakdown/:itemId" element={<BreakdownPage />} />
        <Route path="tasks/:taskId" element={<TaskPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

/** Old item URLs keep working. */
function RedirectToBreakdown() {
  const { projectId, itemId } = useParams();
  return <Navigate to={`/projects/${projectId}/breakdown/${itemId}`} replace />;
}
