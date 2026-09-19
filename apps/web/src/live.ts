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

function open() {
  source = new EventSource('/api/events');
  source.onmessage = (message) => {
    let event: LiveEvent;
    try {
      event = JSON.parse(message.data as string) as LiveEvent;
    } catch {
      return;
    }
    for (const listener of listeners) listener(event);
  };
  // The browser reconnects by itself. What happened in between is unknown, so everyone looks again.
  source.onerror = () => (interrupted = true);
  source.onopen = () => {
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
      source?.close();
      source = null;
      interrupted = false;
    }
  };
}

/** True for an event about this project that some other tab or person caused. */
export const isForeignChange = (event: LiveEvent, projectId: string) =>
  event.resync === true || (event.p === projectId && event.c !== clientId);
