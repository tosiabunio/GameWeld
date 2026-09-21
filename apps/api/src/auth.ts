import {
  findPersona,
  PERSONAS,
  type AuthProviders,
  type CurrentUser,
  type SignInError,
  type TokenAccess,
} from '@gameweld/domain';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { admit } from './admission.ts';
import { avatarUrl } from './avatars.ts';
import type { Queryable } from './db.ts';
import { OidcProvider, type OidcChecks } from './oidc.ts';
import { publicRoute } from './openapi.ts';
import { requestContext } from './requestContext.ts';
import {
  AuthProviders as AuthProvidersSchema,
  CurrentUser as CurrentUserSchema,
} from './schemas.ts';

export const SESSION_COOKIE = 'gw_session';
/** Holds a provider sign-in's state, nonce, and PKCE verifier between leaving and coming back. */
const OIDC_COOKIE = 'gw_oidc';

/** The API token a request came with, instead of a browser session. */
export interface RequestToken {
  id: string;
  name: string;
  access: TokenAccess;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: CurrentUser | null;
    token: RequestToken | null;
  }
}

/** Sessions and API tokens are long random strings, so a fast hash is enough to keep them. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** What a read-only token may do: nothing that changes anything. */
const READ_METHODS = new Set(['GET', 'HEAD']);

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

interface UserRow {
  id: string;
  display_name: string;
  email: string | null;
  is_admin: boolean;
  provider: string | null;
  avatar_id: string | null;
}

const userColumns = `u.id, u.display_name, u.email, u.is_admin, u.avatar_id,
  (SELECT provider FROM identities i WHERE i.user_id = u.id ORDER BY created_at LIMIT 1) AS provider`;

function toCurrentUser(row: UserRow): CurrentUser {
  return {
    id: row.id,
    displayName: row.display_name,
    email: row.email,
    isAdmin: row.is_admin,
    provider: row.provider ?? 'unknown',
    avatarUrl: avatarUrl(row.id, row.avatar_id),
  };
}

