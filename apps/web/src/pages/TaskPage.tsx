import type { BacklogItem, TaskCategory, TaskDetail } from '@gameweld/domain';
import {
  CATEGORY_LABELS,
  STATE_LABELS,
  TASK_CATEGORIES,
  TASK_CATEGORY_LABELS,
} from '@gameweld/domain';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { api, ApiError } from '../api.ts';
import { Attachments } from '../components/Attachments.tsx';
import { Comments } from '../components/Comments.tsx';
import { History } from '../components/History.tsx';
import { LinksList } from '../components/LinksList.tsx';
import { TaskStatus } from '../components/TaskStatus.tsx';
import { WritingPrompt } from '../components/WritingPrompt.tsx';
import { useProject } from './ProjectPage.tsx';

export function TaskPage() {
  const { project } = useProject();
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const fromBoard = (useLocation().state as { from?: string } | null)?.from === 'board';
  const canWork = project.permissions['task.work'];
  const canDirect = project.permissions['backlog.manage'];
  const canComplete = project.permissions['task.complete'];
  const [deleting, setDeleting] = useState(false);
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setTask(await api.task(project.id, taskId!));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load the task');
    }
  }, [project.id, taskId]);

  useEffect(() => {
    setDeleting(false);
    void reload();
  }, [reload]);

  async function run(action: () => Promise<unknown>): Promise<boolean> {
    setError(null);
    try {
      await action();
      await reload();
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) await reload();
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
      return false;
    }
  }

  if (error && !task) return <p className="error">{error}</p>;
  if (!task) return <p>Loading…</p>;
  const editable = canWork && !task.archived;

  return (
    <article className="item-page">
      <p>
        {fromBoard ? (
          <>
            <Link to={`/projects/${project.id}/board`}>← Workboard</Link>
            <span className="muted"> · </span>
            <Link to={`/projects/${project.id}/breakdown/${task.item.id}`}>{task.item.title}</Link>
          </>
        ) : (
          <Link to={`/projects/${project.id}/breakdown/${task.item.id}`}>← {task.item.title}</Link>
        )}
        <span className="muted">
          {' '}
          · {CATEGORY_LABELS[task.item.category]} · {STATE_LABELS[task.item.state]}
        </span>
      </p>
      <div className="item-status">
        <span className="badge neutral">{TASK_CATEGORY_LABELS[task.category]} task</span>
        <TaskStatus task={task} />
        {task.completedAt && (
          <span className="muted">completed {new Date(task.completedAt).toLocaleString()}</span>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {editable && (
        <WritingPrompt id="task-description">
          <strong>Optional prompts.</strong> What is the desired result, and how could someone check
          it? Write as much or as little as helps.
        </WritingPrompt>
      )}
      <TaskForm
        key={task.id}
        task={task}
        readOnly={!editable}
        members={project.members}
        onSave={(input) =>
          run(() => api.updateTask(project.id, task.id, { version: task.version, ...input }))
        }
        onAssign={(assigneeId) =>
          run(() => api.updateTask(project.id, task.id, { version: task.version, assigneeId }))
        }
      />

      <section className="panel" aria-labelledby="task-comments-heading">
        <h2 id="task-comments-heading">Comments</h2>
        <Comments
          owner={{ taskId: task.id }}
          comments={task.comments}
          canComment={canWork}
          onChanged={reload}
        />
      </section>

      <section className="panel" aria-labelledby="task-attachments-heading">
        <h2 id="task-attachments-heading">Attachments</h2>
        <Attachments
          owner={{ taskId: task.id }}
          attachments={task.attachments}
          canWork={editable}
          coverId={task.coverAttachmentId}
          canPickCover={editable}
          onSetCover={(coverAttachmentId) =>
            run(() =>
              api.updateTask(project.id, task.id, { version: task.version, coverAttachmentId }),
            )
          }
          onChanged={reload}
        />
      </section>

      <section className="panel" aria-labelledby="task-links-heading">
        <h2 id="task-links-heading">Links</h2>
        <LinksList
          links={task.links}
          canEdit={editable}
          onAdd={(url, label) => run(() => api.addTaskLink(project.id, task.id, { url, label }))}
          onRemove={(linkId) => run(() => api.removeTaskLink(project.id, task.id, linkId))}
        />
      </section>

      <History query={{ entityType: 'task', entityId: task.id }} />

      {task.completed && canComplete && !task.archived && (
        <section className="panel" aria-labelledby="reopen-heading">
          <h2 id="reopen-heading">Reopen</h2>
          <p className="muted">
            Reopening marks the task unfinished. If its backlog item is Ready for Review or accepted
            as Done, the item returns to Open and any acceptance is kept in history.
          </p>
          <button type="button" onClick={() => void run(() => api.reopenTask(project.id, task.id))}>
            Reopen task
          </button>
        </section>
      )}

      {canDirect && (
        <section className="panel" aria-labelledby="task-admin-heading">
          <h2 id="task-admin-heading">Game Director actions</h2>
          <ReparentForm
            task={task}
            projectId={project.id}
            onMove={(itemId) =>
              run(() => api.updateTask(project.id, task.id, { version: task.version, itemId }))
            }
          />
          <p className="muted">
            {task.archived
              ? 'This task is deleted and excluded from its item’s completion check. Restoring an unfinished task adds it back to the active Workboard when its item is in scope.'
              : 'Deleting removes the task from the Workboard and its item’s completion checks without counting it as done. History is kept and the task can be restored.'}
          </p>
          <button
            type="button"
            onClick={() => {
              if (!task.archived && !deleting) {
                setDeleting(true);
                return;
              }
              void run(() =>
                api.updateTask(project.id, task.id, {
                  version: task.version,
                  archived: !task.archived,
                }),
              ).then(
                (ok) =>
                  ok &&
                  !task.archived &&
                  navigate(`/projects/${project.id}/breakdown/${task.item.id}`),
              );
            }}
          >
            {task.archived ? 'Restore task' : deleting ? 'Confirm deletion' : 'Delete task'}
          </button>
          {deleting && !task.archived && (
            <button type="button" onClick={() => setDeleting(false)}>
              Cancel
            </button>
          )}
        </section>
      )}
    </article>
  );
}

function TaskForm({
  task,
  readOnly,
  members,
  onSave,
  onAssign,
}: {
  task: TaskDetail;
  readOnly: boolean;
  members: { userId: string; displayName: string }[];
  onSave: (input: {
    title: string;
    description: string;
    category: TaskCategory;
  }) => Promise<boolean>;
  /** Assignment applies on its own, the moment a person is picked. */
  onAssign: (assigneeId: string | null) => Promise<boolean>;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [category, setCategory] = useState<TaskCategory>(task.category);
  const [assigneeId, setAssigneeId] = useState<string | null>(task.assignee?.id ?? null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [assigned, setAssigned] = useState<string | null>(null);

  // Take each field from the server only when it changed there, so assigning someone does not
  // wipe a title or description that is still being written.
  useEffect(() => setTitle(task.title), [task.title]);
  useEffect(() => setDescription(task.description), [task.description]);
  useEffect(() => setCategory(task.category), [task.category]);
  useEffect(() => setAssigneeId(task.assignee?.id ?? null), [task.assignee?.id]);

  const dirty =
    title !== task.title || description !== task.description || category !== task.category;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(await onSave({ title: title.trim(), description, category }));
    setSaving(false);
  }

  async function assign(next: string | null) {
    setAssigneeId(next);
    setAssigned(null);
    setAssigning(true);
    const ok = await onAssign(next);
    setAssigning(false);
    if (!ok) {
      setAssigneeId(task.assignee?.id ?? null);
      return;
    }
    const name = members.find((m) => m.userId === next)?.displayName;
    setAssigned(name ? `Assigned to ${name}.` : 'Unassigned.');
  }

  return (
    <form className="form wide" onSubmit={submit}>
      <label>
        Title
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          readOnly={readOnly}
          required
          maxLength={500}
        />
      </label>
      <div className="row fields">
        <label>
          Category
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as TaskCategory)}
            disabled={readOnly || task.placement !== null}
            title={
              task.placement
                ? 'Category cannot be changed while the task is on a Workboard'
                : undefined
            }
          >
            {TASK_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {TASK_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Assignee
          <select
            value={assigneeId ?? ''}
            onChange={(e) => void assign(e.target.value || null)}
            // Each write carries the task's version, so the two never race each other.
            disabled={readOnly || assigning || saving}
          >
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.displayName}
              </option>
            ))}
          </select>
          {assigning ? (
            <span className="hint">Saving…</span>
          ) : (
            assigned && (
              <span className="hint ok" role="status">
                {assigned}
              </span>
            )
          )}
        </label>
      </div>
      <label>
        Description
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          readOnly={readOnly}
          rows={8}
          placeholder={
            readOnly ? 'No description.' : 'Free-form notes, links to references, anything useful.'
          }
        />
      </label>
      {!readOnly && (
        <div className="row">
          <button
            type="submit"
            className="primary"
            disabled={!dirty || title.trim() === '' || assigning || saving}
          >
            Save
          </button>
          {saved && !dirty && <span className="ok">Saved.</span>}
        </div>
      )}
    </form>
  );
}

function ReparentForm({
  task,
  projectId,
  onMove,
}: {
  task: TaskDetail;
  projectId: string;
  onMove: (itemId: string) => Promise<boolean>;
}) {
  const [items, setItems] = useState<BacklogItem[]>([]);
  const [target, setTarget] = useState('');
  useEffect(() => {
    api.backlog(projectId).then(setItems);
  }, [projectId, task.item.id]);
  const others = items.filter((i) => i.id !== task.item.id);
  return (
    <form
      className="form inline"
      aria-label="Move task to another item"
      onSubmit={(e) => {
        e.preventDefault();
        if (target) void onMove(target).then((ok) => ok && setTarget(''));
      }}
    >
      <label>
        Move to another backlog item
        <select value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">Choose an item…</option>
          {others.map((i) => (
            <option key={i.id} value={i.id}>
              {i.title} ({CATEGORY_LABELS[i.category]})
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={!target}>
        Move task
      </button>
    </form>
  );
}
