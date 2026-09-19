import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { api, ApiError } from '../api.ts';
import { t } from '../i18n/index.ts';
import { Shell } from './Shell.tsx';

export function NewProjectPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scopeLimit, setScopeLimit] = useState(5);
  const [doneRestricted, setDoneRestricted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const project = await api.createProject({ name, description, scopeLimit, doneRestricted });
      navigate(`/projects/${project.id}/settings`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('Could not create the project'));
      setBusy(false);
    }
  }

  return (
    <Shell title={t('New project')}>
      <h2>{t('New project')}</h2>
      <p className="muted">
        {t("You become the project's Game Director. Settings can be changed later.")}
      </p>
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
