import {
  can,
  TASK_CATEGORIES,
  type Task,
  type TaskCategory,
  type TaskDetail,
} from '@gameweld/domain';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { generateKeyBetween } from 'fractional-indexing';
import { z } from 'zod';
import { recordActivity } from '../activity.ts';
import { projectRoute } from '../authz.ts';
import { withTransaction, type Queryable } from '../db.ts';
import { badRequest, conflict, notFound, HttpError } from '../errors.ts';
import { recalculateItemState } from '../services/readiness.ts';
import { placeTask, returnTask } from '../services/placement.ts';
import { fetchAttachments, fetchComments, fetchLinks } from './collab.ts';

const uuid = z.string().uuid();

const createSchema = z.object({
  category: z.enum(TASK_CATEGORIES),
  title: z.string().trim().min(1).max(500),
  description: z.string().max(50_000).default(''),
  assigneeId: uuid.nullish(),
});

const updateSchema = z.object({
  version: z.number().int(),
  title: z.string().trim().min(1).max(500).optional(),
  description: z.string().max(50_000).optional(),
  category: z.enum(TASK_CATEGORIES).optional(),
  assigneeId: uuid.nullable().optional(),
  itemId: uuid.optional(),
  archived: z.boolean().optional(),
});

interface TaskRow {
  id: string;
  project_id: string;
  item_id: string;
  category: TaskCategory;
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
  board_id: string | null;
  board_name: string | null;
  column_id: string | null;
  column_name: string | null;
  column_kind: string | null;
  entered_as_exception: boolean | null;
  request_id: string | null;
  request_board_id: string | null;
  request_board_name: string | null;
  request_requester_id: string | null;
}

const taskSelect = `
  SELECT t.id, t.project_id, t.item_id, t.category, t.title, t.description, t.assignee_id,
         u.display_name AS assignee_name, t.completed, t.completed_at, t.archived_at, t.version,
         t.created_at, t.updated_at,
         w.id AS board_id, w.name AS board_name, c.id AS column_id, c.name AS column_name, c.kind AS column_kind,
         p.entered_as_exception,
         r.id AS request_id, r.board_id AS request_board_id, rw.name AS request_board_name, r.requester_id AS request_requester_id
    FROM tasks t
    LEFT JOIN users u ON u.id = t.assignee_id
    LEFT JOIN task_placements p ON p.task_id = t.id AND p.is_current
    LEFT JOIN workboards w ON w.id = p.board_id
    LEFT JOIN board_columns c ON c.id = p.column_id
    LEFT JOIN work_requests r ON r.task_id = t.id AND r.status = 'pending'
    LEFT JOIN workboards rw ON rw.id = r.board_id`;

