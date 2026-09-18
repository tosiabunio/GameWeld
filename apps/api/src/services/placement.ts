import { todoKindFor, type ColumnKind, type TaskCategory } from '@gameweld/domain';
import { generateKeyBetween } from 'fractional-indexing';
import type { Queryable } from '../db.ts';

/** Placement helpers shared by the board, request, and task routes. */

export async function rankAtEndOfColumn(tx: Queryable, columnId: string): Promise<string> {
  const last = await tx.query<{ rank: string }>(
    'SELECT rank FROM task_placements WHERE column_id = $1 AND is_current ORDER BY rank DESC LIMIT 1',
    [columnId],
  );
  return generateKeyBetween(last.rows[0]?.rank ?? null, null);
}

export async function columnOfKind(
  tx: Queryable,
  boardId: string,
  kind: ColumnKind,
): Promise<{ id: string }> {
  const res = await tx.query<{ id: string }>(
    'SELECT id FROM board_columns WHERE board_id = $1 AND kind = $2',
    [boardId, kind],
  );
  if (!res.rows[0]) throw new Error(`board ${boardId} has no ${kind} column`);
  return res.rows[0];
}

/**
 * Places an unplaced task in its category's To Do column. A Director placing a task whose item is
 * outside scope is recorded as an approved exception (Section 9), so the Requests history shows it.
 */
export async function placeTask(
  tx: Queryable,
  boardId: string,
  task: { id: string; category: TaskCategory },
  actorId: string,
  exception: boolean,
  options: { recordApproval?: boolean } = { recordApproval: true },
) {
  const column = await columnOfKind(tx, boardId, todoKindFor(task.category));
  await tx.query(
    `INSERT INTO task_placements (task_id, board_id, column_id, rank, placed_by, entered_as_exception)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [task.id, boardId, column.id, await rankAtEndOfColumn(tx, column.id), actorId, exception],
  );
  if (exception && options.recordApproval) {
    // Any pending request for this task is superseded by the direct placement.
    await tx.query(
      `UPDATE work_requests SET status = 'approved', decided_by = $3, decided_at = now(), decision_note = 'placed directly by a Game Director'
        WHERE task_id = $1 AND board_id = $2 AND status = 'pending'`,
      [task.id, boardId, actorId],
    );
    await tx.query(
      `INSERT INTO work_requests (task_id, board_id, requester_id, reason, status, decided_by, decided_at, decision_note)
       SELECT $1, $2, $3, 'placed directly', 'approved', $3, now(), 'placed directly by a Game Director'
        WHERE NOT EXISTS (SELECT 1 FROM work_requests WHERE task_id = $1 AND board_id = $2 AND status = 'approved' AND decided_at > now() - interval '1 second')`,
      [task.id, boardId, actorId],
    );
  }
}
/**
 * Accepted work is finished work: the item leaves the scope of every active Workboard and all its
 * tasks leave with it, including ones that entered as out-of-scope exceptions. The tasks keep their
 * completion flag (R1) and their placement history (R5). Archived Workboards are history and stay
 * as they were. Returns what left each board, for the activity record.
 */
export async function clearAcceptedItemFromBoards(
  tx: Queryable,
  projectId: string,
  itemId: string,
): Promise<{ boardId: string; wasInScope: boolean; removedTasks: number }[]> {
  const boards = await tx.query<{ id: string }>(
    `SELECT id FROM workboards WHERE project_id = $1 AND state = 'active' ORDER BY id`,
    [projectId],
  );
  const left = [];
  for (const board of boards.rows) {
    const scope = await tx.query(
      'DELETE FROM workboard_scope WHERE board_id = $1 AND item_id = $2',
      [board.id, itemId],
    );
    const placements = await tx.query(
      `UPDATE task_placements p
          SET is_current = false, removed_at = now(), removed_reason = 'item accepted',
              last_column_id = p.column_id
         FROM tasks t
        WHERE p.task_id = t.id AND t.item_id = $2 AND p.board_id = $1 AND p.is_current`,
      [board.id, itemId],
    );
    if (scope.rowCount || placements.rowCount)
      left.push({
        boardId: board.id,
        wasInScope: Boolean(scope.rowCount),
        removedTasks: placements.rowCount ?? 0,
      });
  }
  return left;
}

/** Closes the current placement (R5: the column is recorded, the position is discarded). */
export async function returnTask(tx: Queryable, taskId: string, reason: string) {
  await tx.query(
    `UPDATE task_placements SET is_current = false, removed_at = now(), removed_reason = $2, last_column_id = column_id
      WHERE task_id = $1 AND is_current`,
    [taskId, reason],
  );
}
