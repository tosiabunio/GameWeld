import { matchPath, Navigate, Route, Routes, useLocation, useParams } from 'react-router';
import { TaskHome, type OpenTask } from './components/TaskModal.tsx';
import { BacklogPage } from './pages/BacklogPage.tsx';
import { BreakdownPage } from './pages/BreakdownPage.tsx';
import { MyTasksPage } from './pages/MyTasksPage.tsx';
import { NewProjectPage } from './pages/NewProjectPage.tsx';
import { ProjectPage } from './pages/ProjectPage.tsx';
import { ProfilePage } from './pages/ProfilePage.tsx';
import { ProjectsPage } from './pages/ProjectsPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { SignInPage } from './pages/SignInPage.tsx';
import { WorkboardPage } from './pages/WorkboardPage.tsx';
import { useSession } from './session.tsx';
import type { TaskLinkState } from './taskLinks.ts';

export function App() {
  const { session } = useSession();
  const location = useLocation();
  const openTask = openTaskAt(location.pathname, location.state);
  if (session.state === 'loading') return <main className="page">Loading…</main>;
  if (session.state === 'anonymous') return <SignInPage />;
  return (
    // A task's window opens over a page: the routes keep showing that page, and the project
    // layout adds the window.
    <Routes location={openTask?.background ?? location}>
      <Route path="/" element={<ProjectsPage />} />
      <Route path="/projects/new" element={<NewProjectPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/projects/:projectId" element={<ProjectPage openTask={openTask} />}>
        <Route index element={<Navigate to="backlog" replace />} />
        <Route path="my-tasks" element={<MyTasksPage />} />
        <Route path="backlog" element={<BacklogPage />} />
        <Route path="backlog/:itemId" element={<RedirectToBreakdown />} />
        <Route path="breakdown" element={<BreakdownPage />} />
        <Route path="breakdown/:itemId" element={<BreakdownPage />} />
        <Route path="tasks/:taskId" element={<TaskHome />} />
        <Route path="board" element={<WorkboardPage />} />
        <Route path="board/:boardId" element={<WorkboardPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

/**
 * The task a location opens and the page to show under it. The page comes with the link that
 * was followed; a location without one, or with one from elsewhere, is a task opened directly.
 */
function openTaskAt(pathname: string, state: unknown): OpenTask | null {
  const match = matchPath('/projects/:projectId/tasks/:taskId', pathname);
  const { background, direct } = (state ?? {}) as Partial<TaskLinkState>;
  const { projectId, taskId } = match?.params ?? {};
  if (!projectId || !taskId || typeof background?.pathname !== 'string') return null;
  const project = `/projects/${projectId}/`;
  if (
    !background.pathname.startsWith(project) ||
    background.pathname.startsWith(`${project}tasks/`)
  )
    return null;
  return { taskId, background, direct: direct === true };
}

/** Old item URLs keep working. */
function RedirectToBreakdown() {
  const { projectId, itemId } = useParams();
  return <Navigate to={`/projects/${projectId}/breakdown/${itemId}`} replace />;
}
