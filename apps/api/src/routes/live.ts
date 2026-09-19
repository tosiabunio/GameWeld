import type { FastifyPluginAsync } from 'fastify';
import { requireUser } from '../auth.ts';

/** The stream of live updates for the signed-in member, across their projects. */
export const liveRoutes: FastifyPluginAsync = async (app) => {
  app.get('/events', { preHandler: requireUser }, async (req, reply) => {
    // The response is a stream from here on; Fastify must not try to finish it.
    reply.hijack();
    await app.ctx.live.add(req.user!.id, reply.raw);
  });
};
