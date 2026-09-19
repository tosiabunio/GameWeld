import type { BacklogItem, Dependency } from '@gameweld/domain';
import { CATEGORY_LABELS, STATE_LABELS } from '@gameweld/domain';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api, ApiError } from '../api.ts';
import { t } from '../i18n/index.ts';
import { useProject } from '../pages/ProjectPage.tsx';

/** D9: informational item-to-item dependencies with the referenced item's state. Never blocking. */
export function Dependencies({
  itemId,
  dependsOn,
  dependents,
  onChanged,
}: {
  itemId: string;
  dependsOn: Dependency[];
  dependents: Dependency[];
  onChanged: () => Promise<void>;
}) {
  const { project } = useProject();
  const canDirect = project.permissions['backlog.manage'];
  const [items, setItems] = useState<BacklogItem[]>([]);
  const [target, setTarget] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (canDirect) api.backlog(project.id).then(setItems);
  }, [canDirect, project.id, dependsOn.length]);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('Something went wrong'));
    }
  }

  const candidates = items.filter((i) => i.id !== itemId && !dependsOn.some((d) => d.id === i.id));
  const Row = ({ d }: { d: Dependency }) => (
    <>
      <Link to={`/projects/${project.id}/breakdown/${d.id}`}>{d.title}</Link>
      <span className="muted small">{t(CATEGORY_LABELS[d.category])}</span>
      <span
        className={`badge ${d.state === 'done' ? 'done' : d.state === 'ready_for_review' ? '' : 'neutral'}`}
      >
        {t(STATE_LABELS[d.state])}
      </span>
    </>
  );

  return (
    <div data-testid="dependencies">
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <h4>{t('Depends on')}</h4>
      {dependsOn.length === 0 ? (
        <p className="muted small">
          {t('Nothing. Dependencies are informational: they never block work.')}
        </p>
      ) : (
        <ul className="dep-list">
          {dependsOn.map((d) => (
            <li key={d.id} data-testid="depends-on">
              <Row d={d} />
              {canDirect && (
                <button
                  type="button"
                  className="link"
                  onClick={() => void run(() => api.removeDependency(project.id, itemId, d.id))}
                  aria-label={t('Remove dependency on {title}', { title: d.title })}
                >
                  {t('Remove')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canDirect && (
        <form
          className="add-item"
          aria-label={t('Add dependency')}
          onSubmit={(e) => {
            e.preventDefault();
            if (target)
              void run(() => api.addDependency(project.id, itemId, target)).then(() =>
                setTarget(''),
              );
          }}
        >
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            aria-label={t('Item this one depends on')}
          >
            <option value="">{t('Add a dependency…')}</option>
            {candidates.map((i) => (
              <option key={i.id} value={i.id}>
                {i.title} ({t(CATEGORY_LABELS[i.category])})
              </option>
            ))}
          </select>
          <button type="submit" disabled={!target}>
            {t('Add')}
          </button>
        </form>
      )}
      {dependents.length > 0 && (
        <>
          <h4>{t('Needed by')}</h4>
          <ul className="dep-list">
            {dependents.map((d) => (
              <li key={d.id}>
                <Row d={d} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
