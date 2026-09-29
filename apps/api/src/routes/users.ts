import type { UserSummary } from '@gameweld/domain';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { memberRoute } from '../openapi.ts';
import { personaSql } from '../demo.ts';
import * as schema from '../schemas.ts';

/**
 * People to pick members from: whoever shares a project with the viewer, and the viewer; for an
 * admin, everyone but the demo's personas. Teams on one instance, and the personas beside them,
 * do not see each other.
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
             OR ($2 AND NOT ${personaSql('u.id')})
             OR EXISTS (SELECT 1 FROM project_memberships mine
                          JOIN project_memberships theirs ON theirs.project_id = mine.project_id
                         WHERE mine.user_id = $1 AND theirs.user_id = u.id)
          ORDER BY u.display_name`,
        [req.user!.id, req.user!.isAdmin],
      );
      return res.rows.map((u) => ({ id: u.id, displayName: u.display_name, email: u.email }));
    },
  );
};
