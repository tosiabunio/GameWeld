import type { BacklogItem, TaskCategory, TaskDetail } from '@gameweld/domain';
import {
  CATEGORY_LABELS,
  STATE_LABELS,
  TASK_CATEGORIES,
  TASK_CATEGORY_LABELS,
} from '@gameweld/domain';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { api, ApiError } from '../api.ts';
import { t } from '../i18n/index.ts';
import { useProject } from '../pages/ProjectPage.tsx';
import type { TaskLinkState } from '../taskLinks.ts';
import { ResourcePanel } from './ResourcePanel.tsx';
import { RichText } from './RichText.tsx';
import { Attachments } from './Attachments.tsx';
import { Checklist } from './Checklist.tsx';
import { EditableText, EditableTitle } from './ClickToEdit.tsx';
import { Comments } from './Comments.tsx';
import { History } from './History.tsx';
import { LinksList } from './LinksList.tsx';
import { MentionTextarea } from './MentionTextarea.tsx';
import { TaskFlags } from './TaskBadges.tsx';
import { TaskMeta } from './TaskMeta.tsx';
import { TaskStatus } from './TaskStatus.tsx';
import { WritingPrompt } from './WritingPrompt.tsx';

/** The task whose window is open, and the page showing under it. */
export interface OpenTask extends TaskLinkState {
  taskId: string;
}

/**
 * A task's address opened directly: from a bookmark, a new tab, or a link someone sent. There is
 * no page to show under the window, so this picks the task's own, the Workboard for a task that
 * is on one and its item's Breakdown otherwise, and opens the window over it.
 */
export function TaskHome() {
  const { project } = useProject();
  const { taskId } = useParams<{ taskId: string }>();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    api.task(project.id, taskId!).then(
      (task) => {
        if (!current) return;
        const home = task.placement ? 'board' : `breakdown/${task.item.id}`;
        const state: TaskLinkState = {
          background: { pathname: `/projects/${project.id}/${home}`, search: '', hash: '' },
          direct: true,
        };
        void navigate(pathname, { replace: true, state });
      },
      (e: unknown) =>
        current && setError(e instanceof ApiError ? e.message : t('Could not load the task')),
    );
    return () => {
      current = false;
    };
  }, [project.id, taskId, pathname, navigate]);
  return error ? <p className="error">{error}</p> : <p>{t('Loading…')}</p>;
}

/**
 * The task's window: a modal dialog over the page the task was opened from. Closing it, by its
 * close button, Escape, or a click outside, returns to that page, which then reloads what the
 * window changed. Unsaved text is not thrown away without asking.
 */
