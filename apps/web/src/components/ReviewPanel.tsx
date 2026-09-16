import type { BacklogItemDetail } from '@gameweld/domain';
import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../api.ts';
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
  const [comment, setComment] = useState('');
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
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
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
      <h2 id="review-heading">Review</h2>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {item.state === 'ready_for_review' && (
        <div className="review-state">
          <p>
            <strong>Ready for Review.</strong> Every task is complete; the item awaits acceptance.
            {!canAccept &&
              ' A Game Director or a member with the acceptance permission accepts it.'}
          </p>
          {canAccept && mode === 'idle' && (
            <div className="row">
              <button type="button" className="primary" onClick={() => setMode('accept')}>
                Accept as Done
              </button>
              <button type="button" onClick={() => setMode('reject')}>
                Reject
              </button>
            </div>
          )}
          {canAccept && mode !== 'idle' && (
            <form
              className="form"
              aria-label={mode === 'accept' ? 'Accept item' : 'Reject item'}
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
                {mode === 'accept' ? 'Note (optional)' : 'What needs to change'}
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  required={mode === 'reject'}
                  autoFocus
                />
              </label>
              {mode === 'reject' && (
                <p className="hint">
                  The rejection is recorded as a comment. Then reopen a task or add a follow-up task
                  in the Breakdown; the item stays Ready for Review until a task changes.
                </p>
              )}
              <div className="row">
                <button
                  type="submit"
                  className="primary"
                  disabled={mode === 'reject' && note.trim() === ''}
                >
                  {mode === 'accept' ? 'Confirm acceptance' : 'Record rejection'}
                </button>
                <button type="button" onClick={() => setMode('idle')}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {item.state === 'done' && item.acceptance && (
        <p className="review-state" data-testid="accepted">
          <strong>Accepted</strong> by {item.acceptance.acceptedBy.displayName} on{' '}
          {fmt(item.acceptance.acceptedAt)}
          {item.acceptance.note && <> · “{item.acceptance.note}”</>}
        </p>
      )}

      {item.acceptanceHistory.some((a) => a.invalidatedAt) && (
        <details className="history">
          <summary>Acceptance history</summary>
          <ul className="links">
            {item.acceptanceHistory.map((a) => (
              <li key={a.id}>
                <span>
                  {a.invalidatedAt ? 'Accepted' : 'Current acceptance'} by{' '}
                  {a.acceptedBy.displayName} on {fmt(a.acceptedAt)}
                  {a.note && <> · “{a.note}”</>}
                </span>
                {a.invalidatedAt && (
                  <span className="muted">
                    superseded {fmt(a.invalidatedAt)}
                    {a.invalidatedReason && ` (${a.invalidatedReason})`}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      <h3>Comments</h3>
      {item.comments.length === 0 ? (
        <p className="muted small">No comments yet.</p>
      ) : (
        <ul className="comments" data-testid="comments">
          {item.comments.map((c) => (
            <li key={c.id} className={c.kind === 'rejection' ? 'rejection' : ''}>
              <div className="muted small">
                {c.kind === 'rejection' && <span className="badge warn">Rejected</span>}{' '}
                {c.author.displayName} · {fmt(c.createdAt)}
              </div>
              <p>{c.body}</p>
            </li>
          ))}
        </ul>
      )}
      {canComment && (
        <form
          className="form"
          aria-label="Add comment"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void run(() => api.addItemComment(project.id, item.id, { body: comment.trim() })).then(
              (ok) => ok && setComment(''),
            );
          }}
        >
          <label>
            Comment
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              placeholder="Notes for the team, review findings, build references…"
            />
          </label>
          <div>
            <button type="submit" disabled={comment.trim() === ''}>
              Add comment
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
