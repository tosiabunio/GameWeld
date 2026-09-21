import type { AvatarCrop, MyAvatar } from '@gameweld/domain';
import type { FastifyPluginAsync } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  avatarUrl,
  InvalidCrop,
  normaliseSource,
  readAll,
  renderAvatar,
  renditionKey,
  sourceKey,
  store,
  UnreadablePicture,
} from '../avatars.ts';
import { withTransaction } from '../db.ts';
import { badRequest, conflict, HttpError, notFound } from '../errors.ts';
import { PREVIEW_IMAGE_TYPES } from '../storage.ts';
import { memberRoute } from '../openapi.ts';
import * as schema from '../schemas.ts';

const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);
const cropSchema = z.object({
  left: z.coerce.number().min(0).max(1),
  top: z.coerce.number().min(0).max(1),
  size: z.coerce.number().gt(0).max(1),
});
const SOURCE_URL = '/api/me/avatar/source';

function parseCrop(input: unknown): AvatarCrop {
  const parsed = cropSchema.safeParse(input);
  if (!parsed.success)
    throw badRequest('Choose the circle to keep: its left, top, and size.', parsed.error.flatten());
  return parsed.data;
}

async function render(source: Buffer, crop: AvatarCrop): Promise<Buffer> {
  try {
    return await renderAvatar(source, crop);
  } catch (err) {
    if (err instanceof InvalidCrop) throw badRequest(err.message);
    if (err instanceof UnreadablePicture) throw new HttpError(422, err.message);
    throw err;
  }
}

