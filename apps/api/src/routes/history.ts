import type { ActivityEntry, ColumnKind, ColumnStay, TaskCategory } from '@gameweld/domain';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { projectRoute } from '../authz.ts';
import type { Queryable } from '../db.ts';
import { badRequest } from '../errors.ts';
import * as schema from '../schemas.ts';

const moment = z
  .union([z.string().datetime({ offset: true }), z.string().date()])
  .describe('A time, or a date, which means its start in UTC.');

const activityQuery = z.object({
  entityType: z.enum(['backlog_item', 'task', 'workboard']).optional(),
  entityId: z.string().uuid().optional(),
  from: moment.optional().describe('Only entries from this time on.'),
  to: moment.optional().describe('Only entries before this time.'),
  actorId: z.string().uuid().optional().describe('Only what this member did.'),
  actions: z
    .string()
    .regex(/^[a-z_]+\.(\*|[a-z_]+)(,[a-z_]+\.(\*|[a-z_]+))*$/)
    .optional()
    .describe(
      'Only these actions, comma-separated, such as task.moved,item.rejected; task.* means every task action.',
    ),
  before: z.coerce
    .number()
    .int()
    .positive()
    .optional()
    .describe('Only entries older than the entry with this id, to page back.'),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .describe('At most this many; 100 unless given.'),
});

const staysQuery = z.object({
  boardId: z.string().uuid().optional().describe('Only this Workboard; every board unless given.'),
  taskId: z.string().uuid().optional().describe('Only this task.'),
  from: moment.optional().describe('Only stays that end at or after this time, or have not ended.'),
  to: moment.optional().describe('Only stays that begin before this time.'),
});

/** Most stays a single answer lists; a board of a few hundred tasks has a few thousand. */
const MAX_STAYS = 5000;

/**
 * The project's history (Section 14), for the history panels and for analysis: every change as
 * the activity table records it, and the column stays that the moves in it add up to.
 */
