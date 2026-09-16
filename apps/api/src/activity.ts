import type { Queryable } from './db.ts';

export interface ActivityInput {
  projectId: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  previous?: unknown;
  next?: unknown;
}

/** Appends one activity record (Section 14). Call inside the transaction that made the change. */
export async function recordActivity(db: Queryable, a: ActivityInput): Promise<void> {
  await db.query(
    `INSERT INTO activity (project_id, actor_id, action, entity_type, entity_id, previous, next)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      a.projectId,
      a.actorId,
      a.action,
      a.entityType,
      a.entityId,
      a.previous === undefined ? null : JSON.stringify(a.previous),
      a.next === undefined ? null : JSON.stringify(a.next),
    ],
  );
}
