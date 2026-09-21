import type { SearchResults } from '@gameweld/domain';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { projectRoute } from '../authz.ts';
import * as schema from '../schemas.ts';

const LIMIT = 8;
/** `%` and `_` in what was typed are letters to look for, not wildcards. */
const pattern = (q: string) => `%${q.replace(/[\\%_]/g, '\\$&')}%`;

/**
 * Quick open: a project's backlog items and tasks by a few letters of their title or
 * description. Titles that match come first, then the newest. Deleted work is left out.
 */
export const searchRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app.ctx;
  app.get(
    '/projects/:projectId/search',
    projectRoute('project.view', {
      id: 'search',
      summary: 'Find items and tasks by title or description',
      description: 'At most 8 of each, for quick open.',
      query: z.object({
        q: z
          .string()
          .optional()
          .describe('What to look for: the first 100 characters; case does not matter.'),
      }),
      response: schema.SearchResults,
    }),
    async (req): Promise<SearchResults> => {
      const q = String((req.query as { q?: unknown }).q ?? '')
        .trim()
        .slice(0, 100);
      if (q === '') return { items: [], tasks: [] };
      const projectId = req.access!.project.id;
      const [items, tasks] = await Promise.all([
        db.query<SearchResults['items'][number]>(
          `SELECT id, title, state FROM backlog_items
            WHERE project_id = $1 AND archived_at IS NULL AND (title ILIKE $2 OR description ILIKE $2)
            ORDER BY (title ILIKE $2) DESC, updated_at DESC LIMIT ${LIMIT}`,
          [projectId, pattern(q)],
        ),
        db.query<SearchResults['tasks'][number]>(
          `SELECT t.id, t.title, t.completed, b.title AS "itemTitle"
             FROM tasks t JOIN backlog_items b ON b.id = t.item_id
            WHERE t.project_id = $1 AND t.archived_at IS NULL AND b.archived_at IS NULL
              AND (t.title ILIKE $2 OR t.description ILIKE $2)
            ORDER BY (t.title ILIKE $2) DESC, t.completed, t.updated_at DESC LIMIT ${LIMIT}`,
          [projectId, pattern(q)],
        ),
      ]);
      return { items: items.rows, tasks: tasks.rows };
    },
  );
};
