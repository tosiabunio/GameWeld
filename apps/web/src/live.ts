/**
 * Live updates. The server says that something changed in a project, not what: whoever shows
 * that project's data loads it again through the routes it always uses. One connection serves
 * the whole tab and is open only while something listens.
 */
export interface LiveEvent {
  /** The project something changed in, with the kind of thing, its id, and the action. */
  p?: string;
  t?: string;
  id?: string;
  a?: string;
  /** The tab that made the change; it has the result already. */
  c?: string | null;
  /** The viewer has a new notification. */
  n?: true;
  /** The connection was lost for a while: anything may have changed. */
  resync?: true;
}

/** Names this tab in the requests it makes, so that it can tell its own changes from others'. */
export const clientId =
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `tab-${Math.random().toString(36).slice(2)}`;

type Listener = (event: LiveEvent) => void;
const listeners = new Set<Listener>();
let source: EventSource | null = null;
let interrupted = false;
let reopening: ReturnType<typeof setTimeout> | null = null;

/** How long to wait before opening a stream the browser gave up on: doubling, up to a minute. */
const REOPEN_FIRST_MS = 3_000;
const REOPEN_LONGEST_MS = 60_000;
let reopenAfter = REOPEN_FIRST_MS;

function open() {
  const opened = new EventSource('/api/events');
  source = opened;
  opened.onmessage = (message) => {
    let event: LiveEvent;
    try {
      event = JSON.parse(message.data as string) as LiveEvent;
    } catch {
      return;
    }
    for (const listener of listeners) listener(event);
  };
  // What happened while the connection was down is unknown, so everyone looks again once it is
  // back. After a dropped connection the browser reconnects by itself. It gives up for good when
  // the answer is not a stream, such as a proxy's 502 while the server restarts for a deploy:
  // then the stream is opened anew from here, or the tab would show old data until reloaded.
  opened.onerror = () => {
    interrupted = true;
    if (source !== opened || opened.readyState !== EventSource.CLOSED) return;
    reopening = setTimeout(() => {
      reopening = null;
      if (listeners.size > 0) open();
    }, reopenAfter);
    reopenAfter = Math.min(reopenAfter * 2, REOPEN_LONGEST_MS);
  };
  opened.onopen = () => {
    reopenAfter = REOPEN_FIRST_MS;
    if (!interrupted) return;
    interrupted = false;
    for (const listener of listeners) listener({ resync: true });
  };
}

export function subscribeLive(listener: Listener): () => void {
  listeners.add(listener);
  if (!source) open();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      if (reopening) clearTimeout(reopening);
      reopening = null;
      reopenAfter = REOPEN_FIRST_MS;
      source?.close();
      source = null;
      interrupted = false;
    }
  };
}

/** True for an event about this project that some other tab or person caused. */
export const isForeignChange = (event: LiveEvent, projectId: string) =>
  event.resync === true || (event.p === projectId && event.c !== clientId);
