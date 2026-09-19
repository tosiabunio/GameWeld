import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signInAs, startApp, type TestContext } from './helpers.ts';

// Other test files use the same personas and database at the same time, so a stream also carries
// their projects' events: every expectation here names this file's own project.

/** Reads server-sent events from a real connection; app.inject would wait for the end of the stream. */
class Stream {
  events: Record<string, unknown>[] = [];
  private abort = new AbortController();
  private constructor() {}

  static async open(base: string, cookie: string): Promise<Stream> {
    const stream = new Stream();
    const res = await fetch(`${base}/api/events`, {
      headers: { cookie },
      signal: stream.abort.signal,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    void (async () => {
      const decoder = new TextDecoder();
      let pending = '';
      try {
        for await (const chunk of res.body!) {
          pending += decoder.decode(chunk as Uint8Array, { stream: true });
          const frames = pending.split('\n\n');
          pending = frames.pop()!;
          for (const frame of frames)
            if (frame.startsWith('data: ')) stream.events.push(JSON.parse(frame.slice(6)));
        }
      } catch {
        // Aborted at the end of the test.
      }
    })();
    return stream;
  }

  /** Waits for an event that matches, among those not yet taken. */
  async next(matches: (e: Record<string, unknown>) => boolean): Promise<Record<string, unknown>> {
    for (let i = 0; i < 100; i++) {
      const at = this.events.findIndex(matches);
      if (at !== -1) return this.events.splice(at, 1)[0]!;
      await new Promise((done) => setTimeout(done, 20));
    }
    throw new Error(`no matching event among ${JSON.stringify(this.events)}`);
  }

  close() {
    this.abort.abort();
  }
}

describe('live updates', () => {
  let t: TestContext;
  let base: string;
  let director: string;
  let developer: string;
  let tester: string;
  let projectId: string;
  let itemId: string;

  const post = (cookie: string, url: string, payload: object, clientId?: string) =>
    fetch(`${base}/api${url}`, {
      method: 'POST',
      headers: {
        cookie,
        'content-type': 'application/json',
        ...(clientId ? { 'x-client-id': clientId } : {}),
      },
      body: JSON.stringify(payload),
    });

  beforeAll(async () => {
    t = await startApp();
    await t.app.listen({ port: 0, host: '127.0.0.1' });
    const address = t.app.server.address() as { port: number };
    base = `http://127.0.0.1:${address.port}`;
    director = await signInAs(t.app, 'director');
    developer = await signInAs(t.app, 'developer');
    tester = await signInAs(t.app, 'tester');
    projectId = (await (await post(director, '/projects', { name: 'Live' })).json()).id;
    await post(director, `/projects/${projectId}/members`, {
      email: 'developer@gameweld.local',
      roles: ['developer'],
    });
    itemId = (
      await (
        await post(director, `/projects/${projectId}/backlog`, {
          title: 'Live item',
          category: 'must',
        })
      ).json()
    ).id;
  });
  afterAll(async () => {
    await t.close();
  });

  it('needs a session', async () => {
    expect((await fetch(`${base}/api/events`)).status).toBe(401);
  });

  it('tells a project’s members that something changed, once it is committed, and nobody else', async () => {
    const member = await Stream.open(base, developer);
    const outsider = await Stream.open(base, tester);
    try {
      const created = await post(
        director,
        `/projects/${projectId}/backlog/${itemId}/tasks`,
        { title: 'Seen live', category: 'code' },
        'tab-1',
      );
      const taskId = (await created.json()).id;
      const event = await member.next((e) => e.p === projectId && e.a === 'task.created');
      // What changed and which tab did it, never the change itself: the browser loads it again
      // through the routes that check its permissions.
      expect(event).toEqual({ p: projectId, t: 'task', id: taskId, a: 'task.created', c: 'tab-1' });
      // The event follows the commit: what it points at is there to be read.
      const read = await fetch(`${base}/api/projects/${projectId}/tasks/${taskId}`, {
        headers: { cookie: developer },
      });
      expect(read.status).toBe(200);

      // A comment is not in the activity history and still announces itself.
      await post(developer, `/projects/${projectId}/tasks/${taskId}/comments`, { body: 'Hello' });
      expect(await member.next((e) => e.p === projectId && e.a === 'comment.added')).toMatchObject({
        id: taskId,
        c: null,
      });

      await new Promise((done) => setTimeout(done, 150));
      expect(outsider.events.filter((e) => e.p === projectId)).toEqual([]);
    } finally {
      member.close();
      outsider.close();
    }
  });

  it('rings the bell of whoever is notified, and starts telling a new member about the project', async () => {
    const dev = await Stream.open(base, developer);
    const newcomer = await Stream.open(base, tester);
    try {
      const me = await (await fetch(`${base}/api/me`, { headers: { cookie: developer } })).json();
      await post(director, `/projects/${projectId}/backlog/${itemId}/tasks`, {
        title: 'Yours',
        category: 'code',
        assigneeId: me.id,
      });
      expect(await dev.next((e) => e.n === true)).toEqual({ n: true });

      await post(director, `/projects/${projectId}/members`, {
        email: 'tester@gameweld.local',
        roles: ['tester'],
      });
      expect(await newcomer.next((e) => e.p === projectId && e.t === 'user')).toMatchObject({
        p: projectId,
        a: 'member.added',
      });
      await post(director, `/projects/${projectId}/backlog/${itemId}/tasks`, {
        title: 'Seen by the newcomer',
        category: 'code',
      });
      expect(await newcomer.next((e) => e.p === projectId && e.a === 'task.created')).toMatchObject(
        { p: projectId },
      );
    } finally {
      dev.close();
      newcomer.close();
    }
  });
});
