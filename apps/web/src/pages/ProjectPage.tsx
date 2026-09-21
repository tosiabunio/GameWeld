import type { ProjectDetail } from '@gameweld/domain';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { NavLink, Outlet, useParams } from 'react-router';
import { api, ApiError } from '../api.ts';
import { TaskModal, type OpenTask } from '../components/TaskModal.tsx';
import { t } from '../i18n/index.ts';
import { isForeignChange, subscribeLive } from '../live.ts';
import { Shell } from './Shell.tsx';

interface ProjectContextValue {
  project: ProjectDetail;
  reload: () => Promise<void>;
  /**
   * Counts changes to the project's data that a page may not have seen: made in a task's window
   * open over it, or by someone else (live updates). Pages load again when it moves.
   */
  dataVersion: number;
  notifyChanged: () => void;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function useProject(): ProjectContextValue {
  const value = useContext(ProjectContext);
  if (!value) throw new Error('useProject must be used inside ProjectPage');
  return value;
}

/**
 * Layout for everything under /projects/:projectId: loads the project and offers section
 * navigation. A task opens in a window over whichever section is showing.
 */
export function ProjectPage({ openTask }: { openTask: OpenTask | null }) {
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
          ? t('Project not found, or you are not a member.')
          : t('Could not load the project'),
      );
    }
  }, [projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const [dataVersion, setDataVersion] = useState(0);
  const notifyChanged = useCallback(() => setDataVersion((version) => version + 1), []);

  // Live updates: someone else changed something in this project. A burst of events, as one
  // action often causes, is one reload. Membership and settings belong to the project itself.
  useEffect(() => {
    let timer: number | undefined;
    let projectToo = false;
    const unsubscribe = subscribeLive((event) => {
      if (!isForeignChange(event, projectId!)) return;
      // Labels are part of the project too: pickers and filters list them.
      projectToo ||=
        event.resync === true ||
        event.t === 'project' ||
        event.t === 'user' ||
        event.t === 'invitation' ||
        event.t === 'label';
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (projectToo) void reload();
        projectToo = false;
        notifyChanged();
      }, 200);
    });
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, [projectId, reload, notifyChanged]);

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
        <p>{t('Loading…')}</p>
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
          aria-label={t('Project settings')}
          title={t('Project settings')}
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
        <nav className="tabs" aria-label={t('Project sections')}>
          <NavLink to="my-tasks" className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
            {t('My tasks')}
          </NavLink>
          <NavLink to="backlog" className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
            {t('Backlog')}
          </NavLink>
          <NavLink to="breakdown" className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
            {t('Breakdown')}
          </NavLink>
          <NavLink to="board" className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
            {t('Workboard')}
          </NavLink>
          <NavLink to="overview" className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
            {t('Overview')}
          </NavLink>
        </nav>
      }
    >
      <ProjectContext.Provider value={{ project, reload, dataVersion, notifyChanged }}>
        <Outlet />
        {openTask && <TaskModal key={openTask.taskId} {...openTask} />}
      </ProjectContext.Provider>
    </Shell>
  );
}
