import type { BacklogItemDetail } from '@gameweld/domain';
import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../api.ts';
import { t, tj } from '../i18n/index.ts';
import { Comments } from './Comments.tsx';
import { useProject } from '../pages/ProjectPage.tsx';

/**
 * Section 11: acceptance is an explicit action separate from task completion. Shows the accept
 * and reject controls while the item is Ready for Review, the current acceptance while Done, the
 * acceptance history, and the item's comments (rejections are comments).
 */
export function ReviewPanel({
  item,
  onChanged,
}: {
  item: BacklogItemDetail;
  onChanged: () => Promise<void>;
}) {
  const { project } = useProject();
  const canAccept = project.permissions['item.accept'];
  const canComment = project.permissions['task.work'];
  const [mode, setMode] = useState<'idle' | 'accept' | 'reject'>('idle');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await onChanged();
      setMode('idle');
      setNote('');
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('Something went wrong'));
      await onChanged();
      return false;
    }
  }

  const fmt = (iso: string) => new Date(iso).toLocaleString();
  const showPanel =
    item.state !== 'open' ||
    item.acceptanceHistory.length > 0 ||
    item.comments.length > 0 ||
    canComment;
  if (!showPanel) return null;

  return (
    <section className="panel review" aria-labelledby="review-heading" data-testid="review">
      <h2 id="review-heading">{t('Review')}</h2>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {item.state === 'ready_for_review' && (
        <div className="review-state">
          <p>
            {tj(
              '<1>Ready for Review.</1> Every task is complete; the item awaits acceptance.',
              undefined,
              { 1: (s) => <strong>{s}</strong> },
            )}
            {!canAccept &&
              t(' A Game Director or a member with the acceptance permission accepts it.')}
          </p>
          {canAccept && mode === 'idle' && (
            <div className="row">
              <button type="button" className="primary" onClick={() => setMode('accept')}>
                {t('Accept as Done')}
              </button>
              <button type="button" onClick={() => setMode('reject')}>
                {t('Reject')}
              </button>
            </div>
          )}
          {canAccept && mode !== 'idle' && (
            <form
              className="form"
              aria-label={mode === 'accept' ? t('Accept item') : t('Reject item')}
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                void run(() =>
                  mode === 'accept'
                    ? api.acceptItem(project.id, item.id, { note: note.trim() })
                    : api.rejectItem(project.id, item.id, { note: note.trim() }),
                );
              }}
            >
              <label>
                {mode === 'accept' ? t('Note (optional)') : t('What needs to change')}
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  required={mode === 'reject'}
                  autoFocus
                />
              </label>
              {mode === 'accept' && (
                <p className="hint" data-testid="accept-consequence">
                  {item.activeBoard
                    ? t(
                        'Accepted work is finished: the item leaves the Workboard with all its tasks, freeing a place in the scope of {board}. The tasks stay complete and remain here in the Breakdown.',
                        { board: item.activeBoard.name },
                      )
                    : t(
                        'Accepted work is finished: the item leaves the Workboard with all its tasks. The tasks stay complete and remain here in the Breakdown.',
                      )}
                </p>
              )}
              {mode === 'reject' && (
                <p className="hint">
                  {t(
                    'The rejection is recorded as a comment. Then reopen a task or add a follow-up task in the Breakdown; the item stays Ready for Review until a task changes.',
                  )}
                </p>
              )}
              <div className="row">
                <button
                  type="submit"
                  className="primary"
                  disabled={mode === 'reject' && note.trim() === ''}
                >
                  {mode === 'accept' ? t('Confirm acceptance') : t('Record rejection')}
                </button>
                <button type="button" onClick={() => setMode('idle')}>
                  {t('Cancel')}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {item.state === 'done' && item.acceptance && (
        <p className="review-state" data-testid="accepted">
          {tj(
            '<1>Accepted</1> by {name} on {date}',
            {
              name: item.acceptance.acceptedBy.displayName,
              date: fmt(item.acceptance.acceptedAt),
            },
            { 1: (s) => <strong>{s}</strong> },
          )}
          {item.acceptance.note && <> · {t('“{note}”', { note: item.acceptance.note })}</>}
        </p>
      )}

      {item.acceptanceHistory.some((a) => a.invalidatedAt) && (
        <details className="history">
          <summary>{t('Acceptance history')}</summary>
          <ul className="links">
            {item.acceptanceHistory.map((a) => (
              <li key={a.id}>
                <span>
                  {t(
                    a.invalidatedAt
                      ? 'Accepted by {name} on {date}'
                      : 'Current acceptance by {name} on {date}',
                    { name: a.acceptedBy.displayName, date: fmt(a.acceptedAt) },
                  )}
                  {a.note && <> · {t('“{note}”', { note: a.note })}</>}
                </span>
                {a.invalidatedAt && (
                  <span className="muted">
                    {t('superseded {date}', { date: fmt(a.invalidatedAt) })}
                    {a.invalidatedReason && ` (${a.invalidatedReason})`}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      <h3>{t('Comments')}</h3>
      <Comments
        owner={{ itemId: item.id }}
        comments={item.comments}
        canComment={canComment}
        onChanged={onChanged}
      />
    </section>
  );
}
