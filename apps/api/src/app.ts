import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import path from 'node:path';
import { registerAuth } from './auth.ts';
import type { Config } from './config.ts';
import type { Db } from './db.ts';
import { currentVersion } from './migrate.ts';
import { projectRoutes } from './routes/projects.ts';

export interface AppContext {
  config: Config;
  db: Db;
}

declare module 'fastify' {
  interface FastifyInstance {
    ctx: AppContext;
  }
}

export async function buildApp(ctx: AppContext): Promise<FastifyInstance> {
  const app = Fastify({
    logger: ctx.config.appEnv !== 'test',
    trustProxy: true,
  });
  app.decorate('ctx', ctx);
  await app.register(fastifyCookie);

  app.get('/api/health', async () => ({
    ok: true,
    env: ctx.config.appEnv,
    schemaVersion: await currentVersion(ctx.db),
  }));

  await registerAuth(app);
  await app.register(projectRoutes, { prefix: '/api' });

  app.setErrorHandler((err: FastifyError, _req, reply) => {
    const status = err.statusCode ?? 500;
    if (status >= 500) app.log.error(err);
    reply.status(status).send({ message: status >= 500 ? 'Internal error' : err.message });
  });

  if (ctx.config.webDist) {
    const root = path.resolve(ctx.config.webDist);
    await app.register(fastifyStatic, { root, wildcard: false });
    // Single-page application fallback for everything that is not an API route.
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.status(404).send({ message: 'Not found' });
      return reply.sendFile('index.html');
    });
  }

  return app;
}
