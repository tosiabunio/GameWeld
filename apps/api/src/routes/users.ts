import type { UserSummary } from '@gameweld/domain';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { memberRoute } from '../openapi.ts';
import * as schema from '../schemas.ts';

/** Known users of this instance, for picking members. Any signed-in user may list them. */
export const userRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/users',
    memberRoute({
      id: 'listUsers',
      summary: 'Everyone who has an account on this instance',
      description: 'For choosing whom to add to a project.',
      response: z.array(schema.UserSummary),
    }),
    async (): Promise<UserSummary[]> => {
      const res = await app.ctx.db.query<{
        id: string;
        display_name: string;
        email: string | null;
      }>('SELECT id, display_name, email FROM users ORDER BY display_name');
      return res.rows.map((u) => ({ id: u.id, displayName: u.display_name, email: u.email }));
    },
  );
};
