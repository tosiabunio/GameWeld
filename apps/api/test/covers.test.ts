import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { COVER_HEIGHT, COVER_WIDTH, coverKey } from '../src/covers.ts';
import { multipart, signInAs, startApp, type TestContext } from './helpers.ts';

/** An image whose left half is red and right half blue, so crops and rotations are visible. */
async function halves(width: number, height: number, format: 'png' | 'jpeg', orientation?: number) {
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      pixels.set(x < width / 2 ? [255, 0, 0] : [0, 0, 255], (y * width + x) * 3);
  const image = sharp(pixels, { raw: { width, height, channels: 3 } });
  const encoded = format === 'png' ? image.png() : image.jpeg({ quality: 95 });
  return (orientation ? encoded.withMetadata({ orientation }) : encoded).toBuffer();
}

/** Red or blue at a point of an encoded image. */
async function colourAt(image: Buffer, x: number, y: number): Promise<'red' | 'blue' | 'other'> {
  const { data, info } = await sharp(image).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  const [r, g, b] = [data[i]!, data[i + 1]!, data[i + 2]!];
  if (r > 200 && g < 60 && b < 60) return 'red';
  if (b > 200 && r < 60 && g < 60) return 'blue';
  return 'other';
}

describe('cover renditions of image attachments', () => {
  let t: TestContext;
  let director: string;
  let projectId: string;
  let itemId: string;
  const p = (suffix: string) => `/api/projects/${projectId}${suffix}`;

  async function upload(name: string, type: string, content: Buffer | string) {
    const up = multipart(name, type, content);
    const res = await t.app.inject({
      method: 'POST',
      url: p(`/backlog/${itemId}/attachments`),
      headers: { cookie: director, ...up.headers },
      payload: up.body,
    });
    expect(res.statusCode).toBe(201);
    return res.json().id as string;
  }
  const cover = (id: string) =>
    t.app.inject({
      method: 'GET',
      url: p(`/attachments/${id}/cover`),
      headers: { cookie: director },
    });
  const storageKey = async (id: string) =>
    (
      await t.db.query<{ storage_key: string }>(
        'SELECT storage_key FROM attachments WHERE id = $1',
        [id],
      )
    ).rows[0]!.storage_key;
  const stored = async (key: string) =>
    (await t.app.ctx.storage.get(key).catch(() => null)) !== null;

  beforeAll(async () => {
    t = await startApp();
    director = await signInAs(t.app, 'director');
    projectId = (
      await t.app.inject({
        method: 'POST',
        url: '/api/projects',
        headers: { cookie: director },
        payload: { name: 'Covers' },
      })
    ).json().id;
    itemId = (
      await t.app.inject({
        method: 'POST',
        url: p('/backlog'),
        headers: { cookie: director },
        payload: { title: 'Covered', category: 'must' },
      })
    ).json().id;
  });
  afterAll(async () => {
    await t.close();
  });

  it('renders a 16:9 WebP once, keeps it, and marks it cacheable for good', async () => {
    const id = await upload('wide.png', 'image/png', await halves(1600, 400, 'png'));
    const key = coverKey(await storageKey(id));
    expect(await stored(key)).toBe(false);

    const first = await cover(id);
    expect(first.statusCode).toBe(200);
    expect(first.headers['content-type']).toBe('image/webp');
    expect(first.headers['cache-control']).toBe('private, max-age=31536000, immutable');
    expect(first.headers['x-content-type-options']).toBe('nosniff');
    expect(first.headers['content-security-policy']).toBe("sandbox; default-src 'none'");
    const meta = await sharp(first.rawPayload).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['webp', COVER_WIDTH, COVER_HEIGHT]);
    // Cropped around the centre: both halves of the wide original survive, neither stretched away.
    expect(await colourAt(first.rawPayload, 100, 225)).toBe('red');
    expect(await colourAt(first.rawPayload, 700, 225)).toBe('blue');
    expect(await stored(key)).toBe(true);

    const again = await cover(id);
    expect(again.rawPayload.equals(first.rawPayload)).toBe(true);

    // Deleting the attachment removes its rendition too.
    await t.app.inject({
      method: 'DELETE',
      url: p(`/attachments/${id}`),
      headers: { cookie: director },
    });
    expect(await stored(key)).toBe(false);
  });

  it('turns phone photos upright from their EXIF orientation before cropping', async () => {
    // Stored sideways (red left, blue right) with orientation 6: shown upright, red is on top.
    const photo = await halves(400, 200, 'jpeg', 6);
    expect((await sharp(photo).metadata()).orientation).toBe(6);
    const res = await cover(await upload('photo.jpg', 'image/jpeg', photo));
    expect(res.statusCode).toBe(200);
    expect(await colourAt(res.rawPayload, 600, 50)).toBe('red');
    expect(await colourAt(res.rawPayload, 200, 400)).toBe('blue');
  });

  it('answers concurrent first requests with one identical rendition', async () => {
    const id = await upload('tall.png', 'image/png', await halves(300, 900, 'png'));
    const all = await Promise.all(Array.from({ length: 6 }, () => cover(id)));
    expect(all.map((r) => r.statusCode)).toEqual(Array(6).fill(200));
    for (const r of all) expect(r.rawPayload.equals(all[0]!.rawPayload)).toBe(true);
  });

  it('refuses files that are not previewable images, unreadable, or missing', async () => {
    const svg = await upload(
      'vector.svg',
      'image/svg+xml',
      '<svg xmlns="http://www.w3.org/2000/svg"/>',
    );
    expect((await cover(svg)).statusCode).toBe(404);
    const text = await upload('notes.txt', 'text/plain', 'notes');
    expect((await cover(text)).statusCode).toBe(404);

    const broken = await upload('broken.png', 'image/png', 'this is not a png');
    const res = await cover(broken);
    expect(res.statusCode).toBe(422);
    expect(res.json().message).toBe('The image could not be read.');
    expect(await stored(coverKey(await storageKey(broken)))).toBe(false);

    const lost = await upload('lost.png', 'image/png', await halves(64, 64, 'png'));
    await t.app.ctx.storage.delete(await storageKey(lost));
    expect((await cover(lost)).statusCode).toBe(404);
    expect((await cover(crypto.randomUUID())).statusCode).toBe(404);
  });
});
