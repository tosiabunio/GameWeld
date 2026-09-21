import {
  MAX_TOKENS_PER_USER,
  TOKEN_ACCESS,
  type ApiToken,
  type CreatedToken,
  type TokenAccess,
} from '@gameweld/domain';
import type { FastifyPluginAsync } from 'fastify';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { hashToken } from '../auth.ts';
import { badRequest, conflict, notFound } from '../errors.ts';
import { sessionRoute } from '../openapi.ts';
import * as schema from '../schemas.ts';

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  access: z.enum(TOKEN_ACCESS),
});

interface TokenRow {
  id: string;
  name: string;
  access: TokenAccess;
  created_at: Date;
  last_used_at: Date | null;
}

const toToken = (r: TokenRow): ApiToken => ({
  id: r.id,
  name: r.name,
  access: r.access,
  createdAt: r.created_at.toISOString(),
  lastUsedAt: r.last_used_at?.toISOString() ?? null,
});

/**
 * A member's own API tokens. Only a browser session manages them: a token cannot make, see, or
 * revoke tokens, so one that leaks cannot make itself another or hide.
 */
export const tokenRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app.ctx;

  app.get(
    '/me/tokens',
    sessionRoute({
      id: 'listTokens',
      summary: 'The viewer’s API tokens',
      response: z.array(schema.ApiToken),
    }),
    async (req): Promise<ApiToken[]> => {
      const res = await db.query<TokenRow>(
        `SELECT id, name, access, created_at, last_used_at FROM api_tokens
          WHERE user_id = $1 ORDER BY created_at, id`,
        [req.user!.id],
      );
      return res.rows.map(toToken);
    },
  );

  app.post(
    '/me/tokens',
    sessionRoute({
      id: 'createToken',
      summary: 'Make an API token',
      description: `The answer holds the token itself, the only time it is shown. A member may have ${MAX_TOKENS_PER_USER} at a time, each with its own name.`,
      body: createSchema,
      response: { status: 201, schema: schema.CreatedToken },
    }),
    async (req, reply) => {
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) throw badRequest('Invalid token', parsed.error.flatten());
      const { name, access } = parsed.data;
      const userId = req.user!.id;
      // The prefix tells a person, and secret scanners, what the string is.
      const secret = `gw_${randomBytes(32).toString('base64url')}`;
      const res = await db.query<TokenRow>(
        `INSERT INTO api_tokens (user_id, name, token_hash, access)
         SELECT $1, $2, $3, $4
          WHERE (SELECT count(*) FROM api_tokens WHERE user_id = $1) < $5
         ON CONFLICT (user_id, name) DO NOTHING
         RETURNING id, name, access, created_at, last_used_at`,
        [userId, name, hashToken(secret), access, MAX_TOKENS_PER_USER],
      );
      const row = res.rows[0];
      if (!row) {
        const taken = await db.query('SELECT 1 FROM api_tokens WHERE user_id = $1 AND name = $2', [
          userId,
          name,
        ]);
        throw conflict(
          taken.rowCount
            ? 'You already have a token with this name'
            : `You have ${MAX_TOKENS_PER_USER} tokens already. Revoke one you no longer use.`,
        );
      }
      const created: CreatedToken = { token: toToken(row), secret };
      return reply.status(201).send(created);
    },
  );

  app.delete(
    '/me/tokens/:tokenId',
    sessionRoute({
      id: 'revokeToken',
      summary: 'Revoke an API token',
      description: 'It stops working at once. What was done with it stays in the history.',
      response: null,
    }),
    async (req, reply) => {
      const { tokenId } = req.params as { tokenId: string };
      const res = /^[0-9a-f-]{36}$/i.test(tokenId)
        ? await db.query('DELETE FROM api_tokens WHERE id = $1 AND user_id = $2', [
            tokenId,
            req.user!.id,
          ])
        : { rowCount: 0 };
      if (!res.rowCount) throw notFound('Token not found');
      return reply.status(204).send();
    },
  );
};
