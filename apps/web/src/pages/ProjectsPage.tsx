import type { ProjectSummary } from '@gameweld/domain';
import { ROLE_LABELS } from '@gameweld/domain';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api.ts';
import { Shell } from './Shell.tsx';

export function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    setProjects(null);
    api.projects(showArchived).then(setProjects);
  }, [showArchived]);

  return (
    <Shell>
      <div className="row between page-head">
        <h2>{showArchived ? 'Archived projects' : 'Projects'}</h2>
        <div className="row">
          <button type="button" className="link" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? 'Show active' : 'Show archived'}
          </button>
          <Link className="button primary" to="/projects/new">
            New project
          </Link>
        </div>
      </div>
      {projects === null ? (
        <p>Loading…</p>
      ) : projects.length === 0 ? (
        <p className="muted">
          {showArchived
            ? 'No archived projects.'
            : 'You are not a member of any project yet. Create one to become its Game Director.'}
        </p>
      ) : (
        <ul className="card-list project-grid">
          {projects.map((p) => (
            <li key={p.id} className="project-card" data-testid="project-card">
              <h3>
                <Link to={`/projects/${p.id}`}>{p.name}</Link>
              </h3>
              {p.description && <p className="project-desc">{p.description}</p>}
              <p className="muted small">
                Your roles: {p.roles.map((r) => ROLE_LABELS[r]).join(', ')}
              </p>
              <p className="stats">
                <span>{p.itemCount} backlog items</span>
                <span>scope limit {p.scopeLimit}</span>
                {p.doneRestricted && <span>Done restricted to Testers</span>}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}
