import type { ProjectRole, ProjectSummary } from '@gameweld/domain';
import type { FastifyPluginAsync } from 'fastify';
import { requireUser } from '../auth.ts';

export const projectRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app.ctx;

  app.get('/projects', { preHandler: requireUser }, async (req): Promise<ProjectSummary[]> => {
    const res = await db.query<{
      id: string;
      name: string;
      description: string;
      roles: ProjectRole[];
      can_accept: boolean;
      done_restricted: boolean;
      scope_limit: number;
      item_count: string;
    }>(
      `SELECT p.id, p.name, p.description, m.roles::text[] AS roles, m.can_accept, p.done_restricted, p.scope_limit,
              (SELECT count(*) FROM backlog_items b WHERE b.project_id = p.id AND b.archived_at IS NULL) AS item_count
         FROM projects p
         JOIN project_memberships m ON m.project_id = p.id AND m.user_id = $1
        WHERE p.archived_at IS NULL
        ORDER BY p.created_at`,
      [req.user!.id],
    );
    return res.rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      roles: r.roles,
      canAccept: r.can_accept,
      doneRestricted: r.done_restricted,
      scopeLimit: r.scope_limit,
      itemCount: Number(r.item_count),
    }));
  });
};
