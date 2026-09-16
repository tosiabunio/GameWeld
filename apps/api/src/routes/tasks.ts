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
}

const taskSelect = `
  SELECT t.id, t.project_id, t.item_id, t.category, t.title, t.description, t.assignee_id,
         u.display_name AS assignee_name, t.completed, t.completed_at, t.archived_at, t.version,
         t.created_at, t.updated_at,
         w.id AS board_id, w.name AS board_name, c.id AS column_id, c.name AS column_name, c.kind AS column_kind,
         p.entered_as_exception
    FROM tasks t
    LEFT JOIN users u ON u.id = t.assignee_id
    LEFT JOIN task_placements p ON p.task_id = t.id AND p.is_current
    LEFT JOIN workboards w ON w.id = p.board_id
    LEFT JOIN board_columns c ON c.id = p.column_id`;

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
  return { ...task, item };
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

  // D3: any member may create tasks under an existing item. D8: creation never places the task.
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
      await tx.query('SELECT 1 FROM tasks WHERE id = $1 FOR UPDATE', [taskId]);
      const current = await fetchTask(tx, projectId, taskId);
      if (!current) throw notFound('Task not found');
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
        throw conflict('Return the task from the Workboard before changing its category.');
      }
      if (archived === true && !current.archived && current.placement && !current.completed) {
        throw conflict('Return or finish the task on the Workboard before archiving it.');
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
          await tx.query('SELECT 1 FROM tasks WHERE id = $1 FOR UPDATE', [taskId]);
          const task = await fetchTask(tx, projectId, taskId);
          if (!task) throw notFound('Task not found');
          if (task.archived) throw conflict('Restore the task before changing its completion.');
          await setTaskCompleted(tx, task, completed, req.user!.id, `task ${verb}`);
        });
        return fetchDetail(db, projectId, taskId);
      },
    );
  }
};
