import { AsyncLocalStorage } from 'node:async_hooks';
import type { ServerResponse } from 'node:http';
import pg from 'pg';
import type { Db, Queryable } from './db.ts';

/**
 * Live updates. A change announces itself with Postgres NOTIFY from inside its transaction, so
 * the announcement goes out only when the change is committed, and to every instance of the
 * application. Each instance listens on one connection and passes what concerns a viewer on to
 * their browser over server-sent events. The events say that something changed, not what: the
 * browser then loads the page's data again by the same routes as always, so there is one way of
 * reading a board and the permissions that guard it.
 */
const CHANNEL = 'gameweld_events';

export interface LiveEvent {
  /** The project something changed in. */
  p?: string;
  /** What changed: the activity's entity type, entity id, and action. */
  t?: string;
  id?: string;
  a?: string;
  /** The browser tab that made the change, which has the result already. */
  c?: string | null;
  /** Members who have a new notification. Not passed on to browsers. */
  u?: string[];
}

/** The browser tab a request came from, for the events its changes cause. */
export const requestContext = new AsyncLocalStorage<{ clientId: string | null }>();

export async function emitLive(db: Queryable, event: LiveEvent): Promise<void> {
  const c = requestContext.getStore()?.clientId ?? null;
  await db.query('SELECT pg_notify($1, $2)', [CHANNEL, JSON.stringify({ ...event, c })]);
}

interface Viewer {
  userId: string;
  projects: Set<string>;
  res: ServerResponse;
}

const HEARTBEAT_MS = 25_000;
const RECONNECT_MS = 2_000;

export class LiveHub {
  private viewers = new Set<Viewer>();
  private listener: pg.Client | null = null;
  private heartbeat: NodeJS.Timeout | null = null;
  private stopped = false;
  private listenedBefore = false;
  /** Settles once the listening connection is up, or has failed and will be retried. */
  private ready: Promise<void> | null = null;

  constructor(
    private databaseUrl: string,
    private db: Db,
    private log: (message: string, error?: unknown) => void = () => undefined,
  ) {}

  private async projectsOf(userId: string): Promise<Set<string>> {
    const res = await this.db.query<{ project_id: string }>(
      'SELECT project_id FROM project_memberships WHERE user_id = $1',
      [userId],
    );
    return new Set(res.rows.map((r) => r.project_id));
  }

  /**
   * Starts streaming to one browser. The listening connection opens with the first viewer, and
   * the response starts only once it is up: a browser that has its headers is subscribed, so a
   * change made right after cannot slip through the gap.
   */
  async add(userId: string, res: ServerResponse): Promise<void> {
    const viewer: Viewer = { userId, projects: await this.projectsOf(userId), res };
    this.ready ??= this.listen();
    await this.ready;
    if (this.stopped || res.destroyed) return void res.end();
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      // Reverse proxies must pass each event on as it comes.
      'x-accel-buffering': 'no',
    });
    res.write('retry: 3000\n\n');
    this.viewers.add(viewer);
    res.on('close', () => this.viewers.delete(viewer));
    this.heartbeat ??= setInterval(() => {
      for (const v of this.viewers) v.res.write(': ping\n\n');
    }, HEARTBEAT_MS);
  }

  private async listen(): Promise<void> {
    if (this.stopped) return;
    const client = new pg.Client({ connectionString: this.databaseUrl });
    this.listener = client;
    const retry = (error?: unknown) => {
      if (this.listener !== client) return;
      this.listener = null;
      this.log('live updates: lost the listening connection, reconnecting', error);
      client.end().catch(() => undefined);
      if (!this.stopped) setTimeout(() => (this.ready = this.listen()), RECONNECT_MS);
    };
    client.on('error', retry);
    client.on('end', () => retry());
    client.on('notification', (message) => {
      if (message.channel !== CHANNEL || !message.payload) return;
      try {
        void this.dispatch(JSON.parse(message.payload) as LiveEvent);
      } catch (error) {
        this.log('live updates: unreadable event', error);
      }
    });
    try {
      await client.connect();
      await client.query(`LISTEN ${CHANNEL}`);
      // Whatever happened while the connection was down was missed: have everyone look again.
      if (this.listenedBefore) for (const v of this.viewers) send(v, { resync: true });
      this.listenedBefore = true;
    } catch (error) {
      retry(error);
    }
  }

  private async dispatch(event: LiveEvent): Promise<void> {
    for (const viewer of this.viewers) {
      // A change of membership changes what this viewer may hear about.
      if (event.t === 'user' && event.id === viewer.userId) {
        viewer.projects = await this.projectsOf(viewer.userId);
        send(viewer, { p: event.p, t: event.t, a: event.a, c: event.c ?? null });
        continue;
      }
      if (event.u?.includes(viewer.userId)) send(viewer, { n: true });
      if (event.p && event.t && viewer.projects.has(event.p))
        send(viewer, { p: event.p, t: event.t, id: event.id, a: event.a, c: event.c ?? null });
    }
  }

  /** Ends every stream, so that closing the server does not wait for them. */
  async stop(): Promise<void> {
    this.stopped = true;
    if (this.heartbeat) clearInterval(this.heartbeat);
    for (const v of this.viewers) v.res.end();
    this.viewers.clear();
    const client = this.listener;
    this.listener = null;
    await client?.end().catch(() => undefined);
  }
}

function send(viewer: Viewer, data: object): void {
  viewer.res.write(`data: ${JSON.stringify(data)}\n\n`);
}
