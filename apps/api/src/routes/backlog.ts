import {
  MOSCOW_CATEGORIES,
  type BacklogItem,
  type BacklogItemDetail,
  type ItemLink,
  type ItemState,
  type MoscowCategory,
} from '@gameweld/domain';
import type { FastifyPluginAsync } from 'fastify';
import { generateKeyBetween } from 'fractional-indexing';
import { z } from 'zod';
import { recordActivity } from '../activity.ts';
import { projectRoute } from '../authz.ts';
import { withTransaction, type Queryable } from '../db.ts';
import { badRequest, conflict, notFound } from '../errors.ts';

const createSchema = z.object({
  title: z.string().trim().min(1).max(500),
  description: z.string().max(50_000).default(''),
  category: z.enum(MOSCOW_CATEGORIES),
});

const updateSchema = z.object({
  version: z.number().int(),
  title: z.string().trim().min(1).max(500).optional(),
  description: z.string().max(50_000).optional(),
  archived: z.boolean().optional(),
});

const moveSchema = z.object({
  category: z.enum(MOSCOW_CATEGORIES),
  afterId: z.string().uuid().nullish(),
  beforeId: z.string().uuid().nullish(),
});

const linkSchema = z.object({
  url: z.string().trim().url().max(2000),
  label: z.string().trim().max(200).default(''),
});

interface ItemRow {
  id: string;
  project_id: string;
  title: string;
  description: string;
  category: MoscowCategory;
  rank: string;
  state: ItemState;
  archived_at: Date | null;
  version: number;
  created_at: Date;
  updated_at: Date;
  task_total: string;
  task_completed: string;
  board_id: string | null;
  board_name: string | null;
}

const itemSelect = `
  SELECT b.id, b.project_id, b.title, b.description, b.category, b.rank, b.state, b.archived_at,
         b.version, b.created_at, b.updated_at,
         (SELECT count(*) FROM tasks t WHERE t.item_id = b.id AND t.archived_at IS NULL) AS task_total,
         (SELECT count(*) FROM tasks t WHERE t.item_id = b.id AND t.archived_at IS NULL AND t.completed) AS task_completed,
         w.id AS board_id, w.name AS board_name
    FROM backlog_items b
    LEFT JOIN workboard_scope s ON s.item_id = b.id
    LEFT JOIN workboards w ON w.id = s.board_id AND w.state = 'active'`;

