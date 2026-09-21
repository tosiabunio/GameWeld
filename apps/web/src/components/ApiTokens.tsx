import type { ApiToken, CreatedToken, TokenAccess } from '@gameweld/domain';
import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api.ts';
import { t, tj } from '../i18n/index.ts';

const ACCESS_LABELS: Record<TokenAccess, string> = {
  read: 'Read only',
  write: 'Read and write',
};

/**
 * The member's API tokens, in their profile: keys that let a script or an assistant act as them.
 * A new token is shown here once, until the member has put it away; after that only its name is
 * known.
 */
export function ApiTokens() {
  const [tokens, setTokens] = useState<ApiToken[] | null>(null);
  const [name, setName] = useState('');
  const [access, setAccess] = useState<TokenAccess>('read');
  const [created, setCreated] = useState<CreatedToken | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.tokens().then(setTokens, () => setTokens([]));
  }, []);

  async function make(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const made = await api.createToken({ name, access });
      setCreated(made);
      setTokens((list) => [...(list ?? []), made.token]);
      setName('');
      setAccess('read');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('Something went wrong'));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(token: ApiToken) {
    setError(null);
    try {
      await api.revokeToken(token.id);
      setTokens((list) => list?.filter((x) => x.id !== token.id) ?? null);
      if (created?.token.id === token.id) setCreated(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('Something went wrong'));
    }
  }

  return (
    <section className="panel" aria-labelledby="tokens-heading">
      <h2 id="tokens-heading">{t('API tokens')}</h2>
      <p className="muted small">
        {tj(
          'A token lets a script or an AI assistant use GameWeld as you, with your permissions, through the <1>API</1>. Anyone who has it can do what it allows, so keep it as you would a password.',
          undefined,
          {
            1: (s) => (
              <a href="/api/openapi.json" target="_blank" rel="noreferrer">
                {s}
              </a>
            ),
          },
        )}
      </p>
      {created && (
        <div className="token-created" aria-live="polite">
          <p>
            <strong>
              {t('Your new token “{name}”. Copy it now: it is not shown again.', {
                name: created.token.name,
              })}
            </strong>
          </p>
          <Copyable text={created.secret} testId="token-secret" />
          <p className="small">{t('To use it from Claude Code, run this in a terminal:')}</p>
          <Copyable
            text={`claude mcp add --transport http --scope user gameweld ${window.location.origin}/api/mcp --header "Authorization: Bearer ${created.secret}"`}
            testId="token-mcp-command"
          />
          <div className="row">
            <button type="button" className="quiet" onClick={() => setCreated(null)}>
              {t('Done')}
            </button>
          </div>
        </div>
      )}
      {tokens && tokens.length > 0 && (
        <ul className="token-list" aria-label={t('Your tokens')}>
          {tokens.map((token) => (
            <li key={token.id} data-testid="token">
              <div>
                <strong>{token.name}</strong>{' '}
                <span className={token.access === 'write' ? 'badge warn' : 'badge neutral'}>
                  {t(ACCESS_LABELS[token.access])}
                </span>
                <p className="muted small">
                  {t('Made {date}', { date: new Date(token.createdAt).toLocaleDateString() })}
                  {' · '}
                  {token.lastUsedAt
                    ? t('last used {date}', {
                        date: new Date(token.lastUsedAt).toLocaleString(),
                      })
                    : t('never used')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void revoke(token)}
                aria-label={t('Revoke {name}', { name: token.name })}
              >
                {t('Revoke')}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <form className="form token-form" onSubmit={(e) => void make(e)}>
        <label>
          {t('Name')}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            required
            placeholder={t('What it is for, such as “Claude on my laptop”')}
          />
        </label>
        <label>
          {t('Access')}
          <select value={access} onChange={(e) => setAccess(e.target.value as TokenAccess)}>
            <option value="read">{t(ACCESS_LABELS.read)}</option>
            <option value="write">{t(ACCESS_LABELS.write)}</option>
          </select>
        </label>
        <button type="submit" className="primary" disabled={busy || !name.trim()}>
          {t('Make a token')}
        </button>
      </form>
    </section>
  );
}

/** Text to copy: shown whole, selectable by hand, and copied with one click where allowed. */
function Copyable({ text, testId }: { text: string; testId: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // No clipboard here (an insecure page, or a refusal): the text stays shown to select.
    }
  }
  return (
    <div className="row token-copy">
      <code className="token-secret" data-testid={testId}>
        {text}
      </code>
      <button type="button" onClick={() => void copy()}>
        {copied ? t('Copied') : t('Copy')}
      </button>
    </div>
  );
}
