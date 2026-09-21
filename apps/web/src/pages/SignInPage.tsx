import type { AuthProviders, SignInError } from '@gameweld/domain';
import { ROLE_LABELS } from '@gameweld/domain';
import { useEffect, useState } from 'react';
import { api, ApiError } from '../api.ts';
import { Avatar, Logo } from '../components/Brand.tsx';
import { t } from '../i18n/index.ts';
import { useSession } from '../session.tsx';

/**
 * A provider sign-in that did not get in comes back as `?auth_error=` (and the address it used).
 * Read once, then taken out of the address bar so a reload does not show it again.
 */
function takeReturnedError(): string | null {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('auth_error') as SignInError | null;
  if (!code) return null;
  const email = params.get('email');
  window.history.replaceState(null, '', window.location.pathname);
  switch (code) {
    case 'not_invited':
      return email
        ? t(
            '{email} has not been invited. Ask a Game Director of your project to invite this address, or sign in with the account that was invited.',
            { email },
          )
        : t(
            'This account has not been invited. Ask a Game Director of your project to invite you.',
          );
    case 'email_unverified':
      return t(
        'Your provider has not verified this account’s e-mail address, so it cannot be matched to an invitation.',
      );
    case 'expired':
      return t('The sign-in took too long or was started in another browser. Please try again.');
    case 'unavailable':
      return t('The sign-in provider cannot be reached right now. Please try again in a moment.');
    default:
      return t('Sign-in failed');
  }
}

export function SignInPage() {
  const { refresh } = useSession();
  const [providers, setProviders] = useState<AuthProviders | null>(null);
  const [error, setError] = useState<string | null>(takeReturnedError);

  useEffect(() => {
    api.providers().then(setProviders, (e: Error) => setError(e.message));
  }, []);

  async function pick(persona: string) {
    setError(null);
    try {
      await api.mockSignIn(persona);
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('Sign-in failed'));
    }
  }

  return (
    <main className="auth">
      <div className="auth-card">
        <div className="auth-brand">
          <Logo size={44} />
          <h1>GameWeld</h1>
          <p className="muted">{t('Production Management System')}</p>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {providers && providers.oidc.length > 0 && (
          <section aria-label={t('Sign in')} className="provider-list">
            {providers.oidc.map((p) => (
              <a
                key={p.id}
                className="button primary"
                href={`/api/auth/${p.id}/start`}
                data-testid={`sign-in-${p.id}`}
              >
                {t('Sign in with {provider}', { provider: p.label })}
              </a>
            ))}
            <p className="muted">
              {t('GameWeld is by invitation. Use the address you were invited with.')}
            </p>
          </section>
        )}
        {providers?.mock.enabled ? (
          <section aria-labelledby="persona-heading">
            <h2 id="persona-heading">{t('Sign in as')}</h2>
            <p className="muted">
              {t('Mock sign-in is enabled for local development. Pick a persona.')}
            </p>
            <ul className="persona-list">
              {providers.mock.personas.map((p) => (
                <li key={p.key}>
                  <button
                    type="button"
                    onClick={() => pick(p.key)}
                    data-testid={`persona-${p.key}`}
                  >
                    <Avatar name={p.displayName} size={36} />
                    <span className="persona-text">
                      <strong>{p.displayName}</strong>
                      <span className="muted">
                        {p.roles.map((r) => t(ROLE_LABELS[r])).join(', ')}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : providers && providers.oidc.length === 0 ? (
          <p>{t('No sign-in provider is configured for this instance.')}</p>
        ) : providers ? null : (
          <p>{t('Loading…')}</p>
        )}
      </div>
    </main>
  );
}
