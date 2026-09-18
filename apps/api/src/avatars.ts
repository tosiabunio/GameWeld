import { Readable } from 'node:stream';
import sharp from 'sharp';
import type { AvatarCrop } from '@gameweld/domain';
import type { Storage } from './storage.ts';

/**
 * User pictures (T2 storage). The upload is kept as a normalised source, upright and at most
 * SOURCE_MAX pixels on its long side, so the circle can be chosen again later; the circle becomes
 * a square AVATAR_SIZE rendition that the browser rounds.
 */
export const SOURCE_MAX = 2048;
export const AVATAR_SIZE = 256;

/** The URL of a user's rendition, which changes with every new picture or circle. */
export const avatarUrl = (userId: string, avatarId: string | null): string | null =>
  avatarId ? `/api/users/${userId}/avatar/${avatarId}` : null;

export const sourceKey = (userId: string, sourceId: string) => `avatars/${userId}/${sourceId}`;
export const renditionKey = (userId: string, avatarId: string) =>
  `avatars/${userId}/${avatarId}.avatar`;

export class InvalidCrop extends Error {}
export class UnreadablePicture extends Error {
  constructor() {
    super('The picture could not be read.');
  }
}

/** Upright and bounded, so crop fractions mean the same thing to the browser and the server. */
export async function normaliseSource(upload: Buffer): Promise<Buffer> {
  try {
    return await sharp(upload, { failOn: 'error' })
      .autoOrient()
      .resize(SOURCE_MAX, SOURCE_MAX, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 90 })
      .toBuffer();
  } catch {
    throw new UnreadablePicture();
  }
}

/** Cuts the chosen circle's square out of a normalised source. */
export async function renderAvatar(source: Buffer, crop: AvatarCrop): Promise<Buffer> {
  const { width, height } = await sharp(source).metadata();
  if (!width || !height) throw new UnreadablePicture();
  const size = Math.round(crop.size * width);
  const left = Math.round(crop.left * width);
  const top = Math.round(crop.top * height);
  // A pixel of slack absorbs rounding; anything more is a circle outside the picture.
  if (size < 1 || left < 0 || top < 0 || left + size > width + 1 || top + size > height + 1)
    throw new InvalidCrop('The circle must lie within the picture.');
  const side = Math.min(size, width - left, height - top);
  return sharp(source)
    .extract({ left, top, width: side, height: side })
    .resize(AVATAR_SIZE, AVATAR_SIZE)
    .webp({ quality: 85 })
    .toBuffer();
}

export async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

export async function store(storage: Storage, key: string, data: Buffer): Promise<void> {
  await storage.put(key, Readable.from(data), data.length);
}
