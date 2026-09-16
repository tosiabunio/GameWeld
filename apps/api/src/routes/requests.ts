import type { RequestStatus, WorkRequest } from '@gameweld/domain';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { recordActivity } from '../activity.ts';
import { projectRoute } from '../authz.ts';
import { withTransaction, type Queryable } from '../db.ts';
import { badRequest, conflict, HttpError, notFound } from '../errors.ts';
import { activeBoardFor, placeTask } from './board.ts';
import { fetchTask } from './tasks.ts';

const uuid = z.string().uuid();
const createSchema = z.object({ taskId: uuid, reason: z.string().max(5000).default('') });
const decideSchema = z.object({ note: z.string().max(5000).default('') });
const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

interface RequestRow {
  id: string;
  board_id: string;
  board_name: string;
  task_id: string;
  task_title: string;
  task_category: WorkRequest['task']['category'];
  task_completed: boolean;
  task_placed: boolean;
  item_id: string;
  item_title: string;
  requester_id: string;
  requester_name: string;
  reason: string;
  status: RequestStatus;
  decided_by: string | null;
  decider_name: string | null;
  decided_at: Date | null;
  decision_note: string | null;
  created_at: Date;
}

const requestSelect = `
  SELECT r.id, r.board_id, w.name AS board_name, r.task_id, t.title AS task_title, t.category AS task_category,
         t.completed AS task_completed,
         EXISTS (SELECT 1 FROM task_placements p WHERE p.task_id = t.id AND p.is_current) AS task_placed,
         b.id AS item_id, b.title AS item_title, r.requester_id, ru.display_name AS requester_name, r.reason, r.status,
         r.decided_by, du.display_name AS decider_name, r.decided_at, r.decision_note, r.created_at
    FROM work_requests r
    JOIN workboards w ON w.id = r.board_id
    JOIN tasks t ON t.id = r.task_id
    JOIN backlog_items b ON b.id = t.item_id
    JOIN users ru ON ru.id = r.requester_id
    LEFT JOIN users du ON du.id = r.decided_by`;

function toRequest(r: RequestRow): WorkRequest {
  return {
    id: r.id,
    boardId: r.board_id,
    boardName: r.board_name,
    task: {
      id: r.task_id,
      title: r.task_title,
      category: r.task_category,
      completed: r.task_completed,
      placed: r.task_placed,
    },
    item: { id: r.item_id, title: r.item_title },
    requester: { id: r.requester_id, displayName: r.requester_name },
    reason: r.reason,
    status: r.status,
    decidedBy:
      r.decided_by && r.decider_name ? { id: r.decided_by, displayName: r.decider_name } : null,
    decidedAt: r.decided_at?.toISOString() ?? null,
    decisionNote: r.decision_note,
    createdAt: r.created_at.toISOString(),
  };
}

async function fetchRequest(
  db: Queryable,
  boardId: string,
  requestId: string,
  lock = false,
): Promise<WorkRequest | null> {
  if (!isUuid(requestId)) return null;
  const res = await db.query<RequestRow>(
    `${requestSelect} WHERE r.board_id = $1 AND r.id = $2${lock ? ' FOR UPDATE OF r' : ''}`,
    [boardId, requestId],
  );
  return res.rows[0] ? toRequest(res.rows[0]) : null;
}