export const historyRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app.ctx;

  app.get(
    '/projects/:projectId/activity',
    projectRoute('project.view', {
      id: 'listActivity',
      summary: 'The project’s history, newest first',
      description:
        'Every change, with who made it, through which API token, and the fields it touched before and after. With entityType and entityId, only what concerns one item (with its tasks), one task (with its requests), or one Workboard (with its columns, cards, scope, and requests). To read further back, pass the id of the oldest entry as before.',
      query: activityQuery,
      response: z.array(schema.ActivityEntry),
    }),
    async (req): Promise<ActivityEntry[]> => {
      const parsed = activityQuery.safeParse(req.query);
      if (!parsed.success) throw badRequest('Invalid history query', parsed.error.flatten());
      const q = parsed.data;
      const params: unknown[] = [req.access!.project.id, q.limit ?? 100];
      const param = (value: unknown) => `$${params.push(value)}`;
      const where = ['a.project_id = $1'];
      if (q.entityType && q.entityId) {
        const id = param(q.entityId);
        switch (q.entityType) {
          case 'backlog_item':
            // The item's own events plus those of its tasks.
            where.push(`((a.entity_type = 'backlog_item' AND a.entity_id = ${id})
              OR (a.entity_type = 'task' AND a.entity_id IN (SELECT id FROM tasks WHERE item_id = ${id})))`);
            break;
          case 'task':
            where.push(`((a.entity_type = 'task' AND a.entity_id = ${id})
              OR (a.entity_type = 'work_request' AND a.entity_id IN (SELECT id FROM work_requests WHERE task_id = ${id})))`);
            break;
          case 'workboard':
            // The board, its columns, scope changes on it, placements on it, and its requests.
            where.push(`((a.entity_type = 'workboard' AND a.entity_id = ${id})
              OR (a.entity_type = 'board_column' AND a.entity_id IN (SELECT id FROM board_columns WHERE board_id = ${id}))
              OR (a.entity_type = 'work_request' AND a.entity_id IN (SELECT id FROM work_requests WHERE board_id = ${id}))
              OR a.next->>'boardId' = ${id}::text OR a.next->>'onBoard' = ${id}::text)`);
            break;
        }
      }
      if (q.from) where.push(`a.created_at >= ${param(q.from)}::timestamptz`);
      if (q.to) where.push(`a.created_at < ${param(q.to)}::timestamptz`);
      if (q.actorId) where.push(`a.actor_id = ${param(q.actorId)}`);
      if (q.before) where.push(`a.id < ${param(q.before)}`);
      if (q.actions) {
        const actions = q.actions.split(',');
        const exact = actions.filter((a) => !a.endsWith('.*'));
        const families = actions.filter((a) => a.endsWith('.*')).map((a) => a.slice(0, -1) + '%');
        where.push(
          `(a.action = ANY(${param(exact)}::text[]) OR a.action LIKE ANY(${param(families)}::text[]))`,
        );
      }
      const res = await db.query<{
        id: string;
        action: string;
        entity_type: string;
        entity_id: string;
        entity_title: string | null;
        actor_id: string | null;
        display_name: string | null;
        via_token: string | null;
        previous: Record<string, unknown> | null;
        next: Record<string, unknown> | null;
        created_at: Date;
      }>(
        `SELECT a.id, a.action, a.entity_type, a.entity_id, a.actor_id, u.display_name, a.via_token,
                a.previous, a.next, a.created_at,
                CASE a.entity_type
                  WHEN 'task' THEN (SELECT title FROM tasks WHERE id = a.entity_id)
                  WHEN 'backlog_item' THEN (SELECT title FROM backlog_items WHERE id = a.entity_id)
                  WHEN 'workboard' THEN (SELECT name FROM workboards WHERE id = a.entity_id)
                  WHEN 'board_column' THEN (SELECT name FROM board_columns WHERE id = a.entity_id)
                  WHEN 'work_request' THEN (SELECT t.title FROM work_requests r JOIN tasks t ON t.id = r.task_id
                                             WHERE r.id = a.entity_id)
                  WHEN 'user' THEN (SELECT display_name FROM users WHERE id = a.entity_id)
                  WHEN 'project' THEN (SELECT name FROM projects WHERE id = a.entity_id)
                END AS entity_title
           FROM activity a LEFT JOIN users u ON u.id = a.actor_id
          WHERE ${where.join(' AND ')} ORDER BY a.id DESC LIMIT $2`,
        params,
      );
      return res.rows.map((r) => ({
        id: Number(r.id),
        action: r.action,
        entityType: r.entity_type,
        entityId: r.entity_id,
        entityTitle: r.entity_title,
        actor:
          r.actor_id && r.display_name ? { id: r.actor_id, displayName: r.display_name } : null,
        via: r.via_token,
        previous: r.previous,
        next: r.next,
        createdAt: r.created_at.toISOString(),
      }));
    },
  );

  app.get(
    '/projects/:projectId/column-stays',
    projectRoute('project.view', {
      id: 'listColumnStays',
      summary: 'How long cards stayed in each column',
      description: `One entry per stay of a task's card in a column of a Workboard, oldest first, with its length in hours: where work waits, and for how long. A stay on an archived board ends when the board was archived. At most ${MAX_STAYS}.`,
      query: staysQuery,
      response: z.array(schema.ColumnStay),
    }),
    async (req): Promise<ColumnStay[]> => {
      const parsed = staysQuery.safeParse(req.query);
      if (!parsed.success) throw badRequest('Invalid query', parsed.error.flatten());
      const stays = await columnStays(db, req.access!.project.id, parsed.data);
      return stays.slice(0, MAX_STAYS);
    },
  );
};

interface PlacementRow {
  task_id: string;
  task_title: string;
  category: TaskCategory;
  item_id: string;
  item_title: string;
  board_id: string;
  board_name: string;
  board_archived_at: Date | null;
  column_id: string;
  placed_at: Date;
  removed_at: Date | null;
}

interface MoveRow {
  task_id: string;
  action: string;
  from_column: string | null;
  to_column: string | null;
  created_at: Date;
}

/**
 * Column stays, from the placements and the moves the history records. A placement is one stay
 * of a card on a board; every change of column within it is a task.moved entry naming the column
 * it left and the one it entered. Completing or reopening a task from its window moved its card
 * without such an entry until 21 September 2026: where the moves do not join up, the change is
 * put at the completion or reopening between them.
 */
