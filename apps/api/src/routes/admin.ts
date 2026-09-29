import {
  INSTANCE_ROLES,
  type InstanceInvitation,
  type InstancePeople,
  type InstancePerson,
} from '@gameweld/domain';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireSession } from '../auth.ts';
import { avatarUrl } from '../avatars.ts';
import { withTransaction, type Queryable } from '../db.ts';
import { isPersonaEmail, personaSql } from '../demo.ts';
import { badRequest, conflict, notFound } from '../errors.ts';
import type { RouteDoc } from '../openapi.ts';
import * as schema from '../schemas.ts';

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  as: z.enum(INSTANCE_ROLES),
});

const updateSchema = z.object({
  isAdmin: z.boolean().optional(),
  canCreateProjects: z.boolean().optional(),
});

async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.user?.isAdmin)
    await reply.status(403).send({ message: 'Only an admin of this instance may do this.' });
}

/** An admin's route: a browser session, so an API token cannot grant rights to anyone. */
const adminRoute = (doc: RouteDoc) => ({
  config: { doc },
  preHandler: [requireSession, requireAdmin],
});

interface PersonRow {
  id: string;
  display_name: string;
  email: string | null;
  avatar_id: string | null;
  is_admin: boolean;
  can_create_projects: boolean;
  project_count: string;
}

const toPerson = (r: PersonRow): InstancePerson => ({
  id: r.id,
  displayName: r.display_name,
  email: r.email,
  avatarUrl: avatarUrl(r.id, r.avatar_id),
  isAdmin: r.is_admin,
  canCreateProjects: r.can_create_projects,
  projectCount: Number(r.project_count),
});

// The personas are the demo's, not people of the instance: no admin page lists or changes them.
async function people(db: Queryable, userId?: string): Promise<InstancePerson[]> {
  const res = await db.query<PersonRow>(
    `SELECT u.id, u.display_name, u.email, u.avatar_id, u.is_admin, u.can_create_projects,
            (SELECT count(*) FROM project_memberships m WHERE m.user_id = u.id) AS project_count
       FROM users u
      WHERE NOT ${personaSql('u.id')} AND ($1::uuid IS NULL OR u.id = $1)
      ORDER BY u.display_name`,
    [userId ?? null],
  );
  return res.rows.map(toPerson);
}

async function invitations(db: Queryable, id?: string): Promise<InstanceInvitation[]> {
  const res = await db.query<{
    id: string;
    email: string;
    is_admin: boolean;
    can_create_projects: boolean;
    invited_by: string | null;
    created_at: Date;
  }>(
    `SELECT i.id, i.email, i.is_admin, i.can_create_projects, u.display_name AS invited_by,
            i.created_at
       FROM instance_invitations i LEFT JOIN users u ON u.id = i.invited_by
      WHERE $1::uuid IS NULL OR i.id = $1
      ORDER BY i.created_at`,
    [id ?? null],
  );
  return res.rows.map((i) => ({
    id: i.id,
    email: i.email,
    isAdmin: i.is_admin,
    canCreateProjects: i.can_create_projects,
    invitedBy: i.invited_by,
    createdAt: i.created_at.toISOString(),
  }));
}

/** The instance must keep one admin, or nobody could appoint the next. */
async function assertAdminRemains(tx: Queryable, exceptUserId: string): Promise<void> {
  const res = await tx.query('SELECT 1 FROM users WHERE is_admin AND id <> $1 LIMIT 1', [
    exceptUserId,
  ]);
  if (!res.rowCount) throw conflict('The instance needs at least one admin.');
}

/**
 * The Administration page: who has an account, who is admin, who may create projects (the
 * instance's Game Directors), and admins' invitations for people who have not signed in yet.
 */