function toTask(r: TaskRow): Task {
  return {
    id: r.id,
    projectId: r.project_id,
    itemId: r.item_id,
    category: r.category,
    title: r.title,
    description: r.description,
    assignee:
      r.assignee_id && r.assignee_name ? { id: r.assignee_id, displayName: r.assignee_name } : null,
    completed: r.completed,
    completedAt: r.completed_at?.toISOString() ?? null,
    archived: r.archived_at !== null,
    placement:
      r.board_id && r.board_name && r.column_id && r.column_name
        ? {
            boardId: r.board_id,
            boardName: r.board_name,
            columnId: r.column_id,
            columnName: r.column_name,
            inDone: r.column_kind === 'done',
            enteredAsException: r.entered_as_exception ?? false,
          }
        : null,
    pendingRequest:
      r.request_id && r.request_board_id && r.request_board_name && r.request_requester_id
        ? {
            id: r.request_id,
            boardId: r.request_board_id,
            boardName: r.request_board_name,
            requesterId: r.request_requester_id,
          }
        : null,
    version: r.version,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export async function fetchTask(
  db: Queryable,
  projectId: string,
  taskId: string,
): Promise<Task | null> {
  if (!/^[0-9a-f-]{36}$/i.test(taskId)) return null;
  const res = await db.query<TaskRow>(`${taskSelect} WHERE t.project_id = $1 AND t.id = $2`, [
    projectId,
    taskId,
  ]);
  return res.rows[0] ? toTask(res.rows[0]) : null;
}

async function fetchDetail(
  db: Queryable,
  projectId: string,
  taskId: string,
): Promise<TaskDetail | null> {
  const task = await fetchTask(db, projectId, taskId);
  if (!task) return null;
  const item = (
    await db.query<{
      id: string;
      title: string;
      category: TaskDetail['item']['category'];
      state: TaskDetail['item']['state'];
    }>('SELECT id, title, category, state FROM backlog_items WHERE id = $1', [task.itemId])
  ).rows[0]!;
  const [comments, attachments, links] = await Promise.all([
    fetchComments(db, { taskId: task.id }),
    fetchAttachments(db, { taskId: task.id }),
    fetchLinks(db, { taskId: task.id }),
  ]);
  return { ...task, item, comments, attachments, links };
}

async function assertMember(tx: Queryable, projectId: string, userId: string): Promise<void> {
  const res = await tx.query(
    'SELECT 1 FROM project_memberships WHERE project_id = $1 AND user_id = $2',
    [projectId, userId],
  );
  if (!res.rowCount) throw badRequest('The assignee must be a member of the project.');
}

function requireDirector(req: FastifyRequest, what: string): void {
  const { membership, project } = req.access!;
  if (!can(membership, 'backlog.manage', { doneRestricted: project.done_restricted })) {
    throw new HttpError(403, `Only a Game Director can ${what}.`);
  }
}

/**
 * Sets the completion flag (R1) and keeps any current board placement consistent: completing
 * moves the card to the board's Done column, reopening returns it to its category's To Do column.
 * Then recalculates the parent item's state. Shared with the Workboard column moves in Phase 4.
 */
export async function setTaskCompleted(
  tx: Queryable,
  task: Task,
  completed: boolean,
  actorId: string,
  reason: string,
  syncPlacement = true,
): Promise<void> {
  if (task.completed === completed) return;
  await tx.query(
    `UPDATE tasks SET completed = $2, completed_at = $3, completed_by = $4, version = version + 1, updated_at = now() WHERE id = $1`,
    [task.id, completed, completed ? new Date() : null, completed ? actorId : null],
  );
  if (syncPlacement && task.placement) {
    const board = (
      await tx.query<{ state: string }>('SELECT state FROM workboards WHERE id = $1', [
        task.placement.boardId,
      ])
    ).rows[0]!;
    if (!completed && board.state === 'archived') {
      await returnTask(tx, task.id, 'reopened after board archival');
      await recordActivity(tx, {
        projectId: task.projectId,
        actorId,
        action: 'task.returned',
        entityType: 'task',
        entityId: task.id,
        previous: { columnId: task.placement.columnId },
        next: { boardId: task.placement.boardId, reason: 'reopened after board archival' },
      });
    } else {
      const targetKind = completed ? 'done' : `todo_${task.category}`;
      const column = (
        await tx.query<{ id: string }>(
          'SELECT id FROM board_columns WHERE board_id = $1 AND kind = $2',
          [task.placement.boardId, targetKind],
        )
      ).rows[0];
      if (column && column.id !== task.placement.columnId) {
        const last = await tx.query<{ rank: string }>(
          'SELECT rank FROM task_placements WHERE column_id = $1 AND is_current ORDER BY rank DESC LIMIT 1',
          [column.id],
        );
        await tx.query(
          'UPDATE task_placements SET column_id = $2, rank = $3 WHERE task_id = $1 AND is_current',
          [task.id, column.id, generateKeyBetween(last.rows[0]?.rank ?? null, null)],
        );
      }
    }
  }
  await recordActivity(tx, {
    projectId: task.projectId,
    actorId,
    action: completed ? 'task.completed' : 'task.reopened',
    entityType: 'task',
    entityId: task.id,
    previous: { completed: task.completed },
    next: { completed, reason },
  });
  await recalculateItemState(tx, task.itemId, actorId, reason);
}

export const taskRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app.ctx;

  app.get(
    '/projects/:projectId/backlog/:itemId/tasks',
    projectRoute('project.view'),
    async (req): Promise<Task[]> => {
      const { itemId } = req.params as { itemId: string };
      const projectId = req.access!.project.id;
      if (!/^[0-9a-f-]{36}$/i.test(itemId)) throw notFound('Backlog item not found');
      const item = await db.query('SELECT 1 FROM backlog_items WHERE project_id = $1 AND id = $2', [
        projectId,
        itemId,
      ]);
      if (!item.rowCount) throw notFound('Backlog item not found');
      const res = await db.query<TaskRow>(
        `${taskSelect} WHERE t.project_id = $1 AND t.item_id = $2 ORDER BY t.archived_at NULLS FIRST, t.created_at`,
        [projectId, itemId],
      );
      return res.rows.map(toTask);
    },
  );

  // D3: any member may create tasks under an existing item. D8 (revised): when the parent item is
  // in the active Workboard's scope, the new task is placed in its To Do column right away.
  app.post(
    '/projects/:projectId/backlog/:itemId/tasks',
    projectRoute('task.work'),
    async (req, reply) => {
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) throw badRequest('Invalid task', parsed.error.flatten());
      const input = parsed.data;
      const { itemId } = req.params as { itemId: string };
      const projectId = req.access!.project.id;
      const actorId = req.user!.id;

      const taskId = await withTransaction(db, async (tx) => {
        // Lock the board before the parent so archival/scope removal cannot pass
        // the auto-placement check.
        const lockedBoard = await tx.query<{ id: string }>(
          "SELECT id FROM workboards WHERE project_id = $1 AND state = 'active' FOR UPDATE",
          [projectId],
        );
        const item = await tx.query<{ archived_at: Date | null }>(
          'SELECT archived_at FROM backlog_items WHERE project_id = $1 AND id = $2 FOR UPDATE',
          [projectId, itemId],
        );
        if (!item.rows[0]) throw notFound('Backlog item not found');
        if (item.rows[0].archived_at)
          throw conflict('Restore the backlog item before adding tasks to it.');
        if (input.assigneeId) await assertMember(tx, projectId, input.assigneeId);
        const created = await tx.query<{ id: string }>(
          `INSERT INTO tasks (project_id, item_id, category, title, description, assignee_id)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [
            projectId,
            itemId,
            input.category,
            input.title,
            input.description,
            input.assigneeId ?? null,
          ],
        );
        const id = created.rows[0]!.id;
        await recordActivity(tx, {
          projectId,
          actorId,
          action: 'task.created',
          entityType: 'task',
          entityId: id,
          next: { itemId, category: input.category, title: input.title },
        });
        const scoped = await tx.query<{ board_id: string }>(
          `SELECT s.board_id FROM workboard_scope s JOIN workboards w ON w.id = s.board_id
            WHERE s.item_id = $1 AND w.state = 'active'`,
          [itemId],
        );
        if (scoped.rows[0]) {
          if (scoped.rows[0].board_id !== lockedBoard.rows[0]?.id) {
            throw conflict('The active Workboard changed. Try creating the task again.');
          }
          await placeTask(
            tx,
            scoped.rows[0].board_id,
            { id, category: input.category },
            actorId,
            false,
          );
          await recordActivity(tx, {
            projectId,
            actorId,
            action: 'task.placed',
            entityType: 'task',
            entityId: id,
            next: { boardId: scoped.rows[0].board_id, reason: 'created under an item in scope' },
          });
        }
        await recalculateItemState(tx, itemId, actorId, 'task created');
        return id;
      });
      return reply.status(201).send(await fetchTask(db, projectId, taskId));
    },
  );

  app.get(
    '/projects/:projectId/tasks/:taskId',
    projectRoute('project.view'),
    async (req): Promise<TaskDetail> => {
      const { taskId } = req.params as { taskId: string };
      const task = await fetchDetail(db, req.access!.project.id, taskId);
      if (!task) throw notFound('Task not found');
      return task;
    },
  );

  app.patch('/projects/:projectId/tasks/:taskId', projectRoute('task.work'), async (req) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid task update', parsed.error.flatten());
    const { version, itemId: newItemId, archived, assigneeId, ...fields } = parsed.data;
    const { taskId } = req.params as { taskId: string };
    const projectId = req.access!.project.id;
    const actorId = req.user!.id;
    if (newItemId !== undefined) requireDirector(req, 'move a task to another backlog item');
    if (archived !== undefined) requireDirector(req, 'archive or restore a task');

    await withTransaction(db, async (tx) => {
      // Serialize deletion/restoration with placement, moves, scope changes and archival.
      const boards = await tx.query<{ id: string; state: string }>(
        `SELECT w.id, w.state FROM workboards w WHERE w.project_id = $1
           AND (w.state = 'active' OR EXISTS (
             SELECT 1 FROM task_placements p WHERE p.board_id = w.id AND p.task_id = $2 AND p.is_current
           )) ORDER BY w.id FOR UPDATE OF w`,
        [projectId, taskId],
      );
      await tx.query('SELECT 1 FROM tasks WHERE id = $1 FOR UPDATE', [taskId]);
      const current = await fetchTask(tx, projectId, taskId);
      if (!current) throw notFound('Task not found');
      if (current.placement && !boards.rows.some((b) => b.id === current.placement!.boardId)) {
        throw conflict('The task’s Workboard changed. Reload and try again.');
      }
      if (current.version !== version) {
        throw conflict('The task was changed by someone else. Reload and try again.', {
          currentVersion: current.version,
        });
      }
      if (
        fields.category !== undefined &&
        fields.category !== current.category &&
        current.placement
      ) {
        throw conflict('Category cannot be changed while the task is on a Workboard.');
      }
      if (assigneeId) await assertMember(tx, projectId, assigneeId);
      if (newItemId !== undefined && newItemId !== current.itemId) {
        const target = await tx.query<{ archived_at: Date | null }>(
          'SELECT archived_at FROM backlog_items WHERE project_id = $1 AND id = $2 FOR UPDATE',
          [projectId, newItemId],
        );
        if (!target.rows[0]) throw notFound('Target backlog item not found');
        if (target.rows[0].archived_at) throw conflict('The target backlog item is archived.');
      }

      const next = {
        title: fields.title ?? current.title,
        description: fields.description ?? current.description,
        category: fields.category ?? current.category,
        assignee_id: assigneeId === undefined ? (current.assignee?.id ?? null) : assigneeId,
        item_id: newItemId ?? current.itemId,
        archived_at: archived === undefined ? current.archived : archived,
      };
      if (archived === true && !current.archived) {
        await returnTask(tx, taskId, 'task deleted');
        const rejected = await tx.query<{ id: string; board_id: string }>(
          `UPDATE work_requests SET status = 'rejected', decided_by = $2, decided_at = now(),
             decision_note = 'Task deleted', version = version + 1
           WHERE task_id = $1 AND status = 'pending' RETURNING id, board_id`,
          [taskId, actorId],
        );
        for (const request of rejected.rows) {
          await recordActivity(tx, {
            projectId,
            actorId,
            action: 'request.rejected',
            entityType: 'work_request',
            entityId: request.id,
            next: { boardId: request.board_id, taskId, note: 'Task deleted' },
          });
        }
      }
      if (archived === false && current.archived) {
        const parent = await tx.query<{ archived_at: Date | null }>(
          'SELECT archived_at FROM backlog_items WHERE id = $1 FOR UPDATE',
          [next.item_id],
        );
        if (parent.rows[0]?.archived_at) throw conflict('Restore the backlog item first.');
        const active = boards.rows.find((b) => b.state === 'active');
        if (active && !current.completed && !current.placement) {
          const scope = await tx.query(
            'SELECT 1 FROM workboard_scope WHERE board_id = $1 AND item_id = $2',
            [active.id, next.item_id],
          );
          if (scope.rowCount) {
            await placeTask(tx, active.id, { id: taskId, category: next.category }, actorId, false);
            await recordActivity(tx, {
              projectId,
              actorId,
              action: 'task.placed',
              entityType: 'task',
              entityId: taskId,
              next: { boardId: active.id, reason: 'restored under an item in scope' },
            });
          }
        }
      }
      await tx.query(
        `UPDATE tasks SET title = $2, description = $3, category = $4, assignee_id = $5, item_id = $6,
                          archived_at = CASE WHEN $7::boolean THEN coalesce(archived_at, now()) ELSE NULL END,
                          version = version + 1, updated_at = now()
          WHERE id = $1`,
        [
          taskId,
          next.title,
          next.description,
          next.category,
          next.assignee_id,
          next.item_id,
          next.archived_at,
        ],
      );
      const action =
        newItemId !== undefined && newItemId !== current.itemId
          ? 'task.reparented'
          : archived !== undefined && archived !== current.archived
            ? archived
              ? 'task.archived'
              : 'task.restored'
            : 'task.updated';
      await recordActivity(tx, {
        projectId,
        actorId,
        action,
        entityType: 'task',
        entityId: taskId,
        previous: {
          title: current.title,
          category: current.category,
          assigneeId: current.assignee?.id ?? null,
          itemId: current.itemId,
          archived: current.archived,
          placement: current.placement,
        },
        next: {
          title: next.title,
          category: next.category,
          assigneeId: next.assignee_id,
          itemId: next.item_id,
          archived: next.archived_at,
        },
      });
      // Section 12: reparenting and archival recalculate readiness for every affected item.
      await recalculateItemState(tx, current.itemId, actorId, action);
      if (next.item_id !== current.itemId)
        await recalculateItemState(tx, next.item_id, actorId, action);
    });
    return fetchDetail(db, projectId, taskId);
  });

  for (const [verb, completed] of [
    ['complete', true],
    ['reopen', false],
  ] as const) {
    // Both directions require the completion permission (R2: leaving Done needs the same right).
    app.post(
      `/projects/:projectId/tasks/:taskId/${verb}`,
      projectRoute('task.complete'),
      async (req) => {
        const { taskId } = req.params as { taskId: string };
        const projectId = req.access!.project.id;
        await withTransaction(db, async (tx) => {
          // Serialize completion with board moves and archival, before locking the task.
          // Include its archived board so reopening can safely close that placement.
          const lockedBoards = await tx.query<{ id: string }>(
            `SELECT w.id FROM workboards w WHERE w.project_id = $1
               AND (w.state = 'active' OR EXISTS (
                 SELECT 1 FROM task_placements p WHERE p.board_id = w.id AND p.task_id = $2 AND p.is_current
               )) ORDER BY w.id FOR UPDATE OF w`,
            [projectId, taskId],
          );
          await tx.query('SELECT 1 FROM tasks WHERE id = $1 FOR UPDATE', [taskId]);
          const task = await fetchTask(tx, projectId, taskId);
          if (!task) throw notFound('Task not found');
          if (
            task.placement &&
            !lockedBoards.rows.some((board) => board.id === task.placement!.boardId)
          ) {
            throw conflict('The task’s Workboard changed. Reload and try again.');
          }
          if (task.archived) throw conflict('Restore the task before changing its completion.');
          await setTaskCompleted(tx, task, completed, req.user!.id, `task ${verb}`);
        });
        return fetchDetail(db, projectId, taskId);
      },
    );
  }
};
