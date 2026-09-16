import type { Task, TaskCategory } from '@gameweld/domain';
import { TASK_CATEGORIES, TASK_CATEGORY_LABELS } from '@gameweld/domain';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api, ApiError } from '../api.ts';
import { useCurrentUser } from '../session.tsx';
import { TaskStatus } from './TaskStatus.tsx';

/** The three task groups of an item (Section 7), with inline creation for members. */
export function Breakdown({
  projectId,
  itemId,
  canWork,
  canPlaceOutside,
  activeBoard,
  itemArchived,
  itemState,
  onChanged,
}: {
  projectId: string;
  itemId: string;
  canWork: boolean;
  /** Director permission to place tasks whose item is outside the board scope. */
  canPlaceOutside: boolean;
  /** The active board that includes this item, if any (null when out of scope or no board). */
  activeBoard: { id: string; name: string } | null;
  itemArchived: boolean;
  itemState: 'open' | 'ready_for_review' | 'done';
  onChanged: () => Promise<void>;
}) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setTasks(await api.tasks(projectId, itemId));
  }, [projectId, itemId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const me = useCurrentUser();
  const [boardId, setBoardId] = useState<string | null>(null);
  const [requesting, setRequesting] = useState<{ taskId: string; reason: string } | null>(null);
  useEffect(() => {
    if (activeBoard) setBoardId(activeBoard.id);
    else api.activeBoard(projectId).then((b) => setBoardId(b?.id ?? null));
  }, [activeBoard, projectId]);

  async function act(action: () => Promise<unknown>, failure: string) {
    setError(null);
    try {
      await action();
      await reload();
      await onChanged();
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : failure);
      return false;
    }
  }

  async function place(task: Task) {
    if (!boardId) return;
    setError(null);
    try {
      await api.placeTask(projectId, boardId, task.id);
      await reload();
      await onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not place the task');
    }
  }

  async function add(category: TaskCategory, title: string) {
    setError(null);
    try {
      await api.createTask(projectId, itemId, { category, title });
      await reload();
      await onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not add the task');
    }
  }

  if (tasks === null) return <p>Loading…</p>;
  const archivedCount = tasks.filter((t) => t.archived).length;

  return (
    <div data-testid="breakdown">
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {canWork && !itemArchived && itemState !== 'open' && (
        <p className="notice" data-testid="reopen-warning">
          {itemState === 'done'
            ? 'This item is accepted. Adding or reopening a task returns it to Open; the acceptance stays in history.'
            : 'This item is Ready for Review. Adding or reopening a task returns it to Open.'}
        </p>
      )}
      <div className="task-groups">
        {TASK_CATEGORIES.map((category) => {
          const group = tasks.filter(
            (t) => t.category === category && (showArchived || !t.archived),
          );
          return (
            <section
              key={category}
              className="task-group"
              aria-label={`${TASK_CATEGORY_LABELS[category]} tasks`}
              data-testid={`tasks-${category}`}
            >
              <h3>
                {TASK_CATEGORY_LABELS[category]}{' '}
                <span className="count">{group.filter((t) => !t.archived).length}</span>
              </h3>
              {group.length === 0 ? (
                <p className="muted small">
                  No {TASK_CATEGORY_LABELS[category].toLowerCase()} tasks.
                </p>
              ) : (
                <ul className="task-list">
                  {group.map((task) => (
                    <li
                      key={task.id}
                      className={task.archived ? 'archived' : ''}
                      data-testid="task-row"
                    >
                      <Link to={`/projects/${projectId}/tasks/${task.id}`} className="task-title">
                        {task.title}
                      </Link>
                      <div className="card-meta">
                        <TaskStatus task={task} />
                        {task.assignee && <span>{task.assignee.displayName}</span>}
                        {canWork &&
                          boardId &&
                          !task.placement &&
                          !task.completed &&
                          !task.archived && (
                            <>
                              {activeBoard || canPlaceOutside ? (
                                <button
                                  type="button"
                                  className="link"
                                  onClick={() => void place(task)}
                                  aria-label={`Add ${task.title} to Workboard`}
                                >
                                  {activeBoard ? 'Add to Workboard' : 'Place as exception'}
                                </button>
                              ) : task.pendingRequest ? (
                                <>
                                  <span className="badge neutral">Placement requested</span>
                                  {task.pendingRequest.requesterId === me.id && (
                                    <button
                                      type="button"
                                      className="link"
                                      onClick={() =>
                                        void act(
                                          () =>
                                            api.withdrawRequest(
                                              projectId,
                                              boardId,
                                              task.pendingRequest!.id,
                                            ),
                                          'Could not withdraw the request',
                                        )
                                      }
                                      aria-label={`Withdraw request for ${task.title}`}
                                    >
                                      Withdraw
                                    </button>
                                  )}
                                </>
                              ) : requesting?.taskId !== task.id ? (
                                <button
                                  type="button"
                                  className="link"
                                  onClick={() => setRequesting({ taskId: task.id, reason: '' })}
                                  aria-label={`Request placement of ${task.title}`}
                                >
                                  Request placement on Workboard
                                </button>
                              ) : null}
                            </>
                          )}
                        {requesting?.taskId === task.id && boardId && (
                          <form
                            className="confirm small"
                            aria-label={`Request placement of ${task.title}`}
                            onSubmit={(e) => {
                              e.preventDefault();
                              void act(
                                () =>
                                  api.createRequest(projectId, boardId, {
                                    taskId: task.id,
                                    reason: requesting.reason.trim(),
                                  }),
                                'Could not send the request',
                              ).then((ok) => ok && setRequesting(null));
                            }}
                          >
                            <p>
                              Asks a Game Director to place this task on the Workboard although its
                              item is outside the scope.
                            </p>
                            <input
                              value={requesting.reason}
                              onChange={(e) =>
                                setRequesting({ taskId: task.id, reason: e.target.value })
                              }
                              placeholder="Why now? (optional)"
                              aria-label="Reason"
                              maxLength={5000}
                            />
                            <button type="submit" className="primary">
                              Send request
                            </button>
                            <button type="button" onClick={() => setRequesting(null)}>
                              Cancel
                            </button>
                          </form>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {canWork && !itemArchived && (
                <AddTaskForm category={category} onAdd={(title) => add(category, title)} />
              )}
            </section>
          );
        })}
      </div>
      {archivedCount > 0 && (
        <button type="button" className="link" onClick={() => setShowArchived((v) => !v)}>
          {showArchived
            ? 'Hide archived tasks'
            : `Show ${archivedCount} archived task${archivedCount === 1 ? '' : 's'}`}
        </button>
      )}
    </div>
  );
}

function AddTaskForm({
  category,
  onAdd,
}: {
  category: TaskCategory;
  onAdd: (title: string) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = title.trim();
    if (!value) return;
    setTitle('');
    await onAdd(value);
  }
  return (
    <form
      className="add-item"
      onSubmit={submit}
      aria-label={`Add ${TASK_CATEGORY_LABELS[category]} task`}
    >
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={`New ${TASK_CATEGORY_LABELS[category].toLowerCase()} task`}
        aria-label={`New ${TASK_CATEGORY_LABELS[category]} task`}
        maxLength={500}
      />
      <button type="submit" disabled={title.trim() === ''}>
        Add
      </button>
    </form>
  );
}
