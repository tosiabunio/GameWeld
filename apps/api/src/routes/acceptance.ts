import type { Acceptance, ItemComment } from '@gameweld/domain';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { recordActivity } from '../activity.ts';
import { projectRoute } from '../authz.ts';
import { withTransaction, type Queryable } from '../db.ts';
import { badRequest, conflict, notFound } from '../errors.ts';
import { fetchComments } from './collab.ts';
import { recalculateItemState } from '../services/readiness.ts';

const acceptSchema = z.object({ note: z.string().max(5000).default('') });
const rejectSchema = z.object({ note: z.string().trim().min(1).max(5000) });

export async function fetchAcceptances(db: Queryable, itemId: string): Promise<Acceptance[]> {
  const res = await db.query<{
    id: string;
    accepted_by: string;
    display_name: string;
    accepted_at: Date;
    note: string;
    invalidated_at: Date | null;
    invalidated_reason: string | null;
  }>(
    `SELECT a.id, a.accepted_by, u.display_name, a.accepted_at, a.note, a.invalidated_at, a.invalidated_reason
       FROM acceptances a JOIN users u ON u.id = a.accepted_by
      WHERE a.item_id = $1 ORDER BY a.accepted_at DESC`,
    [itemId],
  );
  return res.rows.map((r) => ({
    id: r.id,
    acceptedBy: { id: r.accepted_by, displayName: r.display_name },
    acceptedAt: r.accepted_at.toISOString(),
    note: r.note,
    invalidatedAt: r.invalidated_at?.toISOString() ?? null,
    invalidatedReason: r.invalidated_reason,
  }));
}

export async function fetchItemComments(db: Queryable, itemId: string): Promise<ItemComment[]> {
  return fetchComments(db, { itemId });
}

export const acceptanceRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app.ctx;
  const base = '/projects/:projectId/backlog/:itemId';

  /** Section 11: an authorized user explicitly accepts a Ready for Review item as Done. */
  app.post(`${base}/accept`, projectRoute('item.accept'), async (req) => {
    const parsed = acceptSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw badRequest('Invalid acceptance', parsed.error.flatten());
    const { itemId } = req.params as { itemId: string };
    const projectId = req.access!.project.id;
    const actorId = req.user!.id;
    if (!/^[0-9a-f-]{36}$/i.test(itemId)) throw notFound('Backlog item not found');

    const stale = await withTransaction(db, async (tx) => {
      const item = (
        await tx.query<{ state: string; archived_at: Date | null }>(
          'SELECT state, archived_at FROM backlog_items WHERE project_id = $1 AND id = $2 FOR UPDATE',
          [projectId, itemId],
        )
      ).rows[0];
      if (!item) throw notFound('Backlog item not found');
      if (item.archived_at) throw conflict('Archived items cannot be accepted.');
      if (item.state === 'done') throw conflict('This item is already accepted.');
      if (item.state !== 'ready_for_review')
        throw conflict('Only items that are Ready for Review can be accepted.');
      // Invariant 6: recheck the actual task states at commit time, not the cached state.
      const counts = (
        await tx.query<{ total: string; unfinished: string }>(
          `SELECT count(*) AS total, count(*) FILTER (WHERE NOT completed) AS unfinished
             FROM tasks WHERE item_id = $1 AND archived_at IS NULL`,
          [itemId],
        )
      ).rows[0]!;
      if (Number(counts.total) === 0 || Number(counts.unfinished) > 0) return true;
      await tx.query('INSERT INTO acceptances (item_id, accepted_by, note) VALUES ($1, $2, $3)', [
        itemId,
        actorId,
        parsed.data.note,
      ]);
      await tx.query(
        `UPDATE backlog_items SET state = 'done', version = version + 1, updated_at = now() WHERE id = $1`,
        [itemId],
      );
      await recordActivity(tx, {
        projectId,
        actorId,
        action: 'item.accepted',
        entityType: 'backlog_item',
        entityId: itemId,
        previous: { state: 'ready_for_review' },
        next: { state: 'done', note: parsed.data.note },
      });
      return false;
    });
    if (stale) {
      // Correct the cached state in its own transaction, then report the conflict.
      await withTransaction(db, (tx) =>
        recalculateItemState(tx, itemId, actorId, 'acceptance recheck'),
      );
      throw conflict(
        'The item changed during review: not every task is complete any more. It has returned to Open.',
      );
    }
    return { ok: true };
  });

  /**
   * Section 11: a rejection is a visible comment. The reviewer then reopens a task or adds a
   * follow-up task through the normal task routes; until then the item stays Ready for Review.
   */
  app.post(`${base}/reject`, projectRoute('item.accept'), async (req, reply) => {
    const parsed = rejectSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Say what needs to change.', parsed.error.flatten());
    const { itemId } = req.params as { itemId: string };
    const projectId = req.access!.project.id;
    const actorId = req.user!.id;
    if (!/^[0-9a-f-]{36}$/i.test(itemId)) throw notFound('Backlog item not found');

    const comment = await withTransaction(db, async (tx) => {
      const item = (
        await tx.query<{ state: string }>(
          'SELECT state FROM backlog_items WHERE project_id = $1 AND id = $2 FOR UPDATE',
          [projectId, itemId],
        )
      ).rows[0];
      if (!item) throw notFound('Backlog item not found');
      if (item.state !== 'ready_for_review')
        throw conflict('Only items that are Ready for Review can be rejected.');
      const created = await tx.query<{ id: string }>(
        `INSERT INTO comments (project_id, item_id, author_id, body, kind) VALUES ($1, $2, $3, $4, 'rejection') RETURNING id`,
        [projectId, itemId, actorId, parsed.data.note],
      );
      await recordActivity(tx, {
        projectId,
        actorId,
        action: 'item.rejected',
        entityType: 'backlog_item',
        entityId: itemId,
        next: { note: parsed.data.note },
      });
      return created.rows[0]!.id;
    });
    const comments = await fetchItemComments(db, itemId);
    return reply.status(201).send(comments.find((c) => c.id === comment));
  });
};
