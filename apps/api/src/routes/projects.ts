import type { ProjectDetail, ProjectRole, ProjectSummary } from '@gameweld/domain';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { recordActivity } from '../activity.ts';
import { requireUser } from '../auth.ts';
import { loadAccess, projectRoute, type ProjectRow } from '../authz.ts';
import { avatarUrl } from '../avatars.ts';
import { fetchLabels } from './labels.ts';
import { withTransaction } from '../db.ts';
import { badRequest, conflict } from '../errors.ts';

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(5000).default(''),
  doneRestricted: z.boolean().default(false),
  scopeLimit: z.number().int().min(1).max(1000).default(5),
});

const updateSchema = z.object({
  version: z.number().int(),
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  doneRestricted: z.boolean().optional(),
  scopeLimit: z.number().int().min(1).max(1000).optional(),
  archived: z.boolean().optional(),
});

interface SummaryRow extends ProjectRow {
  roles: ProjectRole[];
  can_accept: boolean;
  item_count: string;
}

function toSummary(r: SummaryRow): ProjectSummary {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    roles: r.roles,
    canAccept: r.can_accept,
    doneRestricted: r.done_restricted,
    scopeLimit: r.scope_limit,
    itemCount: Number(r.item_count),
    archived: r.archived_at !== null,
    version: r.version,
  };
}

const summarySelect = `
  SELECT p.id, p.name, p.description, p.done_restricted, p.scope_limit, p.archived_at, p.version,
         m.roles::text[] AS roles, m.can_accept,
         (SELECT count(*) FROM backlog_items b WHERE b.project_id = p.id AND b.archived_at IS NULL) AS item_count
    FROM projects p
    JOIN project_memberships m ON m.project_id = p.id AND m.user_id = $1`;

export const projectRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app.ctx;

  app.get('/projects', { preHandler: requireUser }, async (req): Promise<ProjectSummary[]> => {
    const query = req.query as { archived?: string };
    const archived = query.archived === 'true';
    const res = await db.query<SummaryRow>(
      `${summarySelect} WHERE p.archived_at IS ${archived ? 'NOT NULL' : 'NULL'} ORDER BY p.created_at`,
      [req.user!.id],
    );
    return res.rows.map(toSummary);
  });

  // Any signed-in user may create a project and becomes its first Game Director.
  app.post('/projects', { preHandler: requireUser }, async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid project', parsed.error.flatten());
    const input = parsed.data;
    const userId = req.user!.id;

    const projectId = await withTransaction(db, async (tx) => {
      const created = await tx.query<{ id: string }>(
        `INSERT INTO projects (name, description, done_restricted, scope_limit)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [input.name, input.description, input.doneRestricted, input.scopeLimit],
      );
      const id = created.rows[0]!.id;
      await tx.query(
        `INSERT INTO project_memberships (project_id, user_id, roles) VALUES ($1, $2, '{director}')`,
        [id, userId],
      );
      await recordActivity(tx, {
        projectId: id,
        actorId: userId,
        action: 'project.created',
        entityType: 'project',
        entityId: id,
        next: input,
      });
      return id;
    });

    const res = await db.query<SummaryRow>(`${summarySelect} WHERE p.id = $2`, [userId, projectId]);
    return reply.status(201).send(toSummary(res.rows[0]!));
  });

  app.get(
    '/projects/:projectId',
    projectRoute('project.view'),
    async (req): Promise<ProjectDetail> => {
      const { project, permissions } = req.access!;
      const [summary, members] = await Promise.all([
        db.query<SummaryRow>(`${summarySelect} WHERE p.id = $2`, [req.user!.id, project.id]),
        db.query<{
          user_id: string;
          display_name: string;
          email: string | null;
          roles: ProjectRole[];
          can_accept: boolean;
          avatar_id: string | null;
        }>(
          `SELECT m.user_id, u.display_name, u.email, m.roles::text[] AS roles, m.can_accept, u.avatar_id
           FROM project_memberships m JOIN users u ON u.id = m.user_id
          WHERE m.project_id = $1 ORDER BY m.created_at`,
          [project.id],
        ),
      ]);
      return {
        ...toSummary(summary.rows[0]!),
        members: members.rows.map((m) => ({
          userId: m.user_id,
          displayName: m.display_name,
          email: m.email,
          roles: m.roles,
          canAccept: m.can_accept,
          avatarUrl: avatarUrl(m.user_id, m.avatar_id),
        })),
        permissions,
        labels: await fetchLabels(db, project.id),
      };
    },
  );

  app.patch('/projects/:projectId', projectRoute('project.settings'), async (req) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid settings', parsed.error.flatten());
    const { version, archived, ...fields } = parsed.data;
    const { project } = req.access!;
    const userId = req.user!.id;

    await withTransaction(db, async (tx) => {
      const locked = await tx.query<ProjectRow>(
        'SELECT id, name, description, done_restricted, scope_limit, archived_at, version FROM projects WHERE id = $1 FOR UPDATE',
        [project.id],
      );
      const current = locked.rows[0]!;
      if (current.version !== version) {
        throw conflict('The project was changed by someone else. Reload and try again.', {
          currentVersion: current.version,
        });
      }
      const next = {
        name: fields.name ?? current.name,
        description: fields.description ?? current.description,
        done_restricted: fields.doneRestricted ?? current.done_restricted,
        scope_limit: fields.scopeLimit ?? current.scope_limit,
        archived_at:
          archived === undefined
            ? current.archived_at
            : archived
              ? (current.archived_at ?? new Date())
              : null,
      };
      await tx.query(
        `UPDATE projects SET name = $2, description = $3, done_restricted = $4, scope_limit = $5,
                             archived_at = $6, version = version + 1 WHERE id = $1`,
        [
          project.id,
          next.name,
          next.description,
          next.done_restricted,
          next.scope_limit,
          next.archived_at,
        ],
      );
      await recordActivity(tx, {
        projectId: project.id,
        actorId: userId,
        action: 'project.updated',
        entityType: 'project',
        entityId: project.id,
        previous: pick(current),
        next: pick({ ...current, ...next }),
      });
    });

    const access = (await loadAccess(db, project.id, userId))!;
    const res = await db.query<SummaryRow>(`${summarySelect} WHERE p.id = $2`, [
      userId,
      project.id,
    ]);
    return { ...toSummary(res.rows[0]!), permissions: access.permissions };
  });
};

function pick(p: ProjectRow) {
  return {
    name: p.name,
    description: p.description,
    doneRestricted: p.done_restricted,
    scopeLimit: p.scope_limit,
    archived: p.archived_at !== null,
  };
}
