import type { AuthProviders, CurrentUser, ProjectSummary } from '@gameweld/domain';
import { ROLE_LABELS } from '@gameweld/domain';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from './api.ts';

type Session =
  { state: 'loading' } | { state: 'anonymous' } | { state: 'signed-in'; user: CurrentUser };

export function App() {
  const [session, setSession] = useState<Session>({ state: 'loading' });

  const refresh = useCallback(async () => {
    const user = await api.me();
    setSession(user ? { state: 'signed-in', user } : { state: 'anonymous' });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (session.state === 'loading') return <main className="page">Loading…</main>;
  if (session.state === 'anonymous') return <SignIn onSignedIn={refresh} />;
  return <Projects user={session.user} onSignedOut={refresh} />;
}

function SignIn({ onSignedIn }: { onSignedIn: () => Promise<void> }) {
  const [providers, setProviders] = useState<AuthProviders | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.providers().then(setProviders, (e: Error) => setError(e.message));
  }, []);

  async function pick(persona: string) {
    setError(null);
    try {
      await api.mockSignIn(persona);
      await onSignedIn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Sign-in failed');
    }
  }

  return (
    <main className="page narrow">
      <h1>GameWeld</h1>
      <p className="muted">Production Management System</p>
      {error && <p className="error">{error}</p>}
      {providers?.mock.enabled ? (
        <section aria-labelledby="persona-heading">
          <h2 id="persona-heading">Sign in as</h2>
          <p className="muted">Mock sign-in is enabled for local development. Pick a persona.</p>
          <ul className="persona-list">
            {providers.mock.personas.map((p) => (
              <li key={p.key}>
                <button type="button" onClick={() => pick(p.key)} data-testid={`persona-${p.key}`}>
                  <strong>{p.displayName}</strong>
                  <span className="muted">{p.roles.map((r) => ROLE_LABELS[r]).join(', ')}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : providers ? (
        <p>No sign-in provider is configured for this instance.</p>
      ) : (
        <p>Loading…</p>
      )}
    </main>
  );
}

function Projects({ user, onSignedOut }: { user: CurrentUser; onSignedOut: () => Promise<void> }) {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);

  useEffect(() => {
    api.projects().then(setProjects);
  }, []);

  async function signOut() {
    await api.signOut();
    await onSignedOut();
  }

  return (
    <main className="page">
      <header className="topbar">
        <h1>GameWeld</h1>
        <div className="user">
          <span data-testid="current-user">{user.displayName}</span>
          <button type="button" onClick={signOut}>
            {user.provider === 'mock' ? 'Switch persona' : 'Sign out'}
          </button>
        </div>
      </header>
      <h2>Projects</h2>
      {projects === null ? (
        <p>Loading…</p>
      ) : projects.length === 0 ? (
        <p>You are not a member of any project yet.</p>
      ) : (
        <ul className="project-list">
          {projects.map((p) => (
            <li key={p.id} data-testid="project-card">
              <h3>{p.name}</h3>
              <p>{p.description}</p>
              <p className="muted">
                Your roles: {p.roles.map((r) => ROLE_LABELS[r]).join(', ')} · {p.itemCount} backlog
                items · scope limit {p.scopeLimit}
                {p.doneRestricted ? ' · Done restricted to Testers' : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
