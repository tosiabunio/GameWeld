import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// Only the type: each test imports the module afresh, for its own stream.
import type { subscribeLive as SubscribeLive } from '../src/live.ts';

/** The part of the browser's EventSource the client uses, driven by the test. */
class FakeEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static opened: FakeEventSource[] = [];
  readyState = FakeEventSource.CONNECTING;
  onmessage: ((message: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onopen: (() => void) | null = null;
  constructor(readonly url: string) {
    FakeEventSource.opened.push(this);
  }
  close() {
    this.readyState = FakeEventSource.CLOSED;
  }
  /** The server answered with a stream. */
  connect() {
    this.readyState = FakeEventSource.OPEN;
    this.onopen?.();
  }
  /** The connection dropped: the browser will reconnect by itself. */
  drop() {
    this.readyState = FakeEventSource.CONNECTING;
    this.onerror?.();
  }
  /** The answer was not a stream (a proxy's 502, a 401): the browser gives up. */
  fail() {
    this.readyState = FakeEventSource.CLOSED;
    this.onerror?.();
  }
}

describe('live updates in the browser', () => {
  let subscribeLive: typeof SubscribeLive;
  const streams = () => FakeEventSource.opened;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    FakeEventSource.opened = [];
    vi.stubGlobal('EventSource', FakeEventSource);
    ({ subscribeLive } = await import('../src/live.ts'));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('passes events on, and has everyone look again after a connection the browser restored', () => {
    const seen: object[] = [];
    const unsubscribe = subscribeLive((e) => seen.push(e));
    expect(streams()).toHaveLength(1);
    streams()[0]!.connect();
    streams()[0]!.onmessage!({ data: '{"p":"x","t":"task"}' });
    streams()[0]!.drop();
    vi.advanceTimersByTime(120_000);
    // The browser reconnects this one: no second stream beside it.
    expect(streams()).toHaveLength(1);
    streams()[0]!.connect();
    expect(seen).toEqual([{ p: 'x', t: 'task' }, { resync: true }]);
    unsubscribe();
  });

  it('opens the stream anew when the browser gave up, waiting longer each time', () => {
    const seen: object[] = [];
    const unsubscribe = subscribeLive((e) => seen.push(e));
    streams()[0]!.connect();

    // The server restarts: the reconnect gets the proxy's 502, and the browser stops trying.
    streams()[0]!.fail();
    vi.advanceTimersByTime(2_999);
    expect(streams()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(streams()).toHaveLength(2);

    // Still down: the next try comes after twice as long.
    streams()[1]!.fail();
    vi.advanceTimersByTime(5_999);
    expect(streams()).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(streams()).toHaveLength(3);

    streams()[2]!.connect();
    expect(seen).toEqual([{ resync: true }]);

    // Back up, so the wait starts short again.
    streams()[2]!.fail();
    vi.advanceTimersByTime(3_000);
    expect(streams()).toHaveLength(4);
    unsubscribe();
  });

  it('stops trying once nothing listens', () => {
    const unsubscribe = subscribeLive(() => undefined);
    streams()[0]!.fail();
    unsubscribe();
    vi.advanceTimersByTime(120_000);
    expect(streams()).toHaveLength(1);

    // And starts afresh for the next listener.
    subscribeLive(() => undefined)();
    expect(streams()).toHaveLength(2);
    expect(streams()[1]!.readyState).toBe(FakeEventSource.CLOSED);
  });
});
