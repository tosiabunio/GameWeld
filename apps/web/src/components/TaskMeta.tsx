import {
  LABEL_COLORS,
  type Label,
  type LabelColor,
  type TaskDetail,
  type UpdateTaskInput,
} from '@gameweld/domain';
import { useState } from 'react';
import { api, ApiError } from '../api.ts';
import { useProject } from '../pages/ProjectPage.tsx';
import { ActionMenu } from './ActionMenu.tsx';
import { LabelChip } from './TaskBadges.tsx';

type Patch = Omit<UpdateTaskInput, 'version'>;

/**
 * What a card says about its task beyond its category: labels, an optional date, and the
 * "blocked" flag. Each applies the moment it is set, like the assignee.
 */
export function TaskMeta({
  task,
  readOnly,
  onPatch,
}: {
  task: TaskDetail;
  readOnly: boolean;
  onPatch: (input: Patch) => Promise<boolean>;
}) {
  const [reason, setReason] = useState<string | null>(null);
  return (
    <>
      <div className="field">
        <span className="field-label">Labels</span>
        <div className="label-field">
          {task.labels.map((l) => (
            <LabelChip key={l.id} label={l} />
          ))}
          {task.labels.length === 0 && readOnly && <span className="muted small">None</span>}
          {!readOnly && <LabelPicker task={task} onPatch={onPatch} />}
        </div>
      </div>
      <label>
        Due date
        <input
          type="date"
          value={task.dueDate ?? ''}
          disabled={readOnly}
          onChange={(e) => void onPatch({ dueDate: e.target.value || null })}
        />
      </label>
      <div className="field">
        <span className="field-label">Blocked</span>
        {task.blocked ? (
          <div className="blocked-field">
            <span className="badge blocked">Blocked</span>
            {task.blockedReason && <span className="small">{task.blockedReason}</span>}
            {!readOnly && (
              <button
                type="button"
                className="link"
                onClick={() => void onPatch({ blocked: false })}
              >
                Unblock
              </button>
            )}
          </div>
        ) : reason !== null ? (
          <div className="blocked-field">
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                void onPatch({ blocked: true, blockedReason: reason.trim() }).then(
                  (ok) => ok && setReason(null),
                );
              }}
              placeholder="What is it waiting for? (optional)"
              aria-label="Why the task is blocked"
              maxLength={500}
              autoFocus
            />
            <button
              type="button"
              onClick={() =>
                void onPatch({ blocked: true, blockedReason: reason.trim() }).then(
                  (ok) => ok && setReason(null),
                )
              }
            >
              Flag as blocked
            </button>
            <button type="button" className="link" onClick={() => setReason(null)}>
              Cancel
            </button>
          </div>
        ) : (
          <div className="blocked-field">
            <span className="muted small">No</span>
            {!readOnly && !task.completed && (
              <button type="button" className="link" onClick={() => setReason('')}>
                Flag as blocked…
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

/**
 * The project's labels, ticked for this task. Anyone who works on tasks adds a new one here,
 * while labelling, and it goes onto the task at once; a Game Director also renames, recolours,
 * and deletes.
 */
function LabelPicker({
  task,
  onPatch,
}: {
  task: TaskDetail;
  onPatch: (input: Patch) => Promise<boolean>;
}) {
  const { project, reload } = useProject();
  const canManage = project.permissions['backlog.manage'];
  const [draft, setDraft] = useState<{ name: string; color: LabelColor }>({
    name: '',
    color: 'blue',
  });
  const [editing, setEditing] = useState<Label | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mine = new Set(task.labels.map((l) => l.id));

  async function labels(action: () => Promise<Label[]>): Promise<Label[] | null> {
    setError(null);
    try {
      const all = await action();
      await reload();
      return all;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
      return null;
    }
  }

  async function create() {
    const name = draft.name.trim();
    if (name === '') return;
    const all = await labels(() => api.createLabel(project.id, { name, color: draft.color }));
    const created = all?.find((l) => l.name.toLowerCase() === name.toLowerCase());
    if (!created) return;
    setDraft({ name: '', color: draft.color });
    await onPatch({ labelIds: [...mine, created.id] });
  }

  return (
    <ActionMenu
      label="Labels"
      triggerClassName="quiet label-add"
      triggerContent={task.labels.length === 0 ? '+ Add label' : 'Edit'}
      popoverClassName="label-popover"
    >
      {error && (
        <p className="error small" role="alert">
          {error}
        </p>
      )}
      {project.labels.length === 0 && (
        <p className="menu-note top">No labels in this project yet.</p>
      )}
      {project.labels.map((l) =>
        editing?.id === l.id ? (
          <div key={l.id} className="label-edit">
            <input
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              aria-label="Label name"
              maxLength={40}
              autoFocus
            />
            <Swatches
              value={editing.color}
              onChange={(color) => setEditing({ ...editing, color })}
            />
            <div className="row">
              <button
                type="button"
                disabled={editing.name.trim() === ''}
                onClick={() =>
                  void labels(() =>
                    api.updateLabel(project.id, l.id, {
                      name: editing.name.trim(),
                      color: editing.color,
                    }),
                  ).then((ok) => ok && setEditing(null))
                }
              >
                Save
              </button>
              <button
                type="button"
                className="link"
                title="Takes the label off every task that carries it"
                onClick={() =>
                  void labels(() => api.deleteLabel(project.id, l.id)).then(
                    (ok) => ok && setEditing(null),
                  )
                }
              >
                Delete label
              </button>
              <button type="button" className="link" onClick={() => setEditing(null)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div key={l.id} className="label-row">
            <label className="menu-check">
              <input
                type="checkbox"
                checked={mine.has(l.id)}
                onChange={(e) =>
                  void onPatch({
                    labelIds: e.target.checked
                      ? [...mine, l.id]
                      : [...mine].filter((id) => id !== l.id),
                  })
                }
              />
              <LabelChip label={l} />
            </label>
            {canManage && (
              <button
                type="button"
                className="link"
                onClick={() => setEditing(l)}
                aria-label={`Edit label ${l.name}`}
              >
                Edit
              </button>
            )}
          </div>
        ),
      )}
      <div className="label-new">
        <input
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            void create();
          }}
          placeholder="New label…"
          aria-label="New label name"
          maxLength={40}
        />
        <Swatches value={draft.color} onChange={(color) => setDraft({ ...draft, color })} />
        <button type="button" disabled={draft.name.trim() === ''} onClick={() => void create()}>
          Add label
        </button>
      </div>
    </ActionMenu>
  );
}

function Swatches({
  value,
  onChange,
}: {
  value: LabelColor;
  onChange: (color: LabelColor) => void;
}) {
  return (
    <div className="swatches" role="radiogroup" aria-label="Label colour">
      {LABEL_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value === color}
          aria-label={color}
          title={color}
          className={`swatch label-${color}`}
          onClick={() => onChange(color)}
        />
      ))}
    </div>
  );
}