export const requestRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app.ctx;
  const base = '/projects/:projectId/boards/:boardId/requests';

  /** Pending requests first, then decided ones, newest first. */
  app.get(base, projectRoute('project.view'), async (req): Promise<WorkRequest[]> => {
    const { boardId } = req.params as { boardId: string };
    if (!isUuid(boardId)) throw notFound('Workboard not found');
    const owned = await db.query('SELECT 1 FROM workboards WHERE project_id = $1 AND id = $2', [
      req.access!.project.id,
      boardId,
    ]);
    if (!owned.rowCount) throw notFound('Workboard not found');
    const res = await db.query<RequestRow>(
      `${requestSelect} WHERE r.board_id = $1 ORDER BY (r.status = 'pending') DESC, r.created_at DESC`,
      [boardId],
    );
    return res.rows.map(toRequest);
  });

  /** Section 9 step 2: a member asks for an unplaced task of an out-of-scope item to be placed. */
  app.post(base, projectRoute('task.work'), async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid request', parsed.error.flatten());
    const { boardId } = req.params as { boardId: string };
    const projectId = req.access!.project.id;
    const actorId = req.user!.id;

    const requestId = await withTransaction(db, async (tx) => {
      await activeBoardFor(tx, projectId, boardId);
      await tx.query('SELECT 1 FROM tasks WHERE id = $1 FOR UPDATE', [parsed.data.taskId]);
      const task = await fetchTask(tx, projectId, parsed.data.taskId);
      if (!task) throw notFound('Task not found');
      if (task.archived) throw conflict('Restore the task before requesting placement.');
      if (task.completed) throw conflict('The task is already complete.');
      if (task.placement) throw conflict(`The task is already on ${task.placement.boardName}.`);
      const inScope = await tx.query(
        'SELECT 1 FROM workboard_scope WHERE board_id = $1 AND item_id = $2',
        [boardId, task.itemId],
      );
      if (inScope.rowCount)
        throw conflict('This task’s item is in scope: add it to the Workboard directly.');
      if (task.pendingRequest)
        throw conflict('A placement request for this task is already pending.');
      const created = await tx.query<{ id: string }>(
        'INSERT INTO work_requests (task_id, board_id, requester_id, reason) VALUES ($1, $2, $3, $4) RETURNING id',
        [task.id, boardId, actorId, parsed.data.reason],
      );
      await recordActivity(tx, {
        projectId,
        actorId,
        action: 'request.created',
        entityType: 'work_request',
        entityId: created.rows[0]!.id,
        next: { taskId: task.id, boardId, reason: parsed.data.reason },
      });
      return created.rows[0]!.id;
    });
    return reply.status(201).send(await fetchRequest(db, boardId, requestId));
  });

  app.post(
    `${base}/:requestId/withdraw`,
    projectRoute('task.work', { ownerScoped: true }),
    async (req) => {
      const { boardId, requestId } = req.params as { boardId: string; requestId: string };
      const projectId = req.access!.project.id;
      await withTransaction(db, async (tx) => {
        await activeBoardFor(tx, projectId, boardId);
        const request = await fetchRequest(tx, boardId, requestId, true);
        if (!request) throw notFound('Request not found');
        if (request.requester.id !== req.user!.id)
          throw new HttpError(403, 'Only the requester can withdraw a request.');
        if (request.status !== 'pending')
          throw conflict(`This request was already ${request.status}.`);
        await tx.query(
          `UPDATE work_requests SET status = 'withdrawn', version = version + 1 WHERE id = $1`,
          [requestId],
        );
        await recordActivity(tx, {
          projectId,
          actorId: req.user!.id,
          action: 'request.withdrawn',
          entityType: 'work_request',
          entityId: requestId,
        });
      });
      return fetchRequest(db, boardId, requestId);
    },
  );

  for (const verb of ['approve', 'reject'] as const) {
    app.post(`${base}/:requestId/${verb}`, projectRoute('out_of_scope.approve'), async (req) => {
      const parsed = decideSchema.safeParse(req.body ?? {});
      if (!parsed.success) throw badRequest('Invalid decision', parsed.error.flatten());
      const { boardId, requestId } = req.params as { boardId: string; requestId: string };
      const projectId = req.access!.project.id;
      const actorId = req.user!.id;
      await withTransaction(db, async (tx) => {
        await activeBoardFor(tx, projectId, boardId);
        // The row lock serializes two Directors deciding at once: the second sees a decided request.
        const request = await fetchRequest(tx, boardId, requestId, true);
        if (!request) throw notFound('Request not found');
        if (request.status !== 'pending') {
          throw conflict(
            `This request was already ${request.status}${request.decidedBy ? ` by ${request.decidedBy.displayName}` : ''}.`,
          );
        }
        if (verb === 'approve') {
          // Invariant 9: recheck before placing; never overwrite a newer placement silently.
          await tx.query('SELECT 1 FROM tasks WHERE id = $1 FOR UPDATE', [request.task.id]);
          const task = await fetchTask(tx, projectId, request.task.id);
          if (!task || task.archived) throw conflict('The task no longer exists or is archived.');
          if (task.completed) throw conflict('The task was completed in the meantime.');
          if (task.placement) throw conflict(`The task is already on ${task.placement.boardName}.`);
          const inScope = await tx.query(
            'SELECT 1 FROM workboard_scope WHERE board_id = $1 AND item_id = $2',
            [boardId, task.itemId],
          );
          await placeTask(tx, boardId, task, actorId, !inScope.rowCount, { recordApproval: false });
        }
        await tx.query(
          `UPDATE work_requests SET status = $2, decided_by = $3, decided_at = now(), decision_note = $4, version = version + 1 WHERE id = $1`,
          [requestId, verb === 'approve' ? 'approved' : 'rejected', actorId, parsed.data.note],
        );
        await recordActivity(tx, {
          projectId,
          actorId,
          action: `request.${verb === 'approve' ? 'approved' : 'rejected'}`,
          entityType: 'work_request',
          entityId: requestId,
          next: { taskId: request.task.id, note: parsed.data.note },
        });
      });
      return fetchRequest(db, boardId, requestId);
    });
  }
};
