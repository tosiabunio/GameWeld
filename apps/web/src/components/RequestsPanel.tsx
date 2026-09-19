import type {
  BacklogItem,
  BoardView,
  CreateRequestInput,
  Task,
  TaskCategory,
  WorkRequest,
} from '@gameweld/domain';
import { CATEGORY_LABELS, TASK_CATEGORIES, TASK_CATEGORY_LABELS } from '@gameweld/domain';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api, ApiError } from '../api.ts';
import { useProject } from '../pages/ProjectPage.tsx';
import { useCurrentUser } from '../session.tsx';

/**
 * Section 9: the lightweight list of out-of-scope placement requests. Members ask here or from a
 * task's row in the Breakdown; Directors approve or reject with a note; requesters can withdraw;
 * everyone sees the history.
 */
export function RequestsPanel({
  board,
  onBoardChanged,
}: {
  board: BoardView;
  onBoardChanged: () => Promise<void>;
}) {
  const { project, dataVersion } = useProject();
  const me = useCurrentUser();
  const canDecide = project.permissions['out_of_scope.approve'] && board.state === 'active';
  // A Director has no one to ask: "+ New task" on a To Do column places outside work directly.
  const canRequest = project.permissions['task.work'] && board.state === 'active' && !canDecide;
  const [asking, setAsking] = useState(false);
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
  }, [reload, board.counts.pendingRequests, dataVersion]);

  async function run(action: () => Promise<unknown>): Promise<boolean> {
    setError(null);
    let ok = true;
    try {
      await action();
    } catch (e) {
      ok = false;
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
    }
    setDeciding(null);
    await reload();
    await onBoardChanged();
    return ok;
  }

  const pending = (requests ?? []).filter((r) => r.status === 'pending');
  const decided = (requests ?? []).filter((r) => r.status !== 'pending');
  if (requests !== null && requests.length === 0 && !canDecide && !canRequest) return null;

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
        {canRequest && !asking && (
          <button
            type="button"
            className="link"
            onClick={() => {
              setOpen(true);
              setAsking(true);
            }}
          >
            + Request out-of-scope work
          </button>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {open && (
        <>
          {asking && (
            <NewRequestForm
              board={board}
              onSend={(input) => run(() => api.createRequest(project.id, board.id, input))}
              onClose={() => setAsking(false)}
            />
          )}
          {pending.length === 0 ? (
            <p className="muted small">
              No pending requests. Members ask here, or from a task’s row in the Breakdown, when the
              task's item is outside the scope.
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

const NEW_TASK = 'new';

/**
 * Asking from the Workboard: the item outside the scope, then one of its tasks that wait unplaced
 * or a new one, which is created with the request, and optionally why now.
 */
function NewRequestForm({
  board,
  onSend,
  onClose,
}: {
  board: BoardView;
  onSend: (input: CreateRequestInput) => Promise<boolean>;
  onClose: () => void;
}) {
  const { project } = useProject();
  const [items, setItems] = useState<BacklogItem[] | null>(null);
  const [itemId, setItemId] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskId, setTaskId] = useState(NEW_TASK);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<TaskCategory>('code');
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    void api
      .backlog(project.id)
      .then((all) =>
        setItems(all.filter((i) => i.state === 'open' && !board.scope.some((s) => s.id === i.id))),
      );
  }, [project.id, board.scope]);

  // The chosen item's tasks that a request can name: unfinished, unplaced, and not asked for yet.
  useEffect(() => {
    setTasks([]);
    setTaskId(NEW_TASK);
    if (!itemId) return;
    let current = true;
    void api.tasks(project.id, itemId).then((all) => {
      if (!current) return;
      setTasks(all.filter((t) => !t.archived && !t.completed && !t.placement && !t.pendingRequest));
    });
    return () => {
      current = false;
    };
  }, [project.id, itemId]);

  const isNew = taskId === NEW_TASK;
  const ready = itemId !== '' && (!isNew || title.trim() !== '') && !sending;

  return (
    <form
      className="form new-request"
      aria-label="Request out-of-scope work"
      onSubmit={(e) => {
        e.preventDefault();
        setSending(true);
        void onSend({
          ...(isNew ? { newTask: { itemId, category, title: title.trim() } } : { taskId }),
          reason: reason.trim(),
        }).then((ok) => {
          setSending(false);
          if (ok) onClose();
        });
      }}
    >
      <p className="muted small">
        Asks a Game Director to place one task on this Workboard although its backlog item is
        outside the scope. The task waits in the Breakdown until the request is approved.
      </p>
      {items !== null && items.length === 0 ? (
        <p className="muted small">Every open backlog item is already in scope.</p>
      ) : (
        <>
          <label>
            Backlog item
            <select value={itemId} onChange={(e) => setItemId(e.target.value)} required autoFocus>
              <option value="">Choose an item outside the scope…</option>
              {(items ?? []).map((i) => (
                <option key={i.id} value={i.id}>
                  {i.title} ({CATEGORY_LABELS[i.category]})
                </option>
              ))}
            </select>
          </label>
          <label>
            Task
            <select value={taskId} onChange={(e) => setTaskId(e.target.value)} disabled={!itemId}>
              <option value={NEW_TASK}>New task…</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title} ({TASK_CATEGORY_LABELS[t.category]})
                </option>
              ))}
            </select>
          </label>
          {isNew && (
            <div className="new-request-task">
              <label>
                New task’s title
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={500}
                  required
                />
              </label>
              <label>
                Category
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as TaskCategory)}
                >
                  {TASK_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {TASK_CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <label>
            Why now? (optional)
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={5000} />
          </label>
        </>
      )}
      <div className="row">
        <button type="submit" className="primary" disabled={!ready}>
          Send request
        </button>
        <button type="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  );
}
