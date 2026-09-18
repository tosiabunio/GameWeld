import type { ProjectDetail } from '@gameweld/domain';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { NavLink, Outlet, useParams } from 'react-router';
import { api, ApiError } from '../api.ts';
import { Shell } from './Shell.tsx';

interface ProjectContextValue {
  project: ProjectDetail;
  reload: () => Promise<void>;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function useProject(): ProjectContextValue {
  const value = useContext(ProjectContext);
  if (!value) throw new Error('useProject must be used inside ProjectPage');
  return value;
}

/** Layout for everything under /projects/:projectId: loads the project and offers section navigation. */
export function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setProject(await api.project(projectId!));
      setError(null);
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 404
          ? 'Project not found, or you are not a member.'
          : 'Could not load the project',
      );
    }
  }, [projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (error) {
    return (
      <Shell>
        <p className="error">{error}</p>
      </Shell>
    );
  }
  if (!project) {
    return (
      <Shell>
        <p>Loading…</p>
      </Shell>
    );
  }

  return (
    <Shell
      title={project.name}
      titleAction={
        <NavLink
          to="settings"
          className={({ isActive }) => `settings-link${isActive ? ' active' : ''}`}
          aria-label="Project settings"
          title="Project settings"
        >
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </NavLink>
      }
      nav={
        <nav className="tabs" aria-label="Project sections">
          <NavLink to="backlog" className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
            Backlog
          </NavLink>
          <NavLink to="breakdown" className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
            Breakdown
          </NavLink>
          <NavLink to="board" className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
            Workboard
          </NavLink>
        </nav>
      }
    >
      <ProjectContext.Provider value={{ project, reload }}>
        <Outlet />
      </ProjectContext.Provider>
    </Shell>
  );
}
