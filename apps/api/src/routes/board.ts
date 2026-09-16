import {
  can,
  TASK_CATEGORIES,
  todoKindFor,
  type BoardCard,
  type BoardColumn,
  type BoardSummary,
  type BoardView,
  type ColumnKind,
  type ItemState,
  type MoscowCategory,
  type ScopeItem,
} from '@gameweld/domain';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { generateKeyBetween } from 'fractional-indexing';
import { z } from 'zod';
import { recordActivity } from '../activity.ts';
import { projectRoute } from '../authz.ts';
import { withTransaction, type Db, type Queryable } from '../db.ts';
import { badRequest, conflict, HttpError, notFound } from '../errors.ts';
import { recalculateItemState } from '../services/readiness.ts';
import { fetchTask, setTaskCompleted } from './tasks.ts';

const uuid = z.string().uuid();
const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

const createBoardSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(5000).default(''),
});
const updateBoardSchema = z.object({
  version: z.number().int(),
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
});
const archiveSchema = z.object({ returnUnfinished: z.boolean().default(false) });
const createColumnSchema = z.object({
  name: z.string().trim().min(1).max(100),
  afterColumnId: uuid.nullish(),
});
const updateColumnSchema = z.object({
  version: z.number().int(),
  name: z.string().trim().min(1).max(100).optional(),
  afterColumnId: uuid.nullish(),
  beforeColumnId: uuid.nullish(),
});
const scopeSchema = z.object({ itemId: uuid });
const removeScopeSchema = z.object({ returnTasks: z.boolean() });
const placeSchema = z.object({ taskId: uuid });
const moveSchema = z.object({ columnId: uuid, afterId: uuid.nullish(), beforeId: uuid.nullish() });
const boardTaskSchema = z.object({
  itemId: uuid.optional(),
  category: z.enum(TASK_CATEGORIES),
  title: z.string().trim().min(1).max(500),
  description: z.string().max(50_000).default(''),
});

// ---------------------------------------------------------------------------------------------
// Reading

interface BoardRow {
  id: string;
  project_id: string;
  name: string;
  description: string;
  state: 'active' | 'archived';
  version: number;
  created_at: Date;
  archived_at: Date | null;
}

function toSummary(b: BoardRow): BoardSummary {
  return {
    id: b.id,
    projectId: b.project_id,
    name: b.name,
    description: b.description,
    state: b.state,
    version: b.version,
    createdAt: b.created_at.toISOString(),
    archivedAt: b.archived_at?.toISOString() ?? null,
  };
}

const KIND_ORDER: Record<ColumnKind, number> = {
  todo_code: 0,
  todo_assets: 1,
  todo_content: 2,
  intermediate: 3,
  done: 4,
};

