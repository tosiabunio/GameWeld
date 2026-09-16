import type { Task, TaskCategory } from '@gameweld/domain';
import { TASK_CATEGORIES, TASK_CATEGORY_LABELS } from '@gameweld/domain';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api, ApiError } from '../api.ts';
import { TaskStatus } from './TaskStatus.tsx';

/** The three task groups of an item (Section 7), with inline creation for members. */
export function Breakdown({
  projectId,
  itemId,
  canWork,
  itemArchived,
  onChanged,
}: {
  projectId: string;
  itemId: string;
  canWork: boolean;
  itemArchived: boolean;
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