export async function userForToken(db: Queryable, token: string): Promise<CurrentUser | null> {
  const res = await db.query<UserRow>(
    `SELECT ${userColumns}
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashToken(token)],
  );
  return res.rows[0] ? toCurrentUser(res.rows[0]) : null;
}

/** The member an API token acts as, and the token; null for a token that does not exist. */
export async function userForApiToken(
  db: Queryable,
  secret: string,
): Promise<{ user: CurrentUser; token: RequestToken } | null> {
  const res = await db.query<
    UserRow & { token_id: string; token_name: string; access: TokenAccess; stale: boolean }
  >(
    `SELECT ${userColumns}, t.id AS token_id, t.name AS token_name, t.access,
            (t.last_used_at IS NULL OR t.last_used_at < now() - interval '1 minute') AS stale
       FROM api_tokens t JOIN users u ON u.id = t.user_id
      WHERE t.token_hash = $1`,
    [hashToken(secret)],
  );
  const row = res.rows[0];
  if (!row) return null;
  // To the minute is enough to tell a token in use from a forgotten one, at one write a minute.
  if (row.stale)
    await db.query('UPDATE api_tokens SET last_used_at = now() WHERE id = $1', [row.token_id]);
  return {
    user: toCurrentUser(row),
    token: { id: row.token_id, name: row.token_name, access: row.access },
  };
}

export async function deleteSession(db: Queryable, token: string): Promise<void> {
  await db.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
}

/** Fails the request with 401 unless a user is signed in. Use as a preHandler. */
export async function requireUser(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.user) await reply.status(401).send({ message: 'Sign in required' });
}

/**
 * Like requireUser, but only for a browser session: what a token must not do for itself, such as
 * making more tokens, is done in the app. Use as a preHandler.
 */
export async function requireSession(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.user) await reply.status(401).send({ message: 'Sign in required' });
  else if (req.token)
    await reply
      .status(403)
      .send({ message: 'API tokens are managed in the app, not with a token' });
}

async function startSession(app: FastifyInstance, reply: FastifyReply, userId: string) {
  const { config, db } = app.ctx;
  const session = await createSession(db, userId, config.sessionTtlMs);
  reply.setCookie(SESSION_COOKIE, session.token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.appEnv === 'production',
    expires: session.expiresAt,
  });
}

export async function registerAuth(app: FastifyInstance): Promise<void> {
  const { config, db } = app.ctx;
  const mockEnabled = config.authMock && config.appEnv !== 'production';
  const providers = config.oidcProviders.map((p) => new OidcProvider(p, app.ctx.oidcFetch));

  app.decorateRequest('user', null);
  app.decorateRequest('token', null);
  app.addHook('onRequest', async (req, reply) => {
    // An API token, when a request brings one, is the whole of its identity: a cookie beside it
    // is ignored, and a token that does not work is refused rather than taken for no one.
    const authorization = req.headers.authorization;
    if (authorization !== undefined && /^bearer\b/i.test(authorization)) {
      const secret = authorization.slice('bearer'.length).trim();
      const found = secret ? await userForApiToken(db, secret) : null;
      if (!found)
        return reply
          .status(401)
          .send({ message: 'The API token is not valid. It may have been revoked.' });
      if (found.token.access === 'read' && !READ_METHODS.has(req.method))
        return reply.status(403).send({ message: 'This API token can only read' });
      req.user = found.user;
      req.token = found.token;
      // The history says which changes came through a token, whichever route makes them.
      const context = requestContext.getStore();
      if (context) context.token = found.token.name;
      return;
    }
    const token = req.cookies[SESSION_COOKIE];
    req.user = token ? await userForToken(db, token) : null;
  });

  const tag = 'Sign-in';
  app.get(
    '/api/auth/providers',
    publicRoute({
      id: 'getSignInProviders',
      summary: 'How one can sign in to this instance',
      tag,
      response: AuthProvidersSchema,
    }),
    async (): Promise<AuthProviders> => ({
      mock: {
        enabled: mockEnabled,
        personas: mockEnabled
          ? PERSONAS.map((p) => ({ key: p.key, displayName: p.displayName, roles: [...p.roles] }))
          : [],
      },
      oidc: providers.map((p) => ({ id: p.config.id, label: p.config.label })),
    }),
  );

  app.get(
    '/api/me',
    publicRoute({
      id: 'getMe',
      summary: 'Who is signed in',
      description: 'The member the session or API token belongs to; null when nobody is signed in.',
      tag,
      response: CurrentUserSchema.nullable(),
    }),
    async (req) => req.user,
  );

  app.post(
    '/api/auth/sign-out',
    publicRoute({
      id: 'signOut',
      summary: 'End the browser session',
      description: 'An API token stays valid; revoke it in the app to stop it.',
      tag,
      response: null,
    }),
    async (req, reply) => {
      const token = req.cookies[SESSION_COOKIE];
      if (token) await deleteSession(db, token);
      reply.clearCookie(SESSION_COOKIE, { path: '/' });
      return reply.status(204).send();
    },
  );

  // Mock provider (T1). The route does not exist at all unless mock sign-in is enabled.
  if (mockEnabled) {
    const body = z.object({ persona: z.string() });
    const hidden = { summary: 'Sign in as a persona', tag, response: null, hidden: true } as const;
    app.post(
      '/api/auth/mock/sign-in',
      publicRoute({ id: 'signInAsPersona', ...hidden }),
      async (req, reply) => {
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

        await startSession(app, reply, userId);
        return reply.status(204).send();
      },
    );
  }

  // OpenID Connect providers (T1). Both routes are full-page navigations, not API calls: they
  // end by sending the browser on, to the provider or back to the application.
  const back = (reply: FastifyReply, error: SignInError, email?: string | null) => {
    const query = new URLSearchParams({ auth_error: error });
    if (email) query.set('email', email);
    return reply.redirect(`/?${query}`);
  };
  const checksSchema = z.object({
    provider: z.string(),
    state: z.string(),
    nonce: z.string(),
    verifier: z.string(),
  });

  for (const provider of providers) {
    const { id } = provider.config;

    // Steps of a sign-in in the browser, not calls for a client: served, not described.
    const hidden = { tag, response: null, hidden: true } as const;
    app.get(
      `/api/auth/${id}/start`,
      publicRoute({
        id: `${id}SignInStart`,
        summary: `Start signing in with ${provider.config.label}`,
        ...hidden,
      }),
      async (req, reply) => {
        let started: { url: string; checks: OidcChecks };
        try {
          started = await provider.start();
        } catch (err) {
          req.log.error(err, `${id} sign-in could not reach the provider`);
          return back(reply, 'unavailable');
        }
        const value = Buffer.from(JSON.stringify({ provider: id, ...started.checks })).toString(
          'base64url',
        );
        reply.setCookie(OIDC_COOKIE, value, {
          path: '/api/auth',
          httpOnly: true,
          // Lax, not strict: the provider's redirect back is a navigation from another site.
          sameSite: 'lax',
          secure: config.appEnv === 'production',
          maxAge: 10 * 60,
        });
        return reply.redirect(started.url);
      },
    );

    app.get(
      `/api/auth/${id}/callback`,
      publicRoute({
        id: `${id}SignInCallback`,
        summary: `Come back from signing in with ${provider.config.label}`,
        ...hidden,
      }),
      async (req, reply) => {
        const raw = req.cookies[OIDC_COOKIE];
        reply.clearCookie(OIDC_COOKIE, { path: '/api/auth' });
        // Choosing Cancel at the provider is not a failure: back to the sign-in page, quietly.
        if ((req.query as { error?: string }).error) return reply.redirect('/');

        let checks: OidcChecks | null = null;
        try {
          const parsed = checksSchema.safeParse(
            JSON.parse(Buffer.from(raw ?? '', 'base64url').toString()),
          );
          if (parsed.success && parsed.data.provider === id) checks = parsed.data;
        } catch {
          // Missing or unreadable: treated as expired below.
        }
        if (!checks) return back(reply, 'expired');

        let admission: Awaited<ReturnType<typeof admit>>;
        try {
          // The address the provider sent the browser to, rebuilt from PUBLIC_URL rather than from
          // headers a proxy may have rewritten.
          const claims = await provider.finish(new URL(req.url, config.publicUrl!), checks);
          admission = await admit(db, id, claims, config.initialAdminEmail);
        } catch (err) {
          req.log.error(err, `${id} sign-in failed`);
          return back(reply, 'failed');
        }
        if ('refused' in admission) {
          req.log.info({ email: admission.email, reason: admission.refused }, 'sign-in refused');
          return back(reply, admission.refused, admission.email);
        }
        await startSession(app, reply, admission.userId);
        return reply.redirect('/');
      },
    );
  }
}
