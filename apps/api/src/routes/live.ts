import type { FastifyPluginAsync } from 'fastify';
import { memberRoute } from '../openapi.ts';

/** The stream of live updates for the signed-in member, across their projects. */
export const liveRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/events',
    memberRoute({
      id: 'streamEvents',
      summary: 'A stream of what changes in the viewer’s projects',
      description: `Server-sent events. Each says that something changed, not what; read it again by the usual routes. \`{"p": project, "t": entity type, "id": entity, "a": action}\` is a change in a project; \`{"n": true}\`, a new notification; \`{"resync": true}\`, that events may have been missed. A comment line every 25 seconds keeps the connection open.`,
      response: {
        content: 'text/event-stream',
        description: 'Events, until the client closes the connection',
      },
    }),
    async (req, reply) => {
      // The response is a stream from here on; Fastify must not try to finish it.
      reply.hijack();
      await app.ctx.live.add(req.user!.id, reply.raw);
    },
  );
};