export const adminRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app.ctx;

  app.get(
    '/admin/people',
    adminRoute({
      id: 'listInstancePeople',
      summary: 'Everyone with an account, and pending admin invitations',
      description: 'Admins only. The demo personas are not listed.',
      response: schema.InstancePeople,
    }),
    async (): Promise<InstancePeople> => ({
      people: await people(db),
      invitations: await invitations(db),
    }),
  );

  app.post(
    '/admin/invitations',
    adminRoute({
      id: 'inviteToInstance',
      summary: 'Make someone an admin, or let them create projects',
      description:
        'Admins only. `as: director` lets them create projects and lead them as Game Director; `as: admin` makes them an admin, who may do everything. Someone with an account gets it at once (201); anyone else is invited (202), and their first sign-in with that address, with Google, gives it to them. GameWeld sends no e-mail.',
      body: inviteSchema,
      response: [
        { status: 201, schema: schema.InstancePerson, description: 'Given' },
        { status: 202, schema: schema.InstanceInvitation, description: 'Invited' },
      ],
    }),
    async (req, reply) => {
      const parsed = inviteSchema.safeParse(req.body);
      if (!parsed.success) throw badRequest('Invalid invitation', parsed.error.flatten());
      const { email, as } = parsed.data;
      if (isPersonaEmail(email)) throw badRequest('The demo personas cannot be given rights.');
      const admin = as === 'admin';
      const result = await withTransaction(db, async (tx) => {
        const user = await tx.query<{ id: string }>(
          'SELECT id FROM users WHERE lower(email) = $1 ORDER BY created_at LIMIT 1',
          [email],
        );
        const userId = user.rows[0]?.id;
        if (userId) {
          await tx.query(
            admin
              ? 'UPDATE users SET is_admin = true WHERE id = $1'
              : 'UPDATE users SET can_create_projects = true WHERE id = $1',
            [userId],
          );
          return { person: (await people(tx, userId))[0]! };
        }
        const invited = await tx.query<{ id: string }>(
          `INSERT INTO instance_invitations (email, is_admin, can_create_projects, invited_by)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (email) DO UPDATE
             SET is_admin = instance_invitations.is_admin OR EXCLUDED.is_admin,
                 can_create_projects = instance_invitations.can_create_projects
                                       OR EXCLUDED.can_create_projects
           RETURNING id`,
          [email, admin, !admin, req.user!.id],
        );
        return { invitation: (await invitations(tx, invited.rows[0]!.id))[0]! };
      });
      return 'person' in result
        ? reply.status(201).send(result.person)
        : reply.status(202).send(result.invitation);
    },
  );

  app.delete(
    '/admin/invitations/:invitationId',
    adminRoute({
      id: 'cancelInstanceInvitation',
      summary: 'Cancel an admin’s invitation',
      description: 'Admins only.',
      response: null,
    }),
    async (req, reply) => {
      const { invitationId } = req.params as { invitationId: string };
      if (!/^[0-9a-f-]{36}$/i.test(invitationId)) throw notFound('Invitation not found');
      const res = await db.query('DELETE FROM instance_invitations WHERE id = $1', [invitationId]);
      if (!res.rowCount) throw notFound('Invitation not found');
      return reply.status(204).send();
    },
  );

  app.patch(
    '/admin/people/:userId',
    adminRoute({
      id: 'updateInstancePerson',
      summary: 'Make someone an admin or not, or let them create projects or not',
      description:
        'Admins only. The instance keeps at least one admin. Projects someone already leads stay theirs when they may no longer create new ones.',
      body: updateSchema,
      response: schema.InstancePerson,
    }),
    async (req) => {
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) throw badRequest('Invalid change', parsed.error.flatten());
      const { isAdmin, canCreateProjects } = parsed.data;
      const { userId } = req.params as { userId: string };
      if (!/^[0-9a-f-]{36}$/i.test(userId)) throw notFound('Account not found');
      return withTransaction(db, async (tx) => {
        // One change of admins at a time, so two cannot each remove the other.
        await tx.query('SELECT pg_advisory_xact_lock(727002)');
        const before = (await people(tx, userId))[0];
        if (!before) throw notFound('Account not found');
        if (before.isAdmin && isAdmin === false) await assertAdminRemains(tx, userId);
        await tx.query(
          `UPDATE users SET is_admin = COALESCE($2, is_admin),
                            can_create_projects = COALESCE($3, can_create_projects)
            WHERE id = $1`,
          [userId, isAdmin ?? null, canCreateProjects ?? null],
        );
        return (await people(tx, userId))[0]!;
      });
    },
  );
};
