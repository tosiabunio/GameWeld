import type { ChecklistItem } from '@gameweld/domain';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { generateKeyBetween } from 'fractional-indexing';
import { z } from 'zod';
import { projectRoute } from '../authz.ts';
import { withTransaction, type Queryable } from '../db.ts';
import { badRequest, conflict, notFound } from '../errors.ts';
import { emitLive } from '../live.ts';
import * as schema from '../schemas.ts';
import { fetchChecklist } from './tasks.ts';

const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);
const addSchema = z.object({ title: z.string().trim().min(1).max(500) });
const updateSchema = z
  .object({ title: z.string().trim().min(1).max(500).optional(), done: z.boolean().optional() })
  .refine((input) => input.title !== undefined || input.done !== undefined, {
    message: 'Nothing to change.',
  });

/**
 * A task's checklist. Anyone who may work on tasks may change it. Its changes are not part of
 * the activity history, which would fill with ticks; they announce themselves to open pages,
 * and every route answers with the whole list, in order.
 */
export const checklistRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app.ctx;
  const base = '/projects/:projectId/tasks/:taskId/checklist';

  /** Locks the task so that two people adding at once get different places in the list. */
  async function editableTask(tx: Queryable, req: FastifyRequest): Promise<string> {
    const { taskId } = req.params as { taskId: string };
    if (!isUuid(taskId)) throw notFound('Task not found');
    const task = (
      await tx.query<{ archived_at: Date | null }>(
        'SELECT archived_at FROM tasks WHERE project_id = $1 AND id = $2 FOR UPDATE',
        [req.access!.project.id, taskId],
      )
    ).rows[0];
    if (!task) throw notFound('Task not found');
    if (task.archived_at) throw conflict('Restore the task before changing its checklist.');
    return taskId;
  }

  const changed = (tx: Queryable, req: FastifyRequest, taskId: string) =>
    emitLive(tx, { p: req.access!.project.id, t: 'task', id: taskId, a: 'checklist.changed' });

  app.post(
    base,
    projectRoute('task.work', {
      id: 'addChecklistItem',
      summary: 'Add a step to a task’s checklist',
      description:
        'Answers with the whole checklist. Steps decide nothing about whether the task is complete.',
      body: addSchema,
      response: { status: 201, schema: z.array(schema.ChecklistItem) },
    }),
    async (req, reply): Promise<ChecklistItem[]> => {
      const parsed = addSchema.safeParse(req.body);
      if (!parsed.success) throw badRequest('Invalid checklist item', parsed.error.flatten());
      const items = await withTransaction(db, async (tx) => {
        const taskId = await editableTask(tx, req);
        const last = await tx.query<{ rank: string }>(
          'SELECT rank FROM task_checklist_items WHERE task_id = $1 ORDER BY rank DESC LIMIT 1',
          [taskId],
        );
        await tx.query(
          'INSERT INTO task_checklist_items (task_id, title, rank) VALUES ($1, $2, $3)',
          [taskId, parsed.data.title, generateKeyBetween(last.rows[0]?.rank ?? null, null)],
        );
        await changed(tx, req, taskId);
        return fetchChecklist(tx, taskId);
      });
      return reply.status(201).send(items);
    },
  );

  app.patch(
    `${base}/:checkId`,
    projectRoute('task.work', {
      id: 'updateChecklistItem',
      summary: 'Rename a checklist step, or tick it',
      description: 'Answers with the whole checklist.',
      body: updateSchema,
      response: z.array(schema.ChecklistItem),
    }),
    async (req): Promise<ChecklistItem[]> => {
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) throw badRequest('Invalid checklist change', parsed.error.flatten());
      const { checkId } = req.params as { checkId: string };
      return withTransaction(db, async (tx) => {
        const taskId = await editableTask(tx, req);
        const updated = isUuid(checkId)
          ? await tx.query(
              `UPDATE task_checklist_items SET title = coalesce($3, title), done = coalesce($4, done)
              WHERE task_id = $1 AND id = $2`,
              [taskId, checkId, parsed.data.title ?? null, parsed.data.done ?? null],
            )
          : null;
        if (!updated?.rowCount) throw notFound('Checklist item not found');
        await changed(tx, req, taskId);
        return fetchChecklist(tx, taskId);
      });
    },
  );

  app.delete(
    `${base}/:checkId`,
    projectRoute('task.work', {
      id: 'removeChecklistItem',
      summary: 'Remove a checklist step',
      description: 'Answers with what is left of the checklist.',
      response: z.array(schema.ChecklistItem),
    }),
    async (req): Promise<ChecklistItem[]> => {
      const { checkId } = req.params as { checkId: string };
      return withTransaction(db, async (tx) => {
        const taskId = await editableTask(tx, req);
        const removed = isUuid(checkId)
          ? await tx.query('DELETE FROM task_checklist_items WHERE task_id = $1 AND id = $2', [
              taskId,
              checkId,
            ])
          : null;
        if (!removed?.rowCount) throw notFound('Checklist item not found');
        await changed(tx, req, taskId);
        return fetchChecklist(tx, taskId);
      });
    },
  );
};
