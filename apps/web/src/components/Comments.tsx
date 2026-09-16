import type { Comment } from '@gameweld/domain';
import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../api.ts';
import { useProject } from '../pages/ProjectPage.tsx';
import { useCurrentUser } from '../session.tsx';

/** Comment list with add, edit (author), and delete (author or Director). Rejection notes are read-only. */
export function Comments({
  owner,
  comments,
  canComment,
  onChanged,
}: {
  owner: { itemId: string } | { taskId: string };
  comments: Comment[];
  canComment: boolean;
  onChanged: () => Promise<void>;
}) {
  const { project } = useProject();
  const me = useCurrentUser();
  const canDirect = project.permissions['backlog.manage'];
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await onChanged();
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
      return false;
    }
  }

  const fmt = (iso: string) => new Date(iso).toLocaleString();

  return (
    <div data-testid="comments-block">
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {comments.length === 0 ? (
        <p className="muted small">No comments yet.</p>
      ) : (
        <ul className="comments" data-testid="comments">
          {comments.map((c) => (
            <li key={c.id} className={c.kind === 'rejection' ? 'rejection' : ''}>
              <div className="muted small row between">
                <span>
                  {c.kind === 'rejection' && <span className="badge warn">Rejected</span>}{' '}
                  {c.author.displayName} · {fmt(c.createdAt)}
                  {c.updatedAt !== c.createdAt && ' · edited'}
                </span>
                {c.kind === 'comment' && editing?.id !== c.id && (
                  <span className="row">
                    {c.author.id === me.id && (
                      <button
                        type="button"
                        className="link"
                        onClick={() => setEditing({ id: c.id, body: c.body })}
                        aria-label="Edit comment"
                      >
                        Edit
                      </button>
                    )}
                    {(c.author.id === me.id || canDirect) && (
                      <button
                        type="button"
                        className="link"
                        onClick={() => void run(() => api.deleteComment(project.id, c.id))}
                        aria-label="Delete comment"
                      >
                        Delete
                      </button>
                    )}
                  </span>
                )}
              </div>
              {editing?.id === c.id ? (
                <form
                  className="form"
                  aria-label="Edit comment"
                  onSubmit={(e: FormEvent) => {
                    e.preventDefault();
                    void run(() =>
                      api.updateComment(project.id, c.id, { body: editing.body.trim() }),
                    ).then((ok) => ok && setEditing(null));
                  }}
                >
                  <textarea
                    value={editing.body}
                    onChange={(e) => setEditing({ id: c.id, body: e.target.value })}
                    rows={3}
                    aria-label="Comment text"
                    autoFocus
                  />
                  <div className="row">
                    <button type="submit" className="primary" disabled={editing.body.trim() === ''}>
                      Save
                    </button>
                    <button type="button" onClick={() => setEditing(null)}>
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <p>{c.body}</p>
              )}
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
            void run(() => api.addComment(project.id, owner, draft.trim())).then(
              (ok) => ok && setDraft(''),
            );
          }}
        >
          <label>
            Comment
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              placeholder="Notes for the team, review findings, build references…"
            />
          </label>
          <div>
            <button type="submit" disabled={draft.trim() === ''}>
              Add comment
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
