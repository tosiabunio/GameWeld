import { Readable } from 'node:stream';
import sharp from 'sharp';
import type { Storage } from './storage.ts';

/**
 * Cover renditions of image attachments: one 16:9 frame at twice the widest card, so covers stay
 * sharp on high-density screens while a board loads kilobytes instead of whole photos.
 */
export const COVER_WIDTH = 800;
export const COVER_HEIGHT = 450;

/** Part of the storage key, so a change to the rendition renders anew instead of reusing old files. */
const RENDITION = 'cover-800x450-v1';

export const coverKey = (storageKey: string) => `${storageKey}.${RENDITION}`;

/** The attachment claims to be an image but cannot be decoded. */
export class UnreadableImage extends Error {
  constructor() {
    super('The image could not be read.');
  }
}

const rendering = new Map<string, Promise<boolean>>();

/**
 * Streams the cover rendition of an image attachment, rendering and storing it on first use.
 * Returns null when the original is missing from storage.
 */
export async function coverRendition(
  storage: Storage,
  storageKey: string,
): Promise<Readable | null> {
  const key = coverKey(storageKey);
  const stored = await storage.get(key).catch(() => null);
  if (stored) return stored;
  // Concurrent first requests share one render.
  let pending = rendering.get(key);
  if (!pending) {
    pending = render(storage, storageKey, key).finally(() => rendering.delete(key));
    rendering.set(key, pending);
  }
  return (await pending) ? storage.get(key) : null;
}

async function render(storage: Storage, sourceKey: string, key: string): Promise<boolean> {
  const source = await storage.get(sourceKey).catch(() => null);
  if (!source) return false;
  // Originals are bounded by the upload limit, so reading one into memory is safe.
  const chunks: Buffer[] = [];
  for await (const chunk of source) chunks.push(chunk as Buffer);
  let output: Buffer;
  try {
    output = await sharp(Buffer.concat(chunks), { failOn: 'error' })
      .autoOrient() // phone photos carry their rotation in EXIF, as browsers honour it
      .resize(COVER_WIDTH, COVER_HEIGHT, { fit: 'cover', position: 'centre' })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    throw new UnreadableImage();
  }
  await storage.put(key, Readable.from(output), output.length);
  return true;
}
