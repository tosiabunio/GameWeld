import {
  PROJECT_ROLES,
  type ProjectInvitation,
  type ProjectMember,
  type ProjectRole,
} from '@gameweld/domain';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { recordActivity } from '../activity.ts';
import { projectRoute } from '../authz.ts';
import { avatarUrl } from '../avatars.ts';
import { withTransaction, type Queryable } from '../db.ts';
import { badRequest, conflict, notFound } from '../errors.ts';
import * as schema from '../schemas.ts';

const rolesSchema = z
  .array(z.enum(PROJECT_ROLES))
  .min(1)
  .transform((r) => [...new Set(r)]);

const addSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
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

export async function projectInvitations(
  db: Queryable,
  projectId: string,
  invitationId?: string,
): Promise<ProjectInvitation[]> {
  const res = await db.query<{
    id: string;
    email: string;
    roles: ProjectRole[];
    can_accept: boolean;
    invited_by: string | null;
    created_at: Date;
  }>(
    `SELECT i.id, i.email, i.roles::text[] AS roles, i.can_accept, u.display_name AS invited_by,
            i.created_at
       FROM project_invitations i LEFT JOIN users u ON u.id = i.invited_by
      WHERE i.project_id = $1 AND ($2::uuid IS NULL OR i.id = $2)
      ORDER BY i.created_at`,
    [projectId, invitationId ?? null],
  );
  return res.rows.map((i) => ({
    id: i.id,
    email: i.email,
    roles: i.roles,
    canAccept: i.can_accept,
    invitedBy: i.invited_by,
    createdAt: i.created_at.toISOString(),
  }));
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

  app.post(
    '/projects/:projectId/members',
    projectRoute('members.manage', {
      id: 'addMember',
      summary: 'Add a member, or invite an address that has no account yet',
      description:
        'An address that has an account on this instance becomes a member at once (201). Any other address is invited (202): its first sign-in with that address makes it a member. GameWeld sends no e-mail.',
      body: addSchema,
      response: [
        { status: 201, schema: schema.ProjectMember, description: 'Added' },
        { status: 202, schema: schema.ProjectInvitation, description: 'Invited' },
      ],
    }),
    async (req, reply) => {
      const parsed = addSchema.safeParse(req.body);
      if (!parsed.success) throw badRequest('Invalid member', parsed.error.flatten());
      const { email, roles, canAccept } = parsed.data;
      const projectId = req.access!.project.id;

      // Someone who has signed in before becomes a member now (201). Anyone else gets an
      // invitation (202), which their first sign-in with that address turns into a membership.
      const result = await withTransaction(db, async (tx) => {
        const user = await tx.query<{ id: string }>(
          'SELECT id FROM users WHERE lower(email) = $1 ORDER BY created_at LIMIT 1',
          [email],
        );
        const userId = user.rows[0]?.id;
        if (!userId) {
          const invited = await tx.query<{ id: string }>(
            `INSERT INTO project_invitations (project_id, email, roles, can_accept, invited_by)
             VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING RETURNING id`,
            [projectId, email, roles, canAccept, req.user!.id],
          );
          const invitationId = invited.rows[0]?.id;
          if (!invitationId) throw conflict('That address is already invited.');
          await recordActivity(tx, {
            projectId,
            actorId: req.user!.id,
            action: 'member.invited',
            entityType: 'invitation',
            entityId: invitationId,
            next: { email, roles, canAccept },
          });
          return { invitation: (await projectInvitations(tx, projectId, invitationId))[0]! };
        }
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
        return { member: (await memberById(tx, projectId, userId))! };
      });
      return 'member' in result
        ? reply.status(201).send(result.member)
        : reply.status(202).send(result.invitation);
    },
  );

  app.delete(
    '/projects/:projectId/invitations/:invitationId',
    projectRoute('members.manage', {
      id: 'cancelInvitation',
      summary: 'Cancel an invitation',
      response: null,
    }),
    async (req, reply) => {
      const projectId = req.access!.project.id;
      const { invitationId } = req.params as { invitationId: string };
      if (!/^[0-9a-f-]{36}$/i.test(invitationId)) throw notFound('Invitation not found');
      await withTransaction(db, async (tx) => {
        const deleted = await tx.query<{ email: string }>(
          'DELETE FROM project_invitations WHERE project_id = $1 AND id = $2 RETURNING email',
          [projectId, invitationId],
        );
        const email = deleted.rows[0]?.email;
        if (!email) throw notFound('Invitation not found');
        await recordActivity(tx, {
          projectId,
          actorId: req.user!.id,
          action: 'invitation.cancelled',
          entityType: 'invitation',
          entityId: invitationId,
          previous: { email },
        });
      });
      return reply.status(204).send();
    },
  );

  app.patch(
    '/projects/:projectId/members/:userId',
    projectRoute('members.manage', {
      id: 'updateMember',
      summary: 'Change a member’s roles, or whether they may accept items',
      description: 'A project always keeps at least one Game Director.',
      body: updateSchema,
      response: schema.ProjectMember,
    }),
    async (req) => {
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
    },
  );

  app.delete(
    '/projects/:projectId/members/:userId',
    projectRoute('members.manage', {
      id: 'removeMember',
      summary: 'Remove a member from the project',
      description:
        'Their unfinished tasks are left unassigned. A project always keeps at least one Game Director.',
      response: null,
    }),
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
        // Work still to do must not stay with someone who can no longer see the project: their
        // unfinished tasks go back to nobody. Finished tasks keep the name of who did them.
        const handedBack = await tx.query<{ id: string }>(
          `UPDATE tasks SET assignee_id = NULL, version = version + 1, updated_at = now()
            WHERE project_id = $1 AND assignee_id = $2 AND NOT completed RETURNING id`,
          [projectId, userId],
        );
        for (const task of handedBack.rows) {
          await tx.query('DELETE FROM my_task_ranks WHERE task_id = $1', [task.id]);
          await recordActivity(tx, {
            projectId,
            actorId: req.user!.id,
            action: 'task.updated',
            entityType: 'task',
            entityId: task.id,
            previous: { assigneeId: userId },
            next: { assigneeId: null, reason: 'member removed' },
          });
        }
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
