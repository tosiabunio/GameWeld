import { findPersona, PERSONAS, type AuthProviders, type CurrentUser } from '@gameweld/domain';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { avatarUrl } from './avatars.ts';
import type { Queryable } from './db.ts';

export const SESSION_COOKIE = 'gw_session';

declare module 'fastify' {
  interface FastifyRequest {
    user: CurrentUser | null;
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(
  db: Queryable,
  userId: string,
  ttlMs: number,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + ttlMs);
  await db.query('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [
    hashToken(token),
    userId,
    expiresAt,
  ]);
  return { token, expiresAt };
}

export async function userForToken(db: Queryable, token: string): Promise<CurrentUser | null> {
  const res = await db.query<{
    id: string;
    display_name: string;
    email: string | null;
    is_admin: boolean;
    provider: string;
    avatar_id: string | null;
  }>(
    `SELECT u.id, u.display_name, u.email, u.is_admin, u.avatar_id,
            (SELECT provider FROM identities i WHERE i.user_id = u.id ORDER BY created_at LIMIT 1) AS provider
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashToken(token)],
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    displayName: row.display_name,
    email: row.email,
    isAdmin: row.is_admin,
    provider: row.provider ?? 'unknown',
    avatarUrl: avatarUrl(row.id, row.avatar_id),
  };
}

export async function deleteSession(db: Queryable, token: string): Promise<void> {
  await db.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
}

/** Fails the request with 401 unless a user is signed in. Use as a preHandler. */
export async function requireUser(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.user) await reply.status(401).send({ message: 'Sign in required' });
}

export async function registerAuth(app: FastifyInstance): Promise<void> {
  const { config, db } = app.ctx;
  const mockEnabled = config.authMock && config.appEnv !== 'production';

  app.decorateRequest('user', null);
  app.addHook('onRequest', async (req) => {
    const token = req.cookies[SESSION_COOKIE];
    req.user = token ? await userForToken(db, token) : null;
  });

  app.get('/api/auth/providers', async (): Promise<AuthProviders> => ({
    mock: {
      enabled: mockEnabled,
      personas: mockEnabled
        ? PERSONAS.map((p) => ({ key: p.key, displayName: p.displayName, roles: [...p.roles] }))
        : [],
    },
  }));

  app.get('/api/me', async (req) => req.user);

  app.post('/api/auth/sign-out', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) await deleteSession(db, token);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.status(204).send();
  });

  // Mock provider (T1). The route does not exist at all unless mock sign-in is enabled.
  if (mockEnabled) {
    const body = z.object({ persona: z.string() });
    app.post('/api/auth/mock/sign-in', async (req, reply) => {
      const parsed = body.safeParse(req.body);
      const persona = parsed.success ? findPersona(parsed.data.persona) : undefined;
      if (!persona) return reply.status(400).send({ message: 'Unknown persona' });

      const res = await db.query<{ user_id: string }>(
        `SELECT user_id FROM identities WHERE provider = 'mock' AND subject = $1`,
        [persona.key],
      );
      const userId = res.rows[0]?.user_id;
      if (!userId)
        return reply
          .status(409)
          .send({ message: 'Persona is not seeded; run with SEED_DEMO=true' });

      const session = await createSession(db, userId, config.sessionTtlMs);
      reply.setCookie(SESSION_COOKIE, session.token, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: config.appEnv === 'production',
        expires: session.expiresAt,
      });
      return reply.status(204).send();
    });
  }
}
