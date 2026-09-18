import type { ActivityEntry, Attachment, Comment, Dependency, ProjectRole } from '@gameweld/domain';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { recordActivity } from '../activity.ts';
import { can } from '@gameweld/domain';
import { projectRoute } from '../authz.ts';
import { coverKey, coverRendition, UnreadableImage } from '../covers.ts';
import { withTransaction, type Queryable } from '../db.ts';
import { badRequest, conflict, HttpError, notFound } from '../errors.ts';
import { PayloadTooLarge, PREVIEW_IMAGE_TYPES } from '../storage.ts';

const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);
const commentSchema = z.object({ body: z.string().trim().min(1).max(20_000) });
const linkSchema = z.object({
  url: z.string().trim().url().max(2000),
  label: z.string().trim().max(200).default(''),
});
const dependencySchema = z.object({ dependsOnItemId: z.string().uuid() });

// ---------------------------------------------------------------------------------------------
// Readers shared with the item and task detail routes

export async function fetchAttachments(
  db: Queryable,
  owner: { itemId?: string; taskId?: string },
): Promise<Attachment[]> {
  const res = await db.query<{
    id: string;
    file_name: string;
    content_type: string;
    size_bytes: string;
    uploaded_by: string;
    display_name: string;
    created_at: Date;
  }>(
    `SELECT a.id, a.file_name, a.content_type, a.size_bytes, a.uploaded_by, u.display_name, a.created_at
       FROM attachments a JOIN users u ON u.id = a.uploaded_by
      WHERE ($1::uuid IS NULL OR a.item_id = $1) AND ($2::uuid IS NULL OR a.task_id = $2)
      ORDER BY a.created_at`,
    [owner.itemId ?? null, owner.taskId ?? null],
  );
  return res.rows.map((r) => ({
    id: r.id,
    fileName: r.file_name,
    contentType: r.content_type,
    sizeBytes: Number(r.size_bytes),
    uploadedBy: { id: r.uploaded_by, displayName: r.display_name },
    createdAt: r.created_at.toISOString(),
    isImage: PREVIEW_IMAGE_TYPES.has(r.content_type),
  }));
}

