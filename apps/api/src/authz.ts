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
import type { RouteDoc } from './openapi.ts';

export interface ProjectRow {
  id: string;
  name: string;
  description: string;
  done_restricted: boolean;
  scope_limit: number;
  archived_at: Date | null;
  version: number;
  /** A demo project, which takes only personas and goes with a demo reset. */
  demo: boolean;
}

export interface ProjectAccess {
  project: ProjectRow;
  /**
   * What the rules see: the member's own roles, or, for an admin, a Game Director and Tester who
   * may accept, so every rule lets them through.
   */
  membership: Membership & { roles: ProjectRole[] };
  permissions: Permissions;
  /** An admin: may do everything here, member or not. */
  admin: boolean;
}

/** An admin passes every rule of every project (docs/api.md, "Admins"). */
const ADMIN_MEMBERSHIP = { roles: ['director', 'tester'] as ProjectRole[], canAccept: true };

declare module 'fastify' {
  interface FastifyRequest {
    access: ProjectAccess | null;
  }
  interface FastifyContextConfig {
    projectAction?: ProjectAction;
    /** The handler applies an ownership rule (author, uploader, requester) on top of the matrix. */
    ownerScoped?: boolean;
  }
}

/**
 * Loads the project and the user's membership in one query. Null when the project is missing, or
 * the user is neither a member nor an admin.
 */
export async function loadAccess(
  db: Queryable,
  projectId: string,
  user: { id: string; isAdmin: boolean },
): Promise<ProjectAccess | null> {
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return null;
  const res = await db.query<ProjectRow & { roles: ProjectRole[] | null; can_accept: boolean }>(
    `SELECT p.id, p.name, p.description, p.done_restricted, p.scope_limit, p.archived_at, p.version,
            p.demo, m.roles::text[] AS roles, m.can_accept
       FROM projects p
       LEFT JOIN project_memberships m ON m.project_id = p.id AND m.user_id = $2
      WHERE p.id = $1`,
    [projectId, user.id],
  );
  const row = res.rows[0];
  if (!row || (!row.roles && !user.isAdmin)) return null;
  const { roles, can_accept, ...project } = row;
  const membership = user.isAdmin ? ADMIN_MEMBERSHIP : { roles: roles!, canAccept: can_accept };
  return {
    project,
    membership,
    permissions: permissionsFor(membership, { doneRestricted: project.done_restricted }),
    admin: user.isAdmin,
  };
}

/**
 * preHandler for project-scoped routes. Reads the action the route declared in its config,
 * loads membership, and answers 404 for non-members other than admins (the project is not visible
 * to them) or 403 for members without the permission. Handlers then find `req.access` populated.
 */
export async function checkProjectAction(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const action = req.routeOptions.config.projectAction;
  if (!isProjectAction(action)) throw new Error('route is missing config.projectAction');
  const params = req.params as { projectId?: string };
  const access = await loadAccess(req.server.ctx.db, params.projectId ?? '', req.user!);
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

/**
 * Route options that declare the permission a project-scoped route requires, and describe the
 * route for the OpenAPI description.
 */
export function projectRoute(
  action: ProjectAction,
  doc: RouteDoc,
  options: { ownerScoped?: boolean } = {},
): RouteShorthandOptions {
  return {
    config: { projectAction: action, doc, ...(options.ownerScoped ? { ownerScoped: true } : {}) },
    preHandler: [requireUser, checkProjectAction],
  };
}
