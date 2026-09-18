import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import path from 'node:path';
import { registerAuth } from './auth.ts';
import type { Config } from './config.ts';
import type { Db } from './db.ts';
import { FilesystemStorage, type Storage } from './storage.ts';
import { currentVersion } from './migrate.ts';
import { acceptanceRoutes } from './routes/acceptance.ts';
import { avatarRoutes } from './routes/avatars.ts';
import { backlogRoutes } from './routes/backlog.ts';
import { collabRoutes } from './routes/collab.ts';
import { boardRoutes } from './routes/board.ts';
import { memberRoutes } from './routes/members.ts';
import { projectRoutes } from './routes/projects.ts';
import { requestRoutes } from './routes/requests.ts';
import { taskRoutes } from './routes/tasks.ts';
import { userRoutes } from './routes/users.ts';
import { HttpError } from './errors.ts';

export interface AppContext {
  config: Config;
  db: Db;
  storage: Storage;
}

export function createContext(config: Config, db: Db): AppContext {
  return { config, db, storage: new FilesystemStorage(config.attachmentsDir) };
}

declare module 'fastify' {
  interface FastifyInstance {
    ctx: AppContext;
  }
}

export async function buildApp(
  ctx: AppContext,
  beforeRoutes?: (app: FastifyInstance) => void,
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: ctx.config.appEnv !== 'test',
    trustProxy: true,
  });
  app.decorate('ctx', ctx);
  await app.register(fastifyCookie);
  await app.register(fastifyMultipart, {
    limits: { files: 1, fileSize: ctx.config.attachmentMaxBytes },
  });
  beforeRoutes?.(app);

  // Must precede route registration: child contexts inherit the handler that exists at that time.
  app.setErrorHandler((err: FastifyError | HttpError, _req, reply) => {
    const status = err.statusCode ?? 500;
    if (status >= 500) app.log.error(err);
    reply.status(status).send({
      message: status >= 500 ? 'Internal error' : err.message,
      ...(err instanceof HttpError && err.details !== undefined ? { details: err.details } : {}),
    });
  });

  app.get('/api/health', async () => ({
    ok: true,
    env: ctx.config.appEnv,
    schemaVersion: await currentVersion(ctx.db),
  }));

  await registerAuth(app);
  app.decorateRequest('access', null);
  await app.register(projectRoutes, { prefix: '/api' });
  await app.register(memberRoutes, { prefix: '/api' });
  await app.register(userRoutes, { prefix: '/api' });
  await app.register(avatarRoutes, { prefix: '/api' });
  await app.register(backlogRoutes, { prefix: '/api' });
  await app.register(taskRoutes, { prefix: '/api' });
  await app.register(boardRoutes, { prefix: '/api' });
  await app.register(acceptanceRoutes, { prefix: '/api' });
  await app.register(requestRoutes, { prefix: '/api' });
  await app.register(collabRoutes, { prefix: '/api' });

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
