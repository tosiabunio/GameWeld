import { LABEL_COLORS, type Label } from '@gameweld/domain';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { projectRoute } from '../authz.ts';
import type { Queryable } from '../db.ts';
import { badRequest, conflict, notFound } from '../errors.ts';
import { emitLive } from '../live.ts';
import * as schema from '../schemas.ts';

const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);
const labelSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z.enum(LABEL_COLORS),
});

export async function fetchLabels(db: Queryable, projectId: string): Promise<Label[]> {
  const res = await db.query<Label>(
    'SELECT id, name, color FROM project_labels WHERE project_id = $1 ORDER BY lower(name), id',
    [projectId],
  );
  return res.rows;
}

const isDuplicate = (e: unknown) =>
  typeof e === 'object' && e !== null && (e as { code?: string }).code === '23505';

/**
 * A project's labels. Anyone who works on tasks may add one, since the moment a label is
 * wanted is while labelling; renaming and deleting change what other people's cards say, so
 * those are a Game Director's. Labels are not part of the activity history; they announce
 * themselves to open pages. Every route answers with the project's labels.
 */
export const labelRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app.ctx;
  const base = '/projects/:projectId/labels';
  const changed = (projectId: string, id: string, a: string) =>
    emitLive(db, { p: projectId, t: 'label', id, a });

  app.get(
    base,
    projectRoute('project.view', {
      id: 'listLabels',
      summary: 'The project’s labels',
      response: z.array(schema.Label),
    }),
    async (req) => fetchLabels(db, req.access!.project.id),
  );

  app.post(
    base,
    projectRoute('task.work', {
      id: 'createLabel',
      summary: 'Add a label to the project',
      description: 'Answers with all of the project’s labels.',
      body: labelSchema,
      response: { status: 201, schema: z.array(schema.Label) },
    }),
    async (req, reply) => {
      const parsed = labelSchema.safeParse(req.body);
      if (!parsed.success) throw badRequest('Invalid label', parsed.error.flatten());
      const projectId = req.access!.project.id;
      try {
        const created = await db.query<{ id: string }>(
          'INSERT INTO project_labels (project_id, name, color) VALUES ($1, $2, $3) RETURNING id',
          [projectId, parsed.data.name, parsed.data.color],
        );
        await changed(projectId, created.rows[0]!.id, 'label.created');
      } catch (e) {
        if (isDuplicate(e))
          throw conflict(`There is already a label called “${parsed.data.name}”.`);
        throw e;
      }
      return reply.status(201).send(await fetchLabels(db, projectId));
    },
  );

  app.patch(
    `${base}/:labelId`,
    projectRoute('backlog.manage', {
      id: 'updateLabel',
      summary: 'Rename a label, or change its colour',
      description: 'Answers with all of the project’s labels.',
      body: labelSchema,
      response: z.array(schema.Label),
    }),
    async (req) => {
      const parsed = labelSchema.safeParse(req.body);
      if (!parsed.success) throw badRequest('Invalid label', parsed.error.flatten());
      const projectId = req.access!.project.id;
      const { labelId } = req.params as { labelId: string };
      try {
        const updated = isUuid(labelId)
          ? await db.query(
              'UPDATE project_labels SET name = $3, color = $4 WHERE project_id = $1 AND id = $2',
              [projectId, labelId, parsed.data.name, parsed.data.color],
            )
          : null;
        if (!updated?.rowCount) throw notFound('Label not found');
      } catch (e) {
        if (isDuplicate(e))
          throw conflict(`There is already a label called “${parsed.data.name}”.`);
        throw e;
      }
      await changed(projectId, labelId, 'label.updated');
      return fetchLabels(db, projectId);
    },
  );

  /** Deleting a label takes it off every task that carried it. */
  app.delete(
    `${base}/:labelId`,
    projectRoute('backlog.manage', {
      id: 'deleteLabel',
      summary: 'Delete a label',
      description:
        'It comes off every task that has it. Answers with the project’s remaining labels.',
      response: z.array(schema.Label),
    }),
    async (req) => {
      const projectId = req.access!.project.id;
      const { labelId } = req.params as { labelId: string };
      const removed = isUuid(labelId)
        ? await db.query('DELETE FROM project_labels WHERE project_id = $1 AND id = $2', [
            projectId,
            labelId,
          ])
        : null;
      if (!removed?.rowCount) throw notFound('Label not found');
      await changed(projectId, labelId, 'label.deleted');
      return fetchLabels(db, projectId);
    },
  );
};