async function fetchColumns(db: Queryable, boardId: string): Promise<BoardColumn[]> {
  const res = await db.query<BoardColumn & { kind: ColumnKind }>(
    'SELECT id, name, kind, rank, version FROM board_columns WHERE board_id = $1',
    [boardId],
  );
  return res.rows.sort(
    (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.rank.localeCompare(b.rank),
  );
}

async function fetchBoardRow(
  db: Queryable,
  projectId: string,
  boardId: string,
  lock = false,
): Promise<BoardRow | null> {
  if (!isUuid(boardId)) return null;
  const res = await db.query<BoardRow>(
    `SELECT id, project_id, name, description, state, version, created_at, archived_at
       FROM workboards WHERE project_id = $1 AND id = $2${lock ? ' FOR UPDATE' : ''}`,
    [projectId, boardId],
  );
  return res.rows[0] ?? null;
}

async function fetchView(
  db: Queryable,
  projectId: string,
  board: BoardRow,
  scopeLimit: number,
): Promise<BoardView> {
  const columns = await fetchColumns(db, board.id);

  const scopeRows = await db.query<{
    id: string;
    title: string;
    category: MoscowCategory;
    state: ItemState;
    added_at: Date;
    total: string;
    completed: string;
  }>(
    `SELECT b.id, b.title, b.category, b.state, s.added_at,
            (SELECT count(*) FROM tasks t WHERE t.item_id = b.id AND t.archived_at IS NULL) AS total,
            (SELECT count(*) FROM tasks t WHERE t.item_id = b.id AND t.archived_at IS NULL AND t.completed) AS completed
       FROM workboard_scope s JOIN backlog_items b ON b.id = s.item_id
      WHERE s.board_id = $1 ORDER BY s.added_at`,
    [board.id],
  );
  const scope: ScopeItem[] = scopeRows.rows.map((r) => ({
    id: r.id,
    title: r.title,
    category: r.category,
    state: r.state,
    taskCounts: { total: Number(r.total), completed: Number(r.completed) },
    accepted: r.state === 'done',
    addedAt: r.added_at.toISOString(),
  }));
  const scopeIds = new Set(scope.map((s) => s.id));

  const cardRows = await db.query<{
    id: string;
    project_id: string;
    item_id: string;
    category: BoardCard['category'];
    title: string;
    description: string;
    assignee_id: string | null;
    assignee_name: string | null;
    completed: boolean;
    completed_at: Date | null;
    archived_at: Date | null;
    version: number;
    created_at: Date;
    updated_at: Date;
    column_id: string;
    column_name: string;
    column_kind: ColumnKind;
    entered_as_exception: boolean;
    rank: string;
    item_title: string;
    item_category: MoscowCategory;
  }>(
    `SELECT t.id, t.project_id, t.item_id, t.category, t.title, t.description, t.assignee_id,
            u.display_name AS assignee_name, t.completed, t.completed_at, t.archived_at, t.version,
            t.created_at, t.updated_at, c.id AS column_id, c.name AS column_name, c.kind AS column_kind,
            p.entered_as_exception, p.rank, b.title AS item_title, b.category AS item_category
       FROM task_placements p
       JOIN tasks t ON t.id = p.task_id
       JOIN backlog_items b ON b.id = t.item_id
       JOIN board_columns c ON c.id = p.column_id
       LEFT JOIN users u ON u.id = t.assignee_id
      WHERE p.board_id = $1 AND p.is_current
      ORDER BY p.rank, t.id`,
    [board.id],
  );
  const cards: Record<string, BoardCard[]> = Object.fromEntries(columns.map((c) => [c.id, []]));
  let outOfScopeTasks = 0;
  let unfinished = 0;
  for (const r of cardRows.rows) {
    const outOfScope = !scopeIds.has(r.item_id);
    if (outOfScope) outOfScopeTasks++;
    if (!r.completed) unfinished++;
    cards[r.column_id]!.push({
      id: r.id,
      projectId: r.project_id,
      itemId: r.item_id,
      category: r.category,
      title: r.title,
      description: r.description,
      assignee:
        r.assignee_id && r.assignee_name
          ? { id: r.assignee_id, displayName: r.assignee_name }
          : null,
      completed: r.completed,
      completedAt: r.completed_at?.toISOString() ?? null,
      archived: r.archived_at !== null,
      placement: {
        boardId: board.id,
        boardName: board.name,
        columnId: r.column_id,
        columnName: r.column_name,
        inDone: r.column_kind === 'done',
        enteredAsException: r.entered_as_exception,
      },
      version: r.version,
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
      itemTitle: r.item_title,
      itemCategory: r.item_category,
      outOfScope,
      rank: r.rank,
    });
  }

  const next =
    board.state === 'active' && scope.length < scopeLimit
      ? await nextEligible(db, projectId, board.id)
      : null;

  return {
    ...toSummary(board),
    columns,
    cards,
    scope,
    scopeLimit,
    counts: {
      scopeItems: scope.length,
      acceptedItems: scope.filter((s) => s.accepted).length,
      outOfScopeTasks,
      placedTasks: cardRows.rows.length,
      unfinishedTasks: unfinished,
    },
    nextEligible: next,
  };
}

/**
 * D7 / Section 8: the priority rule. The next item to activate is the highest-ranked open item in
 * Must Have, then Should Have, then Could Have, that is not already in scope. Won't Have is never
 * activated as a whole item.
 */
async function nextEligible(db: Queryable, projectId: string, boardId: string) {
  const res = await db.query<{
    id: string;
    title: string;
    category: MoscowCategory;
    unplaced: string;
  }>(
    `SELECT b.id, b.title, b.category,
            (SELECT count(*) FROM tasks t WHERE t.item_id = b.id AND t.archived_at IS NULL AND NOT t.completed
               AND NOT EXISTS (SELECT 1 FROM task_placements p WHERE p.task_id = t.id AND p.is_current)) AS unplaced
       FROM backlog_items b
      WHERE b.project_id = $1 AND b.state = 'open' AND b.archived_at IS NULL AND b.category <> 'wont'
        AND NOT EXISTS (SELECT 1 FROM workboard_scope s WHERE s.board_id = $2 AND s.item_id = b.id)
      ORDER BY CASE b.category WHEN 'must' THEN 0 WHEN 'should' THEN 1 ELSE 2 END, b.rank, b.id
      LIMIT 1`,
    [projectId, boardId],
  );
  const r = res.rows[0];
  return r
    ? { id: r.id, title: r.title, category: r.category, unplacedTasks: Number(r.unplaced) }
    : null;
}

// ---------------------------------------------------------------------------------------------
// Placement helpers shared by several routes

async function rankAtEndOfColumn(tx: Queryable, columnId: string): Promise<string> {
  const last = await tx.query<{ rank: string }>(
    'SELECT rank FROM task_placements WHERE column_id = $1 AND is_current ORDER BY rank DESC LIMIT 1',
    [columnId],
  );
  return generateKeyBetween(last.rows[0]?.rank ?? null, null);
}

async function columnOfKind(
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

/** Places an unplaced task in its category's To Do column. */
async function placeTask(
  tx: Queryable,
  boardId: string,
  task: { id: string; category: BoardCard['category'] },
  actorId: string,
  exception: boolean,
) {
  const column = await columnOfKind(tx, boardId, todoKindFor(task.category));
  await tx.query(
    `INSERT INTO task_placements (task_id, board_id, column_id, rank, placed_by, entered_as_exception)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [task.id, boardId, column.id, await rankAtEndOfColumn(tx, column.id), actorId, exception],
  );
}

/** Closes the current placement (R5: the column is recorded, the position is discarded). */
async function returnTask(tx: Queryable, taskId: string, reason: string) {
  await tx.query(
    `UPDATE task_placements SET is_current = false, removed_at = now(), removed_reason = $2, last_column_id = column_id
      WHERE task_id = $1 AND is_current`,
    [taskId, reason],
  );
}

function requireAction(
  req: FastifyRequest,
  action: Parameters<typeof can>[1],
  message: string,
): void {
  const { membership, project } = req.access!;
  if (!can(membership, action, { doneRestricted: project.done_restricted }))
    throw new HttpError(403, message);
}

async function activeBoardFor(
  tx: Queryable,
  projectId: string,
  boardId: string,
): Promise<BoardRow> {
  const board = await fetchBoardRow(tx, projectId, boardId, true);
  if (!board) throw notFound('Workboard not found');
  if (board.state !== 'active') throw conflict('This Workboard is archived.');
  return board;
}

// ---------------------------------------------------------------------------------------------

export const boardRoutes: FastifyPluginAsync = async (app) => {
  const db: Db = app.ctx.db;
  const base = '/projects/:projectId/boards';

  const view = async (req: FastifyRequest, boardId: string) => {
    const board = await fetchBoardRow(db, req.access!.project.id, boardId);
    if (!board) throw notFound('Workboard not found');
    return fetchView(db, req.access!.project.id, board, req.access!.project.scope_limit);
  };

  /** The project's active board, or null (D1: at most one). */
  app.get(
    '/projects/:projectId/board',
    projectRoute('project.view'),
    async (req): Promise<BoardView | null> => {
      const res = await db.query<{ id: string }>(
        `SELECT id FROM workboards WHERE project_id = $1 AND state = 'active'`,
        [req.access!.project.id],
      );
      return res.rows[0] ? view(req, res.rows[0].id) : null;
    },
  );

  app.get(base, projectRoute('project.view'), async (req): Promise<BoardSummary[]> => {
    const res = await db.query<BoardRow>(
      `SELECT id, project_id, name, description, state, version, created_at, archived_at
         FROM workboards WHERE project_id = $1 ORDER BY state, created_at DESC`,
      [req.access!.project.id],
    );
    return res.rows.map(toSummary);
  });

  app.get(`${base}/:boardId`, projectRoute('project.view'), async (req) =>
    view(req, (req.params as { boardId: string }).boardId),
  );

  app.post(base, projectRoute('board.manage'), async (req, reply) => {
    const parsed = createBoardSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid Workboard', parsed.error.flatten());
    const projectId = req.access!.project.id;
    const boardId = await withTransaction(db, async (tx) => {
      await tx.query('SELECT 1 FROM projects WHERE id = $1 FOR UPDATE', [projectId]);
      const active = await tx.query(
        `SELECT 1 FROM workboards WHERE project_id = $1 AND state = 'active'`,
        [projectId],
      );
      if (active.rowCount)
        throw conflict('This project already has an active Workboard. Archive it first.');
      const created = await tx.query<{ id: string }>(
        'INSERT INTO workboards (project_id, name, description) VALUES ($1, $2, $3) RETURNING id',
        [projectId, parsed.data.name, parsed.data.description],
      );
      const id = created.rows[0]!.id;
      let rank: string | null = null;
      for (const [kind, name] of [
        ['todo_code', 'To Do · Code'],
        ['todo_assets', 'To Do · Assets'],
        ['todo_content', 'To Do · Content'],
        ['done', 'Done'],
      ] as const) {
        rank = generateKeyBetween(rank, null);
        await tx.query(
          'INSERT INTO board_columns (board_id, name, kind, rank) VALUES ($1, $2, $3, $4)',
          [id, name, kind, rank],
        );
      }
      await recordActivity(tx, {
        projectId,
        actorId: req.user!.id,
        action: 'board.created',
        entityType: 'workboard',
        entityId: id,
        next: parsed.data,
      });
      return id;
    });
    return reply.status(201).send(await view(req, boardId));
  });

  app.patch(`${base}/:boardId`, projectRoute('board.manage'), async (req) => {
    const parsed = updateBoardSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid Workboard update', parsed.error.flatten());
    const { boardId } = req.params as { boardId: string };
    const projectId = req.access!.project.id;
    await withTransaction(db, async (tx) => {
      const board = await fetchBoardRow(tx, projectId, boardId, true);
      if (!board) throw notFound('Workboard not found');
      if (board.version !== parsed.data.version)
        throw conflict('The Workboard was changed by someone else. Reload and try again.', {
          currentVersion: board.version,
        });
      await tx.query(
        'UPDATE workboards SET name = $2, description = $3, version = version + 1 WHERE id = $1',
        [boardId, parsed.data.name ?? board.name, parsed.data.description ?? board.description],
      );
      await recordActivity(tx, {
        projectId,
        actorId: req.user!.id,
        action: 'board.updated',
        entityType: 'workboard',
        entityId: boardId,
        previous: { name: board.name },
        next: { name: parsed.data.name ?? board.name },
      });
    });
    return view(req, boardId);
  });

  // D12: archival never completes anything; unfinished placed tasks must be explicitly returned.
  app.post(`${base}/:boardId/archive`, projectRoute('board.manage'), async (req) => {
    const parsed = archiveSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw badRequest('Invalid request', parsed.error.flatten());
    const { boardId } = req.params as { boardId: string };
    const projectId = req.access!.project.id;
    await withTransaction(db, async (tx) => {
      await activeBoardFor(tx, projectId, boardId);
      const unfinished = await tx.query<{ id: string; item_id: string }>(
        `SELECT t.id, t.item_id FROM task_placements p JOIN tasks t ON t.id = p.task_id
          WHERE p.board_id = $1 AND p.is_current AND NOT t.completed`,
        [boardId],
      );
      if (unfinished.rowCount && !parsed.data.returnUnfinished) {
        throw conflict(
          `${unfinished.rowCount} unfinished task(s) are still on this Workboard. Return them to Breakdown to archive.`,
          {
            unfinishedTasks: unfinished.rowCount,
          },
        );
      }
      for (const t of unfinished.rows) await returnTask(tx, t.id, 'board archived');
      await tx.query(
        `UPDATE workboards SET state = 'archived', archived_at = now(), version = version + 1 WHERE id = $1`,
        [boardId],
      );
      await recordActivity(tx, {
        projectId,
        actorId: req.user!.id,
        action: 'board.archived',
        entityType: 'workboard',
        entityId: boardId,
        next: { returnedTasks: unfinished.rowCount },
      });
    });
    return view(req, boardId);
  });

  // Columns ---------------------------------------------------------------------------------

  app.post(`${base}/:boardId/columns`, projectRoute('board.manage'), async (req, reply) => {
    const parsed = createColumnSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid column', parsed.error.flatten());
    const { boardId } = req.params as { boardId: string };
    const projectId = req.access!.project.id;
    await withTransaction(db, async (tx) => {
      await activeBoardFor(tx, projectId, boardId);
      const rank = await intermediateRank(
        tx,
        boardId,
        parsed.data.afterColumnId ?? null,
        null,
        null,
      );
      const created = await tx.query<{ id: string }>(
        `INSERT INTO board_columns (board_id, name, kind, rank) VALUES ($1, $2, 'intermediate', $3) RETURNING id`,
        [boardId, parsed.data.name, rank],
      );
      await recordActivity(tx, {
        projectId,
        actorId: req.user!.id,
        action: 'column.created',
        entityType: 'board_column',
        entityId: created.rows[0]!.id,
        next: { name: parsed.data.name },
      });
    });
    return reply.status(201).send(await view(req, boardId));
  });

  app.patch(`${base}/:boardId/columns/:columnId`, projectRoute('board.manage'), async (req) => {
    const parsed = updateColumnSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid column update', parsed.error.flatten());
    const { boardId, columnId } = req.params as { boardId: string; columnId: string };
    const projectId = req.access!.project.id;
    await withTransaction(db, async (tx) => {
      await activeBoardFor(tx, projectId, boardId);
      const col = (
        await tx.query<BoardColumn>(
          'SELECT id, name, kind, rank, version FROM board_columns WHERE board_id = $1 AND id = $2 FOR UPDATE',
          [boardId, columnId],
        )
      ).rows[0];
      if (!col) throw notFound('Column not found');
      if (col.version !== parsed.data.version)
        throw conflict('The column was changed by someone else. Reload and try again.', {
          currentVersion: col.version,
        });
      let rank = col.rank;
      if (parsed.data.afterColumnId !== undefined || parsed.data.beforeColumnId !== undefined) {
        if (col.kind !== 'intermediate')
          throw conflict('To Do and Done columns keep their positions.');
        rank = await intermediateRank(
          tx,
          boardId,
          parsed.data.afterColumnId ?? null,
          parsed.data.beforeColumnId ?? null,
          columnId,
        );
      }
      // Renaming any column never changes rules or permissions (Section 8): only the kind matters.
      await tx.query(
        'UPDATE board_columns SET name = $2, rank = $3, version = version + 1 WHERE id = $1',
        [columnId, parsed.data.name ?? col.name, rank],
      );
      await recordActivity(tx, {
        projectId,
        actorId: req.user!.id,
        action: 'column.updated',
        entityType: 'board_column',
        entityId: columnId,
        previous: { name: col.name, rank: col.rank },
        next: { name: parsed.data.name ?? col.name, rank },
      });
    });
    return view(req, boardId);
  });

  app.delete(`${base}/:boardId/columns/:columnId`, projectRoute('board.manage'), async (req) => {
    const { boardId, columnId } = req.params as { boardId: string; columnId: string };
    const projectId = req.access!.project.id;
    await withTransaction(db, async (tx) => {
      await activeBoardFor(tx, projectId, boardId);
      if (!isUuid(columnId)) throw notFound('Column not found');
      const col = (
        await tx.query<BoardColumn>(
          'SELECT id, name, kind FROM board_columns WHERE board_id = $1 AND id = $2 FOR UPDATE',
          [boardId, columnId],
        )
      ).rows[0];
      if (!col) throw notFound('Column not found');
      if (col.kind !== 'intermediate') throw conflict('To Do and Done columns cannot be deleted.');
      const occupied = await tx.query(
        'SELECT 1 FROM task_placements WHERE column_id = $1 AND is_current LIMIT 1',
        [columnId],
      );
      if (occupied.rowCount)
        throw conflict('Move the tasks out of this column before deleting it.');
      await tx.query('DELETE FROM board_columns WHERE id = $1', [columnId]);
      await recordActivity(tx, {
        projectId,
        actorId: req.user!.id,
        action: 'column.deleted',
        entityType: 'board_column',
        entityId: columnId,
        previous: { name: col.name },
      });
    });
    return view(req, boardId);
  });

  // Scope -----------------------------------------------------------------------------------

  app.post(`${base}/:boardId/scope`, projectRoute('board.select_scope'), async (req, reply) => {
    const parsed = scopeSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid request', parsed.error.flatten());
    const { boardId } = req.params as { boardId: string };
    const { project } = req.access!;
    const actorId = req.user!.id;
    await withTransaction(db, async (tx) => {
      await activeBoardFor(tx, project.id, boardId);
      const item = (
        await tx.query<{ id: string; title: string; state: ItemState; archived_at: Date | null }>(
          'SELECT id, title, state, archived_at FROM backlog_items WHERE project_id = $1 AND id = $2 FOR UPDATE',
          [project.id, parsed.data.itemId],
        )
      ).rows[0];
      if (!item) throw notFound('Backlog item not found');
      const already = await tx.query(
        'SELECT 1 FROM workboard_scope WHERE board_id = $1 AND item_id = $2',
        [boardId, item.id],
      );
      if (already.rowCount) throw conflict('That item is already in scope.');
      // D6: every included item counts until the Director removes it, accepted ones included.
      const count = Number(
        (
          await tx.query<{ n: string }>(
            'SELECT count(*) AS n FROM workboard_scope WHERE board_id = $1',
            [boardId],
          )
        ).rows[0]!.n,
      );
      if (count >= project.scope_limit) {
        throw conflict(
          `The Workboard already holds ${count} of ${project.scope_limit} items. Remove an item from scope to add another.`,
          {
            scopeItems: count,
            scopeLimit: project.scope_limit,
          },
        );
      }
      // D7: full-item activation follows the priority rule; exceptions go through individual tasks.
      const next = await nextEligible(tx, project.id, boardId);
      if (!next) throw conflict('No open item is eligible for activation.');
      if (next.id !== item.id) {
        throw conflict(
          `"${next.title}" is next in priority. Activate it first, or bring individual tasks in as out-of-scope work.`,
          {
            nextEligible: next,
          },
        );
      }
      await tx.query(
        'INSERT INTO workboard_scope (board_id, item_id, added_by) VALUES ($1, $2, $3)',
        [boardId, item.id, actorId],
      );
      // Section 8: existing unfinished, unplaced tasks enter their To Do columns; completed ones stay complete.
      const tasks = await tx.query<{ id: string; category: BoardCard['category'] }>(
        `SELECT t.id, t.category FROM tasks t WHERE t.item_id = $1 AND t.archived_at IS NULL AND NOT t.completed
            AND NOT EXISTS (SELECT 1 FROM task_placements p WHERE p.task_id = t.id AND p.is_current) ORDER BY t.created_at`,
        [item.id],
      );
      for (const t of tasks.rows) await placeTask(tx, boardId, t, actorId, false);
      await recordActivity(tx, {
        projectId: project.id,
        actorId,
        action: 'scope.added',
        entityType: 'backlog_item',
        entityId: item.id,
        next: { boardId, placedTasks: tasks.rowCount },
      });
    });
    return reply.status(201).send(await view(req, boardId));
  });

  app.post(
    `${base}/:boardId/scope/:itemId/remove`,
    projectRoute('board.select_scope'),
    async (req) => {
      const parsed = removeScopeSchema.safeParse(req.body);
      if (!parsed.success)
        throw badRequest(
          'Say whether unfinished tasks return to Breakdown or stay as exceptions.',
          parsed.error.flatten(),
        );
      const { boardId, itemId } = req.params as { boardId: string; itemId: string };
      const projectId = req.access!.project.id;
      if (!isUuid(itemId)) throw notFound('Item is not in scope');
      await withTransaction(db, async (tx) => {
        await activeBoardFor(tx, projectId, boardId);
        const removed = await tx.query(
          'DELETE FROM workboard_scope WHERE board_id = $1 AND item_id = $2',
          [boardId, itemId],
        );
        if (!removed.rowCount) throw notFound('Item is not in scope');
        const unfinished = await tx.query<{ id: string }>(
          `SELECT t.id FROM task_placements p JOIN tasks t ON t.id = p.task_id
          WHERE p.board_id = $1 AND p.is_current AND t.item_id = $2 AND NOT t.completed`,
          [boardId, itemId],
        );
        if (parsed.data.returnTasks) {
          for (const t of unfinished.rows) await returnTask(tx, t.id, 'item removed from scope');
        } else {
          // The tasks stay; they now show the Out of scope badge, and history says why.
          await tx.query(
            `UPDATE task_placements SET entered_as_exception = true WHERE board_id = $1 AND is_current
            AND task_id IN (SELECT id FROM tasks WHERE item_id = $2 AND NOT completed)`,
            [boardId, itemId],
          );
        }
        await recordActivity(tx, {
          projectId,
          actorId: req.user!.id,
          action: 'scope.removed',
          entityType: 'backlog_item',
          entityId: itemId,
          next: {
            boardId,
            unfinishedTasks: unfinished.rowCount,
            returned: parsed.data.returnTasks,
          },
        });
      });
      return view(req, boardId);
    },
  );

  // Placements ------------------------------------------------------------------------------

  /** Places an unplaced task from Breakdown (D8). Out-of-scope parents need Director approval. */
  app.post(`${base}/:boardId/placements`, projectRoute('task.work'), async (req, reply) => {
    const parsed = placeSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid request', parsed.error.flatten());
    const { boardId } = req.params as { boardId: string };
    const projectId = req.access!.project.id;
    const actorId = req.user!.id;
    await withTransaction(db, async (tx) => {
      await activeBoardFor(tx, projectId, boardId);
      await tx.query('SELECT 1 FROM tasks WHERE id = $1 FOR UPDATE', [parsed.data.taskId]);
      const task = await fetchTask(tx, projectId, parsed.data.taskId);
      if (!task) throw notFound('Task not found');
      if (task.archived) throw conflict('Restore the task before placing it.');
      if (task.completed) throw conflict('The task is already complete.');
      if (task.placement) throw conflict(`The task is already on ${task.placement.boardName}.`);
      const inScope = await tx.query(
        'SELECT 1 FROM workboard_scope WHERE board_id = $1 AND item_id = $2',
        [boardId, task.itemId],
      );
      const exception = !inScope.rowCount;
      if (exception) {
        requireAction(
          req,
          'out_of_scope.approve',
          'This task’s item is outside the Workboard scope. Ask a Game Director to place it.',
        );
      }
      await placeTask(tx, boardId, task, actorId, exception);
      await recordActivity(tx, {
        projectId,
        actorId,
        action: exception ? 'task.placed_as_exception' : 'task.placed',
        entityType: 'task',
        entityId: task.id,
        next: { boardId },
      });
    });
    return reply.status(201).send(await view(req, boardId));
  });

  /** Creates a task directly on the board (Section 8 parent rules) and places it. */
  app.post(`${base}/:boardId/tasks`, projectRoute('task.work'), async (req, reply) => {
    const parsed = boardTaskSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid task', parsed.error.flatten());
    const { boardId } = req.params as { boardId: string };
    const projectId = req.access!.project.id;
    const actorId = req.user!.id;
    const input = parsed.data;
    await withTransaction(db, async (tx) => {
      await activeBoardFor(tx, projectId, boardId);
      const scope = await tx.query<{ item_id: string }>(
        'SELECT item_id FROM workboard_scope WHERE board_id = $1',
        [boardId],
      );
      let itemId = input.itemId;
      if (!itemId) {
        if (scope.rowCount === 1) itemId = scope.rows[0]!.item_id;
        else if (scope.rowCount === 0)
          throw badRequest('No item is in scope. Choose the backlog item this task belongs to.');
        else
          throw badRequest(
            'Several items are in scope. Choose the backlog item this task belongs to.',
            { scopeItems: scope.rowCount },
          );
      }
      const item = (
        await tx.query<{ archived_at: Date | null }>(
          'SELECT archived_at FROM backlog_items WHERE project_id = $1 AND id = $2 FOR UPDATE',
          [projectId, itemId],
        )
      ).rows[0];
      if (!item) throw notFound('Backlog item not found');
      if (item.archived_at) throw conflict('That backlog item is archived.');
      const exception = !scope.rows.some((s) => s.item_id === itemId);
      if (exception) {
        requireAction(
          req,
          'out_of_scope.approve',
          'That item is outside the Workboard scope. Create the task in Breakdown and ask a Game Director to place it.',
        );
      }
      const created = await tx.query<{ id: string }>(
        'INSERT INTO tasks (project_id, item_id, category, title, description) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [projectId, itemId, input.category, input.title, input.description],
      );
      const taskId = created.rows[0]!.id;
      await recordActivity(tx, {
        projectId,
        actorId,
        action: 'task.created',
        entityType: 'task',
        entityId: taskId,
        next: { itemId, category: input.category, title: input.title, onBoard: boardId },
      });
      await placeTask(tx, boardId, { id: taskId, category: input.category }, actorId, exception);
      await recalculateItemState(tx, itemId, actorId, 'task created on board');
    });
    return reply.status(201).send(await view(req, boardId));
  });

  app.post(`${base}/:boardId/placements/:taskId/move`, projectRoute('task.work'), async (req) => {
    const parsed = moveSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid move', parsed.error.flatten());
    const { boardId, taskId } = req.params as { boardId: string; taskId: string };
    const { columnId, afterId, beforeId } = parsed.data;
    const projectId = req.access!.project.id;
    const actorId = req.user!.id;
    await withTransaction(db, async (tx) => {
      // Serialize moves per board so concurrent drops never share a rank.
      await activeBoardFor(tx, projectId, boardId);
      await tx.query('SELECT 1 FROM tasks WHERE id = $1 FOR UPDATE', [taskId]);
      const task = await fetchTask(tx, projectId, taskId);
      if (!task?.placement || task.placement.boardId !== boardId)
        throw notFound('The task is not on this Workboard.');
      const target = (
        await tx.query<{ id: string; kind: ColumnKind }>(
          'SELECT id, kind FROM board_columns WHERE board_id = $1 AND id = $2',
          [boardId, columnId],
        )
      ).rows[0];
      if (!target) throw notFound('Column not found');
      // Section 8: the three To Do columns are category-specific.
      if (target.kind.startsWith('todo_') && target.kind !== todoKindFor(task.category)) {
        throw conflict(`A ${task.category} task can only wait in its own To Do column.`);
      }
      const enteringDone = target.kind === 'done' && !task.placement.inDone;
      const leavingDone = task.placement.inDone && target.kind !== 'done';
      if (enteringDone || leavingDone) {
        // Invariant 4 and R2: both directions need the completion permission under the restriction.
        requireAction(
          req,
          'task.complete',
          'Only members with the completion permission can move tasks into or out of Done.',
        );
      }

      const neighbor = async (id: string | null | undefined) => {
        if (!id) return null;
        if (id === taskId) throw badRequest('A task cannot be placed next to itself');
        const row = await tx.query<{ rank: string }>(
          'SELECT rank FROM task_placements WHERE task_id = $1 AND board_id = $2 AND column_id = $3 AND is_current',
          [id, boardId, columnId],
        );
        if (!row.rows[0])
          throw conflict('The neighboring card is no longer in that column. Reload and try again.');
        return row.rows[0].rank;
      };
      let after = await neighbor(afterId);
      let before = await neighbor(beforeId);
      let rank: string;
      if (after === null && before === null) rank = await rankAtEndOfColumn(tx, columnId);
      else {
        const bounds = (
          await tx.query<{ min: string | null; max: string | null }>(
            'SELECT min(rank), max(rank) FROM task_placements WHERE column_id = $1 AND is_current AND task_id <> $2',
            [columnId, taskId],
          )
        ).rows[0]!;
        if (after === null && bounds.min !== null && (before === null || bounds.min < before))
          before = bounds.min;
        if (before === null && bounds.max !== null && (after === null || bounds.max > after))
          after = bounds.max;
        if (after !== null && before !== null && after >= before)
          throw conflict('Those cards are no longer adjacent. Reload and try again.');
        rank = generateKeyBetween(after, before);
      }
      await tx.query(
        'UPDATE task_placements SET column_id = $2, rank = $3 WHERE task_id = $1 AND is_current',
        [taskId, columnId, rank],
      );
      await recordActivity(tx, {
        projectId,
        actorId,
        action: 'task.moved',
        entityType: 'task',
        entityId: taskId,
        previous: { columnId: task.placement.columnId },
        next: { columnId },
      });
      if (enteringDone) await setTaskCompleted(tx, task, true, actorId, 'moved into Done', false);
      if (leavingDone) await setTaskCompleted(tx, task, false, actorId, 'moved out of Done', false);
    });
    return view(req, boardId);
  });

  app.post(`${base}/:boardId/placements/:taskId/return`, projectRoute('task.work'), async (req) => {
    const { boardId, taskId } = req.params as { boardId: string; taskId: string };
    const projectId = req.access!.project.id;
    await withTransaction(db, async (tx) => {
      await activeBoardFor(tx, projectId, boardId);
      await tx.query('SELECT 1 FROM tasks WHERE id = $1 FOR UPDATE', [taskId]);
      const task = await fetchTask(tx, projectId, taskId);
      if (!task?.placement || task.placement.boardId !== boardId)
        throw notFound('The task is not on this Workboard.');
      if (task.completed)
        throw conflict(
          'Completed tasks stay in Done. Reopen the task first if it needs more work.',
        );
      await returnTask(tx, taskId, 'returned to Breakdown');
      await recordActivity(tx, {
        projectId,
        actorId: req.user!.id,
        action: 'task.returned',
        entityType: 'task',
        entityId: taskId,
        previous: { columnId: task.placement.columnId },
      });
    });
    return view(req, boardId);
  });
};

/** Rank for an intermediate column between two others (or at the end, just before Done). */
async function intermediateRank(
  tx: Queryable,
  boardId: string,
  afterId: string | null,
  beforeId: string | null,
  selfId: string | null,
): Promise<string> {
  const cols = (
    await tx.query<{ id: string; rank: string }>(
      `SELECT id, rank FROM board_columns WHERE board_id = $1 AND kind = 'intermediate' AND id <> coalesce($2, '00000000-0000-0000-0000-000000000000'::uuid) ORDER BY rank`,
      [boardId, selfId],
    )
  ).rows;
  const rankOf = (id: string | null) => {
    if (!id) return null;
    const c = cols.find((x) => x.id === id);
    if (!c) throw conflict('The neighboring column no longer exists. Reload and try again.');
    return c.rank;
  };
  let after = rankOf(afterId);
  let before = rankOf(beforeId);
  if (after === null && before === null)
    return generateKeyBetween(cols[cols.length - 1]?.rank ?? null, null);
  if (after === null && cols[0] && (before === null || cols[0].rank < before))
    before = cols[0].rank;
  if (before === null && cols.length && (after === null || cols[cols.length - 1]!.rank > after))
    after = cols[cols.length - 1]!.rank;
  if (after !== null && before !== null && after >= before)
    throw conflict('Those columns are no longer adjacent. Reload and try again.');
  return generateKeyBetween(after, before);
}