/** Users' own pictures: each user manages theirs; any signed-in user may see anyone's. */
export const avatarRoutes: FastifyPluginAsync = async (app) => {
  const { db, storage, config } = app.ctx;

  /**
   * Writes the new files, points the user at them, and only then removes what the previous
   * picture left behind. With `expectedSource`, the circle is being chosen again from the picture
   * the user had, and a picture replaced or removed meanwhile is a conflict.
   */
  async function save(
    userId: string,
    crop: AvatarCrop,
    rendition: Buffer,
    next: { source: Buffer } | { expectedSource: string },
  ): Promise<MyAvatar> {
    const avatarId = randomUUID();
    const newSource = 'source' in next ? sourceKey(userId, randomUUID()) : null;
    const written = [renditionKey(userId, avatarId), ...(newSource ? [newSource] : [])];
    if (newSource && 'source' in next) await store(storage, newSource, next.source);
    await store(storage, written[0]!, rendition);
    let previous: { avatar_source_key: string | null; avatar_id: string | null };
    try {
      previous = await withTransaction(db, async (tx) => {
        const row = (
          await tx.query<{ avatar_source_key: string | null; avatar_id: string | null }>(
            'SELECT avatar_source_key, avatar_id FROM users WHERE id = $1 FOR UPDATE',
            [userId],
          )
        ).rows[0]!;
        if ('expectedSource' in next && row.avatar_source_key !== next.expectedSource)
          throw conflict('Your picture changed meanwhile. Reload and try again.');
        await tx.query(
          'UPDATE users SET avatar_source_key = $2, avatar_crop = $3, avatar_id = $4 WHERE id = $1',
          [userId, newSource ?? row.avatar_source_key, crop, avatarId],
        );
        return row;
      });
    } catch (err) {
      for (const key of written) await storage.delete(key);
      throw err;
    }
    if (previous.avatar_id) await storage.delete(renditionKey(userId, previous.avatar_id));
    if (newSource && previous.avatar_source_key) await storage.delete(previous.avatar_source_key);
    return { avatarUrl: avatarUrl(userId, avatarId)!, sourceUrl: SOURCE_URL, crop };
  }

  async function current(userId: string) {
    return (
      await db.query<{
        avatar_source_key: string | null;
        avatar_crop: AvatarCrop | null;
        avatar_id: string | null;
      }>('SELECT avatar_source_key, avatar_crop, avatar_id FROM users WHERE id = $1', [userId])
    ).rows[0]!;
  }

  app.get(
    '/me/avatar',
    memberRoute({
      id: 'getMyAvatar',
      summary: 'The viewer’s picture and the circle chosen from it',
      description: 'Null when they have none, and their initials are shown.',
      response: schema.MyAvatar.nullable(),
    }),
    async (req): Promise<MyAvatar | null> => {
      const row = await current(req.user!.id);
      return row.avatar_id && row.avatar_crop
        ? {
            avatarUrl: avatarUrl(req.user!.id, row.avatar_id)!,
            sourceUrl: SOURCE_URL,
            crop: row.avatar_crop,
          }
        : null;
    },
  );

  /** A new picture and the circle chosen from it; the circle travels in the query string. */
  app.post(
    '/me/avatar',
    memberRoute({
      id: 'uploadMyAvatar',
      summary: 'Upload a new picture of the viewer',
      description:
        'A PNG, JPEG, GIF, or WebP picture, with the circle to show from it in the query string.',
      query: cropSchema,
      upload: true,
      response: { status: 201, schema: schema.MyAvatar },
    }),
    async (req, reply) => {
      const crop = parseCrop(req.query);
      const part = await req
        .file({ limits: { fileSize: config.attachmentMaxBytes } })
        .catch(() => null);
      if (!part) throw badRequest('Send one picture as multipart form data.');
      if (!PREVIEW_IMAGE_TYPES.has(part.mimetype)) {
        part.file.resume();
        throw new HttpError(415, 'Upload a PNG, JPEG, GIF, or WebP picture.');
      }
      const upload = await readAll(part.file);
      if (part.file.truncated)
        throw new HttpError(
          413,
          `Pictures are limited to ${Math.round(config.attachmentMaxBytes / 1024 / 1024)} MB.`,
        );
      const source = await normaliseSource(upload).catch((err: unknown) => {
        if (err instanceof UnreadablePicture) throw new HttpError(422, err.message);
        throw err;
      });
      const saved = await save(req.user!.id, crop, await render(source, crop), { source });
      return reply.status(201).send(saved);
    },
  );

  /** Chooses another circle from the picture already uploaded. */
  app.patch(
    '/me/avatar',
    memberRoute({
      id: 'cropMyAvatar',
      summary: 'Choose another circle from the viewer’s picture',
      body: cropSchema,
      response: schema.MyAvatar,
    }),
    async (req): Promise<MyAvatar> => {
      const crop = parseCrop(req.body);
      const { avatar_source_key: key } = await current(req.user!.id);
      if (!key) throw notFound('Upload a picture first.');
      const source = await storage.get(key).then(readAll, () => null);
      if (!source) throw notFound('The picture is missing from storage. Upload it again.');
      return save(req.user!.id, crop, await render(source, crop), { expectedSource: key });
    },
  );

  app.delete(
    '/me/avatar',
    memberRoute({ id: 'deleteMyAvatar', summary: 'Remove the viewer’s picture', response: null }),
    async (req, reply) => {
      const userId = req.user!.id;
      const previous = await withTransaction(db, async (tx) => {
        const row = (
          await tx.query<{ avatar_source_key: string | null; avatar_id: string | null }>(
            'SELECT avatar_source_key, avatar_id FROM users WHERE id = $1 FOR UPDATE',
            [userId],
          )
        ).rows[0]!;
        await tx.query(
          'UPDATE users SET avatar_source_key = NULL, avatar_crop = NULL, avatar_id = NULL WHERE id = $1',
          [userId],
        );
        return row;
      });
      if (previous.avatar_id) await storage.delete(renditionKey(userId, previous.avatar_id));
      if (previous.avatar_source_key) await storage.delete(previous.avatar_source_key);
      return reply.status(204).send();
    },
  );

  app.get(
    '/me/avatar/source',
    memberRoute({
      id: 'getMyAvatarSource',
      summary: 'The whole picture the viewer uploaded, which the circle is chosen from',
      response: { content: 'image/webp', description: 'The picture' },
    }),
    async (req, reply) => {
      const { avatar_source_key: key } = await current(req.user!.id);
      const stream = key ? await storage.get(key).catch(() => null) : null;
      if (!stream) throw notFound('No picture uploaded.');
      return reply
        .header('content-type', 'image/webp')
        .header('cache-control', 'private, no-cache')
        .header('x-content-type-options', 'nosniff')
        .header('content-security-policy', "sandbox; default-src 'none'")
        .send(stream);
    },
  );

  app.get(
    '/users/:userId/avatar/:avatarId',
    memberRoute({
      id: 'getAvatar',
      summary: 'A member’s picture, as a circle cut to a square',
      description: 'Its address comes from avatarUrl, and changes when the picture does.',
      response: { content: 'image/webp', description: 'The picture' },
    }),
    async (req, reply) => {
      const { userId, avatarId } = req.params as { userId: string; avatarId: string };
      if (!isUuid(userId) || !isUuid(avatarId)) throw notFound('Picture not found');
      const known = await db.query('SELECT 1 FROM users WHERE id = $1 AND avatar_id = $2', [
        userId,
        avatarId,
      ]);
      const stream = known.rowCount
        ? await storage.get(renditionKey(userId, avatarId)).catch(() => null)
        : null;
      if (!stream) throw notFound('Picture not found');
      return (
        reply
          .header('content-type', 'image/webp')
          // A new picture or circle gets a new id, so a rendition never changes under its URL.
          .header('cache-control', 'private, max-age=31536000, immutable')
          .header('x-content-type-options', 'nosniff')
          .header('content-security-policy', "sandbox; default-src 'none'")
          .send(stream)
      );
    },
  );
};