export function TaskModal({ taskId, background, direct }: OpenTask) {
  const { project, notifyChanged, dataVersion } = useProject();
  const navigate = useNavigate();
  const dialog = useRef<HTMLDialogElement>(null);
  const changed = useRef(false);
  // A ref, not state: Escape right after a keystroke must already see the text as unsaved.
  const dirty = useRef(false);
  const [discarding, setDiscarding] = useState(false);
  const canWork = project.permissions['task.work'];
  const canDirect = project.permissions['backlog.manage'];
  const canComplete = project.permissions['task.complete'];
  const [deleting, setDeleting] = useState(false);
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setTask(await api.task(project.id, taskId));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('Could not load the task'));
    }
  }, [project.id, taskId]);

  useEffect(() => {
    setDeleting(false);
    void reload();
  }, [reload]);
  // Someone else may change the task while its window is open (live updates). The form keeps
  // text that is being written: it takes a field from the server only when it changed there.
  useEffect(() => {
    if (dataVersion > 0) void reload();
  }, [reload, dataVersion]);

  // A modal dialog keeps focus inside, makes the page under it inert, and sits above everything.
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    document.documentElement.classList.add('modal-open');
    return () => {
      document.documentElement.classList.remove('modal-open');
      element.close();
      // The page under the window was loaded before the window changed anything.
      if (changed.current) notifyChanged();
    };
  }, [notifyChanged]);

  /** Back to the page underneath: a step back when a link led here, otherwise straight to it. */
  const close = useCallback(() => {
    if (direct) void navigate(background, { replace: true });
    else void navigate(-1);
  }, [navigate, background, direct]);

  function requestClose() {
    if (dirty.current && !discarding) setDiscarding(true);
    else close();
  }

  /** Comments, attachments, and links save themselves; the page underneath shows some of them. */
  const reloadChanged = useCallback(async () => {
    changed.current = true;
    await reload();
  }, [reload]);

  async function run(action: () => Promise<unknown>): Promise<boolean> {
    setError(null);
    changed.current = true;
    try {
      await action();
      await reload();
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) await reload();
      setError(e instanceof ApiError ? e.message : t('Something went wrong'));
      return false;
    }
  }

  const editable = canWork && !(task?.archived ?? true);

  const body = task && (
    <>
      <div className="item-status">
        <span className="badge neutral">
          {t('{category} task', { category: t(TASK_CATEGORY_LABELS[task.category]) })}
        </span>
        <TaskStatus task={task} />
        <TaskFlags task={task} />
        {task.completedAt && (
          <span className="muted">
            {t('completed {date}', { date: new Date(task.completedAt).toLocaleString() })}
          </span>
        )}
        {/* Dragging a card into Done is one way to finish a task; a task that waits in the
            Breakdown has no card to drag, and this works for both. */}
        {!task.completed && !task.archived && canComplete && (
          <button
            type="button"
            className="complete-task"
            title={
              task.placement
                ? t('Marks the task complete and moves its card to Done on {board}', {
                    board: task.placement.boardName,
                  })
                : t('Marks the task complete')
            }
            onClick={() => void run(() => api.completeTask(project.id, task.id))}
          >
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
              <path
                d="m3.5 8.5 3 3 6-7"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {t('Mark complete')}
          </button>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
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
        onDirty={(is) => {
          dirty.current = is;
          if (!is) setDiscarding(false);
        }}
      />

      <div className="detail-bottom">
        <div>
          <Checklist
            items={task.checklistItems}
            canEdit={editable}
            onAdd={(titles) =>
              run(async () => {
                for (const title of titles) await api.addChecklistItem(project.id, task.id, title);
              })
            }
            onUpdate={(id, input) =>
              run(() => api.updateChecklistItem(project.id, task.id, id, input))
            }
            onRemove={(id) => run(() => api.removeChecklistItem(project.id, task.id, id))}
          />
          <section className="panel" aria-labelledby="task-comments-heading">
            <h2 id="task-comments-heading">{t('Comments')}</h2>
            <Comments
              owner={{ taskId: task.id }}
              comments={task.comments}
              canComment={canWork}
              onChanged={reloadChanged}
            />
          </section>

          <History query={{ entityType: 'task', entityId: task.id }} />
        </div>
        <aside className="detail-resources" aria-label={t('Task resources')}>
          {/* Beside the checklist and the comments, which are long, rather than beside the
              description, which is often short. */}
          <div className="form task-meta">
            <TaskMeta
              task={task}
              readOnly={!editable}
              onPatch={(input) =>
                run(() => api.updateTask(project.id, task.id, { version: task.version, ...input }))
              }
            />
          </div>
          <ResourcePanel title="Attachments" count={task.attachments.length}>
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
              onChanged={reloadChanged}
            />
          </ResourcePanel>

          <ResourcePanel title="Links" count={task.links.length}>
            <LinksList
              links={task.links}
              canEdit={editable}
              onAdd={(url, label) =>
                run(() => api.addTaskLink(project.id, task.id, { url, label }))
              }
              onRemove={(linkId) => run(() => api.removeTaskLink(project.id, task.id, linkId))}
            />
          </ResourcePanel>
        </aside>
      </div>

      {task.completed && canComplete && !task.archived && (
        <section className="panel" aria-labelledby="reopen-heading">
          <h2 id="reopen-heading">{t('Reopen')}</h2>
          <p className="muted">
            {t(
              'Reopening marks the task unfinished. If its backlog item is Ready for Review or accepted as Done, the item returns to Open and any acceptance is kept in history.',
            )}
          </p>
          <button type="button" onClick={() => void run(() => api.reopenTask(project.id, task.id))}>
            {t('Reopen task')}
          </button>
        </section>
      )}

      {canDirect && (
        <section className="panel" aria-labelledby="task-admin-heading">
          <h2 id="task-admin-heading">{t('Game Director actions')}</h2>
          <ReparentForm
            task={task}
            projectId={project.id}
            onMove={(itemId) =>
              run(() => api.updateTask(project.id, task.id, { version: task.version, itemId }))
            }
          />
          <p className="muted">
            {task.archived
              ? t(
                  'This task is deleted and excluded from its item’s completion check. Restoring an unfinished task adds it back to the active Workboard when its item is in scope.',
                )
              : t(
                  'Deleting removes the task from the Workboard and its item’s completion checks without counting it as done. History is kept and the task can be restored.',
                )}
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
              ).then((ok) => ok && !task.archived && close());
            }}
          >
            {task.archived
              ? t('Restore task')
              : deleting
                ? t('Confirm deletion')
                : t('Delete task')}
          </button>
          {deleting && !task.archived && (
            <button type="button" onClick={() => setDeleting(false)}>
              {t('Cancel')}
            </button>
          )}
        </section>
      )}
    </>
  );

  return (
    <dialog
      ref={dialog}
      className="task-modal"
      aria-label={task ? t('Task: {title}', { title: task.title }) : t('Task')}
      data-testid="task-modal"
      // Escape asks to close, like the button, so it cannot throw unsaved text away either.
      onCancel={(e) => {
        e.preventDefault();
        requestClose();
      }}
      // The dialog element itself is only ever hit on its backdrop; its content covers the rest.
      onClick={(e) => e.target === e.currentTarget && requestClose()}
    >
      <article className="item-page task-page">
        <header className="task-modal-head">
          <p>
            {task && (
              <>
                <Link to={`/projects/${project.id}/breakdown/${task.item.id}`}>
                  {task.item.title}
                </Link>
                <span className="muted">
                  {' '}
                  · {t(CATEGORY_LABELS[task.item.category])} · {t(STATE_LABELS[task.item.state])}
                </span>
              </>
            )}
          </p>
          <button
            type="button"
            className="quiet modal-close"
            aria-label={t('Close task')}
            title={t('Close')}
            onClick={requestClose}
          >
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
              <path
                d="m3.5 3.5 9 9m0-9-9 9"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>
        {discarding && (
          <div className="confirm small" role="group" aria-label={t('Unsaved changes')}>
            <p>{t('The title or description has changes that are not saved.')}</p>
            <button type="button" className="primary" onClick={close}>
              {t('Discard and close')}
            </button>
            <button type="button" onClick={() => setDiscarding(false)}>
              {t('Keep editing')}
            </button>
          </div>
        )}
        {!task ? error ? <p className="error">{error}</p> : <p>{t('Loading…')}</p> : body}
      </article>
    </dialog>
  );
}

