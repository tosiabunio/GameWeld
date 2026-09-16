import type { BacklogItemDetail } from '@gameweld/domain';
import { CATEGORY_LABELS, STATE_LABELS } from '@gameweld/domain';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { api, ApiError } from '../api.ts';
import { Breakdown } from '../components/Breakdown.tsx';
import { ReviewPanel } from '../components/ReviewPanel.tsx';
import { Attachments } from '../components/Attachments.tsx';
import { Dependencies } from '../components/Dependencies.tsx';
import { History } from '../components/History.tsx';
import { LinksList } from '../components/LinksList.tsx';
import { WritingPrompt } from '../components/WritingPrompt.tsx';
import { useProject } from './ProjectPage.tsx';

export function ItemBreakdown({
  itemId,
  onChanged,
}: {
  itemId: string;
  onChanged: () => Promise<void>;
}) {
  const { project } = useProject();
  const navigate = useNavigate();
  const canManage = project.permissions['backlog.manage'];
  const [item, setItem] = useState<BacklogItemDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setItem(await api.item(project.id, itemId));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load the item');
    }
  }, [project.id, itemId]);

  const changed = useCallback(async () => {
    await reload();
    await onChanged();
  }, [reload, onChanged]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await changed();
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) await reload();
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
      return false;
    }
  }

  if (error && !item) return <p className="error">{error}</p>;
  if (!item) return <p>Loading…</p>;

  return (
    <article className="item-page">
      <div className="item-status">
        <span className="badge">{CATEGORY_LABELS[item.category]}</span>
        <span className="badge">{STATE_LABELS[item.state]}</span>
        {item.activeBoard && <span className="badge">On {item.activeBoard.name}</span>}
        {item.archived && <span className="badge warn">Archived</span>}
        <span className="muted">
          {item.taskCounts.completed}/{item.taskCounts.total} tasks complete
        </span>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {canManage && (
        <WritingPrompt id="item-description">
          <strong>Optional prompts.</strong> What should players experience when this is done? How
          will the team know it is good enough? Answer in the description if it helps; nothing here
          is required.
        </WritingPrompt>
      )}
      <ItemForm
        item={item}
        readOnly={!canManage}
        onSave={(input) =>
          run(() => api.updateItem(project.id, item.id, { version: item.version, ...input }))
        }
      />

      <ReviewPanel item={item} onChanged={changed} />

      <section className="panel" aria-labelledby="tasks-heading">
        <h2 id="tasks-heading">Breakdown</h2>
        <p className="muted">
          The tasks needed to produce this item, grouped by nature. Any combination is fine; no
          category is required. Creating a task does not place it on a Workboard.
        </p>
        <Breakdown
          projectId={project.id}
          itemId={item.id}
          canWork={project.permissions['task.work']}
          canPlaceOutside={project.permissions['out_of_scope.approve']}
          activeBoard={item.activeBoard}
          itemArchived={item.archived}
          itemState={item.state}
          onChanged={changed}
        />
      </section>

      <section className="panel" aria-labelledby="links-heading">
        <h2 id="links-heading">Links</h2>
        <LinksList
          links={item.links}
          canEdit={canManage}
          onAdd={(url, label) => run(() => api.addLink(project.id, item.id, { url, label }))}
          onRemove={(linkId) => run(() => api.removeLink(project.id, item.id, linkId))}
        />
      </section>

      <section className="panel" aria-labelledby="attachments-heading">
        <h2 id="attachments-heading">Attachments</h2>
        <Attachments
          owner={{ itemId: item.id }}
          attachments={item.attachments}
          canWork={project.permissions['task.work'] && !item.archived}
          coverId={item.coverAttachmentId}
          onSetCover={(coverAttachmentId) =>
            run(() =>
              api.updateItem(project.id, item.id, { version: item.version, coverAttachmentId }),
            )
          }
          onChanged={changed}
        />
      </section>

      <section className="panel" aria-labelledby="deps-heading">
        <h2 id="deps-heading">Dependencies</h2>
        <Dependencies
          itemId={item.id}
          dependsOn={item.dependsOn}
          dependents={item.dependents}
          onChanged={changed}
        />
      </section>

      <History query={{ entityType: 'backlog_item', entityId: item.id }} />

      {canManage && (
        <section className="panel" aria-labelledby="archive-item-heading">
          <h2 id="archive-item-heading">{item.archived ? 'Archived item' : 'Archive'}</h2>
          <p className="muted">
            {item.archived
              ? 'This item is hidden from the Backlog. Restore it to plan it again.'
              : 'Archiving hides the item from the Backlog. Tasks placed on a Workboard must be returned or finished first.'}
          </p>
          <button
            type="button"
            onClick={() =>
              void run(() =>
                api.updateItem(project.id, item.id, {
                  version: item.version,
                  archived: !item.archived,
                }),
              ).then((ok) => ok && !item.archived && navigate(`/projects/${project.id}/backlog`))
            }
          >
            {item.archived ? 'Restore item' : 'Archive item'}
          </button>
        </section>
      )}
    </article>
  );
}

function ItemForm({
  item,
  readOnly,
  onSave,
}: {
  item: BacklogItemDetail;
  readOnly: boolean;
  onSave: (input: { title: string; description: string }) => Promise<boolean>;
}) {
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setTitle(item.title);
    setDescription(item.description);
  }, [item.title, item.description]);
  const dirty = title !== item.title || description !== item.description;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaved(await onSave({ title: title.trim(), description }));
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
      <label>
        Description
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          readOnly={readOnly}
          rows={10}
          placeholder={
            readOnly
              ? 'No description.'
              : 'Free-form. Describe the intended result however suits the team; nothing here is required.'
          }
        />
      </label>
      {!readOnly && (
        <div className="row">
          <button type="submit" className="primary" disabled={!dirty || title.trim() === ''}>
            Save
          </button>
          {saved && !dirty && <span className="ok">Saved.</span>}
        </div>
      )}
    </form>
  );
}
