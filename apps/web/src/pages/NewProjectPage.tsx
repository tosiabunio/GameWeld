import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { api, ApiError } from '../api.ts';
import { t } from '../i18n/index.ts';
import { useSession } from '../session.tsx';
import { Shell } from './Shell.tsx';

export function NewProjectPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scopeLimit, setScopeLimit] = useState(5);
  const [doneRestricted, setDoneRestricted] = useState(false);
  const [directorEmail, setDirectorEmail] = useState('');
  const [created, setCreated] = useState<string | null>(null);
  const { session } = useSession();
  const user = session.state === 'signed-in' ? session.user : null;
  const persona = user?.provider === 'mock';
  // An admin may start a project for its Game Director, without joining it.
  const forSomeoneElse = !!user?.isAdmin && !persona;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setCreated(null);
    const director = directorEmail.trim();
    try {
      const project = await api.createProject({
        name,
        description,
        scopeLimit,
        doneRestricted,
        ...(director ? { directorEmail: director } : {}),
      });
      if (!director) return navigate(`/projects/${project.id}/settings`);
      setCreated(
        t('{project} is created, with {email} as its Game Director.', {
          project: project.name,
          email: director,
        }),
      );
      setName('');
      setDescription('');
      setDirectorEmail('');
      setBusy(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('Could not create the project'));
      setBusy(false);
    }
  }

  return (
    <Shell title={t('New project')}>
      <h2>{t('New project')}</h2>
      <p className="muted">
        {forSomeoneElse
          ? t(
              'Name its Game Director to create it for them: they are added, or invited if they have not signed in yet, and you do not join it. Leave it empty to lead it yourself.',
            )
          : t("You become the project's Game Director. Settings can be changed later.")}
      </p>
      {persona && (
        <p className="muted">
          {t('As a persona you make a demo project, which the demo’s next reset removes.')}
        </p>
      )}
      <form className="form" onSubmit={submit}>
        <label>
          {t('Name')}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={200}
            autoFocus
          />
        </label>
        {forSomeoneElse && (
          <label>
            {t('Game Director’s e-mail')}
            <input
              type="email"
              value={directorEmail}
              onChange={(e) => setDirectorEmail(e.target.value)}
              data-testid="director-email"
            />
          </label>
        )}
        <label>
          {t('Description')}
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={5000}
          />
        </label>
        <label>
          {t('Workboard scope limit')}
          <input
            type="number"
            min={1}
            max={1000}
            value={scopeLimit}
            onChange={(e) => setScopeLimit(Number(e.target.value))}
          />
          <span className="hint">
            {t("Maximum number of backlog items included in the active Workboard's scope.")}
          </span>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={doneRestricted}
            onChange={(e) => setDoneRestricted(e.target.checked)}
          />
          {t('Restrict moving tasks into Done to Testers')}
        </label>
        {error && <p className="error">{error}</p>}
        {created && (
          <p role="status" data-testid="project-created">
            {created}
          </p>
        )}
        <div className="row">
          <button type="submit" className="primary" disabled={busy || name.trim() === ''}>
            {t('Create project')}
          </button>
          <button type="button" onClick={() => navigate('/')}>
            {t('Cancel')}
          </button>
        </div>
      </form>
    </Shell>
  );
}
