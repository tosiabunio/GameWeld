import type { AuthProviders } from '@gameweld/domain';
import { ROLE_LABELS } from '@gameweld/domain';
import { useEffect, useState } from 'react';
import { api, ApiError } from '../api.ts';
import { useSession } from '../session.tsx';

export function SignInPage() {
  const { refresh } = useSession();
  const [providers, setProviders] = useState<AuthProviders | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.providers().then(setProviders, (e: Error) => setError(e.message));
  }, []);

  async function pick(persona: string) {
    setError(null);
    try {
      await api.mockSignIn(persona);
      await refresh();
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
