import type { Queryable } from './db.ts';
import { emitLive } from './live.ts';
import { viaToken } from './requestContext.ts';
import { notifyFromActivity } from './services/notifications.ts';

export interface ActivityInput {
  projectId: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  previous?: unknown;
  next?: unknown;
}

/**
 * Appends one activity record (Section 14). Call inside the transaction that made the change.
 * The record is also where notifications and live updates come from, so whoever a change
 * concerns hears of it, and every open board shows it, whichever route made it. A change made
 * with an API token names the token beside its actor.
 */
export async function recordActivity(db: Queryable, a: ActivityInput): Promise<void> {
  await db.query(
    `INSERT INTO activity (project_id, actor_id, action, entity_type, entity_id, previous, next, via_token)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      a.projectId,
      a.actorId,
      a.action,
      a.entityType,
      a.entityId,
      a.previous === undefined ? null : JSON.stringify(a.previous),
      a.next === undefined ? null : JSON.stringify(a.next),
      viaToken(a.actorId),
    ],
  );
  await notifyFromActivity(db, a);
  await emitLive(db, { p: a.projectId, t: a.entityType, id: a.entityId, a: a.action });
}
