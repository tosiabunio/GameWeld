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
    <Shell title={project.name}>
      <nav className="tabs" aria-label="Project sections">
        <NavLink to="backlog" className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
          Backlog
        </NavLink>
        <span className="tab disabled" title="Arrives in Phase 4">
          Workboard
        </span>
        <NavLink to="settings" className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
          Settings
        </NavLink>
      </nav>
      <ProjectContext.Provider value={{ project, reload }}>
        <Outlet />
      </ProjectContext.Provider>
    </Shell>
  );
}