export async function fetchComments(
  db: Queryable,
  owner: { itemId?: string; taskId?: string },
): Promise<Comment[]> {
  const res = await db.query<{
    id: string;
    author_id: string;
    display_name: string;
    body: string;
    kind: Comment['kind'];
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT c.id, c.author_id, u.display_name, c.body, c.kind, c.created_at, c.updated_at
       FROM comments c JOIN users u ON u.id = c.author_id
      WHERE ($1::uuid IS NULL OR c.item_id = $1) AND ($2::uuid IS NULL OR c.task_id = $2)
      ORDER BY c.created_at`,
    [owner.itemId ?? null, owner.taskId ?? null],
  );
  return res.rows.map((r) => ({
    id: r.id,
    author: { id: r.author_id, displayName: r.display_name },
    body: r.body,
    kind: r.kind,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  }));
}

export async function fetchLinks(db: Queryable, owner: { itemId?: string; taskId?: string }) {
  const res = await db.query<{ id: string; url: string; label: string }>(
    `SELECT id, url, label FROM links WHERE ($1::uuid IS NULL OR item_id = $1) AND ($2::uuid IS NULL OR task_id = $2) ORDER BY created_at`,
    [owner.itemId ?? null, owner.taskId ?? null],
  );
  return res.rows;
}

export async function fetchDependencies(
  db: Queryable,
  itemId: string,
): Promise<{ dependsOn: Dependency[]; dependents: Dependency[] }> {
  const rows = async (sql: string) =>
    (await db.query<Dependency>(sql, [itemId])).rows.map((r) => ({
      id: r.id,
      title: r.title,
      category: r.category,
      state: r.state,
    }));
  return {
    dependsOn: await rows(
      `SELECT b.id, b.title, b.category, b.state FROM item_dependencies d JOIN backlog_items b ON b.id = d.depends_on_item_id
        WHERE d.item_id = $1 ORDER BY d.created_at`,
    ),
    dependents: await rows(
      `SELECT b.id, b.title, b.category, b.state FROM item_dependencies d JOIN backlog_items b ON b.id = d.item_id
        WHERE d.depends_on_item_id = $1 ORDER BY d.created_at`,
    ),
  };
}

// ---------------------------------------------------------------------------------------------

/** Resolves the owner of a comment/attachment/link route: an item or a task in this project. */
async function resolveOwner(
  db: Queryable,
  projectId: string,
  params: { itemId?: string; taskId?: string },
) {
  if (params.itemId !== undefined) {
    if (!isUuid(params.itemId)) throw notFound('Backlog item not found');
    const r = await db.query('SELECT 1 FROM backlog_items WHERE project_id = $1 AND id = $2', [
      projectId,
      params.itemId,
    ]);
    if (!r.rowCount) throw notFound('Backlog item not found');
    return { itemId: params.itemId, entityType: 'backlog_item', entityId: params.itemId };
  }
  if (!isUuid(params.taskId ?? '')) throw notFound('Task not found');
  const r = await db.query('SELECT 1 FROM tasks WHERE project_id = $1 AND id = $2', [
    projectId,
    params.taskId,
  ]);
  if (!r.rowCount) throw notFound('Task not found');
  return { taskId: params.taskId!, entityType: 'task', entityId: params.taskId! };
}

/** An attachment's owner and the table that holds its cover. */
type CoverOwner = { itemId: string } | { taskId: string };
const coverTable = (owner: CoverOwner) =>
  'itemId' in owner
    ? { table: 'backlog_items', column: 'item_id', id: owner.itemId }
    : { table: 'tasks', column: 'task_id', id: owner.taskId };

/**
 * The owner's most recently attached previewable image becomes its cover, or none is left. Runs
 * when an image is attached and when the cover is deleted; a manual pick or clear holds until
 * the next image arrives. An item's cover belongs to the backlog, so only images from members
 * who may edit it qualify; any image qualifies for a task.
 */
async function coverWithLatestImage(
  tx: Queryable,
  owner: CoverOwner,
  projectId: string,
): Promise<void> {
  const { table, column, id } = coverTable(owner);
  const uploaders = 'itemId' in owner ? await backlogEditors(tx, projectId) : null;
  await tx.query(
    `UPDATE ${table} SET cover_attachment_id = (
        SELECT id FROM attachments WHERE ${column} = $1 AND content_type = ANY($2::text[])
           AND ($3::uuid[] IS NULL OR uploaded_by = ANY($3::uuid[]))
         ORDER BY created_at DESC, id DESC LIMIT 1
      ), version = version + 1, updated_at = now()
      WHERE id = $1`,
    [id, [...PREVIEW_IMAGE_TYPES], uploaders],
  );
}

/** Members who may edit the backlog, by the same rule the routes enforce. */
async function backlogEditors(tx: Queryable, projectId: string): Promise<string[]> {
  const members = await tx.query<{ user_id: string; roles: ProjectRole[]; can_accept: boolean }>(
    'SELECT user_id, roles::text[] AS roles, can_accept FROM project_memberships WHERE project_id = $1',
    [projectId],
  );
  return members.rows
    .filter((m) =>
      can({ roles: m.roles, canAccept: m.can_accept }, 'backlog.manage', { doneRestricted: false }),
    )
    .map((m) => m.user_id);
}

function isDirector(req: FastifyRequest): boolean {
  const { membership, project } = req.access!;
  return can(membership, 'backlog.manage', { doneRestricted: project.done_restricted });
}

export const collabRoutes: FastifyPluginAsync = async (app) => {
  const { db, storage, config } = app.ctx;

  // Comments on items and tasks -------------------------------------------------------------

  for (const owner of ['backlog/:itemId', 'tasks/:taskId'] as const) {
    app.post(
      `/projects/:projectId/${owner}/comments`,
      projectRoute('task.work'),
      async (req, reply) => {
        const parsed = commentSchema.safeParse(req.body);
        if (!parsed.success) throw badRequest('Invalid comment', parsed.error.flatten());
        const projectId = req.access!.project.id;
        const target = await resolveOwner(
          db,
          projectId,
          req.params as { itemId?: string; taskId?: string },
        );
        const created = await db.query<{ id: string }>(
          `INSERT INTO comments (project_id, item_id, task_id, author_id, body) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [projectId, target.itemId ?? null, target.taskId ?? null, req.user!.id, parsed.data.body],
        );
        const comments = await fetchComments(db, target);
        return reply.status(201).send(comments.find((c) => c.id === created.rows[0]!.id));
      },
    );
  }

  /** Authors edit their own comments; authors and Directors delete. Rejection comments are history and stay. */
  app.patch(
    '/projects/:projectId/comments/:commentId',
    projectRoute('task.work', { ownerScoped: true }),
    async (req) => {
      const parsed = commentSchema.safeParse(req.body);
      if (!parsed.success) throw badRequest('Invalid comment', parsed.error.flatten());
      const { commentId } = req.params as { commentId: string };
      const projectId = req.access!.project.id;
      if (!isUuid(commentId)) throw notFound('Comment not found');
      const row = (
        await db.query<{
          author_id: string;
          kind: string;
          item_id: string | null;
          task_id: string | null;
        }>(
          'SELECT author_id, kind, item_id, task_id FROM comments WHERE project_id = $1 AND id = $2',
          [projectId, commentId],
        )
      ).rows[0];
      if (!row) throw notFound('Comment not found');
      if (row.author_id !== req.user!.id)
        throw new HttpError(403, 'Only the author can edit a comment.');
      if (row.kind === 'rejection')
        throw conflict('Rejection notes are part of the review history and cannot be edited.');
      await db.query('UPDATE comments SET body = $2, updated_at = now() WHERE id = $1', [
        commentId,
        parsed.data.body,
      ]);
      const comments = await fetchComments(
        db,
        row.item_id ? { itemId: row.item_id } : { taskId: row.task_id! },
      );
      return comments.find((c) => c.id === commentId);
    },
  );

  app.delete(
    '/projects/:projectId/comments/:commentId',
    projectRoute('task.work', { ownerScoped: true }),
    async (req, reply) => {
      const { commentId } = req.params as { commentId: string };
      const projectId = req.access!.project.id;
      if (!isUuid(commentId)) throw notFound('Comment not found');
      const row = (
        await db.query<{ author_id: string; kind: string }>(
          'SELECT author_id, kind FROM comments WHERE project_id = $1 AND id = $2',
          [projectId, commentId],
        )
      ).rows[0];
      if (!row) throw notFound('Comment not found');
      if (row.author_id !== req.user!.id && !isDirector(req))
        throw new HttpError(403, 'Only the author or a Game Director can delete a comment.');
      if (row.kind === 'rejection')
        throw conflict('Rejection notes are part of the review history and cannot be deleted.');
      await db.query('DELETE FROM comments WHERE id = $1', [commentId]);
      return reply.status(204).send();
    },
  );

  // Links on tasks (item links live in the backlog routes) -------------------------------------

  app.post(
    '/projects/:projectId/tasks/:taskId/links',
    projectRoute('task.work'),
    async (req, reply) => {
      const parsed = linkSchema.safeParse(req.body);
      if (!parsed.success) throw badRequest('Invalid link', parsed.error.flatten());
      const projectId = req.access!.project.id;
      const target = await resolveOwner(db, projectId, req.params as { taskId: string });
      const created = await db.query<{ id: string; url: string; label: string }>(
        `INSERT INTO links (project_id, task_id, url, label, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id, url, label`,
        [projectId, target.taskId, parsed.data.url, parsed.data.label, req.user!.id],
      );
      return reply.status(201).send(created.rows[0]);
    },
  );

  app.delete(
    '/projects/:projectId/tasks/:taskId/links/:linkId',
    projectRoute('task.work'),
    async (req, reply) => {
      const { taskId, linkId } = req.params as { taskId: string; linkId: string };
      if (!isUuid(linkId) || !isUuid(taskId)) throw notFound('Link not found');
      const deleted = await db.query(
        'DELETE FROM links WHERE project_id = $1 AND task_id = $2 AND id = $3',
        [req.access!.project.id, taskId, linkId],
      );
      if (!deleted.rowCount) throw notFound('Link not found');
      return reply.status(204).send();
    },
  );

  // Attachments (T2) --------------------------------------------------------------------------

  for (const owner of ['backlog/:itemId', 'tasks/:taskId'] as const) {
    app.post(
      `/projects/:projectId/${owner}/attachments`,
      projectRoute('task.work'),
      async (req, reply) => {
        const projectId = req.access!.project.id;
        const target = await resolveOwner(
          db,
          projectId,
          req.params as { itemId?: string; taskId?: string },
        );
        const part = await req
          .file({ limits: { fileSize: config.attachmentMaxBytes } })
          .catch(() => null);
        if (!part) throw badRequest('Send one file as multipart form data.');
        const fileName = (part.filename || 'file').slice(0, 255);
        const contentType = (part.mimetype || 'application/octet-stream').slice(0, 200);
        const id = crypto.randomUUID();
        const key = `${projectId}/${id}`;
        let sizeBytes: number;
        try {
          ({ sizeBytes } = await storage.put(key, part.file, config.attachmentMaxBytes));
          if (part.file.truncated) throw new PayloadTooLarge();
        } catch (err) {
          await storage.delete(key);
          if (err instanceof PayloadTooLarge)
            throw new HttpError(
              413,
              `Files are limited to ${Math.round(config.attachmentMaxBytes / 1024 / 1024)} MB.`,
            );
          throw err;
        }
        // An item's cover belongs to the backlog, so only those who may edit it change it by
        // uploading; anyone who works a task may change the task's own cover.
        const becomesCover =
          PREVIEW_IMAGE_TYPES.has(contentType) && (target.taskId !== undefined || isDirector(req));
        await withTransaction(db, async (tx) => {
          await tx.query(
            `INSERT INTO attachments (id, project_id, item_id, task_id, uploaded_by, file_name, content_type, size_bytes, storage_key)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              id,
              projectId,
              target.itemId ?? null,
              target.taskId ?? null,
              req.user!.id,
              fileName,
              contentType,
              sizeBytes,
              key,
            ],
          );
          if (becomesCover)
            await coverWithLatestImage(
              tx,
              target.itemId ? { itemId: target.itemId } : { taskId: target.taskId! },
              projectId,
            );
          await recordActivity(tx, {
            projectId,
            actorId: req.user!.id,
            action: 'attachment.added',
            entityType: target.entityType,
            entityId: target.entityId,
            next: {
              attachmentId: id,
              fileName,
              sizeBytes,
              ...(becomesCover ? { cover: true } : {}),
            },
          });
        });
        const list = await fetchAttachments(db, target);
        return reply.status(201).send(list.find((a) => a.id === id));
      },
    );
  }

  /** Download: enforced on the server through project membership (Section 14). */
  app.get(
    '/projects/:projectId/attachments/:attachmentId',
    projectRoute('project.view'),
    async (req, reply) => {
      const { attachmentId } = req.params as { attachmentId: string };
      if (!isUuid(attachmentId)) throw notFound('Attachment not found');
      const row = (
        await db.query<{
          file_name: string;
          content_type: string;
          size_bytes: string;
          storage_key: string;
        }>(
          'SELECT file_name, content_type, size_bytes, storage_key FROM attachments WHERE project_id = $1 AND id = $2',
          [req.access!.project.id, attachmentId],
        )
      ).rows[0];
      if (!row) throw notFound('Attachment not found');
      const inline =
        PREVIEW_IMAGE_TYPES.has(row.content_type) &&
        (req.query as { inline?: string }).inline === '1';
      const stream = await storage.get(row.storage_key).catch(() => null);
      if (!stream) throw notFound('The file is missing from storage.');
      const safeName = encodeURIComponent(row.file_name);
      return reply
        .header('content-type', inline ? row.content_type : 'application/octet-stream')
        .header('content-length', row.size_bytes)
        .header(
          'content-disposition',
          `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${safeName}`,
        )
        .header('x-content-type-options', 'nosniff')
        .header('content-security-policy', "sandbox; default-src 'none'")
        .send(stream);
    },
  );

  /** A card-sized rendition of an image attachment: a 16:9 WebP, rendered once and kept. */
  app.get(
    '/projects/:projectId/attachments/:attachmentId/cover',
    projectRoute('project.view'),
    async (req, reply) => {
      const { attachmentId } = req.params as { attachmentId: string };
      if (!isUuid(attachmentId)) throw notFound('Attachment not found');
      const row = (
        await db.query<{ content_type: string; storage_key: string }>(
          'SELECT content_type, storage_key FROM attachments WHERE project_id = $1 AND id = $2',
          [req.access!.project.id, attachmentId],
        )
      ).rows[0];
      if (!row) throw notFound('Attachment not found');
      if (!PREVIEW_IMAGE_TYPES.has(row.content_type))
        throw notFound('Only PNG, JPEG, GIF, and WebP images have a cover.');
      const stream = await coverRendition(storage, row.storage_key).catch((err: unknown) => {
        if (err instanceof UnreadableImage) throw new HttpError(422, err.message);
        throw err;
      });
      if (!stream) throw notFound('The file is missing from storage.');
      return (
        reply
          .header('content-type', 'image/webp')
          .header('content-disposition', 'inline')
          // An attachment never changes under its id, so its rendition can be kept for good.
          .header('cache-control', 'private, max-age=31536000, immutable')
          .header('x-content-type-options', 'nosniff')
          .header('content-security-policy', "sandbox; default-src 'none'")
          .send(stream)
      );
    },
  );

  app.delete(
    '/projects/:projectId/attachments/:attachmentId',
    projectRoute('task.work', { ownerScoped: true }),
    async (req, reply) => {
      const { attachmentId } = req.params as { attachmentId: string };
      const projectId = req.access!.project.id;
      if (!isUuid(attachmentId)) throw notFound('Attachment not found');
      await withTransaction(db, async (tx) => {
        const found = (
          await tx.query<{ item_id: string | null; task_id: string | null }>(
            'SELECT item_id, task_id FROM attachments WHERE project_id = $1 AND id = $2',
            [projectId, attachmentId],
          )
        ).rows[0];
        const owner: CoverOwner | null = found?.item_id
          ? { itemId: found.item_id }
          : found?.task_id
            ? { taskId: found.task_id }
            : null;
        // Lock the owner before the attachment: the order a cover change takes through the
        // foreign key, so the two cannot deadlock.
        let wasCover = false;
        if (owner) {
          const { table, id } = coverTable(owner);
          const locked = await tx.query<{ cover_attachment_id: string | null }>(
            `SELECT cover_attachment_id FROM ${table} WHERE id = $1 FOR UPDATE`,
            [id],
          );
          wasCover = locked.rows[0]?.cover_attachment_id === attachmentId;
        }
        const row = (
          await tx.query<{
            uploaded_by: string;
            storage_key: string;
            file_name: string;
            item_id: string | null;
            task_id: string | null;
          }>(
            'SELECT uploaded_by, storage_key, file_name, item_id, task_id FROM attachments WHERE project_id = $1 AND id = $2 FOR UPDATE',
            [projectId, attachmentId],
          )
        ).rows[0];
        if (!row) throw notFound('Attachment not found');
        if (row.uploaded_by !== req.user!.id && !isDirector(req))
          throw new HttpError(
            403,
            'Only the uploader or a Game Director can delete an attachment.',
          );
        await tx.query('DELETE FROM attachments WHERE id = $1', [attachmentId]);
        if (wasCover && owner) await coverWithLatestImage(tx, owner, projectId);
        await recordActivity(tx, {
          projectId,
          actorId: req.user!.id,
          action: 'attachment.removed',
          entityType: row.item_id ? 'backlog_item' : 'task',
          entityId: row.item_id ?? row.task_id!,
          previous: { attachmentId, fileName: row.file_name },
        });
        await storage.delete(row.storage_key);
        await storage.delete(coverKey(row.storage_key));
      });
      return reply.status(204).send();
    },
  );

  // Dependencies (D9) ------------------------------------------------------------------------

  app.post(
    '/projects/:projectId/backlog/:itemId/dependencies',
    projectRoute('backlog.manage'),
    async (req, reply) => {
      const parsed = dependencySchema.safeParse(req.body);
      if (!parsed.success) throw badRequest('Invalid dependency', parsed.error.flatten());
      const { itemId } = req.params as { itemId: string };
      const projectId = req.access!.project.id;
      if (!isUuid(itemId)) throw notFound('Backlog item not found');
      if (parsed.data.dependsOnItemId === itemId)
        throw badRequest('An item cannot depend on itself.');
      const both = await db.query<{ id: string }>(
        'SELECT id FROM backlog_items WHERE project_id = $1 AND id = ANY($2::uuid[])',
        [projectId, [itemId, parsed.data.dependsOnItemId]],
      );
      if (both.rowCount !== 2) throw notFound('Backlog item not found');
      const inserted = await db.query(
        'INSERT INTO item_dependencies (item_id, depends_on_item_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [itemId, parsed.data.dependsOnItemId],
      );
      if (!inserted.rowCount) throw conflict('That dependency already exists.');
      await recordActivity(db, {
        projectId,
        actorId: req.user!.id,
        action: 'dependency.added',
        entityType: 'backlog_item',
        entityId: itemId,
        next: { dependsOnItemId: parsed.data.dependsOnItemId },
      });
      return reply.status(201).send(await fetchDependencies(db, itemId));
    },
  );

  app.delete(
    '/projects/:projectId/backlog/:itemId/dependencies/:dependsOnItemId',
    projectRoute('backlog.manage'),
    async (req) => {
      const { itemId, dependsOnItemId } = req.params as { itemId: string; dependsOnItemId: string };
      const projectId = req.access!.project.id;
      if (!isUuid(itemId) || !isUuid(dependsOnItemId)) throw notFound('Dependency not found');
      const owned = await db.query(
        'SELECT 1 FROM backlog_items WHERE project_id = $1 AND id = $2',
        [projectId, itemId],
      );
      if (!owned.rowCount) throw notFound('Backlog item not found');
      const deleted = await db.query(
        'DELETE FROM item_dependencies WHERE item_id = $1 AND depends_on_item_id = $2',
        [itemId, dependsOnItemId],
      );
      if (!deleted.rowCount) throw notFound('Dependency not found');
      await recordActivity(db, {
        projectId,
        actorId: req.user!.id,
        action: 'dependency.removed',
        entityType: 'backlog_item',
        entityId: itemId,
        previous: { dependsOnItemId },
      });
      return fetchDependencies(db, itemId);
    },
  );

  // Activity history (Section 14) --------------------------------------------------------------

  app.get(
    '/projects/:projectId/activity',
    projectRoute('project.view'),
    async (req): Promise<ActivityEntry[]> => {
      const q = req.query as { entityType?: string; entityId?: string; limit?: string };
      const projectId = req.access!.project.id;
      const limit = Math.min(Math.max(Number(q.limit) || 100, 1), 500);
      const params: unknown[] = [projectId, limit];
      let where = 'a.project_id = $1';
      if (q.entityType && q.entityId) {
        if (!isUuid(q.entityId)) throw badRequest('Invalid entity id');
        params.push(q.entityId);
        switch (q.entityType) {
          case 'backlog_item':
            // The item's own events plus those of its tasks.
            where += ` AND ((a.entity_type = 'backlog_item' AND a.entity_id = $3)
                      OR (a.entity_type = 'task' AND a.entity_id IN (SELECT id FROM tasks WHERE item_id = $3)))`;
            break;
          case 'task':
            where += ` AND ((a.entity_type = 'task' AND a.entity_id = $3)
                      OR (a.entity_type = 'work_request' AND a.entity_id IN (SELECT id FROM work_requests WHERE task_id = $3)))`;
            break;
          case 'workboard':
            // The board, its columns, scope changes on it, placements on it, and its requests.
            where += ` AND ((a.entity_type = 'workboard' AND a.entity_id = $3)
                      OR (a.entity_type = 'board_column' AND a.entity_id IN (SELECT id FROM board_columns WHERE board_id = $3))
                      OR (a.entity_type = 'work_request' AND a.entity_id IN (SELECT id FROM work_requests WHERE board_id = $3))
                      OR a.next->>'boardId' = $3::text OR a.next->>'onBoard' = $3::text)`;
            break;
          default:
            throw badRequest('Unknown entity type');
        }
      }
      const res = await db.query<{
        id: string;
        action: string;
        entity_type: string;
        entity_id: string;
        actor_id: string | null;
        display_name: string | null;
        previous: unknown;
        next: unknown;
        created_at: Date;
      }>(
        `SELECT a.id, a.action, a.entity_type, a.entity_id, a.actor_id, u.display_name, a.previous, a.next, a.created_at
         FROM activity a LEFT JOIN users u ON u.id = a.actor_id
        WHERE ${where} ORDER BY a.id DESC LIMIT $2`,
        params,
      );
      return res.rows.map((r) => ({
        id: Number(r.id),
        action: r.action,
        entityType: r.entity_type,
        entityId: r.entity_id,
        actor:
          r.actor_id && r.display_name ? { id: r.actor_id, displayName: r.display_name } : null,
        previous: r.previous,
        next: r.next,
        createdAt: r.created_at.toISOString(),
      }));
    },
  );
};
