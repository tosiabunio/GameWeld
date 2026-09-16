import type { UserSummary } from '@gameweld/domain';
import type { FastifyPluginAsync } from 'fastify';
import { requireUser } from '../auth.ts';

/** Known users of this instance, for picking members. Any signed-in user may list them. */
export const userRoutes: FastifyPluginAsync = async (app) => {
  app.get('/users', { preHandler: requireUser }, async (): Promise<UserSummary[]> => {
    const res = await app.ctx.db.query<{ id: string; display_name: string; email: string | null }>(
      'SELECT id, display_name, email FROM users ORDER BY display_name',
    );
    return res.rows.map((u) => ({ id: u.id, displayName: u.display_name, email: u.email }));
  });
};
