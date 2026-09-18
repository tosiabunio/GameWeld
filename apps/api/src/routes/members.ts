import { PROJECT_ROLES, type ProjectMember, type ProjectRole } from '@gameweld/domain';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { recordActivity } from '../activity.ts';
import { projectRoute } from '../authz.ts';
import { avatarUrl } from '../avatars.ts';
import { withTransaction, type Queryable } from '../db.ts';
import { badRequest, conflict, notFound } from '../errors.ts';

const rolesSchema = z
  .array(z.enum(PROJECT_ROLES))
  .min(1)
  .transform((r) => [...new Set(r)]);

const addSchema = z.object({
  email: z.string().trim().email(),
  roles: rolesSchema,
  canAccept: z.boolean().default(false),
});

const updateSchema = z.object({
  roles: rolesSchema.optional(),
  canAccept: z.boolean().optional(),
});

async function memberById(
  db: Queryable,
  projectId: string,
  userId: string,
): Promise<ProjectMember | null> {
  const res = await db.query<{
    user_id: string;
    display_name: string;
    email: string | null;
    roles: ProjectRole[];
    can_accept: boolean;
    avatar_id: string | null;
  }>(
    `SELECT m.user_id, u.display_name, u.email, m.roles::text[] AS roles, m.can_accept, u.avatar_id
       FROM project_memberships m JOIN users u ON u.id = m.user_id
      WHERE m.project_id = $1 AND m.user_id = $2`,
    [projectId, userId],
  );
  const m = res.rows[0];
  return m
    ? {
        userId: m.user_id,
        displayName: m.display_name,
        email: m.email,
        roles: m.roles,
        canAccept: m.can_accept,
        avatarUrl: avatarUrl(m.user_id, m.avatar_id),
      }
    : null;
}

/** A project must always keep at least one Game Director. */
async function assertDirectorRemains(
  tx: Queryable,
  projectId: string,
  exceptUserId: string,
): Promise<void> {
  const res = await tx.query(
    `SELECT 1 FROM project_memberships WHERE project_id = $1 AND user_id <> $2 AND 'director' = ANY(roles) LIMIT 1`,
    [projectId, exceptUserId],
  );
  if (!res.rowCount) throw conflict('A project needs at least one Game Director.');
}

export const memberRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app.ctx;

  app.post('/projects/:projectId/members', projectRoute('members.manage'), async (req, reply) => {
    const parsed = addSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid member', parsed.error.flatten());
    const { email, roles, canAccept } = parsed.data;
    const projectId = req.access!.project.id;

    const member = await withTransaction(db, async (tx) => {
      const user = await tx.query<{ id: string }>(
        'SELECT id FROM users WHERE lower(email) = lower($1)',
        [email],
      );
      const userId = user.rows[0]?.id;
      if (!userId) throw notFound('No user with that email has signed in yet.');
      const inserted = await tx.query(
        `INSERT INTO project_memberships (project_id, user_id, roles, can_accept)
         VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
        [projectId, userId, roles, canAccept],
      );
      if (!inserted.rowCount) throw conflict('That user is already a member.');
      await recordActivity(tx, {
        projectId,
        actorId: req.user!.id,
        action: 'member.added',
        entityType: 'user',
        entityId: userId,
        next: { roles, canAccept },
      });
      return (await memberById(tx, projectId, userId))!;
    });
    return reply.status(201).send(member);
  });

  app.patch('/projects/:projectId/members/:userId', projectRoute('members.manage'), async (req) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid member update', parsed.error.flatten());
    const { roles, canAccept } = parsed.data;
    const projectId = req.access!.project.id;
    const { userId } = req.params as { userId: string };

    return withTransaction(db, async (tx) => {
      await tx.query('SELECT 1 FROM projects WHERE id = $1 FOR UPDATE', [projectId]);
      const before = await memberById(tx, projectId, userId);
      if (!before) throw notFound('Member not found');
      const nextRoles = roles ?? before.roles;
      if (before.roles.includes('director') && !nextRoles.includes('director')) {
        await assertDirectorRemains(tx, projectId, userId);
      }
      await tx.query(
        'UPDATE project_memberships SET roles = $3, can_accept = $4 WHERE project_id = $1 AND user_id = $2',
        [projectId, userId, nextRoles, canAccept ?? before.canAccept],
      );
      const after = (await memberById(tx, projectId, userId))!;
      await recordActivity(tx, {
        projectId,
        actorId: req.user!.id,
        action: 'member.updated',
        entityType: 'user',
        entityId: userId,
        previous: { roles: before.roles, canAccept: before.canAccept },
        next: { roles: after.roles, canAccept: after.canAccept },
      });
      return after;
    });
  });

  app.delete(
    '/projects/:projectId/members/:userId',
    projectRoute('members.manage'),
    async (req, reply) => {
      const projectId = req.access!.project.id;
      const { userId } = req.params as { userId: string };

      await withTransaction(db, async (tx) => {
        await tx.query('SELECT 1 FROM projects WHERE id = $1 FOR UPDATE', [projectId]);
        const before = await memberById(tx, projectId, userId);
        if (!before) throw notFound('Member not found');
        if (before.roles.includes('director')) await assertDirectorRemains(tx, projectId, userId);
        await tx.query('DELETE FROM project_memberships WHERE project_id = $1 AND user_id = $2', [
          projectId,
          userId,
        ]);
        await recordActivity(tx, {
          projectId,
          actorId: req.user!.id,
          action: 'member.removed',
          entityType: 'user',
          entityId: userId,
          previous: { roles: before.roles, canAccept: before.canAccept },
        });
      });
      return reply.status(204).send();
    },
  );
};