function TaskForm({
  task,
  readOnly,
  members,
  onSave,
  onAssign,
  onDirty,
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
  /** Whether the title, description, or category differ from what is saved. */
  onDirty: (dirty: boolean) => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [category, setCategory] = useState<TaskCategory>(task.category);
  const [assigneeId, setAssigneeId] = useState<string | null>(task.assignee?.id ?? null);
  const [saved, setSaved] = useState(false);
  // Which field the edit began in, and so which one gets the caret.
  const [editing, setEditing] = useState<false | 'title' | 'description'>(false);
  const startEditing = (field: 'title' | 'description') => {
    setSaved(false);
    setEditing(field);
  };
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
  const reportDirty = useRef(onDirty);
  useEffect(() => {
    reportDirty.current = onDirty;
  });
  useEffect(() => reportDirty.current(dirty), [dirty]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const ok = await onSave({ title: title.trim(), description, category });
    setSaved(ok);
    if (ok) setEditing(false);
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
    setAssigned(name ? t('Assigned to {name}.', { name }) : t('Unassigned.'));
  }

  return (
    <form className="task-editor" onSubmit={submit}>
      {editing && (
        <WritingPrompt id="task-description">
          {t('What is the desired result, and how could someone check it?')}
        </WritingPrompt>
      )}
      <div className="task-copy">
        {editing ? (
          <div className="form">
            <label>
              {t('Title')}
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                maxLength={500}
                autoFocus={editing === 'title'}
              />
            </label>
            <label>
              {t('Description')}
              <MentionTextarea
                value={description}
                onChange={setDescription}
                autoFocus={editing === 'description'}
                // The caret goes to the end of what is there, ready to go on writing.
                onFocus={(e) =>
                  e.currentTarget.setSelectionRange(description.length, description.length)
                }
                rows={8}
                placeholder={t('Free-form notes, links to references, anything useful.')}
              />
            </label>
          </div>
        ) : (
          <>
            <div className="row between">
              <h1>
                {readOnly ? (
                  task.title
                ) : (
                  <EditableTitle
                    label={t('Click to edit the title')}
                    onEdit={() => startEditing('title')}
                  >
                    {task.title}
                  </EditableTitle>
                )}
              </h1>
              {!readOnly && (
                <button type="button" className="quiet" onClick={() => startEditing('title')}>
                  {t('Edit task')}
                </button>
              )}
            </div>
            {readOnly ? (
              task.description ? (
                <RichText text={task.description} className="description-text" />
              ) : (
                <p className="description-text">{t('No description yet.')}</p>
              )
            ) : (
              <EditableText
                label={t('Click to edit the description')}
                onEdit={() => startEditing('description')}
              >
                {task.description ? (
                  <RichText text={task.description} className="description-text" />
                ) : (
                  <p className="description-text">{t('No description yet. Click to add one.')}</p>
                )}
              </EditableText>
            )}
          </>
        )}
        {!readOnly && (editing || dirty) && (
          <div className="row editor-actions">
            <button
              type="submit"
              className="primary"
              disabled={!dirty || title.trim() === '' || assigning || saving}
            >
              {t('Save')}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setTitle(task.title);
                setDescription(task.description);
                setCategory(task.category);
                setEditing(false);
              }}
            >
              {t('Cancel')}
            </button>
          </div>
        )}
        {saved && !dirty && (
          <span className="ok" role="status">
            {t('Saved.')}
          </span>
        )}
      </div>
      <div className="form task-properties">
        <label>
          {t('Category')}
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as TaskCategory)}
            disabled={readOnly || task.placement !== null}
            title={
              task.placement
                ? t('Category cannot be changed while the task is on a Workboard')
                : undefined
            }
          >
            {TASK_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(TASK_CATEGORY_LABELS[c])}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('Assignee')}
          <select
            value={assigneeId ?? ''}
            onChange={(e) => void assign(e.target.value || null)}
            // Each write carries the task's version, so the two never race each other.
            disabled={readOnly || assigning || saving}
          >
            <option value="">{t('Unassigned')}</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.displayName}
              </option>
            ))}
          </select>
          {assigning ? (
            <span className="hint">{t('Saving…')}</span>
          ) : (
            assigned && (
              <span className="hint ok" role="status">
                {assigned}
              </span>
            )
          )}
        </label>
      </div>
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
      aria-label={t('Move task to another item')}
      onSubmit={(e) => {
        e.preventDefault();
        if (target) void onMove(target).then((ok) => ok && setTarget(''));
      }}
    >
      <label>
        {t('Move to another backlog item')}
        <select value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">{t('Choose an item…')}</option>
          {others.map((i) => (
            <option key={i.id} value={i.id}>
              {i.title} ({t(CATEGORY_LABELS[i.category])})
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={!target}>
        {t('Move task')}
      </button>
    </form>
  );
}
