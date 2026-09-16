import {
  can,
  isProjectAction,
  permissionsFor,
  type Membership,
  type Permissions,
  type ProjectAction,
  type ProjectRole,
} from '@gameweld/domain';
import type { FastifyReply, FastifyRequest, RouteShorthandOptions } from 'fastify';
import { requireUser } from './auth.ts';
import type { Queryable } from './db.ts';

export interface ProjectRow {
  id: string;
  name: string;
  description: string;
  done_restricted: boolean;
  scope_limit: number;
  archived_at: Date | null;
  version: number;
}

export interface ProjectAccess {
  project: ProjectRow;
  membership: Membership & { roles: ProjectRole[] };
  permissions: Permissions;
}

declare module 'fastify' {
  interface FastifyRequest {
    access: ProjectAccess | null;
  }
  interface FastifyContextConfig {
    projectAction?: ProjectAction;
  }
}

/** Loads the project and the user's membership in one query. Null when either is missing. */
export async function loadAccess(
  db: Queryable,
  projectId: string,
  userId: string,
): Promise<ProjectAccess | null> {
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return null;
  const res = await db.query<ProjectRow & { roles: ProjectRole[]; can_accept: boolean }>(
    `SELECT p.id, p.name, p.description, p.done_restricted, p.scope_limit, p.archived_at, p.version,
            m.roles::text[] AS roles, m.can_accept
       FROM projects p
       JOIN project_memberships m ON m.project_id = p.id AND m.user_id = $2
      WHERE p.id = $1`,
    [projectId, userId],
  );
  const row = res.rows[0];
  if (!row) return null;
  const { roles, can_accept, ...project } = row;
  const membership = { roles, canAccept: can_accept };
  return {
    project,
    membership,
    permissions: permissionsFor(membership, { doneRestricted: project.done_restricted }),
  };
}

/**
 * preHandler for project-scoped routes. Reads the action the route declared in its config,
 * loads membership, and answers 404 for non-members (the project is not visible to them) or
 * 403 for members without the permission. Handlers then find `req.access` populated.
 */
export async function checkProjectAction(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const action = req.routeOptions.config.projectAction;
  if (!isProjectAction(action)) throw new Error('route is missing config.projectAction');
  const params = req.params as { projectId?: string };
  const access = await loadAccess(req.server.ctx.db, params.projectId ?? '', req.user!.id);
  if (!access) {
    await reply.status(404).send({ message: 'Project not found' });
    return;
  }
  if (!can(access.membership, action, { doneRestricted: access.project.done_restricted })) {
    await reply.status(403).send({ message: 'Not permitted' });
    return;
  }
  req.access = access;
}

/** Route options that declare the permission a project-scoped route requires. */
export function projectRoute(action: ProjectAction): RouteShorthandOptions {
  return { config: { projectAction: action }, preHandler: [requireUser, checkProjectAction] };
}
