/**
 * A limit on how much one address may ask of the instance in a minute, for those nobody invited:
 * visitors who are not signed in, and the demo's personas, whom anyone may be. It keeps one
 * visitor from wearing out what the teams beside the demo share with it. Counted in memory, per
 * process, in whole minutes from an address's first request.
 */
const WINDOW_MS = 60_000;
/** Addresses remembered at once; beyond it the finished minutes are forgotten, then everything. */
const MAX_KEYS = 50_000;
/** What a request that costs the server much counts as: an upload, an import, a sign-in. */
export const COSTLY = 20;

declare module 'fastify' {
  interface FastifyContextConfig {
    /** The route does much work for one request, so it counts as COSTLY ones. Uploads do anyway. */
    costly?: boolean;
  }
}

export class RateLimiter {
  private windows = new Map<string, { used: number; until: number }>();

  constructor(
    readonly perMinute: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Counts a request against `key`. Returns 0, or the seconds until the key may ask again. */
  take(key: string, cost = 1): number {
    const now = this.now();
    let window = this.windows.get(key);
    if (!window || window.until <= now) {
      if (this.windows.size >= MAX_KEYS) this.forget(now);
      window = { used: 0, until: now + WINDOW_MS };
      this.windows.set(key, window);
    }
    if (window.used >= this.perMinute) return Math.ceil((window.until - now) / 1000);
    window.used += cost;
    return 0;
  }

  private forget(now: number): void {
    for (const [key, window] of this.windows) if (window.until <= now) this.windows.delete(key);
    // Still full of addresses within their minute: let them start over rather than grow.
    if (this.windows.size >= MAX_KEYS) this.windows.clear();
  }
}

/** A request made on the machine itself, such as the scripts that fill the demo after a reset. */
export const isLoopback = (address: string | undefined): boolean =>
  ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address ?? '');
