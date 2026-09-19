import type { NotificationKind } from '@gameweld/domain';
import type { ActivityInput } from '../activity.ts';
import type { Queryable } from '../db.ts';
import { emitLive } from '../live.ts';

interface NotifyInput {
  projectId: string;
  actorId: string | null;
  kind: NotificationKind;
  /** Whoever did it is never told about it, and neither is anyone outside the project. */
  recipients: (string | null | undefined)[];
  taskId?: string | null;
  itemId?: string | null;
  detail?: string;
}

export async function notify(db: Queryable, n: NotifyInput): Promise<void> {
  const recipients = [...new Set(n.recipients)].filter(
    (id): id is string => typeof id === 'string' && id !== n.actorId,
  );
  if (recipients.length === 0) return;
  await db.query(
    `INSERT INTO notifications (user_id, project_id, actor_id, kind, task_id, item_id, detail)
     SELECT m.user_id, $1, $2, $3, $4, $5, $6
       FROM project_memberships m
      WHERE m.project_id = $1 AND m.user_id = ANY($7::uuid[])`,
    [
      n.projectId,
      n.actorId,
      n.kind,
      n.taskId ?? null,
      n.itemId ?? null,
      (n.detail ?? '').slice(0, 300),
      recipients,
    ],
  );
  // Their bells ring at once. After the rows exist: outside a transaction this goes out now.
  await emitLive(db, { u: recipients });
}

const field = (value: unknown, name: string): unknown =>
  value && typeof value === 'object' ? (value as Record<string, unknown>)[name] : undefined;
const text = (value: unknown) => (typeof value === 'string' ? value : '');

/**
 * Turns an activity record into the notifications it calls for. Every change already passes
 * through the activity history, so deciding here who should hear of it covers every route that
 * makes the change, the automatic ones included, with nothing to remember at the call sites.
 */
export async function notifyFromActivity(db: Queryable, a: ActivityInput): Promise<void> {
  const base = { projectId: a.projectId, actorId: a.actorId };

  if (a.entityType === 'task' && a.action.startsWith('task.')) {
    const before = field(a.previous, 'assigneeId');
    const after = field(a.next, 'assigneeId');
    const created = a.action === 'task.created';
    if ((created && after) || (before !== undefined && after !== undefined && before !== after)) {
      const itemId = (
        await db.query<{ item_id: string }>('SELECT item_id FROM tasks WHERE id = $1', [a.entityId])
      ).rows[0]?.item_id;
      const about = { ...base, taskId: a.entityId, itemId: itemId ?? null };
      await notify(db, { ...about, kind: 'task.assigned', recipients: [text(after) || null] });
      if (!created)
        await notify(db, { ...about, kind: 'task.unassigned', recipients: [text(before) || null] });
    }
    return;
  }

  if (a.entityType === 'work_request') {
    const kind = a.action as NotificationKind;
    if (kind !== 'request.created' && kind !== 'request.approved' && kind !== 'request.rejected')
      return;
    const request = (
      await db.query<{ task_id: string; item_id: string; requester_id: string; reason: string }>(
        `SELECT r.task_id, t.item_id, r.requester_id, r.reason
           FROM work_requests r JOIN tasks t ON t.id = r.task_id WHERE r.id = $1`,
        [a.entityId],
      )
    ).rows[0];
    if (!request) return;
    const about = { ...base, kind, taskId: request.task_id, itemId: request.item_id };
    if (kind === 'request.created') {
      // Those who can decide it.
      const directors = await db.query<{ user_id: string }>(
        `SELECT user_id FROM project_memberships WHERE project_id = $1 AND 'director' = ANY(roles)`,
        [a.projectId],
      );
      await notify(db, {
        ...about,
        recipients: directors.rows.map((d) => d.user_id),
        detail: request.reason,
      });
    } else {
      await notify(db, {
        ...about,
        recipients: [request.requester_id],
        detail: text(field(a.next, 'note')),
      });
    }
    return;
  }

  if (a.entityType === 'backlog_item') {
    if (a.action === 'item.ready_for_review') {
      // Those who can accept it.
      const acceptors = await db.query<{ user_id: string }>(
        `SELECT user_id FROM project_memberships
          WHERE project_id = $1 AND ('director' = ANY(roles) OR can_accept)`,
        [a.projectId],
      );
      await notify(db, {
        ...base,
        kind: 'item.ready_for_review',
        itemId: a.entityId,
        recipients: acceptors.rows.map((m) => m.user_id),
      });
    } else if (a.action === 'item.accepted' || a.action === 'item.rejected') {
      // Those whose work it was.
      const workers = await db.query<{ assignee_id: string }>(
        `SELECT DISTINCT assignee_id FROM tasks
          WHERE item_id = $1 AND archived_at IS NULL AND assignee_id IS NOT NULL`,
        [a.entityId],
      );
      await notify(db, {
        ...base,
        kind: a.action,
        itemId: a.entityId,
        recipients: workers.rows.map((w) => w.assignee_id),
        detail: text(field(a.next, 'note')),
      });
    }
  }
}

/**
 * A comment concerns whoever does the task and everyone already in the conversation. Comments
 * are not part of the activity history, so the comment route calls this itself.
 */
export async function notifyOfComment(
  db: Queryable,
  c: {
    projectId: string;
    authorId: string;
    taskId: string | null;
    itemId: string | null;
    body: string;
  },
): Promise<void> {
  const people = await db.query<{ user_id: string | null; item_id: string | null }>(
    c.taskId
      ? `SELECT t.assignee_id AS user_id, t.item_id FROM tasks t WHERE t.id = $1
         UNION SELECT k.author_id, NULL FROM comments k WHERE k.task_id = $1`
      : `SELECT k.author_id AS user_id, NULL::uuid AS item_id FROM comments k WHERE k.item_id = $1
         UNION SELECT t.assignee_id, NULL FROM tasks t
          WHERE t.item_id = $1 AND t.archived_at IS NULL AND NOT t.completed`,
    [c.taskId ?? c.itemId],
  );
  await notify(db, {
    projectId: c.projectId,
    actorId: c.authorId,
    kind: 'comment.added',
    taskId: c.taskId,
    itemId: c.itemId ?? people.rows.find((p) => p.item_id)?.item_id ?? null,
    recipients: people.rows.map((p) => p.user_id),
    detail: c.body.replace(/\s+/g, ' ').trim(),
  });
}
