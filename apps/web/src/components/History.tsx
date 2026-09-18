import type { ActivityEntry, ActivityQuery } from '@gameweld/domain';
import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import { useProject } from '../pages/ProjectPage.tsx';

const LABELS: Record<string, string> = {
  'project.created': 'created the project',
  'project.updated': 'changed project settings',
  'member.added': 'added a member',
  'member.updated': 'changed a member’s roles',
  'member.removed': 'removed a member',
  'item.created': 'created the item',
  'item.updated': 'edited the item',
  'item.reordered': 'reordered the item',
  'item.recategorized': 'moved the item to another category',
  'item.archived': 'archived the item',
  'item.restored': 'restored the item',
  'item.ready_for_review': 'item became Ready for Review',
  'item.reopened': 'item returned to Open',
  'item.accepted': 'accepted the item as Done',
  'item.rejected': 'rejected the item',
  'item.link_added': 'added a link',
  'item.link_removed': 'removed a link',
  'task.created': 'created the task',
  'task.updated': 'edited the task',
  'task.completed': 'completed the task',
  'task.reopened': 'reopened the task',
  'task.reparented': 'moved the task to another item',
  'task.archived': 'archived the task',
  'task.restored': 'restored the task',
  'task.placed': 'placed the task on the Workboard',
  'task.placed_as_exception': 'placed the task as out-of-scope work',
  'task.moved': 'moved the task to another column',
  'task.returned': 'returned the task to Breakdown',
  'scope.added': 'added the item to the Workboard scope',
  'scope.removed': 'removed the item from the Workboard scope',
  'board.created': 'created the Workboard',
  'board.updated': 'renamed the Workboard',
  'board.archived': 'archived the Workboard',
  'column.created': 'added a column',
  'column.updated': 'changed a column',
  'column.deleted': 'deleted a column',
  'request.created': 'requested out-of-scope placement',
  'request.withdrawn': 'withdrew a placement request',
  'request.approved': 'approved a placement request',
  'request.rejected': 'rejected a placement request',
  'attachment.added': 'added an attachment',
  'attachment.removed': 'removed an attachment',
  'dependency.added': 'added a dependency',
  'dependency.removed': 'removed a dependency',
  'project.seeded': 'seeded the demo project',
};

function detail(e: ActivityEntry): string | null {
  const n = (e.next ?? {}) as Record<string, unknown>;
  const p = (e.previous ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v : null);
  switch (e.action) {
    case 'item.created':
    case 'task.created':
      return str(n.title);
    case 'item.recategorized':
      return `${str(p.category) ?? '?'} → ${str(n.category) ?? '?'}`;
    case 'member.updated':
      return `${(p.roles as string[] | undefined)?.join(', ') ?? ''} → ${(n.roles as string[] | undefined)?.join(', ') ?? ''}`;
    case 'item.accepted':
    case 'request.approved':
    case 'request.rejected':
      return str(n.note);
    case 'item.rejected':
    case 'request.created':
      return str(n.note) ?? str(n.reason);
    case 'attachment.added':
      return n.cover ? `${str(n.fileName)}, now the cover` : str(n.fileName);
    case 'attachment.removed':
      return str(p.fileName);
    case 'column.updated':
      return str(p.name) !== str(n.name) ? `${str(p.name)} → ${str(n.name)}` : null;
    case 'column.created':
    case 'column.deleted':
      return str(n.name) ?? str(p.name);
    case 'item.reopened':
    case 'item.ready_for_review':
      return str(n.reason);
    default:
      return null;
  }
}

/** Activity history (Section 14) for an item, a task, or a board, newest first. */
export function History({
  query,
  open: initiallyOpen = false,
}: {
  query: ActivityQuery;
  open?: boolean;
}) {
  const { project } = useProject();
  const [open, setOpen] = useState(initiallyOpen);
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);

  useEffect(() => {
    if (!open) return;
    api.activity(project.id, query).then(setEntries);
  }, [open, project.id, query.entityType, query.entityId]);

  return (
    <section
      className="panel history-panel"
      aria-labelledby="history-heading"
      data-testid="history"
    >
      <h3 id="history-heading">
        <button
          type="button"
          className="link"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {open ? '▾' : '▸'} History
        </button>
      </h3>
      {open &&
        (entries === null ? (
          <p className="muted small">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="muted small">Nothing recorded yet.</p>
        ) : (
          <ul className="history-list">
            {entries.map((e) => {
              const extra = detail(e);
              return (
                <li key={e.id} data-testid="history-entry">
                  <span className="muted small">{new Date(e.createdAt).toLocaleString()}</span>{' '}
                  <strong>{e.actor?.displayName ?? 'System'}</strong> {LABELS[e.action] ?? e.action}
                  {extra && <span className="muted"> · {extra}</span>}
                </li>
              );
            })}
          </ul>
        ))}
    </section>
  );
}
