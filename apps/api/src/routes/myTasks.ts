import type { MoscowCategory, MyTask } from '@gameweld/domain';
import type { FastifyPluginAsync } from 'fastify';
import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';
import { z } from 'zod';
import { projectRoute } from '../authz.ts';
import { withTransaction, type Queryable } from '../db.ts';
import { badRequest, conflict, notFound } from '../errors.ts';
import { taskSelect, toTask, type TaskRow } from './tasks.ts';

const uuid = z.string().uuid();
const moveSchema = z.object({ afterId: uuid.nullish(), beforeId: uuid.nullish() });

type MyTaskRow = TaskRow & {
  item_title: string;
  item_category: MoscowCategory;
  my_rank: string | null;
};

/**
 * The unfinished tasks assigned to one member, in that member's own order. Tasks they have not
 * ordered yet follow the ordered ones, oldest first, so new work never jumps the queue.
 */
async function fetchMyTasks(db: Queryable, projectId: string, userId: string) {
  const res = await db.query<MyTaskRow>(
    `SELECT x.*, b.title AS item_title, b.category AS item_category, mr.rank AS my_rank
       FROM (${taskSelect}
              WHERE t.project_id = $1 AND t.assignee_id = $2
                AND NOT t.completed AND t.archived_at IS NULL) x
       JOIN backlog_items b ON b.id = x.item_id AND b.archived_at IS NULL
       LEFT JOIN my_task_ranks mr ON mr.task_id = x.id AND mr.user_id = $2
      ORDER BY mr.rank NULLS LAST, x.created_at, x.id`,
    [projectId, userId],
  );
  return res.rows;
}

const toMyTask = (r: MyTaskRow): MyTask => ({
  ...toTask(r),
  itemTitle: r.item_title,
  itemCategory: r.item_category,
});

/**
 * "My tasks" is each member's own view of the project, so reading and ordering it need no more
 * than membership. Ordering is not project history: it changes no task and records no activity.
 */
export const myTaskRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app.ctx;
  const base = '/projects/:projectId/my-tasks';

  app.get(base, projectRoute('project.view'), async (req): Promise<MyTask[]> =>
    (await fetchMyTasks(db, req.access!.project.id, req.user!.id)).map(toMyTask),
  );

  app.post(`${base}/:taskId/move`, projectRoute('project.view'), async (req): Promise<MyTask[]> => {
    const parsed = moveSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid move', parsed.error.flatten());
    const { taskId } = req.params as { taskId: string };
    const { afterId, beforeId } = parsed.data;
    const projectId = req.access!.project.id;
    const userId = req.user!.id;
    if (afterId === taskId || beforeId === taskId)
      throw badRequest('A task cannot be placed next to itself');

    await withTransaction(db, async (tx) => {
      // Serialize this member's moves, so two drops never share a rank.
      await tx.query(
        'SELECT 1 FROM project_memberships WHERE project_id = $1 AND user_id = $2 FOR UPDATE',
        [projectId, userId],
      );
      const mine = await fetchMyTasks(tx, projectId, userId);
      if (!mine.some((t) => t.id === taskId))
        throw notFound('That task is not among the tasks assigned to you.');

      // Tasks never ordered before get their places first, so every neighbour has a rank.
      const unranked = mine.filter((t) => t.my_rank === null);
      const lastRank = mine[mine.length - unranked.length - 1]?.my_rank ?? null;
      const keys = generateNKeysBetween(lastRank, null, unranked.length);
      for (const [i, t] of unranked.entries()) {
        t.my_rank = keys[i]!;
        await tx.query(
          `INSERT INTO my_task_ranks (user_id, task_id, rank) VALUES ($1, $2, $3)
           ON CONFLICT (user_id, task_id) DO UPDATE SET rank = EXCLUDED.rank`,
          [userId, t.id, t.my_rank],
        );
      }

      const others = mine.filter((t) => t.id !== taskId);
      const indexOf = (id: string) => {
        const index = others.findIndex((t) => t.id === id);
        if (index === -1)
          throw conflict('The neighboring task is no longer in your list. Reload and try again.');
        return index;
      };
      const at = afterId ? indexOf(afterId) + 1 : beforeId ? indexOf(beforeId) : others.length;
      const rank = generateKeyBetween(others[at - 1]?.my_rank ?? null, others[at]?.my_rank ?? null);
      await tx.query('UPDATE my_task_ranks SET rank = $3 WHERE user_id = $1 AND task_id = $2', [
        userId,
        taskId,
        rank,
      ]);
    });
    return (await fetchMyTasks(db, projectId, userId)).map(toMyTask);
  });
};
