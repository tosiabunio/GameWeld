import type { ItemState } from '@gameweld/domain';
import { recordActivity } from '../activity.ts';
import type { Queryable } from '../db.ts';

/**
 * Invariant 5 (plan Section 4.2) and specification Section 11: an item is Ready for Review when
 * it has at least one non-archived task and every non-archived task is completed. Call this
 * inside the transaction of any task change. Returns the resulting state.
 *
 * - open -> ready_for_review when the rule becomes true.
 * - ready_for_review -> open when it becomes false.
 * - done -> open when an unfinished task appears (D4); the current acceptance is invalidated and
 *   kept in history.
 */
export async function recalculateItemState(
  tx: Queryable,
  itemId: string,
  actorId: string | null,
  reason: string,
): Promise<ItemState> {
  const item = (
    await tx.query<{ project_id: string; state: ItemState }>(
      'SELECT project_id, state FROM backlog_items WHERE id = $1 FOR UPDATE',
      [itemId],
    )
  ).rows[0];
  if (!item) throw new Error(`item ${itemId} not found`);

  const counts = (
    await tx.query<{ total: string; unfinished: string }>(
      `SELECT count(*) AS total, count(*) FILTER (WHERE NOT completed) AS unfinished
         FROM tasks WHERE item_id = $1 AND archived_at IS NULL`,
      [itemId],
    )
  ).rows[0]!;
  const total = Number(counts.total);
  const unfinished = Number(counts.unfinished);
  const ready = total >= 1 && unfinished === 0;

  let next: ItemState = item.state;
  if (item.state === 'done') {
    if (unfinished > 0) next = 'open';
  } else {
    next = ready ? 'ready_for_review' : 'open';
  }
  if (next === item.state) return next;

  await tx.query(
    'UPDATE backlog_items SET state = $2, version = version + 1, updated_at = now() WHERE id = $1',
    [itemId, next],
  );
  if (item.state === 'done') {
    await tx.query(
      `UPDATE acceptances SET invalidated_at = now(), invalidated_reason = $2 WHERE item_id = $1 AND invalidated_at IS NULL`,
      [itemId, reason],
    );
  }
  await recordActivity(tx, {
    projectId: item.project_id,
    actorId,
    action: next === 'ready_for_review' ? 'item.ready_for_review' : 'item.reopened',
    entityType: 'backlog_item',
    entityId: itemId,
    previous: { state: item.state },
    next: { state: next, reason },
  });
  return next;
}
