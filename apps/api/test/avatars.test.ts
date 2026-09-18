import type { MyAvatar } from '@gameweld/domain';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AVATAR_SIZE, SOURCE_MAX } from '../src/avatars.ts';
import { multipart, signInAs, startApp, type TestContext } from './helpers.ts';
import { colourAt, halves } from './images.ts';

describe("users' own pictures", () => {
  let t: TestContext;
  // Tess keeps these pictures to herself; other suites sign in as the same personas.
  let tester: string;
  let developer: string;
  let director: string;

  const call = (
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    cookie?: string,
    payload?: object,
  ) =>
    t.app.inject({
      method,
      url,
      ...(cookie ? { headers: { cookie } } : {}),
      ...(payload ? { payload } : {}),
    });
  async function upload(picture: Buffer | string, type: string, crop: string, cookie = tester) {
    const up = multipart('me.img', type, picture);
    return t.app.inject({
      method: 'POST',
      url: `/api/me/avatar?${crop}`,
      headers: { cookie, ...up.headers },
      payload: up.body,
    });
  }
  const stored = async (key: string) =>
    (await t.app.ctx.storage.get(key).catch(() => null)) !== null;
  const keys = async () =>
    (
      await t.db.query<{ avatar_source_key: string | null; avatar_id: string | null; id: string }>(
        "SELECT u.id, u.avatar_source_key, u.avatar_id FROM users u JOIN identities i ON i.user_id = u.id WHERE i.subject = 'tester'",
      )
    ).rows[0]!;

  beforeAll(async () => {
    t = await startApp();
    tester = await signInAs(t.app, 'tester');
    developer = await signInAs(t.app, 'developer');
    director = await signInAs(t.app, 'director');
  });
  afterAll(async () => {
    await call('DELETE', '/api/me/avatar', tester);
    await t.close();
  });

  it('keeps the chosen circle of an upright, bounded picture, and lets it be chosen again', async () => {
    // Red on the left, blue on the right; the circle takes the left square.
    const res = await upload(await halves(3000, 1500, 'png'), 'image/png', 'left=0&top=0&size=0.5');
    expect(res.statusCode).toBe(201);
    const first = res.json<MyAvatar>();
    expect(first.crop).toEqual({ left: 0, top: 0, size: 0.5 });
    expect((await call('GET', '/api/me', tester)).json().avatarUrl).toBe(first.avatarUrl);

    const picture = await call('GET', first.avatarUrl, tester);
    expect(picture.statusCode).toBe(200);
    expect(picture.headers['content-type']).toBe('image/webp');
    expect(picture.headers['cache-control']).toBe('private, max-age=31536000, immutable');
    expect(await sharp(picture.rawPayload).metadata()).toMatchObject({
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
    });
    for (const x of [8, 128, 247]) expect(await colourAt(picture.rawPayload, x, 128)).toBe('red');

    // The kept source is upright and at most SOURCE_MAX on its long side.
    const source = await call('GET', first.sourceUrl, tester);
    expect(source.headers['content-type']).toBe('image/webp');
    expect(await sharp(source.rawPayload).metadata()).toMatchObject({
      width: SOURCE_MAX,
      height: SOURCE_MAX / 2,
    });

    // Choosing again renders a new picture under a new URL, and the old one is gone.
    const again = await call('PATCH', '/api/me/avatar', tester, { left: 0.5, top: 0, size: 0.5 });
    expect(again.statusCode).toBe(200);
    const second = again.json<MyAvatar>();
    expect(second.avatarUrl).not.toBe(first.avatarUrl);
    expect((await call('GET', first.avatarUrl, tester)).statusCode).toBe(404);
    const blue = await call('GET', second.avatarUrl, tester);
    for (const x of [8, 128, 247]) expect(await colourAt(blue.rawPayload, x, 128)).toBe('blue');
    expect((await call('GET', '/api/me/avatar', tester)).json()).toEqual(second);
  });

  it('turns phone photos upright before the circle is applied', async () => {
    // Stored sideways (red left, blue right) with orientation 6: upright, red is on top.
    const photo = await halves(400, 200, 'jpeg', 6);
    const top = (await upload(photo, 'image/jpeg', 'left=0&top=0&size=1')).json<MyAvatar>();
    expect(await colourAt((await call('GET', top.avatarUrl, tester)).rawPayload, 128, 128)).toBe(
      'red',
    );
    const bottom = (
      await call('PATCH', '/api/me/avatar', tester, { left: 0, top: 0.5, size: 1 })
    ).json<MyAvatar>();
    expect(await colourAt((await call('GET', bottom.avatarUrl, tester)).rawPayload, 128, 128)).toBe(
      'blue',
    );
  });

  it('refuses circles outside the picture, other files, and unreadable ones', async () => {
    const picture = await halves(400, 200, 'png');
    expect((await upload(picture, 'image/png', 'left=0&top=0')).statusCode).toBe(400);
    expect((await upload(picture, 'image/png', 'left=0.8&top=0&size=0.5')).statusCode).toBe(400);
    expect((await upload(picture, 'image/png', 'left=0&top=0.2&size=0.5')).statusCode).toBe(400);
    expect(
      (
        await upload(
          '<svg xmlns="http://www.w3.org/2000/svg"/>',
          'image/svg+xml',
          'left=0&top=0&size=0.5',
        )
      ).statusCode,
    ).toBe(415);
    const unreadable = await upload('not a picture', 'image/png', 'left=0&top=0&size=0.5');
    expect(unreadable.statusCode).toBe(422);
    expect(unreadable.json().message).toBe('The picture could not be read.');
    // A bad request leaves the current picture as it was.
    const before = await keys();
    expect(before.avatar_id).not.toBeNull();
    expect(
      (await call('PATCH', '/api/me/avatar', tester, { left: 0.9, top: 0, size: 0.5 })).statusCode,
    ).toBe(400);
    expect(await keys()).toEqual(before);
    // Choosing a circle needs a picture to choose from.
    expect(
      (await call('PATCH', '/api/me/avatar', developer, { left: 0, top: 0, size: 0.5 })).statusCode,
    ).toBe(404);
  });

  it('shows the picture to signed-in users wherever the person appears', async () => {
    const mine = (
      await upload(await halves(200, 200, 'png'), 'image/png', 'left=0&top=0&size=1')
    ).json<MyAvatar>();
    expect((await call('GET', mine.avatarUrl, developer)).statusCode).toBe(200);
    expect((await call('GET', mine.avatarUrl)).statusCode).toBe(401);
    const { id } = await keys();
    expect(
      (await call('GET', `/api/users/${id}/avatar/${crypto.randomUUID()}`, developer)).statusCode,
    ).toBe(404);

    // A project where Tess is a member and the assignee of a task on the board.
    const pid = (await call('POST', '/api/projects', director, { name: 'Pictures' })).json().id;
    const p = (s: string) => `/api/projects/${pid}${s}`;
    await call('POST', p('/members'), director, {
      email: 'tester@gameweld.local',
      roles: ['developer'],
    });
    const item = (
      await call('POST', p('/backlog'), director, { title: 'Portrait', category: 'must' })
    ).json().id;
    const task = (
      await call('POST', p(`/backlog/${item}/tasks`), director, {
        category: 'assets',
        title: 'Paint',
      })
    ).json();
    await call('PATCH', p(`/tasks/${task.id}`), director, {
      version: task.version,
      assigneeId: id,
    });
    const board = (await call('POST', p('/boards'), director, { name: 'Sprint' })).json().id;
    await call('POST', p(`/boards/${board}/scope`), director, { itemId: item });

    const members = (await call('GET', p(''), director)).json().members;
    expect(members.find((m: { userId: string }) => m.userId === id).avatarUrl).toBe(mine.avatarUrl);
    expect((await call('GET', p(`/tasks/${task.id}`), director)).json().assignee.avatarUrl).toBe(
      mine.avatarUrl,
    );
    const cards = Object.values((await call('GET', p('/board'), director)).json().cards).flat() as {
      id: string;
      assignee: { avatarUrl: string | null } | null;
    }[];
    expect(cards.find((c) => c.id === task.id)!.assignee!.avatarUrl).toBe(mine.avatarUrl);
  });

  it('removes the picture and its files, back to initials', async () => {
    const before = await keys();
    expect(before.avatar_source_key).not.toBeNull();
    const url = (await call('GET', '/api/me', tester)).json().avatarUrl as string;
    const rendition = `avatars/${before.id}/${before.avatar_id}.avatar`;
    expect(await stored(rendition)).toBe(true);

    expect((await call('DELETE', '/api/me/avatar', tester)).statusCode).toBe(204);
    expect((await call('GET', '/api/me', tester)).json().avatarUrl).toBeNull();
    expect((await call('GET', '/api/me/avatar', tester)).json()).toBeNull();
    expect((await call('GET', url, developer)).statusCode).toBe(404);
    expect((await call('GET', '/api/me/avatar/source', tester)).statusCode).toBe(404);
    expect(await stored(rendition)).toBe(false);
    expect(await stored(before.avatar_source_key!)).toBe(false);
  });
});
