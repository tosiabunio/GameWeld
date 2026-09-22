import { useSyncExternalStore } from 'react';
import { DONE_WINDOWS, type DoneWindow } from './doneWindow.ts';

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
  /** Lanes, or My tasks' cards, that do not fill the window's width stand in its middle. */
  centered: boolean;
  /** The Backlog's Done lane shows the items accepted in these last days first; 0, a page. */
  doneWindow: DoneWindow;
}

const KEY = 'gameweld:display';
const DEFAULTS: DisplayOptions = {
  collapseEmpty: false,
  smallCovers: false,
  centered: false,
  doneWindow: 30,
};

function read(): DisplayOptions {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    const options = saved && typeof saved === 'object' ? (saved as Record<string, unknown>) : {};
    return {
      collapseEmpty: options.collapseEmpty === true,
      smallCovers: options.smallCovers === true,
      centered: options.centered === true,
      doneWindow: DONE_WINDOWS.find((days) => days === options.doneWindow) ?? DEFAULTS.doneWindow,
    };
  } catch {
    return DEFAULTS;
  }
}

/**
 * Covers are plain images in three views; one attribute on the root restyles them all. Centering
 * is layout alone, so it is an attribute too.
 */
function apply(options: DisplayOptions) {
  document.documentElement.toggleAttribute('data-small-covers', options.smallCovers);
  document.documentElement.toggleAttribute('data-centered', options.centered);
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

export function setDisplayOption<K extends keyof DisplayOptions>(
  name: K,
  value: DisplayOptions[K],
) {
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