async function columnStays(
  db: Queryable,
  projectId: string,
  filter: z.infer<typeof staysQuery>,
): Promise<ColumnStay[]> {
  const params: unknown[] = [projectId];
  const where = ['t.project_id = $1'];
  if (filter.boardId) where.push(`p.board_id = $${params.push(filter.boardId)}`);
  if (filter.taskId) where.push(`p.task_id = $${params.push(filter.taskId)}`);
  const placements = await db.query<PlacementRow>(
    `SELECT p.task_id, t.title AS task_title, t.category, t.item_id, b.title AS item_title,
            p.board_id, w.name AS board_name, w.archived_at AS board_archived_at,
            coalesce(p.last_column_id, p.column_id) AS column_id, p.placed_at, p.removed_at
       FROM task_placements p
       JOIN tasks t ON t.id = p.task_id
       JOIN backlog_items b ON b.id = t.item_id
       JOIN workboards w ON w.id = p.board_id
      WHERE ${where.join(' AND ')}
      ORDER BY p.placed_at, p.id`,
    params,
  );
  if (placements.rows.length === 0) return [];

  const taskIds = [...new Set(placements.rows.map((p) => p.task_id))];
  const boardIds = [...new Set(placements.rows.map((p) => p.board_id))];
  const [moves, columns] = await Promise.all([
    db.query<MoveRow>(
      `SELECT entity_id AS task_id, action, previous->>'columnId' AS from_column,
              next->>'columnId' AS to_column, created_at
         FROM activity
        WHERE project_id = $1 AND entity_type = 'task' AND entity_id = ANY($2::uuid[])
          AND action IN ('task.moved', 'task.completed', 'task.reopened')
        ORDER BY id`,
      [projectId, taskIds],
    ),
    db.query<{ id: string; board_id: string; name: string; kind: ColumnKind }>(
      'SELECT id, board_id, name, kind FROM board_columns WHERE board_id = ANY($1::uuid[])',
      [boardIds],
    ),
  ]);
  const columnById = new Map(columns.rows.map((c) => [c.id, c]));
  const eventsByTask = new Map<string, MoveRow[]>();
  for (const m of moves.rows) {
    const list = eventsByTask.get(m.task_id) ?? [];
    list.push(m);
    eventsByTask.set(m.task_id, list);
  }

  const now = new Date();
  const stays: ColumnStay[] = [];
  for (const p of placements.rows) {
    const end = p.removed_at ?? p.board_archived_at;
    const within = (eventsByTask.get(p.task_id) ?? []).filter(
      (e) => e.created_at >= p.placed_at && (!end || e.created_at <= end),
    );
    const add = (columnId: string, enteredAt: Date, leftAt: Date | null) => {
      const column = columnById.get(columnId);
      if (!column || (leftAt && leftAt <= enteredAt)) return;
      stays.push({
        taskId: p.task_id,
        taskTitle: p.task_title,
        category: p.category,
        itemId: p.item_id,
        itemTitle: p.item_title,
        boardId: p.board_id,
        boardName: p.board_name,
        columnId,
        columnName: column.name,
        columnKind: column.kind,
        enteredAt: enteredAt.toISOString(),
        leftAt: leftAt?.toISOString() ?? null,
        hours: Math.round(((leftAt ?? now).getTime() - enteredAt.getTime()) / 360_000) / 10,
      });
    };

    const recorded = within.filter(
      (e) => e.action === 'task.moved' && e.from_column && e.to_column,
    );
    // A card is placed in the To Do column of its task's category.
    const todo = columns.rows.find(
      (c) => c.board_id === p.board_id && c.kind === `todo_${p.category}`,
    );
    let column = todo?.id ?? recorded[0]?.from_column ?? p.column_id;
    let since = p.placed_at;
    // A change of column with no entry of its own: at the completion or reopening that caused it.
    const bridge = (to: string, before: Date) => {
      if (to === column) return;
      const cause = within.find(
        (e) => e.action !== 'task.moved' && e.created_at >= since && e.created_at <= before,
      );
      if (cause) {
        add(column, since, cause.created_at);
        since = cause.created_at;
      }
      column = to;
    };
    for (const move of recorded) {
      bridge(move.from_column!, move.created_at);
      add(column, since, move.created_at);
      column = move.to_column!;
      since = move.created_at;
    }
    bridge(p.column_id, end ?? now);
    add(column, since, end);
  }

  return stays
    .filter(
      (s) =>
        (!filter.from || !s.leftAt || new Date(s.leftAt) >= new Date(filter.from)) &&
        (!filter.to || new Date(s.enteredAt) < new Date(filter.to)),
    )
    .sort((a, b) => a.enteredAt.localeCompare(b.enteredAt));
}