function toItem(r: ItemRow): BacklogItem {
  return {
    id: r.id,
    projectId: r.project_id,
    title: r.title,
    description: r.description,
    category: r.category,
    rank: r.rank,
    state: r.state,
    archived: r.archived_at !== null,
    version: r.version,
    taskCounts: { total: Number(r.task_total), completed: Number(r.task_completed) },
    activeBoard: r.board_id && r.board_name ? { id: r.board_id, name: r.board_name } : null,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

async function fetchItem(
  db: Queryable,
  projectId: string,
  itemId: string,
): Promise<BacklogItem | null> {
  if (!/^[0-9a-f-]{36}$/i.test(itemId)) return null;
  const res = await db.query<ItemRow>(`${itemSelect} WHERE b.project_id = $1 AND b.id = $2`, [
    projectId,
    itemId,
  ]);
  return res.rows[0] ? toItem(res.rows[0]) : null;
}

async function fetchLinks(db: Queryable, itemId: string): Promise<ItemLink[]> {
  const res = await db.query<{ id: string; url: string; label: string }>(
    'SELECT id, url, label FROM links WHERE item_id = $1 ORDER BY created_at',
    [itemId],
  );
  return res.rows;
}

/** Rank after the last open item in a category, or the first rank when the category is empty. */
async function rankAtEnd(
  tx: Queryable,
  projectId: string,
  category: MoscowCategory,
): Promise<string> {
  const last = await tx.query<{ rank: string }>(
    `SELECT rank FROM backlog_items WHERE project_id = $1 AND category = $2 AND state = 'open' AND archived_at IS NULL
      ORDER BY rank DESC LIMIT 1`,
    [projectId, category],
  );
  return generateKeyBetween(last.rows[0]?.rank ?? null, null);
}

export const backlogRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app.ctx;
  const base = '/projects/:projectId/backlog';

  app.get(base, projectRoute('project.view'), async (req): Promise<BacklogItem[]> => {
    const res = await db.query<ItemRow>(
      `${itemSelect} WHERE b.project_id = $1 AND b.archived_at IS NULL ORDER BY b.category, b.rank, b.id`,
      [req.access!.project.id],
    );
    return res.rows.map(toItem);
  });

  app.post(base, projectRoute('backlog.manage'), async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid backlog item', parsed.error.flatten());
    const input = parsed.data;
    const projectId = req.access!.project.id;

    const itemId = await withTransaction(db, async (tx) => {
      await tx.query('SELECT 1 FROM projects WHERE id = $1 FOR UPDATE', [projectId]);
      const rank = await rankAtEnd(tx, projectId, input.category);
      const created = await tx.query<{ id: string }>(
        `INSERT INTO backlog_items (project_id, title, description, category, rank)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [projectId, input.title, input.description, input.category, rank],
      );
      const id = created.rows[0]!.id;
      await recordActivity(tx, {
        projectId,
        actorId: req.user!.id,
        action: 'item.created',
        entityType: 'backlog_item',
        entityId: id,
        next: { title: input.title, category: input.category },
      });
      return id;
    });
    return reply.status(201).send(await fetchItem(db, projectId, itemId));
  });

  app.get(
    `${base}/:itemId`,
    projectRoute('project.view'),
    async (req): Promise<BacklogItemDetail> => {
      const { itemId } = req.params as { itemId: string };
      const item = await fetchItem(db, req.access!.project.id, itemId);
      if (!item) throw notFound('Backlog item not found');
      return { ...item, links: await fetchLinks(db, item.id) };
    },
  );

  app.patch(`${base}/:itemId`, projectRoute('backlog.manage'), async (req) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid backlog item update', parsed.error.flatten());
    const { version, archived, ...fields } = parsed.data;
    const { itemId } = req.params as { itemId: string };
    const projectId = req.access!.project.id;

    await withTransaction(db, async (tx) => {
      const locked = await tx.query<ItemRow>(
        `SELECT * FROM backlog_items WHERE project_id = $1 AND id = $2 FOR UPDATE`,
        [projectId, itemId],
      );
      const current = locked.rows[0];
      if (!current) throw notFound('Backlog item not found');
      if (current.version !== version) {
        throw conflict('The item was changed by someone else. Reload and try again.', {
          currentVersion: current.version,
        });
      }
      if (archived === true && current.archived_at === null) {
        // Section 12: unfinished board tasks must be resolved before the parent is archived.
        const placed = await tx.query(
          `SELECT 1 FROM task_placements p JOIN tasks t ON t.id = p.task_id
            WHERE t.item_id = $1 AND p.is_current AND NOT t.completed LIMIT 1`,
          [itemId],
        );
        if (placed.rowCount)
          throw conflict(
            'Return or finish the tasks placed on a Workboard before archiving this item.',
          );
      }
      const next = {
        title: fields.title ?? current.title,
        description: fields.description ?? current.description,
        archived_at:
          archived === undefined
            ? current.archived_at
            : archived
              ? (current.archived_at ?? new Date())
              : null,
      };
      await tx.query(
        `UPDATE backlog_items SET title = $3, description = $4, archived_at = $5, version = version + 1, updated_at = now()
          WHERE project_id = $1 AND id = $2`,
        [projectId, itemId, next.title, next.description, next.archived_at],
      );
      await recordActivity(tx, {
        projectId,
        actorId: req.user!.id,
        action:
          archived === undefined ? 'item.updated' : archived ? 'item.archived' : 'item.restored',
        entityType: 'backlog_item',
        entityId: itemId,
        previous: {
          title: current.title,
          description: current.description,
          archived: current.archived_at !== null,
        },
        next: {
          title: next.title,
          description: next.description,
          archived: next.archived_at !== null,
        },
      });
    });
    return fetchItem(db, projectId, itemId);
  });

  app.post(`${base}/:itemId/move`, projectRoute('backlog.manage'), async (req) => {
    const parsed = moveSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid move', parsed.error.flatten());
    const { category, afterId, beforeId } = parsed.data;
    const { itemId } = req.params as { itemId: string };
    const projectId = req.access!.project.id;

    await withTransaction(db, async (tx) => {
      // Serialize every reorder in the project so concurrent moves see each other's ranks.
      await tx.query('SELECT 1 FROM projects WHERE id = $1 FOR UPDATE', [projectId]);
      const current = (
        await tx.query<ItemRow>('SELECT * FROM backlog_items WHERE project_id = $1 AND id = $2', [
          projectId,
          itemId,
        ])
      ).rows[0];
      if (!current || current.archived_at) throw notFound('Backlog item not found');
      if (current.state !== 'open')
        throw conflict('Only open items can be reordered; this item is awaiting review or done.');

      const neighbor = async (id: string | null | undefined): Promise<string | null> => {
        if (!id) return null;
        if (id === itemId) throw badRequest('An item cannot be placed next to itself');
        const row = await tx.query<{ rank: string }>(
          `SELECT rank FROM backlog_items WHERE project_id = $1 AND id = $2 AND category = $3 AND state = 'open' AND archived_at IS NULL`,
          [projectId, id, category],
        );
        if (!row.rows[0])
          throw conflict('The neighboring item is no longer in that lane. Reload and try again.');
        return row.rows[0].rank;
      };
      let after = await neighbor(afterId);
      let before = await neighbor(beforeId);
      let rank: string;
      if (after === null && before === null) {
        rank = await rankAtEnd(tx, projectId, category);
      } else {
        // An empty side means "start" or "end" of the lane: bound it by the lane's current
        // extreme (excluding the moving item) so serialized concurrent moves never share a key.
        const bounds = await tx.query<{ min: string | null; max: string | null }>(
          `SELECT min(rank) AS min, max(rank) AS max FROM backlog_items
            WHERE project_id = $1 AND category = $2 AND state = 'open' AND archived_at IS NULL AND id <> $3`,
          [projectId, category, itemId],
        );
        const { min, max } = bounds.rows[0]!;
        if (after === null && min !== null && (before === null || min < before)) before = min;
        if (before === null && max !== null && (after === null || max > after)) after = max;
        if (after !== null && before !== null && after >= before) {
          throw conflict('Those items are no longer adjacent. Reload and try again.');
        }
        rank = generateKeyBetween(after, before);
      }
      await tx.query(
        `UPDATE backlog_items SET category = $3, rank = $4, version = version + 1, updated_at = now()
          WHERE project_id = $1 AND id = $2`,
        [projectId, itemId, category, rank],
      );
      await recordActivity(tx, {
        projectId,
        actorId: req.user!.id,
        action: current.category === category ? 'item.reordered' : 'item.recategorized',
        entityType: 'backlog_item',
        entityId: itemId,
        previous: { category: current.category, rank: current.rank },
        next: { category, rank },
      });
    });
    return fetchItem(db, projectId, itemId);
  });

  app.post(`${base}/:itemId/links`, projectRoute('backlog.manage'), async (req, reply) => {
    const parsed = linkSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid link', parsed.error.flatten());
    const { itemId } = req.params as { itemId: string };
    const projectId = req.access!.project.id;
    const item = await fetchItem(db, projectId, itemId);
    if (!item) throw notFound('Backlog item not found');

    const link = await withTransaction(db, async (tx) => {
      const created = await tx.query<{ id: string; url: string; label: string }>(
        `INSERT INTO links (project_id, item_id, url, label, created_by) VALUES ($1, $2, $3, $4, $5)
         RETURNING id, url, label`,
        [projectId, itemId, parsed.data.url, parsed.data.label, req.user!.id],
      );
      await recordActivity(tx, {
        projectId,
        actorId: req.user!.id,
        action: 'item.link_added',
        entityType: 'backlog_item',
        entityId: itemId,
        next: parsed.data,
      });
      return created.rows[0]!;
    });
    return reply.status(201).send(link);
  });

  app.delete(
    `${base}/:itemId/links/:linkId`,
    projectRoute('backlog.manage'),
    async (req, reply) => {
      const { itemId, linkId } = req.params as { itemId: string; linkId: string };
      const projectId = req.access!.project.id;
      if (!/^[0-9a-f-]{36}$/i.test(linkId)) throw notFound('Link not found');
      await withTransaction(db, async (tx) => {
        const deleted = await tx.query<{ url: string; label: string }>(
          'DELETE FROM links WHERE project_id = $1 AND item_id = $2 AND id = $3 RETURNING url, label',
          [projectId, itemId, linkId],
        );
        if (!deleted.rowCount) throw notFound('Link not found');
        await recordActivity(tx, {
          projectId,
          actorId: req.user!.id,
          action: 'item.link_removed',
          entityType: 'backlog_item',
          entityId: itemId,
          previous: deleted.rows[0],
        });
      });
      return reply.status(204).send();
    },
  );
};
