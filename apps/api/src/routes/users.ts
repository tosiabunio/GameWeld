import type { UserSummary } from '@gameweld/domain';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { memberRoute } from '../openapi.ts';
import * as schema from '../schemas.ts';

/**
 * People to pick members from: whoever shares a project with the viewer, and the viewer. Teams on
 * one instance, and the demo's personas beside them, do not see each other.
 */
export const userRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/users',
    memberRoute({
      id: 'listUsers',
      summary: 'The people the viewer shares a project with',
      description:
        'For choosing whom to add to a project. Anyone else is added by typing their address.',
      response: z.array(schema.UserSummary),
    }),
    async (req): Promise<UserSummary[]> => {
      const res = await app.ctx.db.query<{
        id: string;
        display_name: string;
        email: string | null;
      }>(
        `SELECT u.id, u.display_name, u.email FROM users u
          WHERE u.id = $1
             OR EXISTS (SELECT 1 FROM project_memberships mine
                          JOIN project_memberships theirs ON theirs.project_id = mine.project_id
                         WHERE mine.user_id = $1 AND theirs.user_id = u.id)
          ORDER BY u.display_name`,
        [req.user!.id],
      );
      return res.rows.map((u) => ({ id: u.id, displayName: u.display_name, email: u.email }));
    },
  );
};
