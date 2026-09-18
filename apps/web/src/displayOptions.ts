import { useSyncExternalStore } from 'react';

/**
 * How this viewer likes the lanes and cards shown. Like collapsed lanes, these are a per-viewer
 * convenience kept in this browser: they change nothing for anyone else, and storage may be
 * missing or refuse.
 */
export interface DisplayOptions {
  /** Backlog and Workboard lanes without cards shrink to their stubs. */
  collapseEmpty: boolean;
  /** Covers show as a small picture beside the title instead of a banner across the card. */
  smallCovers: boolean;
}

const KEY = 'gameweld:display';
const DEFAULTS: DisplayOptions = { collapseEmpty: false, smallCovers: false };

function read(): DisplayOptions {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    const options = saved && typeof saved === 'object' ? (saved as Record<string, unknown>) : {};
    return {
      collapseEmpty: options.collapseEmpty === true,
      smallCovers: options.smallCovers === true,
    };
  } catch {
    return DEFAULTS;
  }
}

/** Covers are plain images in three views; one attribute on the root restyles them all. */
function apply(options: DisplayOptions) {
  document.documentElement.toggleAttribute('data-small-covers', options.smallCovers);
}

let current = read();
apply(current);
const listeners = new Set<() => void>();

function publish(next: DisplayOptions) {
  current = next;
  apply(current);
  for (const listener of listeners) listener();
}

// Another tab of the same browser changed the options.
window.addEventListener('storage', (event) => {
  if (event.key === KEY) publish(read());
});

export function setDisplayOption(name: keyof DisplayOptions, value: boolean) {
  publish({ ...current, [name]: value });
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // The option still holds for this visit.
  }
}

export function useDisplayOptions(): DisplayOptions {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}
