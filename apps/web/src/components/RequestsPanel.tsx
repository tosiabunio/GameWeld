import type { BoardView, WorkRequest } from '@gameweld/domain';
import { TASK_CATEGORY_LABELS } from '@gameweld/domain';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api, ApiError } from '../api.ts';
import { useProject } from '../pages/ProjectPage.tsx';
import { useCurrentUser } from '../session.tsx';

/**
 * Section 9: the lightweight list of out-of-scope placement requests. Directors approve or
 * reject with a note; requesters can withdraw; everyone sees the history.
 */
export function RequestsPanel({
  board,
  onBoardChanged,
}: {
  board: BoardView;
  onBoardChanged: () => Promise<void>;
}) {
  const { project } = useProject();
  const me = useCurrentUser();
  const canDecide = project.permissions['out_of_scope.approve'] && board.state === 'active';
  const [requests, setRequests] = useState<WorkRequest[] | null>(null);
  const [open, setOpen] = useState(board.counts.pendingRequests > 0);
  const [showDecided, setShowDecided] = useState(false);
  const [deciding, setDeciding] = useState<{
    id: string;
    verb: 'approve' | 'reject';
    note: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setRequests(await api.requests(project.id, board.id));
  }, [project.id, board.id]);

  useEffect(() => {
    void reload();
  }, [reload, board.counts.pendingRequests]);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
    }
    setDeciding(null);
    await reload();
    await onBoardChanged();
  }

  const pending = (requests ?? []).filter((r) => r.status === 'pending');
  const decided = (requests ?? []).filter((r) => r.status !== 'pending');
  if (requests !== null && requests.length === 0 && !canDecide) return null;

  return (
    <section className="panel requests" aria-labelledby="requests-heading" data-testid="requests">
      <div className="row between">
        <h3 id="requests-heading">
          <button
            type="button"
            className="link"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            {open ? '▾' : '▸'} Out-of-scope requests{' '}
            <span className={pending.length > 0 ? 'badge warn' : 'count'}>{pending.length}</span>
          </button>
        </h3>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {open && (
        <>
          {pending.length === 0 ? (
            <p className="muted small">
              No pending requests. Members ask from a task's row in the Breakdown when its item is
              outside the scope.
            </p>
          ) : (
            <ul className="request-list">
              {pending.map((r) => (
                <li key={r.id} data-testid="request">
                  <div>
                    <strong>{r.task.title}</strong>{' '}
                    <span className="chip">{TASK_CATEGORY_LABELS[r.task.category]}</span>{' '}
                    <span className="muted">
                      under{' '}
                      <Link to={`/projects/${project.id}/breakdown/${r.item.id}`}>
                        {r.item.title}
                      </Link>{' '}
                      · asked by {r.requester.displayName} on{' '}
                      {new Date(r.createdAt).toLocaleDateString()}
                    </span>
                    {r.reason && <p className="small">“{r.reason}”</p>}
                  </div>
                  {deciding?.id === r.id ? (
                    <form
                      className="confirm small"
                      aria-label={`${deciding.verb === 'approve' ? 'Approve' : 'Reject'} request for ${r.task.title}`}
                      onSubmit={(e) => {
                        e.preventDefault();
                        void run(() =>
                          api.decideRequest(project.id, board.id, r.id, deciding.verb, {
                            note: deciding.note.trim(),
                          }),
                        );
                      }}
                    >
                      <input
                        value={deciding.note}
                        onChange={(e) => setDeciding({ ...deciding, note: e.target.value })}
                        placeholder="Note (optional)"
                        aria-label="Decision note"
                        autoFocus
                      />
                      <button type="submit" className="primary">
                        {deciding.verb === 'approve' ? 'Approve and place' : 'Reject'}
                      </button>
                      <button type="button" onClick={() => setDeciding(null)}>
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <div className="row">
                      {canDecide && (
                        <>
                          <button
                            type="button"
                            className="primary"
                            onClick={() => setDeciding({ id: r.id, verb: 'approve', note: '' })}
                            aria-label={`Approve request for ${r.task.title}`}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeciding({ id: r.id, verb: 'reject', note: '' })}
                            aria-label={`Reject request for ${r.task.title}`}
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {r.requester.id === me.id && (
                        <button
                          type="button"
                          className="link"
                          onClick={() =>
                            void run(() => api.withdrawRequest(project.id, board.id, r.id))
                          }
                          aria-label={`Withdraw request for ${r.task.title}`}
                        >
                          Withdraw
                        </button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {decided.length > 0 && (
            <button type="button" className="link" onClick={() => setShowDecided((v) => !v)}>
              {showDecided
                ? 'Hide decided requests'
                : `Show ${decided.length} decided request${decided.length === 1 ? '' : 's'}`}
            </button>
          )}
          {showDecided && (
            <ul className="request-list decided">
              {decided.map((r) => (
                <li key={r.id}>
                  <span className={`badge ${r.status === 'approved' ? 'done' : 'neutral'}`}>
                    {r.status}
                  </span>{' '}
                  <strong>{r.task.title}</strong>{' '}
                  <span className="muted">
                    under {r.item.title} · {r.requester.displayName}
                    {r.decidedBy && ` → ${r.decidedBy.displayName}`}
                    {r.decisionNote && ` · “${r.decisionNote}”`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
